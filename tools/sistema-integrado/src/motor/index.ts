/**
 * EL MOTOR — determinista, sin red, sin LLM, sin reloj.
 *
 * El avance y las puertas los calcula SOLO este módulo, a partir de hechos: qué evidencia está APROBADA y a qué
 * requisitos se liga, qué no aplica (con su justificación) y qué fases están cerradas. Un LLM nunca abre una puerta
 * ni sube un porcentaje (L4).
 */
import { CATALOGO, comparaClausula, type Catalogo, type Fase, type IdEdicion, type Requisito } from '../catalogo/index.js';

export type Rol = 'consultor' | 'admin_pyme' | 'alta_direccion' | 'dueno_proceso' | 'auditor_interno';

export const ROLES: readonly Rol[] = ['consultor', 'admin_pyme', 'alta_direccion', 'dueno_proceso', 'auditor_interno'];

/** Qué se aprueba en la app. El consultor NUNCA aprueba: propone. */
export type TipoAprobable =
  | 'politica' | 'soa' | 'evaluacion_impacto' | 'objetivos' | 'riesgos' | 'plan_proyecto'
  | 'procedimiento' | 'evidencia' | 'plan_capacitacion' | 'proveedor' | 'hallazgo' | 'eficacia_accion' | 'cierre_fase';

/**
 * Quién puede aprobar cada cosa. La misma tabla vive en SQL (`sgi_puede_aprobar`, migración del esquema) y una prueba
 * compara las dos: si divergen, rojo.
 */
export const APROBADORES: Readonly<Record<Exclude<TipoAprobable, 'cierre_fase'>, readonly Rol[]>> = {
  politica: ['alta_direccion'],
  soa: ['alta_direccion'],
  evaluacion_impacto: ['alta_direccion'],
  objetivos: ['alta_direccion'],
  riesgos: ['alta_direccion', 'admin_pyme'],
  plan_proyecto: ['alta_direccion', 'admin_pyme'],
  procedimiento: ['admin_pyme', 'dueno_proceso'],
  evidencia: ['admin_pyme', 'dueno_proceso', 'alta_direccion'],
  plan_capacitacion: ['admin_pyme'],
  proveedor: ['admin_pyme'],
  hallazgo: ['auditor_interno'],
  eficacia_accion: ['auditor_interno', 'admin_pyme'],
};

/** Quién cierra cada fase del roadmap. */
export const ROL_CIERRE: Readonly<Record<Fase, Rol>> = {
  0: 'admin_pyme', 1: 'admin_pyme', 2: 'alta_direccion', 3: 'alta_direccion', 4: 'admin_pyme',
  5: 'admin_pyme', 6: 'alta_direccion', 7: 'admin_pyme', 8: 'alta_direccion',
};

export const NOMBRE_FASE: Readonly<Record<Fase, string>> = {
  0: 'Diagnóstico', 1: 'Contexto y alcance', 2: 'Liderazgo', 3: 'Planificación', 4: 'Soporte',
  5: 'Operación', 6: 'Evaluación', 7: 'Mejora', 8: 'Preparación para la certificación',
};

export const FASES: readonly Fase[] = [0, 1, 2, 3, 4, 5, 6, 7, 8];

export function puedeAprobar(tipo: TipoAprobable, rol: Rol, fase?: Fase): boolean {
  if (rol === 'consultor') return false;
  if (tipo === 'cierre_fase') return fase !== undefined && ROL_CIERRE[fase] === rol;
  return APROBADORES[tipo].includes(rol);
}

// ───────────────────────── estado de un proyecto ─────────────────────────

export interface EvidenciaMotor {
  readonly id: string;
  readonly requisitos: readonly string[];
  /** Solo la evidencia aprobada por el rol correcto cuenta. Una propuesta (de un agente o del consultor) no. */
  readonly aprobada: boolean;
}

export interface EstadoProyecto {
  readonly ediciones: readonly IdEdicion[];
  readonly evidencias: readonly EvidenciaMotor[];
  /** Requisitos que no aplican, con su justificación escrita (vacía = no cuenta como justificada). */
  readonly noAplica?: Readonly<Record<string, string>>;
  readonly fasesCerradas: readonly Fase[];
  readonly diagnosticoCompleto?: boolean;
  readonly planAprobado?: boolean;
  readonly simulacroRealizado?: boolean;
  readonly ncAbiertas?: number;
}

export interface Porcentaje { readonly cubiertos: number; readonly total: number; readonly pct: number }

