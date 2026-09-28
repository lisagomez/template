#!/usr/bin/env node
/**
 * Banco de medicion de la lectura de caducidades: cada motor (y variante) sobre el corpus
 * SINTETICO (banco/sintetico.mjs) y el REAL (fotos del laboratorio, fuera de git), pasando por el
 * MISMO camino que la app: preparaImagenes (recorte de la guia) → motor → proponCaducidad.
 *
 *   node banco/mide-caducidades.mjs --real <carpeta> --sintetico <carpeta> [--motores a,b] [--salida x.md]
 *
 * Motores: rapidocr, rapidocr-puntos, rapidocr-cascada, rapidocr-2tomas, tesseract,
 * tesseract-puntos, qwen (recorte) y qwen-completa / rapidocr-completa (foto entera, solo real).
 * Los que no esten instalados se saltan y se dice. Qwen (modelo de lenguaje) es SOLO linea base
 * del banco: la app no lo usa (usarlo seria C8).
 *
 * Categorias (una por imagen): exacta · con opcion correcta (la persona elige) · ambiguedad
 * marcada · EQUIVOCADA (se propuso UNA fecha y no es: la peligrosa) · opciones sin la correcta ·
 * no leyo · inventada (propuso algo en una foto SIN fecha). `por_confirmar` no cuenta.
 */
import { execFile } from 'node:child_process'
import { request } from 'node:http'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import sharp from 'sharp'
import { leeYPropone, proponCaducidad } from '../dist/index.js'
import { preparaImagenes } from '../dist/imagenes.js'
import { motorPorProceso, SCRIPT_RAPIDOCR } from '../dist/motores/proceso.js'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
const HOY = arg('hoy', '2026-09-27')
const PY = process.env.ETIQUETAS_MOTOR_PYTHON ?? resolve('.datos/motores/rapidocr/bin/python')
const TESS = process.env.ETIQUETAS_TESSERACT_RAIZ ?? join(homedir(), '.local/tesseract/usr')
const OLLAMA = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434'
const QWEN = 'qwen2.5vl:3b'
const img = preparaImagenes(sharp)

// --- Motores --------------------------------------------------------------------------------
const correr = (cmd, args, env) => new Promise((ok, mal) => execFile(cmd, args, { env: { ...process.env, ...env }, maxBuffer: 1 << 22, timeout: 120_000 }, (e, so) => (e ? mal(e) : ok(so))))

async function enTemporal(bytes, fn) {
  const dir = await mkdtemp(join(tmpdir(), 'banco-cad-'))
  try { const ruta = join(dir, 'i.png'); await writeFile(ruta, bytes); return await fn(ruta, dir) } finally { await rm(dir, { recursive: true, force: true }) }
}

const unePuntos = (ruta, salida) => correr(PY, ['-c', `import importlib.util,cv2,sys;s=importlib.util.spec_from_file_location('m',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);cv2.imwrite(sys.argv[3],m.une_puntos(sys.argv[2]))`, SCRIPT_RAPIDOCR, ruta, salida])

function tesseract(puntos) {
  const env = { LD_LIBRARY_PATH: `${TESS}/lib/x86_64-linux-gnu:${TESS}/lib`, TESSDATA_PREFIX: `${TESS}/share/tesseract-ocr/5/tessdata` }
  return {
    modelo: `tesseract-5.5.0-spa+eng-psm6${puntos ? '+puntos' : ''}`,
    async lee(bytes) {
      const t0 = Date.now()
      const texto = await enTemporal(bytes, async (ruta, dir) => {
        const entrada = puntos ? join(dir, 'p.png') : ruta
        if (puntos) await unePuntos(ruta, entrada)
        return correr(`${TESS}/bin/tesseract`, [entrada, 'stdout', '-l', 'spa+eng', '--psm', '6'], env)
      })
      return { motor: this.modelo, ms: Date.now() - t0, lineas: texto.split('\n').filter((l) => l.trim()).map((l) => ({ texto: l })) }
    },
  }
}

/** POST sin limite de espera: un modelo de vision en CPU puede tardar minutos (fetch corta a los 300 s). */
function postJson(url, cuerpo) {
  return new Promise((ok, mal) => {
    const u = new URL(url)
    const q = request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
      let d = ''
      res.on('data', (x) => { d += x })
      res.on('end', () => { try { ok(JSON.parse(d)) } catch (e) { mal(e) } })
    })
    q.on('error', mal)
    q.end(JSON.stringify(cuerpo))
  })
}

const qwen = (digest) => ({
  modelo: `ollama/${QWEN}@${digest.slice(0, 12)}`,
  async lee(bytes) {
    const t0 = Date.now()
    const j = await postJson(`${OLLAMA}/api/generate`, { model: QWEN, prompt: 'Transcribe exactly the printed text in this image, character by character. Output only the text. If there is no text, output nothing.', images: [Buffer.from(bytes).toString('base64')], stream: false, options: { temperature: 0, num_ctx: 8192 } })
    return { motor: this.modelo, ms: Date.now() - t0, lineas: String(j.response ?? '').split('\n').filter((l) => l.trim()).map((l) => ({ texto: l })) }
  },
})

