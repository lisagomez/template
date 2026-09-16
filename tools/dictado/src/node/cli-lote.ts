/**
 * `archivo`: un audio → texto, con tiempos (el modo archivo, el que se mide).
 * `lote`: una reunion → turnos por `voz` (VAD + diarizacion) + texto por este paquete → acta.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { creaDiarizador, fusionaTurnos } from '@tu-scope/voz';
import { creaModeloHablante } from '@tu-scope/voz/node';
import type { Turno } from '../types.js';
import { formateaActa, transcribeLote } from '../lote.js';
import { leeAudio } from './audio.js';
import type { Configuracion } from './cli-config.js';
import { cargaOrt, creaDetector, creaMotor } from './cli-motores.js';

export async function ordenArchivo(config: Configuracion, posicionales: string[], opciones: Record<string, string | boolean>): Promise<void> {
  const ruta = posicionales[0];
  if (!ruta) throw new Error('uso: dictado archivo <audio>');
  const idioma = typeof opciones['idioma'] === 'string' ? opciones['idioma'] : 'es';
  const motor = await creaMotor(typeof opciones['motor'] === 'string' ? opciones['motor'] : 'parakeet', config, idioma);
  const audio = await leeAudio(ruta);
  const t0 = performance.now();
  await motor.calienta?.();
  const carga = performance.now() - t0;
  const t1 = performance.now();
  const r = await motor.transcribe(audio.muestras, audio.frecuenciaHz, { idioma });
  const ms = performance.now() - t1;
  console.log(r.texto);
  console.error(`motor=${motor.id} audio=${(audio.duracionMs / 1000).toFixed(1)}s calienta=${carga.toFixed(0)}ms transcribe=${ms.toFixed(0)}ms rtf=${(ms / audio.duracionMs).toFixed(3)}`);
  await motor.cierra?.();
}

/** Corta el audio entero en turnos con el VAD de `voz`, conservando el audio de cada uno. */
async function turnosDe(config: Configuracion, muestras: Float32Array, silencioMs: number): Promise<Turno[]> {
  const detector = await creaDetector(config, { msSilencioParaCerrar: silencioMs });
  const eventos = [...(await detector.procesa(muestras)), ...(await detector.cierra())];
  return eventos.flatMap((e) => (e.tipo === 'finHabla' ? [e.turno] : []));
}

export async function ordenLote(config: Configuracion, posicionales: string[], opciones: Record<string, string | boolean>): Promise<void> {
  const ruta = posicionales[0];
  if (!ruta) throw new Error('uso: dictado lote <audio> [--hablantes N]');
  const idioma = typeof opciones['idioma'] === 'string' ? opciones['idioma'] : 'es';
  const hablantes = typeof opciones['hablantes'] === 'string' ? Number(opciones['hablantes']) : undefined;
  const embedding = join(config.modelos, 'embedding.onnx');
  if (!existsSync(embedding)) throw new Error(`falta ${embedding} (WeSpeaker; npm run mide lo descarga)`);

  const audio = await leeAudio(ruta);
  const t0 = performance.now();
  const turnos = await turnosDe(config, audio.muestras, typeof opciones['silencio-ms'] === 'string' ? Number(opciones['silencio-ms']) : 500);
  const msVad = performance.now() - t0;

  const ort = await cargaOrt(config);
  const diarizador = creaDiarizador({ modelo: await creaModeloHablante({ ort, modelo: embedding }), ...(hablantes ? { hablantes } : {}) });
  const t1 = performance.now();
  const conHablante = await diarizador.asigna(turnos);
  const msDiar = performance.now() - t1;

  const motor = await creaMotor(typeof opciones['motor'] === 'string' ? opciones['motor'] : 'parakeet', config, idioma);
  await motor.calienta?.();
  const lote = await transcribeLote(conHablante, motor, { frecuenciaHz: audio.frecuenciaHz, idioma, alProgreso: (h, t) => process.stderr.write(`\r  transcribiendo ${h}/${t}`) });
  process.stderr.write('\n');
  const acta = fusionaTurnos(lote.turnos.map((t) => ({ ...t, audio: undefined })));
  console.log(formateaActa(acta));
  const distintos = new Set(acta.map((t) => t.hablante ?? '?'));
  console.error(
    `audio=${(audio.duracionMs / 1000).toFixed(1)}s turnos=${turnos.length} hablantes=${distintos.size} motor=${motor.id} vad=${msVad.toFixed(0)}ms diarizacion=${msDiar.toFixed(0)}ms transcripcion=${lote.ms.total.toFixed(0)}ms fallos=${lote.fallos}`,
  );
  await motor.cierra?.();
}