const pct = (cubiertos: number, total: number): Porcentaje =>
  ({ cubiertos, total, pct: total === 0 ? 0 : Math.round((cubiertos * 1000) / total) / 10 });

/** Requisitos que aplican al proyecto: de sus ediciones y sin exclusión justificada. */
export function aplicables(estado: EstadoProyecto, c: Catalogo = CATALOGO): Requisito[] {
  const excluido = (id: string) => (estado.noAplica?.[id] ?? '').trim().length > 0;
  return c.requisitos.filter((r) => r.refs.some((x) => estado.ediciones.includes(x.edicion)) && !excluido(r.id));
}

/** Mapa requisito → evidencias aprobadas que lo cubren. */
export function cobertura(estado: EstadoProyecto): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const e of estado.evidencias) {
    if (!e.aprobada) continue;
    for (const id of e.requisitos) m.set(id, [...(m.get(id) ?? []), e.id]);
  }
  for (const v of m.values()) v.sort();
  return m;
}

export interface Avance {
  readonly global: Porcentaje;
  readonly porNorma: Readonly<Record<string, Porcentaje>>;
  readonly porClausula: Readonly<Record<string, readonly (Porcentaje & { clausula: string })[]>>;
  readonly porFase: Readonly<Record<Fase, Porcentaje>>;
  readonly requisitos: readonly { id: string; cubierto: boolean; evidencias: readonly string[] }[];
}

/** El avance: función pura. Mismos hechos → mismo número, siempre. */
export function avance(estado: EstadoProyecto, c: Catalogo = CATALOGO): Avance {
  const ap = aplicables(estado, c);
  const cob = cobertura(estado);
  const cubierto = (r: Requisito) => (cob.get(r.id)?.length ?? 0) > 0;
  const porNorma: Record<string, Porcentaje> = {};
  const porClausula: Record<string, (Porcentaje & { clausula: string })[]> = {};
  for (const ed of [...estado.ediciones].sort()) {
    const deEsta = ap.filter((r) => r.refs.some((x) => x.edicion === ed));
    porNorma[ed] = pct(deEsta.filter(cubierto).length, deEsta.length);
    const clausulas = new Map<string, Requisito[]>();
    for (const r of deEsta) for (const x of r.refs) if (x.edicion === ed) {
      const principal = x.clausula.startsWith('A.') ? 'Anexo A' : x.clausula.split('.')[0]!;
      clausulas.set(principal, [...(clausulas.get(principal) ?? []), r]);
    }
    porClausula[ed] = [...clausulas.entries()]
      .map(([clausula, rs]) => { const u = [...new Map(rs.map((r) => [r.id, r])).values()]; return { clausula, ...pct(u.filter(cubierto).length, u.length) }; })
      .sort((a, b) => (a.clausula === 'Anexo A' ? 1 : b.clausula === 'Anexo A' ? -1 : comparaClausula(a.clausula, b.clausula)));
  }
  const porFase = Object.fromEntries(
    ([0, 1, 2, 3, 4, 5, 6, 7, 8] as Fase[]).map((f) => { const rs = ap.filter((r) => r.fase === f); return [f, pct(rs.filter(cubierto).length, rs.length)]; }),
  ) as Record<Fase, Porcentaje>;
  return {
    global: pct(ap.filter(cubierto).length, ap.length),
    porNorma, porClausula, porFase,
    requisitos: ap.map((r) => ({ id: r.id, cubierto: cubierto(r), evidencias: cob.get(r.id) ?? [] })),
  };
}

// ───────────────────────── puertas ─────────────────────────

export interface Falta {
  readonly tipo: 'requisito' | 'fase-previa' | 'condicion';
  readonly id: string;
  readonly motivo: string;
}

export interface Puerta {
  readonly fase: Fase;
  readonly nombre: string;
  readonly cerrada: boolean;
  /** `true` = los hechos alcanzan; todavía falta que el rol correcto la cierre. */
  readonly puedeCerrarse: boolean;
  readonly rolRequerido: Rol;
  readonly faltan: readonly Falta[];
  /** Requisitos de la fase con información documentada obligatoria (los que abren o traban la puerta). */
  readonly obligatorios: readonly string[];
}