async function disponibles() {
  const m = {}
  if (existsSync(PY)) {
    const rapido = motorPorProceso({ comando: PY })
    m.rapidocr = { lee: (b) => rapido.lee(b) }
    m['rapidocr-puntos'] = { lee: (b) => rapido.lee(b, { variante: 'puntos' }) }
    m['rapidocr-producto'] = { producto: rapido }
    m['rapidocr-cascada'] = { lee: async (b) => { const x = await rapido.lee(b); const p = proponCaducidad([x], { hoy: HOY }); return ['sin-fecha', 'invalida'].includes(p.estado) ? rapido.lee(b, { variante: 'puntos' }) : x } }
  }
  if (existsSync(`${TESS}/bin/tesseract`)) { m.tesseract = tesseract(false); if (existsSync(PY)) m['tesseract-puntos'] = tesseract(true) }
  try {
    const tags = await (await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2000) })).json()
    const q = tags.models?.find((x) => x.name === QWEN)
    if (q) m.qwen = qwen(q.digest)
  } catch { /* sin Ollama: se salta */ }
  return m
}

// --- Clasificacion ----------------------------------------------------------------------------
export function clasifica(p, e) {
  const opciones = p.opciones.map((o) => o.iso)
  if (e.sinFecha) return p.estado === 'propuesta' || opciones.length > 0 ? 'inventada' : 'sin-fecha-correcta'
  if (e.porConfirmar) return 'por-confirmar'
  if (e.ambigua) {
    if (p.estado === 'propuesta') return 'equivocada'
    if (e.ambigua.every((x) => opciones.includes(x))) return 'ambigua-marcada'
    return opciones.length ? 'opciones-sin-la-correcta' : 'no-leyo'
  }
  if (p.estado === 'propuesta') return p.fecha === e.caducidad ? 'exacta' : 'equivocada'
  if (opciones.includes(e.caducidad)) return 'con-opcion'
  return opciones.length ? 'opciones-sin-la-correcta' : 'no-leyo'
}

const claseLote = (p, e) => (!e.lote ? '-' : p.lote === e.lote ? 'lote-exacto' : p.lote ? 'lote-equivocado' : 'sin-lote')

// --- Corpus --------------------------------------------------------------------------------
async function casosSinteticos(carpeta) {
  const { imagenes } = JSON.parse(await readFile(join(carpeta, 'esperado.json'), 'utf8'))
  return Promise.all(imagenes.map(async (x) => ({ corpus: 'sintético', id: x.id, fondo: x.fondo, esperado: x, tomas: await Promise.all(x.tomas.map((t) => readFile(join(carpeta, t)))) })))
}

async function casosReales(carpeta, completa) {
  const { fotos } = JSON.parse(await readFile(join(carpeta, 'esperado.json'), 'utf8'))
  const casos = []
  for (const [archivo, f] of Object.entries(fotos)) {
    const n = await img.normaliza(new Uint8Array(await readFile(join(carpeta, 'fotos', archivo))))
    const esperado = { caducidad: f.caducidad ?? undefined, lote: f.lote ?? undefined, sinFecha: Boolean(f.sin_fecha_visible), porConfirmar: Boolean(f.por_confirmar), ...(f.ambigua ? { ambigua: f.ambigua.map((a) => a.slice(0, 10)) } : {}) }
    if (completa) { casos.push({ corpus: 'real (foto entera)', id: archivo, esperado, tomas: [n.jpeg] }); continue }
    if (!f.recorte) { casos.push({ corpus: 'real (recorte)', id: archivo, esperado, tomas: [n.jpeg] }); continue }
    const [x, y, w, h] = f.recorte
    const rec = await img.recorta(n.jpeg, { x: x / n.ancho, y: y / n.alto, ancho: w / n.ancho, alto: h / n.alto }, n)
    casos.push({ corpus: 'real (recorte)', id: archivo, esperado, tomas: [rec], entera: n.jpeg })
  }
  return casos
}

// --- Corrida y tabla -----------------------------------------------------------------------
async function mide(nombre, motor, casos, dosTomas) {
  const filas = []
  for (const c of casos) {
    try { filas.push(await mideUno(nombre, motor, c, dosTomas)) } catch (e) {
      // Una imagen que falla no tumba la corrida: queda como «error» y se dice.
      filas.push({ motor: nombre, corpus: c.corpus, id: c.id, fondo: c.fondo, clase: 'error', lote: '-', estado: 'error', opciones: [], leido: [String(e?.message ?? e).slice(0, 120)], ms: 0 })
    }
  }
  return filas
}

