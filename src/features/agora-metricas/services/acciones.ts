'use server';

/**
 * Editar el tablero con palabras, sin LLM: `entiende` dice qué entendió (o que esa métrica no existe y no la sustituye),
 * y guardar escribe una VERSIÓN nueva de la especificación (nunca se edita una vieja). La especificación se valida con
 * Zod contra el catálogo: una métrica o dimensión que el catálogo no tiene no llega a la base.
 */
import { refresh } from 'next/cache';
import { z } from 'zod';
import { como, metricas } from '../../../../tools/agora/dist/index.js';
import type { Sesion } from '../../../../tools/agora/dist/index.js';
import { laboratorio, personaActual } from '@/features/agora/services/laboratorio';
import type { Resultado } from '@/features/agora/types';

async function conPersona<T>(fn: (s: Sesion, persona: string) => Promise<T>): Promise<Resultado<T>> {
  const lab = laboratorio();
  if (!lab.activo) return { ok: false, motivo: lab.motivo };
  const p = await personaActual();
  try {
    return { ok: true, valor: await como(lab.entorno.base, { tipo: 'persona', id: p.id }, (s) => fn(s, p.id)) };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) };
  }
}

const Periodo = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const Componente = z.object({
  metrica: z.string().refine((m) => metricas.nombres().includes(m), 'esa métrica no está en el catálogo'),
  dimension: z.string().nullable(),
  periodo: Periodo.nullable(),
  workspace: z.string().uuid().nullable(),
  origen: z.enum(['interno', 'externo']).nullable(),
  vista: z.enum(['cifra', 'barras', 'tabla']),
}).refine((c) => c.dimension === null || (metricas.describe(c.metrica)?.dimensiones ?? []).includes(c.dimension), 'esa métrica no se abre por esa dimensión');
const Espec = z.object({ version: z.literal(1), titulo: z.string().min(2).max(120), componentes: z.array(Componente.and(z.object({ id: z.string().regex(/^[a-z0-9-]{2,60}$/) }))).max(30) });

async function vigente(s: Sesion): Promise<{ version: number; spec: metricas.EspecTablero; org: string }> {
  const [o] = await s.consulta<{ org: string }>('select org_id org from agora.persona where id = auth.uid()');
  const [v] = await s.consulta<{ version: number; spec: metricas.EspecTablero }>('select version, spec from agora.metricas_tablero order by version desc limit 1');
  return { version: v?.version ?? 0, spec: v?.spec ?? metricas.TABLERO_INICIAL, org: o!.org };
}

async function guarda(s: Sesion, spec: metricas.EspecTablero, motivo: string) {
  const limpio = Espec.parse(spec);
  const v = await vigente(s);
  await s.consulta('insert into agora.metricas_tablero (org_id, version, spec, motivo) values ($1, $2, $3::text::jsonb, $4)', [v.org, v.version + 1, JSON.stringify(limpio), motivo]);
  return { version: v.version + 1 };
}

export async function entiendeIndicador(entrada: { texto: string; periodo: string }) {
  const d = z.object({ texto: z.string().trim().min(3).max(300), periodo: Periodo }).parse(entrada);
  return conPersona(async (s) => {
    const workspaces = await s.consulta<{ id: string; nombre: string }>(`select id, nombre from agora.nodo where tipo = 'workspace' order by orden`);
    return metricas.entiende(d.texto, { periodo: d.periodo, workspaces });
  });
}

export async function agregaIndicador(entrada: { componente: unknown }) {
  const c = Componente.parse(entrada.componente);
  const r = await conPersona(async (s) => {
    const v = await vigente(s);
    const n = v.spec.componentes.filter((x) => x.metrica === c.metrica).length + 1;
    const titulo = metricas.describe(c.metrica)!.titulo;
    return guarda(s, { ...v.spec, componentes: [...v.spec.componentes, { id: `${c.metrica.replace(/_/g, '-')}-${n}`.slice(0, 60), ...c }] }, `agregó «${titulo}»`);
  });
  if (r.ok) refresh();
  return r;
}

export async function quitaIndicador(entrada: { id: string }) {
  const d = z.object({ id: z.string().regex(/^[a-z0-9-]{2,60}$/) }).parse(entrada);
  const r = await conPersona(async (s) => {
    const v = await vigente(s);
    const quitado = v.spec.componentes.find((x) => x.id === d.id);
    if (!quitado) throw new Error('ese indicador ya no está en el tablero');
    return guarda(s, { ...v.spec, componentes: v.spec.componentes.filter((x) => x.id !== d.id) }, `quitó «${metricas.describe(quitado.metrica)?.titulo ?? quitado.metrica}»`);
  });
  if (r.ok) refresh();
  return r;
}

export async function vuelveAVersion(entrada: { version: number }) {
  const d = z.object({ version: z.number().int().min(0) }).parse(entrada);
  const r = await conPersona(async (s) => {
    const [v] = await s.consulta<{ spec: metricas.EspecTablero }>('select spec from agora.metricas_tablero where version = $1', [d.version]);
    const spec = d.version === 0 ? metricas.TABLERO_INICIAL : v?.spec;
    if (!spec) throw new Error('esa versión no existe');
    return guarda(s, spec, d.version === 0 ? 'volvió al tablero inicial' : `volvió a la versión ${d.version}`);
  });
  if (r.ok) refresh();
  return r;
}