/**
 * La puerta de una fase. Regla:
 *   - fase 0: diagnóstico completo + plan de proyecto aprobado;
 *   - fases 1-7: la fase anterior cerrada + todo requisito aplicable de la fase con información documentada
 *     obligatoria cubierto por evidencia aprobada;
 *   - fase 8: fases 0-7 cerradas + simulacro realizado + cero no conformidades abiertas.
 */
export function puerta(estado: EstadoProyecto, fase: Fase, c: Catalogo = CATALOGO): Puerta {
  const faltan: Falta[] = [];
  const cob = cobertura(estado);
  const obligatorios = aplicables(estado, c).filter((r) => r.fase === fase && r.doc !== null);
  if (fase === 0) {
    if (!estado.diagnosticoCompleto) faltan.push({ tipo: 'condicion', id: 'diagnostico', motivo: 'El diagnóstico no está completo' });
    if (!estado.planAprobado) faltan.push({ tipo: 'condicion', id: 'plan-proyecto', motivo: 'Falta aprobar el plan del proyecto' });
  } else {
    const previa = (fase - 1) as Fase;
    if (!estado.fasesCerradas.includes(previa)) faltan.push({ tipo: 'fase-previa', id: `fase-${previa}`, motivo: `Primero se cierra la fase ${previa} (${NOMBRE_FASE[previa]})` });
    for (const r of obligatorios) if (!(cob.get(r.id)?.length)) faltan.push({ tipo: 'requisito', id: r.id, motivo: `Falta evidencia aprobada: ${r.tema}` });
    if (fase === 8) {
      for (const f of [0, 1, 2, 3, 4, 5, 6, 7] as Fase[]) if (f !== 7 && !estado.fasesCerradas.includes(f)) faltan.push({ tipo: 'fase-previa', id: `fase-${f}`, motivo: `La fase ${f} sigue abierta` });
      if (!estado.simulacroRealizado) faltan.push({ tipo: 'condicion', id: 'simulacro', motivo: 'Falta el simulacro de auditoría' });
      if ((estado.ncAbiertas ?? 0) > 0) faltan.push({ tipo: 'condicion', id: 'nc-abiertas', motivo: `Hay ${estado.ncAbiertas} no conformidad(es) abierta(s)` });
    }
  }
  return {
    fase, nombre: NOMBRE_FASE[fase], cerrada: estado.fasesCerradas.includes(fase),
    puedeCerrarse: faltan.length === 0, rolRequerido: ROL_CIERRE[fase], faltan,
    obligatorios: obligatorios.map((r) => r.id),
  };
}

export type ResultadoCierre = { readonly ok: true } | { readonly ok: false; readonly motivo: string };

/** ¿Puede ESTA persona cerrar ESTA puerta ahora? Hechos + rol, nada más. */
export function autorizaCierre(estado: EstadoProyecto, fase: Fase, rol: Rol, c: Catalogo = CATALOGO): ResultadoCierre {
  const p = puerta(estado, fase, c);
  if (p.cerrada) return { ok: false, motivo: 'La fase ya está cerrada' };
  if (!p.puedeCerrarse) return { ok: false, motivo: `Faltan ${p.faltan.length} punto(s): ${p.faltan.slice(0, 3).map((f) => f.motivo).join('; ')}` };
  if (!puedeAprobar('cierre_fase', rol, fase)) return { ok: false, motivo: `La fase ${fase} solo la cierra: ${p.rolRequerido}` };
  return { ok: true };
}

/** La primera fase abierta: donde está parado el proyecto. */
export const faseActual = (estado: EstadoProyecto): Fase => FASES.find((f) => !estado.fasesCerradas.includes(f)) ?? 8;

// ───────────────────────── migración de edición ─────────────────────────

export interface Migracion {
  readonly desde: IdEdicion;
  readonly hacia: IdEdicion;
  /** Mismo requisito, mismo número: la evidencia sigue valiendo tal cual. */
  readonly siguen: readonly string[];
  /** Mismo requisito, otro número: la evidencia sigue valiendo, cambia la referencia. */
  readonly remapeados: readonly { id: string; de: string; a: string }[];
  /** Requisitos que la edición nueva añade: piden evidencia nueva. */
  readonly nuevos: readonly string[];
  /** Requisitos que la edición nueva ya no tiene. */
  readonly retirados: readonly string[];
  /** Evidencias aprobadas que siguen contando completas en la edición nueva. */
  readonly evidenciasVigentes: readonly string[];
  /** Evidencias que pierden algún requisito (lo que cubrían desaparece). */
  readonly evidenciasARevisar: readonly string[];
}

