/**
 * El estado REAL de cada caso: el de partida del catalogo, corregido por lo que hay en la
 * maquina. Un caso LISTO al que le falta un peso cae a PUERTA y dice cual. Puro: lo comparten
 * el servidor (que sabe que hay) y el cliente (que lo pinta).
 */
import type { Caso, EstadoCalculado, EstadoCaso, PiezaId, Piezas } from '../types/index.ts';

export const NOMBRE_PIEZA: Record<PiezaId, string> = {
  parakeet: 'el motor de transcripcion (Parakeet)',
  silero: 'el detector de voz (Silero)',
  embedding: 'el modelo que distingue voces (WeSpeaker)',
  piper: 'la voz sintetica (Piper es-MX)',
  ffmpeg: 'ffmpeg para leer audio del navegador',
  runtime: 'los runtimes de los modelos (sherpa-onnx, onnxruntime)',
  tokenServidor: 'el token de emparejamiento en el servidor',
  llaveLlm: 'una llave de modelo de lenguaje',
  supabase: 'un proyecto de base de datos',
};

export const ETIQUETA_ESTADO: Record<EstadoCaso, string> = {
  listo: 'LISTO',
  reglas: 'POR REGLAS',
  puerta: 'PUERTA HUMANA',
};

export const EXPLICACION_ESTADO: Record<EstadoCaso, string> = {
  listo: 'La pieza existe en esta computadora y se demuestra aqui mismo.',
  reglas: 'Se demuestra con logica local escrita a mano, sin ningun modelo de lenguaje. Acierta en lo claro y falla en lo sutil, y lo dice.',
  puerta: 'Falta un peso, una llave, una integracion o una firma. Lo decide una persona; esta pagina no lo simula.',
};

export function calculaEstado(caso: Caso, piezas: Piezas | undefined): EstadoCalculado {
  if (caso.estadoBase === 'puerta') return { estado: 'puerta', razon: caso.razonPuerta ?? 'Cerrado por decision humana pendiente.' };
  if (!piezas) return { estado: caso.estadoBase, razon: 'Comprobando que hay en la maquina…' };
  const faltan = caso.requiere.filter((p) => !piezas[p]);
  if (faltan.length > 0) {
    return { estado: 'puerta', razon: `Falta ${faltan.map((p) => NOMBRE_PIEZA[p]).join(' y ')}. Se instala en esta maquina; hasta entonces no se prueba.` };
  }
  return { estado: caso.estadoBase, razon: caso.estadoBase === 'reglas' ? EXPLICACION_ESTADO.reglas : EXPLICACION_ESTADO.listo };
}

export function resumenEstados(casos: readonly Caso[], piezas: Piezas | undefined): Record<EstadoCaso, number> {
  const r: Record<EstadoCaso, number> = { listo: 0, reglas: 0, puerta: 0 };
  for (const c of casos) r[calculaEstado(c, piezas).estado] += 1;
  return r;
}
