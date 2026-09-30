/**
 * «Fotografiar» una matriz viva (riesgos, SoA, impacto de IA, objetivos, contexto, competencias) en una VERSIÓN de
 * documento con huella. Lo que se aprueba es esa versión exacta: si la matriz cambia después, hace falta una foto
 * nueva y otra aprobación. Texto determinista (sin LLM): mismas filas, misma huella.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { requisitosDe, type IdEdicion } from '../../../../tools/sistema-integrado/dist/catalogo/index.js';
import type { Contexto } from './contexto.ts';
import { nuevoDocumento } from './agentes.ts';

export type Foto = 'riesgos' | 'soa' | 'evaluacion_impacto' | 'objetivos' | 'contexto' | 'competencias';

const REQUISITOS: Record<Foto, string[]> = {
  riesgos: ['SGI-C-6.1-01', 'SGI-C-6.1-02', 'SGI-Q-6.1-03', 'SGI-Q-6.1-04', 'SGI-IA-6.1-05', 'SGI-IA-6.1-06', 'SGI-IA-6.1-07', 'SGI-IA-8.2-01'],
  soa: ['SGI-IA-6.1-08', 'SGI-IA-6.1-09'],
  evaluacion_impacto: ['SGI-IA-6.1-10', 'SGI-IA-8.4-01', 'SGI-A-5.2-01', 'SGI-A-5.3-01', 'SGI-A-5.4-01', 'SGI-A-5.5-01'],
  objetivos: ['SGI-C-6.2-01', 'SGI-C-6.2-02', 'SGI-C-9.1-01'],
  contexto: ['SGI-C-4.1-01', 'SGI-Q-4.1-02', 'SGI-IA-4.1-03', 'SGI-C-4.2-01', 'SGI-Q-4.2-02', 'SGI-IA-4.2-03'],
  competencias: ['SGI-C-7.2-01', 'SGI-A-4.6-01'],
};
const TITULO: Record<Foto, string> = {
  riesgos: 'Matriz de riesgos y oportunidades', soa: 'Declaración de aplicabilidad (SoA)', evaluacion_impacto: 'Evaluación de impacto de sistemas de IA',
  objetivos: 'Objetivos e indicadores', contexto: 'Contexto de la organización y partes interesadas', competencias: 'Matriz de competencias por puesto',
};
const TIPO_DOC: Record<Foto, string> = {
  riesgos: 'riesgos', soa: 'soa', evaluacion_impacto: 'evaluacion_impacto', objetivos: 'objetivos', contexto: 'contexto', competencias: 'plan_capacitacion',
};

type Fila = Record<string, unknown>;
const s = (v: unknown) => String(v ?? '');

async function filas(sb: SupabaseClient, tabla: string, proyecto: string, columnas: string, orden = 'creado_en'): Promise<Fila[]> {
  const r = await sb.from(tabla).select(columnas).eq('proyecto_id', proyecto).order(orden);
  if (r.error) throw new Error(`${tabla}: ${r.error.message}`);
  return (r.data ?? []) as unknown as Fila[];
}

async function secciones(sb: SupabaseClient, ctx: Contexto, foto: Foto): Promise<{ titulo: string; parrafos: string[] }[]> {
  const p = ctx.proyecto!.id;
  const nombreIA = (id: unknown) => ctx.sistemasIA.find((x) => x.id === id)?.nombre ?? 'sistema de IA';
  switch (foto) {
    case 'riesgos': {
      const r = await filas(sb, 'sgi_riesgo', p, 'tipo, descripcion, probabilidad, impacto, nivel, tratamiento, sistema_ia_id');
      const de = (t: string) => r.filter((x) => x.tipo === t).sort((a, b) => Number(b.nivel) - Number(a.nivel))
        .map((x) => `${s(x.descripcion)} — probabilidad ${s(x.probabilidad)} × impacto ${s(x.impacto)} = ${s(x.nivel)}${x.sistema_ia_id ? ` — ${nombreIA(x.sistema_ia_id)}` : ''}. Tratamiento: ${s(x.tratamiento) || 'por definir'}.`);
      return [{ titulo: 'Riesgos de calidad', parrafos: de('riesgo') }, { titulo: 'Oportunidades', parrafos: de('oportunidad') }, { titulo: 'Riesgos de IA', parrafos: de('riesgo_ia') }].filter((x) => x.parrafos.length);
    }
    case 'soa': {
      const r = await filas(sb, 'sgi_control_soa', p, 'control, requisito_id, aplica, justificacion, estado_impl', 'control');
      return [
        { titulo: 'Controles que aplican', parrafos: r.filter((x) => x.aplica).map((x) => `${s(x.control)} (${s(x.requisito_id)}): ${s(x.justificacion)} Estado: ${s(x.estado_impl).replace('_', ' ')}.`) },
        { titulo: 'Controles que no aplican (con su razón)', parrafos: r.filter((x) => !x.aplica).map((x) => `${s(x.control)} (${s(x.requisito_id)}): ${s(x.justificacion)}`) },
      ].filter((x) => x.parrafos.length);
    }
    case 'evaluacion_impacto': {
      const r = await filas(sb, 'sgi_evaluacion_impacto', p, 'sistema_ia_id, afectados, descripcion, severidad, medidas');
      return ctx.sistemasIA.map((sis) => ({ titulo: sis.nombre, parrafos: r.filter((x) => x.sistema_ia_id === sis.id).map((x) => `${s(x.descripcion)} Afectados: ${s(x.afectados)}. Severidad ${s(x.severidad)}. Medidas: ${s(x.medidas) || 'por definir'}.`) })).filter((x) => x.parrafos.length);
    }
    case 'objetivos': {
      const [o, i] = await Promise.all([filas(sb, 'sgi_objetivo', p, 'descripcion, meta, plazo'), filas(sb, 'sgi_indicador', p, 'nombre, formula, meta, unidad, frecuencia')]);
      return [
        { titulo: 'Objetivos', parrafos: o.map((x) => `${s(x.descripcion)} — meta: ${s(x.meta)}${x.plazo ? `, para ${s(x.plazo)}` : ''}.`) },
        { titulo: 'Indicadores', parrafos: i.map((x) => `${s(x.nombre)}: ${s(x.formula)}. Meta ${s(x.meta)} ${s(x.unidad)}, ${s(x.frecuencia)}.`) },
      ].filter((x) => x.parrafos.length);
    }
    case 'contexto': {
      const [a, pi] = await Promise.all([filas(sb, 'sgi_asunto', p, 'tipo, categoria, descripcion, efecto'), filas(sb, 'sgi_parte_interesada', p, 'nombre, necesidades, se_atiende')]);
      return [
        { titulo: 'Asuntos internos', parrafos: a.filter((x) => x.tipo === 'interno').map((x) => `${s(x.descripcion)} (${s(x.efecto)}${x.categoria ? `, ${s(x.categoria)}` : ''})`) },
        { titulo: 'Asuntos externos', parrafos: a.filter((x) => x.tipo === 'externo').map((x) => `${s(x.descripcion)} (${s(x.efecto)}${x.categoria ? `, ${s(x.categoria)}` : ''})`) },
        { titulo: 'Partes interesadas', parrafos: pi.map((x) => `${s(x.nombre)}: ${s(x.necesidades)}${x.se_atiende ? '' : ' (no se atiende con el sistema)'}`) },
      ].filter((x) => x.parrafos.length);
    }
    case 'competencias': {
      const c = await filas(sb, 'sgi_competencia', p, 'puesto, competencia, nivel_requerido, como_se_evalua, brecha', 'puesto');
      return [...new Set(c.map((x) => s(x.puesto)))].map((puesto) => ({ titulo: puesto, parrafos: c.filter((x) => x.puesto === puesto).map((x) => `${s(x.competencia)}${x.nivel_requerido ? ` — nivel: ${s(x.nivel_requerido)}` : ''}${x.como_se_evalua ? ` — se evalúa: ${s(x.como_se_evalua)}` : ''}${x.brecha ? ' — BRECHA' : ''}`) }));
    }
  }
}

/** Crea la versión siguiente (o la primera) y la deja EN REVISIÓN. Devuelve el id de la versión. */
export async function fotografia(sb: SupabaseClient, ctx: Contexto, foto: Foto): Promise<{ versionId: string } | { error: string }> {
  if (!ctx.proyecto) return { error: 'La organización no tiene proyecto.' };
  const secs = await secciones(sb, ctx, foto);
  if (!secs.length) return { error: 'No hay filas que fotografiar todavía: primero propón o captura la matriz.' };
  const aplicables = new Set(requisitosDe(ctx.proyecto.ediciones as IdEdicion[]).map((r) => r.id));
  const requisitos = REQUISITOS[foto].filter((id) => aplicables.has(id));
  const previo = await sb.from('sgi_documento').select('id').eq('proyecto_id', ctx.proyecto.id).eq('tipo', TIPO_DOC[foto]).eq('titulo', TITULO[foto]).maybeSingle();
  let versionId: string;
  if (previo.data) {
    const ult = await sb.from('sgi_documento_version').select('numero').eq('documento_id', previo.data.id).order('numero', { ascending: false }).limit(1).maybeSingle();
    const v = await sb.from('sgi_documento_version').insert({ documento_id: previo.data.id, organizacion_id: ctx.org.id, numero: Number(ult.data?.numero ?? 0) + 1, contenido: { secciones: secs } }).select('id').single();
    if (v.error) return { error: v.error.message };
    versionId = String(v.data.id);
  } else {
    const d = await nuevoDocumento(sb, ctx as Parameters<typeof nuevoDocumento>[1], { tipo: TIPO_DOC[foto], titulo: TITULO[foto], requisitos, secciones: secs, trazaId: null });
    versionId = d.versionId;
  }
  const r = await sb.from('sgi_documento_version').update({ estado: 'en_revision' }).eq('id', versionId).eq('generico', false);
  if (r.error) return { error: r.error.message };
  return { versionId };
}