export function migraEdicion(desde: IdEdicion, hacia: IdEdicion, evidencias: readonly EvidenciaMotor[] = [], c: Catalogo = CATALOGO): Migracion {
  const siguen: string[] = [], nuevos: string[] = [], retirados: string[] = [];
  const remapeados: { id: string; de: string; a: string }[] = [];
  for (const r of c.requisitos) {
    const a = r.refs.filter((x) => x.edicion === desde).map((x) => x.clausula).sort(comparaClausula);
    const b = r.refs.filter((x) => x.edicion === hacia).map((x) => x.clausula).sort(comparaClausula);
    if (a.length && b.length) {
      if (a.join() === b.join()) siguen.push(r.id);
      else remapeados.push({ id: r.id, de: a.join(', '), a: b.join(', ') });
    } else if (a.length) retirados.push(r.id);
    else if (b.length) nuevos.push(r.id);
  }
  const fuera = new Set(retirados);
  const vigentes: string[] = [], aRevisar: string[] = [];
  for (const e of evidencias) {
    if (!e.aprobada) continue;
    (e.requisitos.some((id) => fuera.has(id)) ? aRevisar : vigentes).push(e.id);
  }
  return { desde, hacia, siguen, remapeados, nuevos, retirados, evidenciasVigentes: vigentes.sort(), evidenciasARevisar: aRevisar.sort() };
}

// ───────────────────────── diagnóstico (puntaje fijo) ─────────────────────────

export type Respuesta = 'si' | 'parcial' | 'no' | 'no-se';

/**
 * Madurez por cláusula, 0 a 5, con una regla fija: sí = 1, parcial = 0.5, no / no sé = 0; el promedio por 5,
 * redondeado a medio punto. El agente de diagnóstico redacta el informe; el puntaje no lo decide él.
 */
export function madurez(respuestas: Readonly<Record<string, Respuesta>>, ediciones: readonly IdEdicion[], c: Catalogo = CATALOGO):
  { porClausula: Record<string, number>; global: number; contestadas: number; total: number } {
  const valor: Record<Respuesta, number> = { si: 1, parcial: 0.5, no: 0, 'no-se': 0 };
  const grupos = new Map<string, number[]>();
  const ap = c.requisitos.filter((r) => r.refs.some((x) => ediciones.includes(x.edicion)));
  let contestadas = 0;
  for (const r of ap) {
    const resp = respuestas[r.id];
    if (!resp) continue;
    contestadas++;
    const clave = r.familia === 'A' ? 'Anexo A' : r.id.split('-')[2]!.split('.')[0]!;
    grupos.set(clave, [...(grupos.get(clave) ?? []), valor[resp]]);
  }
  const medioPunto = (x: number) => Math.round(x * 2) / 2;
  const porClausula = Object.fromEntries([...grupos.entries()].sort(([a], [b]) => (a === 'Anexo A' ? 1 : b === 'Anexo A' ? -1 : Number(a) - Number(b)))
    .map(([k, v]) => [k, medioPunto((v.reduce((s, x) => s + x, 0) / v.length) * 5)]));
  const todas = [...grupos.values()].flat();
  return { porClausula, global: todas.length ? medioPunto((todas.reduce((s, x) => s + x, 0) / todas.length) * 5) : 0, contestadas, total: ap.length };
}

/**
 * Qué preguntar en el diagnóstico (adaptativo): sin sistemas de IA no hay preguntas del Anexo A ni del cuerpo propio
 * de la IA; si no diseñan, se salta el diseño; si responden «no» a la ficha de procesos, no se profundiza en cada
 * proceso de operación hasta tenerla.
 */
export function preguntasDiagnostico(opts: { ediciones: readonly IdEdicion[]; usaIA: boolean; disena: boolean; respuestas?: Readonly<Record<string, Respuesta>> }, c: Catalogo = CATALOGO): Requisito[] {
  const base = c.requisitos.filter((r) => r.refs.some((x) => opts.ediciones.includes(x.edicion)));
  return base.filter((r) => {
    if (!opts.usaIA && (r.familia === 'A' || r.familia === 'IA')) return false;
    if (!opts.disena && r.id.startsWith('SGI-Q-8.3-') && r.id !== 'SGI-Q-8.3-01') return false;
    if (opts.respuestas?.['SGI-Q-4.4-02'] === 'no' && /^SGI-Q-8\.5-0[2-6]$/.test(r.id)) return false;
    return true;
  });
}