async function mideUno(nombre, motor, c, dosTomas) {
  const tomas = dosTomas ? c.tomas.slice(0, 2) : c.tomas.slice(0, 1)
  const ctx = { hoy: HOY, ...(c.esperado.vidaUtilDias ? { vidaUtilDias: c.esperado.vidaUtilDias } : {}) }
  const lecturas = []
  let p
  if (motor.producto) {
    const t0 = Date.now()
    p = await leeYPropone(motor.producto, tomas.map((t) => new Uint8Array(t)), ctx, c.entera)
    lecturas.push({ ms: Date.now() - t0, lineas: [] })
  } else {
    for (const t of tomas) lecturas.push(await motor.lee(new Uint8Array(t)))
    p = proponCaducidad(lecturas, ctx)
  }
  const conf = lecturas[0].lineas?.find((l) => p.fecha && l.texto && p.textoLeido[0]?.includes(l.texto))?.confianza
  return { motor: nombre, corpus: c.corpus, id: c.id, fondo: c.fondo, clase: clasifica(p, c.esperado), lote: claseLote(p, c.esperado), estado: p.estado, fecha: p.fecha, opciones: p.opciones.map((o) => o.iso), leido: p.textoLeido, ms: lecturas.reduce((s, l) => s + l.ms, 0), confianza: conf }
}

const CLASES = ['exacta', 'con-opcion', 'ambigua-marcada', 'equivocada', 'opciones-sin-la-correcta', 'no-leyo', 'inventada', 'sin-fecha-correcta', 'error']
const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0 }

function tabla(filas) {
  const grupos = new Map()
  for (const f of filas) { const k = `${f.motor}|${f.corpus}`; grupos.set(k, [...(grupos.get(k) ?? []), f]) }
  const cab = '| motor | corpus | n | exacta | con opción correcta | ambigüedad marcada | **EQUIVOCADA** | opciones sin la correcta | no leyó | inventada (sin fecha) | sin fecha, correcto | error | lote exacto / equivocado | ms mediana |'
  const lineas = [cab, `|${'---|'.repeat(14)}`]
  for (const [k, fs] of grupos) {
    const [motor, corpus] = k.split('|')
    const cuenta = (c) => fs.filter((f) => f.clase === c).length
    const validas = fs.filter((f) => f.clase !== 'por-confirmar')
    lineas.push(`| ${motor} | ${corpus} | ${validas.length} | ${CLASES.map((c) => (c === 'equivocada' ? `**${cuenta(c)}**` : cuenta(c))).join(' | ')} | ${fs.filter((f) => f.lote === 'lote-exacto').length} / ${fs.filter((f) => f.lote === 'lote-equivocado').length} | ${mediana(fs.map((f) => f.ms))} |`)
  }
  return lineas.join('\n')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const motores = await disponibles()
  const pedidos = (arg('motores', 'rapidocr,rapidocr-puntos,rapidocr-cascada,rapidocr-2tomas,rapidocr-producto,tesseract,tesseract-puntos,qwen,qwen-completa,rapidocr-completa')).split(',')
  const real = arg('real'), sint = arg('sintetico')
  const casos = { s: sint ? await casosSinteticos(sint) : [], r: real ? await casosReales(real, false) : [], rc: real ? await casosReales(real, true) : [] }
  const salida = arg('salida')
  const carpeta = salida ? salida.replace(/[^/]+$/, '') || '.' : undefined
  for (const p of pedidos) {
    const base = p.replace(/-(2tomas|completa)$/, '')
    const motor = motores[base]
    if (!motor) { console.log(`— ${p}: no instalado, se salta`); continue }
    const t0 = Date.now()
    const filas = []
    if (p.endsWith('-completa')) filas.push(...await mide(p, motor, casos.rc, false))
    else if (p.endsWith('-2tomas')) filas.push(...await mide(p, motor, casos.s, true))
    else if (p === 'rapidocr-producto') filas.push(...await mide(p, motor, casos.s, true), ...await mide(p, motor, casos.r, false))
    else filas.push(...await mide(p, motor, casos.s, false), ...await mide(p, motor, casos.r, false))
    // Cada motor se guarda al terminar: una corrida que se cae despues no pierde lo medido.
    if (carpeta) await writeFile(`${carpeta}medicion-${p}.json`, JSON.stringify(filas, null, 1))
    console.log(`✓ ${p} (${Math.round((Date.now() - t0) / 1000)} s)`)
  }
  // La tabla sale de TODO lo medido en la carpeta (tambien de corridas anteriores de otros motores).
  const filas = []
  if (carpeta) for (const f of (await readdir(carpeta)).filter((x) => /^medicion-.+\.json$/.test(x) && x !== 'medicion-rapido.json').sort()) filas.push(...JSON.parse(await readFile(`${carpeta}${f}`, 'utf8')))
  const md = `# Medición de lectura de caducidades (${HOY})\n\n${tabla(filas)}\n\n## Propuestas EQUIVOCADAS\n\n${filas.filter((f) => f.clase === 'equivocada').map((f) => `- ${f.motor} · ${f.corpus} · ${f.id}: propuso ${f.fecha}${f.confianza !== undefined ? ` (confianza del motor ${f.confianza})` : ''} · leyó «${f.leido.join(' ¦ ')}»`).join('\n') || '- ninguna'}\n\n## Inventadas (fotos sin fecha)\n\n${filas.filter((f) => f.clase === 'inventada').map((f) => `- ${f.motor} · ${f.id}: ${f.estado} ${f.opciones.join(', ')} · leyó «${f.leido.join(' ¦ ')}»`).join('\n') || '- ninguna'}\n`
  if (salida) await writeFile(salida, md)
  console.log(md)
}
