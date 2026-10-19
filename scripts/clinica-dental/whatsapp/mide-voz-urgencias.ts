/**
 * LAS URGENCIAS POR VOZ, por regla: ¿la regla las detecta aunque el ASR tuerza una palabra? Cada urgencia del corpus se
 * dice N veces con una voz Piper local (cada toma suena un poco distinta), pasa por OGG/Opus como una nota de WhatsApp y
 * se lee con LAS MISMAS funciones que usa la app (`lecturas-voz.ts`): la nota de WhatsApp (dos motores siempre) y el
 * turno del portal (el segundo motor solo si el primero ya trae una señal de alarma). Por cada toma se cuenta:
 *  - `antes`: una sola lectura y la regla tal cual (como estaba el canal al empezar este goal);
 *  - `especificas`: alguna de U1–U6 (con las lecturas y su corrección);
 *  - `whatsapp` y `portal`: alguna regla, U7 incluida (el aviso condicional que sale PRIMERO, sin LLM).
 * Sin LLM: no gasta.
 *
 *   node --env-file=.env.local scripts/clinica-dental/whatsapp/mide-voz-urgencias.ts [--tomas 10] [--voz es_MX-ald-medium] [--velocidad 1.2]
 * Necesita el demonio de `tools/dictado` vivo. Escribe docs/goals/clinica-dental-whatsapp-medicion/voz-urgencias-<voz>[-v<velocidad>].json.
 */
import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLINICAS, detectaUrgencia, detectaUrgenciaEnVoz, REGLA_VOZ } from '../../../tools/clinica-dental/dist/servidor.js';
import { transcribeTurno } from '../../../src/features/centro-de-mando/services/servidor/transcribe.ts';
import { leeNotaDeVoz, leeTurnoDelPortal } from '../../../src/features/clinica-dental/services/servidor/lecturas-voz.ts';
import { CORPUS } from '../evaluador.ts';

const arg = (n: string, d: string) => process.argv.find((_, i) => process.argv[i - 1] === n) ?? d;
const TOMAS = Number(arg('--tomas', '10'));
const VOZ = arg('--voz', 'es_MX-claude-high');
const VELOCIDAD = Number(arg('--velocidad', '1'));
const DEMONIO = `http://127.0.0.1:${process.env['DICTADO_DEMONIO_PUERTO'] ?? '47125'}`;
const auth = { authorization: `Bearer ${process.env['DICTADO_MOVIL_TOKEN'] ?? ''}` };

const ffmpeg = (args: string[], entrada: Uint8Array) => new Promise<Uint8Array>((ok, mal) => {
  const p = execFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { encoding: 'buffer', maxBuffer: 64 << 20 }, (e, out) => (e ? mal(e) : ok(new Uint8Array(out))));
  p.stdin?.end(Buffer.from(entrada));
});

/** Texto → voz Piper → OGG/Opus 16 kHz (como graba WhatsApp) → PCM16 16 kHz (como lo decodifica la app). */
async function notaDeVoz(texto: string): Promise<Uint8Array> {
  const r = await fetch(`${DEMONIO}/sintetizar`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ texto, voz: VOZ, velocidad: VELOCIDAD }) });
  if (!r.ok) throw new Error(`el demonio no sintetiza: ${r.status}`);
  const hz = r.headers.get('x-frecuencia-hz') ?? '22050';
  const ogg = await ffmpeg(['-f', 's16le', '-ar', hz, '-ac', '1', '-i', 'pipe:0', '-c:a', 'libopus', '-b:a', '24k', '-ar', '16000', '-f', 'ogg', 'pipe:1'], new Uint8Array(await r.arrayBuffer()));
  return ffmpeg(['-i', 'pipe:0', '-f', 's16le', '-ar', '16000', '-ac', '1', 'pipe:1'], ogg);
}

interface Fila { id: string; antes: number; especificas: number; whatsapp: number; portal: number; tomas: number; perdidas: string[] }

async function mideToma(p: { texto: string; clinica: string }, r: Fila): Promise<void> {
  const c = CLINICAS.find((x) => x.id === p.clinica)!;
  const pcm = await notaDeVoz(p.texto);
  const senal = AbortSignal.timeout(60_000);
  const una = (await transcribeTurno(pcm, senal)).candidatos;
  const nota = await leeNotaDeVoz(pcm, senal);
  const turno = (await leeTurnoDelPortal(pcm, senal)).candidatos;
  const wa = detectaUrgenciaEnVoz(nota, c);
  // El portal: el navegador manda al servidor la lectura en la que alguna regla dispara, y el servidor la vuelve a leer igual.
  const portal = turno.map((x) => detectaUrgenciaEnVoz([x], c)).find((u) => u !== null) ?? null;
  r.antes += Number(una.some((x) => detectaUrgencia(x, c) !== null));
  r.especificas += Number(wa !== null && wa.regla.id !== REGLA_VOZ.id);
  r.whatsapp += Number(wa !== null);
  r.portal += Number(portal !== null);
  if (!wa || !portal) r.perdidas.push(`${!wa ? 'whatsapp' : 'portal'}: ${(!wa ? nota : turno).join(' | ')}`);
}

async function principal(): Promise<void> {
  const filas: Fila[] = [];
  for (const p of CORPUS.preguntas.filter((x) => x.categoria === 'urgencia')) {
    const r: Fila = { id: p.id, antes: 0, especificas: 0, whatsapp: 0, portal: 0, tomas: TOMAS, perdidas: [] };
    for (let i = 0; i < TOMAS; i++) await mideToma(p, r);
    filas.push(r);
    console.log(`  ${r.whatsapp === TOMAS && r.portal === TOMAS ? '✓' : '✗'} ${p.id.padEnd(7)} antes ${r.antes}/${TOMAS} · U1-U6 ${r.especificas}/${TOMAS} · whatsapp ${r.whatsapp}/${TOMAS} · portal ${r.portal}/${TOMAS}`);
  }
  const suma = (k: 'antes' | 'especificas' | 'whatsapp' | 'portal') => `${filas.reduce((s, f) => s + f[k], 0)}/${filas.length * TOMAS}`;
  const resumen = { voz: VOZ, velocidad: VELOCIDAD, tomas: filas.length * TOMAS, antes: suma('antes'), especificas: suma('especificas'), whatsapp: suma('whatsapp'), portal: suma('portal') };
  writeFileSync(join(process.cwd(), 'docs/goals/clinica-dental-whatsapp-medicion', `voz-urgencias-${VOZ}${VELOCIDAD === 1 ? '' : `-v${VELOCIDAD}`}.json`), `${JSON.stringify({ cuando: new Date().toISOString(), resumen, filas }, null, 1)}\n`);
  console.log(JSON.stringify(resumen));
}

await principal();
