/**
 * «Apruébalo» DICHO EN VOZ, por el camino real de la voz de la capa: Piper (demonio local de `tools/dictado`) dice la
 * frase, Chromium la oye como micrófono, el detector de voz del navegador cierra el turno, Parakeet (el mismo demonio)
 * la transcribe y el Modo conversación la manda a la conversación de la capa como mensaje «dicho en voz». La BASE
 * tiene que quedar con las mismas aprobaciones. Nada sale de la máquina: los motores escuchan en 127.0.0.1.
 *
 * Requiere el demonio arriba (`npm --prefix tools/dictado run demonio`) y el servidor del laboratorio con
 * DICTADO_MOVIL_TOKEN en su entorno. El token se lee del entorno y no se imprime nunca.
 * Uso: node scripts/agora/voz-apruebalo.ts [url] [carpeta]
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { leeEntorno, RAIZ } from './entorno.ts'

const [URL = 'http://localhost:3021', CARPETA = join(RAIZ, 'docs/goals/agora-a2a-capturas')] = process.argv.slice(2)
const TOKEN = process.env.DICTADO_MOVIL_TOKEN ?? ''
if (!/^[0-9a-f]{32}$/i.test(TOKEN)) { console.error('✗ falta DICTADO_MOVIL_TOKEN (presente: no)'); process.exit(2) }
const DEMONIO = `http://127.0.0.1:${process.env.DICTADO_DEMONIO_PUERTO ?? '47125'}`

// 1. Piper dice la frase (local) y se arma el «micrófono»: un segundo de silencio, la frase y tres de silencio.
const dir = mkdtempSync(join(tmpdir(), 'agora-voz-'))
const r = await fetch(`${DEMONIO}/v1/audio/speech`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
  body: JSON.stringify({ model: 'piper', input: 'Apruébalo.', voice: 'es_MX-claude-high', response_format: 'wav', speed: 0.9 }) })
if (!r.ok) { console.error(`✗ el demonio no sintetizó (HTTP ${r.status})`); process.exit(2) }
writeFileSync(join(dir, 'frase.wav'), Buffer.from(await r.arrayBuffer()))
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-t', '1', '-i', 'anullsrc=r=16000:cl=mono', '-i', join(dir, 'frase.wav'), '-f', 'lavfi', '-t', '3', '-i', 'anullsrc=r=16000:cl=mono',
  '-filter_complex', '[1:a]aresample=16000,aformat=channel_layouts=mono[f];[0:a][f][2:a]concat=n=3:v=0:a=1', '-ar', '16000', '-ac', '1', join(dir, 'mic.wav')])

const db = new pg.Client({ connectionString: leeEntorno().AGORA_PG_URL })
await db.connect()
const aprobaciones = async () => Number((await db.query('select count(*) n from agora.aprobacion')).rows[0].n)

const nav = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${join(dir, 'mic.wav')}`, '--autoplay-policy=no-user-gesture-required'] })
const c = await nav.newContext({ viewport: { width: 1680, height: 1050 }, locale: 'es-MX', permissions: ['microphone'] })
await c.addCookies([{ name: 'agora_persona', value: 'paula', url: URL }])
await c.addInitScript(() => { try { localStorage.setItem('capa:agora:capa/agora/golfo-norte/capa/primer-arranque', JSON.stringify({ version: 1, terminado: true, paso: 5, nivel: 'lo-importante', voz: true })) } catch {} })
const p = await c.newPage()
const errores: string[] = []
p.on('pageerror', (e) => errores.push(String(e)))
// El enlace de emparejamiento (#t=…) no viaja al servidor y la página lo borra de la barra al guardarlo.
await p.goto(`${URL}/agora#t=${TOKEN}`, { waitUntil: 'networkidle' })
await p.waitForTimeout(1500)
const antes = await aprobaciones()
await p.locator('[data-capa-boton="modo-conversacion"]').click()
const oido = await p.waitForFunction(() => [...document.querySelectorAll('[data-capa-mensaje][data-de="persona"]')].some((m) => /dicho en voz/.test(m.textContent ?? '')), undefined, { timeout: 60_000 })
  .then(() => true, () => false)
await p.waitForFunction(() => /no apruebo/i.test([...document.querySelectorAll('[data-capa-mensaje][data-de="asistente"]')].map((m) => m.textContent).join(' ')), undefined, { timeout: 30_000 }).catch(() => {})
await p.waitForTimeout(1200)
const dicho = await p.locator('[data-capa-mensaje][data-de="persona"]').last().innerText().catch(() => '')
const respuesta = await p.locator('[data-capa-mensaje][data-de="asistente"]').last().innerText().catch(() => '')
await p.screenshot({ path: join(CARPETA, '36-apruebalo-por-voz-no-aprueba.png') })
await p.locator('[data-capa-boton="modo-conversacion"]').click().catch(() => {})
const despues = await aprobaciones()
await nav.close()
await db.end()

// Parakeet a veces escribe «Apruévalo» (con v): es lo que oyó; el enrutador lo resuelve igual (misma raíz).
const ok = oido && /apru[eé][bv]alo/i.test(dicho) && /dicho en voz/.test(dicho) && /no apruebo/i.test(respuesta) && antes === despues && errores.length === 0
console.log(`${oido ? '✓' : '✗'} la persona lo dijo en voz y la capa lo oyó: «${dicho.replace(/\s+/g, ' ').trim().slice(0, 60)}»`)
console.log(`${/no apruebo/i.test(respuesta) ? '✓' : '✗'} la respuesta: «${respuesta.replace(/\s+/g, ' ').trim().slice(0, 110)}»`)
console.log(`${antes === despues ? '✓' : '✗'} la base tiene las mismas aprobaciones: ${antes} → ${despues}`)
console.log(`${errores.length ? '✗' : '✓'} errores de página: ${errores.length}`)
console.log(ok ? '\nTodo en verde: «apruébalo» por voz no aprueba nada' : '\nEN ROJO')
process.exit(ok ? 0 : 1)
