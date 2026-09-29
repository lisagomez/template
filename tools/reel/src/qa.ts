/** QA del máster: formato, duración, volumen y que nada quedó al aire. Todo bloquea: la sala no deja aprobar un máster rojo. */
import type { Medidas, Observacion } from './tipos.js';
import { FORMATO } from './tipos.js';

export interface MedidasDelMaster { medidas: Medidas; lufs: number | null; carasSinCubrir: number; datosEnPantalla: number; rotulosFueraDeZona: number }

export const DURACION = { min: 15, max: 60 } as const;

export function revisaMaster(q: MedidasDelMaster): Observacion[] {
  const obs: Observacion[] = [];
  const m = q.medidas;
  const falla = (regla: string, mensaje: string) => obs.push({ regla, nivel: 'bloquea', mensaje });
  if (m.ancho !== FORMATO.ancho || m.alto !== FORMATO.alto) falla('formato', `El máster mide ${m.ancho}×${m.alto}; debe ser 1080×1920`);
  if (Math.round(m.fps) !== FORMATO.fps) falla('cuadros', `El máster va a ${m.fps} cuadros por segundo; debe ir a 30`);
  if (m.codecVideo && m.codecVideo !== 'h264') falla('codec-video', `Video en ${m.codecVideo}; debe ser H.264`);
  if (m.codecAudio && m.codecAudio !== 'aac') falla('codec-audio', `Audio en ${m.codecAudio}; debe ser AAC`);
  if (m.audioHz && m.audioHz !== FORMATO.audioHz) falla('muestreo', `Audio a ${m.audioHz} Hz; debe ir a 48 kHz`);
  if (m.duracion < DURACION.min || m.duracion > DURACION.max) falla('duracion', `Dura ${m.duracion.toFixed(1)} s; un reel va de ${DURACION.min} a ${DURACION.max} s`);
  if (q.lufs === null || Math.abs(q.lufs - FORMATO.lufs) > 1) falla('volumen', `Volumen integrado ${q.lufs === null ? 'sin medir' : q.lufs.toFixed(1) + ' LUFS'}; debe quedar en −14 ± 1`);
  if (q.carasSinCubrir > 0) falla('cara-sin-cubrir', `Al revisar el máster quedan ${q.carasSinCubrir} cara(s) sin desenfocar`);
  if (q.datosEnPantalla > 0) falla('dato-sin-cubrir', `Al revisar el máster se leen ${q.datosEnPantalla} dato(s) personal(es)`);
  if (q.rotulosFueraDeZona > 0) falla('rotulo-fuera', `${q.rotulosFueraDeZona} rótulo(s) salen de la zona segura`);
  return obs;
}

export const hayBloqueo = (obs: readonly Observacion[]): boolean => obs.some((o) => o.nivel === 'bloquea');
