'use client';

/**
 * Silero VAD v6.2 en el navegador: `onnxruntime-web` (fijado en 1.29.0, el de `voz` en `RUNTIMES`) y los
 * pesos que `npm run prepara:silero` deja en `public/` tras comprobar su huella. Se importa bajo demanda: con
 * el detector de energía, ni el runtime ni los 2 MB del modelo se bajan.
 *
 * Un solo hilo: Silero es diminuto (~0,15 ms por marco de 32 ms en Node, medido el 2026-10-16), y los hilos
 * de WebAssembly exigen aislamiento de origen (COOP/COEP), que la app no tiene ni necesita para esto.
 */
import { creaModeloSilero, type RuntimeOnnx } from '../../../../tools/voz/dist/browser/index.js';
import type { ModeloVoz } from '../../../../tools/voz/dist/index.js';

export const RUTA_MODELO_SILERO = '/centro-de-mando/silero/silero_vad.onnx';
const RUTA_RUNTIME = '/centro-de-mando/silero/';

export async function creaSileroNavegador(): Promise<ModeloVoz> {
  const ort = await import('onnxruntime-web/wasm');
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = RUTA_RUNTIME;
  const r = await fetch(RUTA_MODELO_SILERO);
  if (!r.ok) throw new Error(`no está el modelo (${r.status}); se prepara con npm run prepara:silero`);
  return creaModeloSilero({ ort: ort as unknown as RuntimeOnnx, modelo: new Uint8Array(await r.arrayBuffer()) });
}
