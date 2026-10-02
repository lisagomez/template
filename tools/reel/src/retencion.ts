/**
 * Retención firmada (respuesta 7): el bruto y su transcripción se borran a los 30 días de aprobado el
 * reel; se conservan el máster, el registro y los consentimientos. El reloj se INYECTA: sin eso la regla
 * de 30 días no se puede probar sin esperar 30 días.
 */
import type { Transcripcion } from './tipos.js';
import type { Descarte } from './cortes.js';
import type { CorteEnVozAjena, TurnoDeVoz } from './privacidad.js';
export const DIAS_DE_RETENCION = 30;

/** Lo que se borra del almacén al vencer la retención (y lo que NO). */
// `normalizado.mov` es una copia completa del video original (mismas caras y voces) y `resultado.json` lleva la
// transcripción dentro: los dos se quedaban al vencer la retención (medido con el reloj inyectado). Se borran.
export const BRUTO = ['bruto.mp4', 'normalizado.mov', 'audio.wav', 'transcripcion.json', 'resultado.json', 'cuadros'] as const;
export const SE_CONSERVA = ['master.mp4', 'master.json', 'registro.json', 'consentimientos'] as const;

/**
 * Riesgo 5 de la AISIA firmada, segunda mitad: cuando en el reel habla alguien además del dueño, la
 * transcripción ÍNTEGRA (sin cortes, con quién habla y qué se cortó) se guarda CON el consentimiento. Es la
 * prueba si esa persona reclama que un corte le cambió el sentido a lo que dijo. Vive en `consentimientos/`,
 * que la retención de 30 días conserva, y sigue el ciclo del consentimiento: dura lo que la vigencia más
 * larga, la borra el job de retención al vencer y la borra el retiro de un consentimiento en el acto.
 */
export const TRANSCRIPCION_CONSERVADA = 'consentimientos/transcripcion-integra.json';

export interface TranscripcionConservada {
  version: number; huella: string; aprobadoEn: string;
  /** AAAA-MM-DD: la vigencia más larga de los consentimientos que había al aprobar. */
  conservarHasta: string;
  consentimientos: string[];
  transcripcion: Transcripcion; turnos: TurnoDeVoz[]; cortes: Descarte[]; cortesEnVozAjena: CorteEnVozAjena[];
}

export interface ProcesoParaConservar {
  hablantes?: number; transcripcion?: Transcripcion; turnos?: TurnoDeVoz[];
  edl?: { descartes: Descarte[] }; cortesEnVozAjena?: CorteEnVozAjena[];
}

/** `null` si no hay a quién proteger (una sola voz, ningún consentimiento vigente) o falta la transcripción. */
export function transcripcionAConservar(p: ProcesoParaConservar, a: { version: number; huella: string; aprobadoEn: string; consentimientos: ReadonlyArray<{ alias: string; vigenteHasta: string }> }): TranscripcionConservada | null {
  if ((p.hablantes ?? 0) < 2 || !p.transcripcion || a.consentimientos.length === 0) return null;
  const conservarHasta = a.consentimientos.map((c) => c.vigenteHasta).sort().at(-1) ?? '';
  return {
    version: a.version, huella: a.huella, aprobadoEn: a.aprobadoEn, conservarHasta, consentimientos: a.consentimientos.map((c) => c.alias),
    transcripcion: p.transcripcion, turnos: p.turnos ?? [], cortes: p.edl?.descartes ?? [], cortesEnVozAjena: p.cortesEnVozAjena ?? [],
  };
}

/** Vencida el día DESPUÉS de `conservarHasta` (la vigencia incluye ese día). */
export const transcripcionVencida = (t: { conservarHasta: string }, hoy: string): boolean => t.conservarHasta < hoy;

/**
 * El documento firmado de un consentimiento se conserva MIENTRAS DURA SU VIGENCIA (propuesta de respaldo del
 * 2026-09-27) y se borra al vencer o al retirarse. El job de retención no toca Supabase, así que al registrar
 * se guarda junto al documento su vigencia y su huella (nada personal). Al borrar el documento se queda este
 * archivo con la fecha: la constancia de que existió y de cuándo se borró, como la fila en Supabase.
 */
export interface VigenciaDeDocumento { consentimiento: string; vigenteHasta: string; huella: string; documentoBorradoEn?: string | null }
export const vigenciaDeDocumento = (consentimiento: string): string => `consentimientos/${consentimiento}.vigencia.json`;
export const documentoDeConsentimiento = (consentimiento: string): string => `consentimientos/${consentimiento}.bin`;

/** Vencido el día DESPUÉS de `vigenteHasta`, y solo si su documento sigue ahí. */
export const documentoVencido = (v: VigenciaDeDocumento, hoy: string): boolean => !v.documentoBorradoEn && v.vigenteHasta < hoy;

export interface EstadoDeRetencion { id: string; aprobadoEn: string | null; brutoBorradoEn: string | null }

export function venceEl(aprobadoEn: string): Date {
  const d = new Date(aprobadoEn);
  d.setUTCDate(d.getUTCDate() + DIAS_DE_RETENCION);
  return d;
}

export function porBorrar(ps: readonly EstadoDeRetencion[], ahora: Date): string[] {
  return ps.filter((p) => p.aprobadoEn !== null && p.brutoBorradoEn === null && venceEl(p.aprobadoEn) <= ahora).map((p) => p.id);
}
