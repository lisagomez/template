/**
 * De las filas de la base al estado que entiende el motor. Función pura: el avance y las puertas los calcula SOLO el
 * motor (tools/sistema-integrado), con estos hechos. Nada de aquí decide.
 */
import type { EstadoProyecto, Fase, IdEdicion } from '../../../../tools/sistema-integrado/dist/index.js';

export interface FilasDelProyecto {
  readonly proyecto: { ediciones: string[]; no_aplica: Record<string, string>; diagnostico_completo: boolean };
  readonly evidencias: readonly { id: string; aprobada: boolean }[];
  readonly vinculos: readonly { evidencia_id: string; requisito_id: string }[];
  readonly aprobaciones: readonly { objeto_tipo: string; fase: number | null; decision: string; revocada_en: string | null }[];
  readonly soa: readonly { requisito_id: string; aplica: boolean; justificacion: string }[];
  readonly auditorias: readonly { tipo: string; estado: string }[];
  readonly ncs: readonly { estado: string }[];
}

export function estadoDesdeFilas(f: FilasDelProyecto): EstadoProyecto {
  const porEvidencia = new Map<string, string[]>();
  for (const v of f.vinculos) porEvidencia.set(v.evidencia_id, [...(porEvidencia.get(v.evidencia_id) ?? []), v.requisito_id]);
  const vigentes = f.aprobaciones.filter((a) => a.decision === 'aprobado' && !a.revocada_en);
  // Un control que la declaración de aplicabilidad excluye, CON justificación, sale del avance (el Anexo A es
  // condicional a la SoA). Lo que excluye la persona en el proyecto manda sobre la SoA.
  const noAplica: Record<string, string> = {};
  for (const s of f.soa) if (!s.aplica && s.justificacion.trim()) noAplica[s.requisito_id] = s.justificacion;
  Object.assign(noAplica, f.proyecto.no_aplica);
  return {
    ediciones: f.proyecto.ediciones as IdEdicion[],
    evidencias: f.evidencias.map((e) => ({ id: e.id, aprobada: e.aprobada, requisitos: porEvidencia.get(e.id) ?? [] })),
    noAplica,
    fasesCerradas: [...new Set(vigentes.filter((a) => a.objeto_tipo === 'cierre_fase' && a.fase !== null).map((a) => a.fase as Fase))].sort(),
    diagnosticoCompleto: f.proyecto.diagnostico_completo,
    planAprobado: vigentes.some((a) => a.objeto_tipo === 'plan_proyecto'),
    simulacroRealizado: f.auditorias.some((a) => a.tipo === 'simulacro' && a.estado === 'realizada'),
    ncAbiertas: f.ncs.filter((n) => n.estado !== 'cerrada').length,
  };
}
