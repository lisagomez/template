/**
 * Contrato del brief del lunes (fusión de `marketing-monday`). Cada herramienta convierte su
 * resultado en una `SeccionDelLunes`; la fusión vive en `./pulso`. Una fuente que no llegó es
 * una sección con `estado: 'sin-datos'` y su motivo: la fusión la MUESTRA, nunca la tira.
 */
export type FuenteDelLunes = 'ventas' | 'resenas' | 'visibilidad' | 'anuncios' | 'competencia' | 'contenido';

export interface AccionSugerida {
  readonly titulo: string;
  readonly porque: string;
  /** Impacto estimado en texto («~$3,200 al mes»), o `null` si no hay base para estimarlo. */
  readonly impacto: string | null;
  /** 1 = más urgente. */
  readonly prioridad: 1 | 2 | 3;
  readonly fuente: FuenteDelLunes;
}

export interface SeccionDelLunes {
  readonly fuente: FuenteDelLunes;
  readonly titulo: string;
  readonly estado: 'ok' | 'sin-datos';
  readonly motivo: string | null;
  readonly hallazgos: readonly string[];
  readonly acciones: readonly AccionSugerida[];
}

export function seccionSinDatos(fuente: FuenteDelLunes, titulo: string, motivo: string): SeccionDelLunes {
  return { fuente, titulo, estado: 'sin-datos', motivo, hallazgos: [], acciones: [] };
}
