/**
 * El contrato de dictado ES el de voz: se demuestra en tipos (este archivo lo compila el
 * `typecheck` de la raiz: una divergencia rompe ahi, no en produccion) y en tiempo de ejecucion
 * (los defectos del VAD, el nivel y el PCM son los mismos objetos y las mismas cifras).
 *
 *   node --test tools/dictado/pruebas/contrato.ts   (requiere `npm run build`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type * as Voz from '@tu-scope/voz';
import { nivelDb as nivelDbVoz, PERFILES_DETECTOR, picoDb } from '@tu-scope/voz';
import { floatAPcm16 as pcmVoz, leeWav } from '@tu-scope/voz/node';
import type { DetectorVoz, EventoVoz, Motor, Muestras, OpcionesTranscribe, Transcripcion, Transcriptor, Turno } from '../dist/index.js';
import { DEFECTOS_DICTADO, escribeWav, factorDe, floatAPcm16, nivelDb } from '../dist/node/index.js';

// ---------- en tipos: cada alias de dictado es asignable en las dos direcciones al de voz ----------
type Igual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _muestras: Igual<Muestras, Voz.Muestras> = true;
const _turno: Igual<Turno, Voz.Turno> = true;
const _evento: Igual<EventoVoz, Voz.EventoVoz> = true;
const _detector: Igual<DetectorVoz, Voz.DetectorVoz> = true;
const _transcriptor: Igual<Transcriptor, Voz.Transcriptor> = true;
const _opciones: Igual<OpcionesTranscribe, Voz.OpcionesTranscribe> = true;
const _transcripcion: Igual<Transcripcion, Voz.Transcripcion> = true;
// Un `Motor` de dictado es un `Transcriptor` de voz: se le puede pasar a `transcribeTurnos` sin adaptar.
const _motorEsTranscriptor: Motor extends Voz.Transcriptor ? true : false = true;
// Y un transcriptor escrito contra voz 0.4 (dos parametros, solo texto) sigue siendo un `Transcriptor`.
const viejo = { async transcribe(_m: Muestras, hz: number) { return { texto: `viejo@${hz}` }; } };
const _viejoVale: Transcriptor = viejo;
void [_muestras, _turno, _evento, _detector, _transcriptor, _opciones, _transcripcion, _motorEsTranscriptor, _viejoVale];

const seno = (ms: number, amplitud = 0.5, fs = 16_000): Muestras => {
  const n = Math.round((fs * ms) / 1000);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = amplitud * Math.sin((2 * Math.PI * 440 * i) / fs);
  return s;
};

test('los defectos del VAD de dictado SON el perfil `dictado` de voz (mismo objeto, cifras medidas)', () => {
  assert.equal(DEFECTOS_DICTADO, PERFILES_DETECTOR.dictado);
  assert.deepEqual({ ...DEFECTOS_DICTADO }, { umbralEntrada: 0.5, umbralSalida: 0.35, msSilencioParaCerrar: 1000, msMinimoHabla: 200, msRelleno: 250 });
  assert.notDeepEqual({ ...PERFILES_DETECTOR.bargeIn }, { ...PERFILES_DETECTOR.dictado }, 'barge-in sigue siendo otro perfil');
});

test('nivel, pico y factor: una sola aritmetica, la de voz', () => {
  const s = seno(100, 0.3);
  assert.equal(nivelDb(s), nivelDbVoz(s));
  assert.equal(nivelDb, nivelDbVoz, 'es la misma funcion, no una copia');
  assert.equal(factorDe(6), 10 ** (6 / 20));
  assert.ok(picoDb(s, 480) >= nivelDbVoz(s));
});

test('PCM16 y WAV: lo que dictado manda por la red y graba sale de voz, byte a byte', async () => {
  const s = seno(50, 0.7);
  const deDictado = floatAPcm16(s);
  assert.ok(Buffer.isBuffer(deDictado), 'dictado lo entrega como Buffer (base64 al motor por proceso)');
  assert.deepEqual([...deDictado], [...pcmVoz(s)]);
  const dir = mkdtempSync(join(tmpdir(), 'contrato-'));
  const ruta = join(dir, 'x', 'toma.wav');
  await escribeWav(ruta, s, 16_000);
  const b = readFileSync(ruta);
  const leido = leeWav(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  assert.equal(leido.frecuenciaHz, 16_000);
  assert.equal(leido.canales[0]!.length, s.length);
  rmSync(dir, { recursive: true, force: true });
});
