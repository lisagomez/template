/**
 * Propuestas de SoA → una fila por CONTROL del Anexo A. El agente a veces agrupa controles en una propuesta
 * («A.2.2 a A.2.4 — Política de IA», con los tres IDs): medido el 2026-10-01, 19 propuestas cubrían 39 IDs y la app,
 * que tomaba solo el primero, dejaba la SoA de Maquinados en 19 de 38. Lo usan la app y el laboratorio, para que
 * los dos cuenten lo mismo. Puro: sin base ni red.
 */
import type { Propuesta } from '../../../../tools/sistema-integrado/dist/agentes/index.js';
import { requisito } from '../../../../tools/sistema-integrado/dist/catalogo/index.js';

export interface FilaSoa {
  readonly control: string;
  readonly requisito_id: string;
  readonly aplica: boolean;
  readonly justificacion: string;
  readonly estado_impl: 'no_iniciado' | 'en_curso' | 'implementado';
}

const texto = (v: unknown) => (v === undefined || v === null ? '' : String(v));
const ESTADOS = ['no_iniciado', 'en_curso', 'implementado'] as const;

/** Una fila por control citado; si dos propuestas citan el mismo control, gana la primera. */
export function filasSoa(propuestas: readonly Propuesta[]): FilaSoa[] {
  const filas = new Map<string, FilaSoa>();
  for (const p of propuestas.filter((x) => x.tipo === 'control_soa')) {
    const estado = texto(p.datos?.estado);
    const comun = {
      aplica: p.datos?.aplica !== false && texto(p.datos?.aplica) !== 'false',
      justificacion: (texto(p.datos?.justificacion) || p.detalle).slice(0, 1000).padEnd(5, '.'),
      estado_impl: (ESTADOS as readonly string[]).includes(estado) ? estado as FilaSoa['estado_impl'] : 'no_iniciado',
    };
    for (const id of p.requisitos.filter((r) => r.startsWith('SGI-A-'))) {
      const control = requisito(id)?.refs[0]?.clausula;
      if (control && !filas.has(control)) filas.set(control, { control, requisito_id: id, ...comun });
    }
  }
  return [...filas.values()];
}
