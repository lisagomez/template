/**
 * Correr un agente de verdad sobre una organización y convertir su salida en PROPUESTAS: filas o documentos en
 * borrador. Nada queda aprobado: aprobar es de una persona con el rol correcto. Cada corrida deja su traza (agente,
 * modelo pineado, versión de prompt, huellas de insumos y salida, IDs citados, uso y costo o null).
 * Cliente y modelo inyectados: lo usa la app (sesión por cookies) y el laboratorio (cuenta sintética).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AGENTES, ejecutaAgente, type AgenteId, type EntradaAgente, type EvidenciaDeTerceros, type ModeloLLM, type ResultadoAgente, type SalidaAgente,
} from '../../../../tools/sistema-integrado/dist/agentes/index.js';
import { detectaGenerico, textoDe } from '../../../../tools/sistema-integrado/dist/documentos/index.js';
import { existe, requisitosDe, requisito, type IdEdicion } from '../../../../tools/sistema-integrado/dist/catalogo/index.js';
import { avance, madurez, puerta, faseActual, type Respuesta } from '../../../../tools/sistema-integrado/dist/index.js';
import { costeUsd, type ClaseDeTarea } from '../../../lib/ai/routing.ts';
import { perfilDe, terminosPropios, type Contexto } from './contexto.ts';
import { presupuestoDe } from './llm.ts';

export interface Corrida {
  readonly ok: boolean;
  readonly mensaje: string;
  readonly trazaId: string | null;
  readonly costoUsd: number | null;
  readonly resultado: ResultadoAgente | null;
  readonly creados: readonly { tabla: string; id: string }[];
}

type Ctx = Contexto & { proyecto: NonNullable<Contexto['proyecto']>; estado: NonNullable<Contexto['estado']> };

export const deProyecto = (ctx: Contexto): ctx is Ctx => ctx.proyecto !== null && ctx.estado !== null;

const ediciones = (ctx: Ctx) => ctx.proyecto.ediciones as IdEdicion[];
const ids = (ctx: Ctx, filtro: (id: string) => boolean) => requisitosDe(ediciones(ctx)).map((r) => r.id).filter(filtro);

// ───────────────────────── entradas por agente ─────────────────────────

export function entradaDiagnostico(ctx: Ctx): EntradaAgente {
  const resp = ctx.proyecto.diagnostico as Record<string, Respuesta>;
  const m = madurez(resp, ediciones(ctx));
  const pendientes = Object.entries(resp).filter(([, v]) => v !== 'si').map(([id, v]) => `${id}: ${v}`);
  return {
    organizacion: perfilDe(ctx), ediciones: ediciones(ctx),
    tarea: 'Redacta el informe de brechas (GAP) de esta empresa a partir de las respuestas del cuestionario. El puntaje de madurez ya viene calculado: úsalo tal cual.',
    requisitos: Object.keys(resp).filter((id) => existe(id)),
    datos: { madurez_por_clausula_0_a_5: m.porClausula, madurez_global_0_a_5: m.global, preguntas_contestadas: `${m.contestadas} de ${m.total}`, respuestas_no_parcial_nose: pendientes },
  };
}

export function entradaContexto(ctx: Ctx): EntradaAgente {
  return {
    organizacion: perfilDe(ctx), ediciones: ediciones(ctx),
    tarea: 'Propón los asuntos internos y externos (FODA/PESTEL) y las partes interesadas de esta empresa, con lo que necesita cada una.',
    requisitos: ids(ctx, (id) => /^SGI-(C|Q|IA)-4\./.test(id)),
  };
}

export type EnfoqueRiesgos = 'riesgos' | 'impacto' | 'soa';
export function entradaRiesgos(ctx: Ctx, enfoque: EnfoqueRiesgos, existentes: readonly string[] = []): EntradaAgente {
  const tareas: Record<EnfoqueRiesgos, string> = {
    riesgos: 'Propón la matriz de riesgos y oportunidades de calidad y los riesgos de IA de cada sistema de IA de la empresa.',
    impacto: 'Propón la evaluación de impacto de cada sistema de IA de la empresa: a quién puede afectar, con qué severidad y con qué medidas.',
    soa: 'Propón la declaración de aplicabilidad: para CADA control del Anexo A (IDs SGI-A-…) di si aplica a esta empresa y por qué, según su papel frente a cada sistema de IA (la usa, la integra o la desarrolla).',
  };
  const req = enfoque === 'soa' ? ids(ctx, (id) => id.startsWith('SGI-A-') || id === 'SGI-IA-6.1-08')
    : enfoque === 'impacto' ? ids(ctx, (id) => /^SGI-(IA-6\.1-10|IA-8\.4-01|A-5\.)/.test(id))
      : ids(ctx, (id) => /^SGI-(C|Q|IA)-6\.1-/.test(id) || id === 'SGI-IA-8.2-01');
  return {
    organizacion: perfilDe(ctx), ediciones: ediciones(ctx), tarea: tareas[enfoque], requisitos: req,
    datos: { ya_registrados: existentes.slice(0, 20), sistemas_de_ia: ctx.sistemasIA.map((s) => `${s.nombre} (${s.papel}): ${s.proposito}; datos: ${s.datos}`) },
  };
}

export interface PedidoDocumento { readonly tipo: string; readonly titulo: string; readonly requisitos: readonly string[]; readonly instruccion?: string }
export function entradaDocumental(ctx: Ctx, pedido: PedidoDocumento, evidencias: readonly EvidenciaDeTerceros[] = []): EntradaAgente {
  return {
    organizacion: perfilDe(ctx), ediciones: ediciones(ctx),
    tarea: `Redacta el borrador de «${pedido.titulo}» (${pedido.tipo}) para esta empresa.${pedido.instruccion ? ` Indicaciones de quien lo pide: ${pedido.instruccion}` : ''}`,
    requisitos: pedido.requisitos.filter((id) => existe(id)), evidencias,
  };
}

export function entradaCapacitacion(ctx: Ctx): EntradaAgente {
  return {
    organizacion: perfilDe(ctx), ediciones: ediciones(ctx),
    tarea: 'Propón la matriz de competencias por puesto (incluidos los puestos que operan o supervisan sistemas de IA) y el plan de capacitación.',
    requisitos: ids(ctx, (id) => /^SGI-(C-7\.[23]-|Q-7\.3-|Q-7\.1-07|A-4\.6-)/.test(id)),
  };
}

export function entradaProveedores(ctx: Ctx, proveedores: readonly { nombre: string; tipo: string; suministra: string }[]): EntradaAgente {
  return {
    organizacion: perfilDe(ctx), ediciones: ediciones(ctx),
    tarea: 'Propón criterios de evaluación de proveedores (incluidos los de IA) y una evaluación de cada proveedor de la lista, SOLO con los hechos dados.',
    requisitos: ids(ctx, (id) => /^SGI-(Q-8\.4-|A-10\.)/.test(id)),
    datos: { proveedores: proveedores.map((p) => `${p.nombre} — ${p.tipo} — ${p.suministra}`) },
  };
}

export function entradaKpis(ctx: Ctx): EntradaAgente {
  return {
    organizacion: perfilDe(ctx), ediciones: ediciones(ctx),
    tarea: 'Propón de 4 a 6 indicadores medibles con fórmula y meta para esta empresa, incluidos los de sus sistemas de IA si los tiene.',
    requisitos: ids(ctx, (id) => /^SGI-(C-6\.2-|C-9\.1-|Q-9\.1-|A-9\.3-)/.test(id)),
  };
}

export function entradaAuditoria(ctx: Ctx, alcance: string, notas?: string, evidencias: readonly EvidenciaDeTerceros[] = []): EntradaAgente {
  return {
    organizacion: perfilDe(ctx), ediciones: ediciones(ctx),
    tarea: notas
      ? `Redacta los hallazgos en borrador a partir de las notas del auditor. Alcance: ${alcance}. Notas del auditor: ${notas}`
      : `Prepara la lista de verificación y el muestreo de la auditoría. Alcance: ${alcance}.`,
    requisitos: requisitosDe(ediciones(ctx)).map((r) => r.id), evidencias,
  };
}

export function entradaPortafolio(ctx: Ctx): EntradaAgente {
  const a = avance(ctx.estado);
  const f = faseActual(ctx.estado);
  const p = puerta(ctx.estado, f);
  return {
    organizacion: perfilDe(ctx), ediciones: ediciones(ctx),
    tarea: 'Redacta el reporte de avance del mes que el consultor envía a esta empresa, con los números que vienen calculados.',
    requisitos: [...new Set([...p.faltan.filter((x) => x.tipo === 'requisito').map((x) => x.id), ...p.obligatorios])],
    datos: {
      avance_global_pct: a.global.pct, avance_por_norma_pct: Object.fromEntries(Object.entries(a.porNorma).map(([k, v]) => [k, v.pct])),
      fase_actual: `${f} (${p.nombre})`, puerta_puede_cerrarse: p.puedeCerrarse, faltan: p.faltan.map((x) => x.motivo),
    },
  };
}

// ───────────────────────── correr ─────────────────────────

export async function correAgente(sb: SupabaseClient, ctx: Ctx, agente: AgenteId, entrada: EntradaAgente, modelo: ModeloLLM | null): Promise<Omit<Corrida, 'creados'>> {
  const tarjeta = AGENTES[agente];
  if (!modelo) return { ok: false, mensaje: 'Falta la llave del proveedor de modelos: el agente no corre y no se inventa ninguna respuesta.', trazaId: null, costoUsd: null, resultado: null };
  const pres = await presupuestoDe(sb, ctx.org.id);
  if (pres.nivel === 'excedido') return { ok: false, mensaje: `Agentes en pausa este mes para esta organización. ${pres.mensaje}`, trazaId: null, costoUsd: null, resultado: null };
  const r = await ejecutaAgente(agente, entrada, { modelo });
  const costo = r.traza.uso && tarjeta.clase ? costeUsd(tarjeta.clase as ClaseDeTarea, r.traza.uso) : null;
  const { data, error } = await sb.from('sgi_traza').insert({
    organizacion_id: ctx.org.id, proyecto_id: ctx.proyecto.id, agente, version_prompt: r.traza.versionPrompt, modelo: r.traza.modelo,
    insumos: r.traza.insumos, salida_huella: r.traza.salidaHuella, requisitos_citados: r.traza.requisitosCitados,
    uso: r.traza.uso, costo_usd: costo, intentos: r.traza.intentos, alertas: r.traza.alertas, ok: r.ok,
    salida: r.ok ? r.salida : null, errores: r.ok ? [] : r.errores, creado_por: ctx.userId,
  }).select('id').single();
  if (error) throw new Error(`no se pudo guardar la traza: ${error.message}`);
  const aviso = pres.nivel === 'aviso' ? ` ${pres.mensaje}` : '';
  return {
    ok: r.ok, trazaId: String(data.id), costoUsd: costo, resultado: r,
    mensaje: r.ok ? `Propuesta lista (${r.traza.requisitosCitados.length} requisitos citados${costo !== null ? `, US$${costo.toFixed(4)}` : ', costo sin reportar'}).${aviso}` : `El agente no dio una propuesta válida: ${r.errores.join('; ')}`,
  };
}

// ───────────────────────── materializar (siempre como propuesta) ─────────────────────────

export async function nuevoDocumento(sb: SupabaseClient, ctx: Ctx, d: { tipo: string; titulo: string; requisitos: readonly string[]; secciones: readonly { titulo: string; parrafos: readonly string[] }[]; trazaId: string | null }) {
  const g = detectaGenerico(textoDe({ titulo: d.titulo, secciones: d.secciones }), { nombre: ctx.org.nombre, terminos: terminosPropios(ctx) });
  const doc = await sb.from('sgi_documento').insert({ organizacion_id: ctx.org.id, proyecto_id: ctx.proyecto.id, tipo: d.tipo, titulo: d.titulo.slice(0, 200), requisitos: [...new Set(d.requisitos)].filter((id) => existe(id)) }).select('id').single();
  if (doc.error) throw new Error(`documento: ${doc.error.message}`);
  const ver = await sb.from('sgi_documento_version').insert({
    documento_id: doc.data.id, organizacion_id: ctx.org.id, numero: 1, contenido: { secciones: d.secciones },
    generico: g.generico, motivo_generico: g.motivo, traza_id: d.trazaId,
  }).select('id').single();
  if (ver.error) throw new Error(`versión: ${ver.error.message}`);
  return { documentoId: String(doc.data.id), versionId: String(ver.data.id), genericidad: g };
}

const n15 = (v: unknown, def = 3) => Math.min(5, Math.max(1, Math.round(Number(v) || def)));
const texto = (v: unknown) => (v === undefined || v === null ? '' : String(v));
const citados = (s: SalidaAgente) => [...new Set(s.propuestas.flatMap((p) => p.requisitos))];

export async function materializa(sb: SupabaseClient, ctx: Ctx, agente: AgenteId, s: SalidaAgente, trazaId: string | null, extra: { tipoDocumento?: string; tituloDocumento?: string; auditoriaId?: string } = {}): Promise<{ tabla: string; id: string }[]> {
  const creados: { tabla: string; id: string }[] = [];
  const base = { organizacion_id: ctx.org.id, proyecto_id: ctx.proyecto.id, traza_id: trazaId };
  const inserta = async (tabla: string, filas: Record<string, unknown>[]) => {
    if (!filas.length) return;
    const r = await sb.from(tabla).insert(filas).select('id');
    if (r.error) throw new Error(`${tabla}: ${r.error.message}`);
    creados.push(...(r.data ?? []).map((x) => ({ tabla, id: String(x.id) })));
  };
  const seccionesDe = (tipos: Record<string, string>) => Object.entries(tipos).map(([tipo, titulo]) => ({
    titulo, parrafos: s.propuestas.filter((p) => p.tipo === tipo).map((p) => `${p.titulo}: ${p.detalle} (${p.requisitos.join(', ')})`),
  })).filter((x) => x.parrafos.length);
  switch (agente) {
    case 'documental': {
      const d = await nuevoDocumento(sb, ctx, { tipo: extra.tipoDocumento ?? 'procedimiento', titulo: s.documento?.titulo ?? extra.tituloDocumento ?? 'Documento', requisitos: citados(s), secciones: s.documento?.secciones ?? [], trazaId });
      creados.push({ tabla: 'sgi_documento_version', id: d.versionId });
      break;
    }
    case 'diagnostico':
    case 'portafolio': {
      const titulo = agente === 'diagnostico' ? 'Informe de brechas (GAP)' : `Reporte de avance — ${new Date().toISOString().slice(0, 7)}`;
      const secciones = [{ titulo: 'Resumen', parrafos: [s.resumen] }, ...seccionesDe(agente === 'diagnostico'
        ? { prioridad: 'Primeros pasos', brecha: 'Brechas', fortaleza: 'Fortalezas' } : { mensaje: 'Cómo vamos', siguiente_paso: 'Siguientes pasos', alerta: 'Lo que traba el avance' })];
      const d = await nuevoDocumento(sb, ctx, { tipo: 'informe', titulo, requisitos: citados(s), secciones, trazaId });
      creados.push({ tabla: 'sgi_documento_version', id: d.versionId });
      break;
    }
    case 'contexto': {
      await inserta('sgi_asunto', s.propuestas.filter((p) => p.tipo.startsWith('asunto_')).map((p) => ({ ...base, tipo: p.tipo === 'asunto_interno' ? 'interno' : 'externo', categoria: texto(p.datos?.categoria).slice(0, 40), descripcion: `${p.titulo}: ${p.detalle}`.slice(0, 1000), efecto: texto(p.datos?.efecto) === 'positivo' ? 'positivo' : 'negativo', requisitos: p.requisitos })));
      await inserta('sgi_parte_interesada', s.propuestas.filter((p) => p.tipo === 'parte_interesada').map((p) => ({ ...base, nombre: p.titulo.slice(0, 120), necesidades: (texto(p.datos?.necesidades) || p.detalle).slice(0, 1000), se_atiende: texto(p.datos?.se_atiende_con) !== 'no', requisitos: p.requisitos })));
      break;
    }
    case 'riesgos': {
      const sistema = (v: unknown) => ctx.sistemasIA.find((x) => texto(v).toLowerCase().includes(x.nombre.toLowerCase().slice(0, 12)) || x.nombre.toLowerCase().includes(texto(v).toLowerCase().slice(0, 12)))?.id ?? null;
      await inserta('sgi_riesgo', s.propuestas.filter((p) => ['riesgo', 'oportunidad', 'riesgo_ia'].includes(p.tipo)).map((p) => ({ ...base, tipo: p.tipo, descripcion: `${p.titulo}: ${p.detalle}`.slice(0, 1000), probabilidad: n15(p.datos?.probabilidad), impacto: n15(p.datos?.impacto), tratamiento: texto(p.datos?.tratamiento).slice(0, 1000), sistema_ia_id: p.tipo === 'riesgo_ia' ? sistema(p.datos?.sistema) : null, requisitos: p.requisitos })));
      await inserta('sgi_evaluacion_impacto', s.propuestas.filter((p) => p.tipo === 'impacto_ia' && sistema(p.datos?.sistema)).map((p) => ({ ...base, sistema_ia_id: sistema(p.datos?.sistema), afectados: (texto(p.datos?.afectados) || 'por definir').slice(0, 500), descripcion: `${p.titulo}: ${p.detalle}`.slice(0, 2000), severidad: ['baja', 'media', 'alta'].includes(texto(p.datos?.severidad)) ? texto(p.datos?.severidad) : 'media', medidas: texto(p.datos?.medidas).slice(0, 2000), requisitos: p.requisitos })));
      const soa = s.propuestas.filter((p) => p.tipo === 'control_soa').map((p) => {
        const req = p.requisitos.find((id) => id.startsWith('SGI-A-'));
        const control = req ? requisito(req)?.refs[0]?.clausula : undefined;
        return control && req ? { ...base, control, requisito_id: req, aplica: p.datos?.aplica !== false && texto(p.datos?.aplica) !== 'false', justificacion: (texto(p.datos?.justificacion) || p.detalle).slice(0, 1000).padEnd(5, '.'), estado_impl: ['no_iniciado', 'en_curso', 'implementado'].includes(texto(p.datos?.estado)) ? texto(p.datos?.estado) : 'no_iniciado' } : null;
      }).filter((x) => x !== null);
      if (soa.length) {
        const r = await sb.from('sgi_control_soa').upsert(soa, { onConflict: 'proyecto_id,control' }).select('id');
        if (r.error) throw new Error(`sgi_control_soa: ${r.error.message}`);
        creados.push(...(r.data ?? []).map((x) => ({ tabla: 'sgi_control_soa', id: String(x.id) })));
      }
      await inserta('sgi_objetivo', s.propuestas.filter((p) => p.tipo === 'objetivo').map((p) => ({ ...base, descripcion: p.titulo.slice(0, 500), meta: (texto(p.datos?.meta) || p.detalle).slice(0, 200), requisitos: p.requisitos })));
      break;
    }
    case 'capacitacion':
      await inserta('sgi_competencia', s.propuestas.filter((p) => p.tipo === 'brecha_competencia').map((p) => ({ ...base, puesto: (texto(p.datos?.puesto) || p.titulo).slice(0, 80), competencia: p.detalle.slice(0, 300), nivel_requerido: texto(p.datos?.nivel_requerido).slice(0, 80), como_se_evalua: texto(p.datos?.como_se_evalua).slice(0, 300), requisitos: p.requisitos })));
      if (s.propuestas.some((p) => p.tipo === 'curso')) {
        const d = await nuevoDocumento(sb, ctx, { tipo: 'plan_capacitacion', titulo: 'Plan de capacitación', requisitos: citados(s), secciones: seccionesDe({ curso: 'Cursos', evaluacion_eficacia: 'Cómo sabremos que funcionó', brecha_competencia: 'Brechas por puesto' }), trazaId });
        creados.push({ tabla: 'sgi_documento_version', id: d.versionId });
      }
      break;
    case 'proveedores': {
      for (const p of s.propuestas.filter((x) => x.tipo === 'evaluacion_proveedor')) {
        const nombre = texto(p.datos?.proveedor) || p.titulo;
        const rec = texto(p.datos?.recomendacion);
        const r = await sb.from('sgi_proveedor').update({ puntaje: Math.min(100, Math.max(0, Math.round(Number(p.datos?.puntaje) || 0))), recomendacion: ['aprobar', 'condicionar', 'no_aprobar'].includes(rec) ? rec : null, traza_id: trazaId })
          .eq('organizacion_id', ctx.org.id).ilike('nombre', `%${nombre.split(/[—(-]/)[0]!.trim().slice(0, 30)}%`).eq('estado', 'propuesto').select('id');
        creados.push(...(r.data ?? []).map((x) => ({ tabla: 'sgi_proveedor', id: String(x.id) })));
      }
      const d = await nuevoDocumento(sb, ctx, { tipo: 'procedimiento', titulo: 'Criterios de selección y evaluación de proveedores', requisitos: citados(s), secciones: seccionesDe({ criterio: 'Criterios', requisito_a_proveedor: 'Lo que se pide por escrito al proveedor', evaluacion_proveedor: 'Evaluaciones propuestas' }), trazaId });
      creados.push({ tabla: 'sgi_documento_version', id: d.versionId });
      break;
    }
    case 'kpis':
      await inserta('sgi_indicador', s.propuestas.filter((p) => p.tipo === 'indicador').map((p) => ({ ...base, nombre: p.titulo.slice(0, 160), formula: (texto(p.datos?.formula) || p.detalle).slice(0, 500), meta: Number.parseFloat(texto(p.datos?.meta).replace(/[^0-9.-]/g, '')) || 0, unidad: texto(p.datos?.unidad).slice(0, 20) || '%', frecuencia: ['mensual', 'trimestral', 'semestral', 'anual'].includes(texto(p.datos?.frecuencia)) ? texto(p.datos?.frecuencia) : 'mensual', requisitos: p.requisitos })));
      await inserta('sgi_objetivo', s.propuestas.filter((p) => p.tipo === 'objetivo').map((p) => ({ ...base, descripcion: p.titulo.slice(0, 500), meta: (texto(p.datos?.meta) || p.detalle).slice(0, 200), requisitos: p.requisitos })));
      break;
    case 'auditoria': {
      const checklist = s.propuestas.filter((p) => p.tipo === 'pregunta_auditoria' || p.tipo === 'muestra').map((p) => ({ tipo: p.tipo, titulo: p.titulo, detalle: p.detalle, requisitos: p.requisitos, datos: p.datos ?? {} }));
      if (checklist.length && extra.auditoriaId) {
        const r = await sb.from('sgi_auditoria').update({ checklist, traza_id: trazaId }).eq('id', extra.auditoriaId).select('id');
        if (r.error) throw new Error(`auditoría: ${r.error.message}`);
      }
      if (extra.auditoriaId) {
        const clasif = (v: unknown) => (['no_conformidad_mayor', 'no_conformidad_menor', 'observacion', 'oportunidad_de_mejora'].includes(texto(v)) ? texto(v) : 'observacion');
        await inserta('sgi_hallazgo', s.propuestas.filter((p) => p.tipo === 'hallazgo' && p.requisitos.length).map((p) => ({ auditoria_id: extra.auditoriaId, organizacion_id: ctx.org.id, requisito_id: p.requisitos[0], clasificacion: clasif(p.datos?.clasificacion), descripcion: `${p.titulo}: ${p.detalle}`.slice(0, 2000), evidencia_observada: texto(p.datos?.evidencia_observada).slice(0, 2000), traza_id: trazaId })));
      }
      break;
    }
    case 'orquestador':
      break;
  }
  return creados;
}

export async function correYMaterializa(sb: SupabaseClient, ctx: Ctx, agente: AgenteId, entrada: EntradaAgente, modelo: ModeloLLM | null, extra: Parameters<typeof materializa>[5] = {}): Promise<Corrida> {
  const c = await correAgente(sb, ctx, agente, entrada, modelo);
  if (!c.ok || !c.resultado?.ok) return { ...c, creados: [] };
  const creados = await materializa(sb, ctx, agente, c.resultado.salida, c.trazaId, extra);
  return { ...c, creados };
}
