/**
 * Cuántas voces hay (no QUIÉN): turnos por los huecos entre palabras, un vector de hablante por turno y
 * una agrupación. Sirve para una sola pregunta de la AISIA: ¿habla alguien más que el dueño? La
 * diarización se INYECTA (la de `@tu-scope/voz` 0.5.0 encaja tal cual): el paquete no depende de nadie.
 */
import type { Palabra } from '../tipos.js';

export interface TurnoVoz { inicioMs: number; finMs: number; audio?: Float32Array; hablante?: string }
/** Estructuralmente, `creaModeloHablante` y `creaDiarizador` de `@tu-scope/voz`. */
export interface Diarizacion<M = unknown> {
  creaModeloHablante(o: { ort: unknown; modelo: string }): Promise<M>;
  creaDiarizador(o: { modelo: M; msMinimo?: number; umbral?: number }): { asigna(turnos: readonly TurnoVoz[]): Promise<TurnoVoz[]> };
}
/**
 * Calibrado el 2026-09-27 con voces SINTÉTICAS (Piper «claude» y «ald», scripts/reel/calibra-voces.ts):
 * turnos de una misma voz a 0.27–0.36 de distancia coseno, la otra voz a 0.82; los turnos de menos de
 * ~1.5 s dan vectores ruidosos (0.68–0.73 con la MISMA voz), por eso no se embeben. Con voces reales hay
 * que recalibrar en el estreno: es una cifra medida, no universal.
 */
export const CALIBRACION_DE_VOCES = { umbral: 0.6, msMinimo: 1800, msPorVoz: 2000 } as const;

export interface OpcionesHablantes { diarizacion: Diarizacion; ort: unknown; modelo: string; umbral?: number; hueco?: number }

export function turnosDePalabras(palabras: readonly Palabra[], muestras: Float32Array, hz: number, hueco = 0.35): TurnoVoz[] {
  const turnos: TurnoVoz[] = [];
  let actual: { inicio: number; fin: number } | null = null;
  let cierraFrase = false;
  for (const p of palabras) {
    // Un turno se corta en un hueco, en el final de una frase o a los 4 s: sin eso, una segunda voz que
    // entra entre dos frases del dueño quedaba DENTRO de su turno y no había forma de separarla (medido).
    if (actual && !cierraFrase && p.inicio - actual.fin <= hueco && p.fin - actual.inicio <= 4) actual.fin = p.fin;
    else { if (actual) turnos.push(aTurno(actual, muestras, hz)); actual = { inicio: p.inicio, fin: p.fin }; }
    cierraFrase = /[.!?]$/.test(p.texto);
  }
  if (actual) turnos.push(aTurno(actual, muestras, hz));
  return turnos;
}

const aTurno = (t: { inicio: number; fin: number }, m: Float32Array, hz: number): TurnoVoz => ({
  inicioMs: Math.round(t.inicio * 1000), finMs: Math.round(t.fin * 1000), audio: m.slice(Math.floor(t.inicio * hz), Math.ceil(t.fin * hz)),
});

export async function cuentaHablantes(o: OpcionesHablantes, muestras16k: Float32Array, palabras: readonly Palabra[]): Promise<{ hablantes: number; turnos: Array<{ inicio: number; fin: number; hablante: string | null }> }> {
  const modelo = await o.diarizacion.creaModeloHablante({ ort: o.ort, modelo: o.modelo });
  const diarizador = o.diarizacion.creaDiarizador({ modelo, msMinimo: CALIBRACION_DE_VOCES.msMinimo, umbral: o.umbral ?? CALIBRACION_DE_VOCES.umbral });
  const asignados = await diarizador.asigna(turnosDePalabras(palabras, muestras16k, 16_000, o.hueco));
  await (modelo as { cierra?: () => Promise<void> }).cierra?.();
  const porVoz = new Map<string, number>();
  for (const t of asignados) if (t.hablante) porVoz.set(t.hablante, (porVoz.get(t.hablante) ?? 0) + (t.finMs - t.inicioMs));
  const voces = [...porVoz.values()].filter((ms) => ms >= CALIBRACION_DE_VOCES.msPorVoz).length;
  return { hablantes: voces, turnos: asignados.map((t) => ({ inicio: t.inicioMs / 1000, fin: t.finMs / 1000, hablante: t.hablante ?? null })) };
}
