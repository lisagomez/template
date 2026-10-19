/**
 * LAS URGENCIAS POR VOZ: ¿la regla las detecta aunque el ASR pierda una palabra? Cada urgencia del corpus se dice N
 * veces con la voz Piper local (cada toma suena un poco distinta), pasa por OGG/Opus como una nota de WhatsApp, se
 * transcribe con los DOS motores del demonio (las mismas funciones y la misma pista que usa la app) y se cuenta cuántas
 * detecta la regla tal cual con cada motor, y cuántas detecta el canal (`detectaUrgenciaEnVoz`: las dos lecturas y su
 * corrección hacia las palabras de alarma) y cuántas reciben al menos el aviso fijo del 911 (`red`: la regla, o una señal
 * de alarma que ninguna regla reconoció). Sin LLM: no gasta.
 *
 *   node --env-file=.env.local scripts/clinica-dental/whatsapp/mide-voz-urgencias.ts [--tomas 10] [--voz es_MX-ald-medium]
 * Necesita el demonio de `tools/dictado` vivo. Escribe docs/goals/clinica-dental-whatsapp-medicion/voz-urgencias[-<voz>].json:
 * la voz por defecto es con la que se AJUSTÓ la corrección; otra voz es la prueba de control (no se ajusta nada con ella).
 */
import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLINICAS, detectaUrgencia, detectaUrgenciaEnVoz, PISTA_VOZ_URGENCIAS, traeSenalDeAlarma } from '../../../tools/clinica-dental/dist/servidor.js';
import { transcribeRespaldo, transcribeTurno } from '../../../src/features/centro-de-mando/services/servidor/transcribe.ts';
import { CORPUS } from '../evaluador.ts';

const arg = (n: string, d: string) => process.argv.find((_, i) => process.argv[i - 1] === n) ?? d;
const TOMAS = Number(arg('--tomas', '10'));
const VOZ_AJUSTE = 'es_MX-claude-high';
const VOZ = arg('--voz', VOZ_AJUSTE);
const DEMONIO = `http://127.0.0.1:${process.env['DICTADO_DEMONIO_PUERTO'] ?? '47125'}`;
const auth = { authorization: `Bearer ${process.env['DICTADO_MOVIL_TOKEN'] ?? ''}` };

const ffmpeg = (args: string[], entrada: Uint8Array) => new Promise<Uint8Array>((ok, mal) => {
  const p = execFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { encoding: 'buffer', maxBuffer: 64 << 20 }, (e, out) => (e ? mal(e) : ok(new Uint8Array(out))));
  p.stdin?.end(Buffer.from(entrada));
});

/** Texto → voz Piper → OGG/Opus 16 kHz (como graba WhatsApp) → PCM16 16 kHz (como lo decodifica la app). */
async function notaDeVoz(texto: string): Promise<Uint8Array> {
  const r = await fetch(`${DEMONIO}/sintetizar`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ texto, voz: VOZ, velocidad: 1 }) });
  if (!r.ok) throw new Error(`el demonio no sintetiza: ${r.status}`);
  const hz = r.headers.get('x-frecuencia-hz') ?? '22050';
  const ogg = await ffmpeg(['-f', 's16le', '-ar', hz, '-ac', '1', '-i', 'pipe:0', '-c:a', 'libopus', '-b:a', '24k', '-ar', '16000', '-f', 'ogg', 'pipe:1'], new Uint8Array(await r.arrayBuffer()));
  return ffmpeg(['-i', 'pipe:0', '-f', 's16le', '-ar', '16000', '-ac', '1', 'pipe:1'], ogg);
}

interface Fila { id: string; principal: number; respaldo: number; canal: number; red: number; tomas: number; perdidas: string[] }

async function principal(): Promise<void> {
  const urgencias = CORPUS.preguntas.filter((p) => p.categoria === 'urgencia');
  const filas: Fila[] = [];
  for (const p of urgencias) {
    const c = CLINICAS.find((x) => x.id === p.clinica)!;
    const detecta = (xs: string[]) => xs.some((x) => detectaUrgencia(x, c) !== null);
    const r: Fila = { id: p.id, principal: 0, respaldo: 0, canal: 0, red: 0, tomas: TOMAS, perdidas: [] };
    for (let i = 0; i < TOMAS; i++) {
      const pcm = await notaDeVoz(p.texto);
      const senal = AbortSignal.timeout(30_000);
      const a = (await transcribeTurno(pcm, senal)).candidatos;
      const b = await transcribeRespaldo(pcm, senal, PISTA_VOZ_URGENCIAS);
      r.principal += Number(detecta(a));
      r.respaldo += Number(detecta([b]));
      const canal = detectaUrgenciaEnVoz([...a, b], c) !== null;
      r.canal += Number(canal);
      r.red += Number(canal || traeSenalDeAlarma([...a, b]));
      if (!canal) r.perdidas.push(`principal: ${a.join(' | ')} · respaldo: ${b}`);
    }
    filas.push(r);
    console.log(`  ${r.canal === TOMAS ? '✓' : '✗'} ${p.id.padEnd(7)} principal ${r.principal}/${TOMAS} · respaldo ${r.respaldo}/${TOMAS} · canal ${r.canal}/${TOMAS} · red ${r.red}/${TOMAS}`);
  }
  const suma = (k: 'principal' | 'respaldo' | 'canal' | 'red') => filas.reduce((s, f) => s + f[k], 0);
  const total = filas.length * TOMAS;
  const resumen = { tomas: total, principal: `${suma('principal')}/${total}`, respaldo: `${suma('respaldo')}/${total}`, canal: `${suma('canal')}/${total}`, red: `${suma('red')}/${total}` };
  const archivo = VOZ === VOZ_AJUSTE ? 'voz-urgencias.json' : `voz-urgencias-${VOZ}.json`;
  const papel = VOZ === VOZ_AJUSTE ? 'voz con la que se ajustó la corrección' : 'prueba de control: voz que no se usó para ajustar nada';
  writeFileSync(join(process.cwd(), 'docs/goals/clinica-dental-whatsapp-medicion', archivo), `${JSON.stringify({ cuando: new Date().toISOString(), voz: `${VOZ} (Piper local)`, papel, resumen, filas }, null, 1)}\n`);
  console.log(JSON.stringify(resumen));
}

await principal();
