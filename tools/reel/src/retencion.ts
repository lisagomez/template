/**
 * Retención firmada (respuesta 7): el bruto y su transcripción se borran a los 30 días de aprobado el
 * reel; se conservan el máster, el registro y los consentimientos. El reloj se INYECTA: sin eso la regla
 * de 30 días no se puede probar sin esperar 30 días.
 */
export const DIAS_DE_RETENCION = 30;

/** Lo que se borra del almacén al vencer la retención (y lo que NO). */
// `normalizado.mov` es una copia completa del video original (mismas caras y voces) y `resultado.json` lleva la
// transcripción dentro: los dos se quedaban al vencer la retención (medido con el reloj inyectado). Se borran.
export const BRUTO = ['bruto.mp4', 'normalizado.mov', 'audio.wav', 'transcripcion.json', 'resultado.json', 'cuadros'] as const;
export const SE_CONSERVA = ['master.mp4', 'master.json', 'registro.json', 'consentimientos'] as const;

export interface EstadoDeRetencion { id: string; aprobadoEn: string | null; brutoBorradoEn: string | null }

export function venceEl(aprobadoEn: string): Date {
  const d = new Date(aprobadoEn);
  d.setUTCDate(d.getUTCDate() + DIAS_DE_RETENCION);
  return d;
}

export function porBorrar(ps: readonly EstadoDeRetencion[], ahora: Date): string[] {
  return ps.filter((p) => p.aprobadoEn !== null && p.brutoBorradoEn === null && venceEl(p.aprobadoEn) <= ahora).map((p) => p.id);
}
