/**
 * Plantillas: en OpenWA son textos guardados; por la vía oficial, crear una la manda a REVISIÓN de Meta (pending →
 * approved o rejected) y solo una aprobada sale, también fuera de la ventana. Las variables `{{nombre}}` de OpenWA
 * pasan a `{{1}}`, `{{2}}`… en el orden en que aparecen, con su nombre como ejemplo. Editar crea una versión nueva
 * (otra revisión) con sufijo: un nombre borrado no se reusa en Meta durante 30 días.
 */
import { ahora, sesionDe, type Contexto, type Manejador } from './contexto.js';
import { falla, noEncontrado, responde, valida } from './respuestas.js';
import type { NumeroDeSesion, PlantillaOW, Respuesta, Sesion } from './tipos.js';

const VARIABLE = /\{\{\s*([A-Za-z_][\w.-]*)\s*\}\}/g;

/** `Hola {{nombre}}, tu pedido {{pedido}}` → cuerpo de Meta con `{{1}}`, `{{2}}` y las variables en ese orden. */
export function aCuerpoMeta(body: string): { cuerpo: string; variables: string[] } {
  const variables: string[] = [];
  const cuerpo = body.replace(VARIABLE, (_, nombre: string) => {
    if (!variables.includes(nombre)) variables.push(nombre);
    return `{{${variables.indexOf(nombre) + 1}}}`;
  });
  return { cuerpo, variables };
}

function nombreMeta(c: Contexto, name: string): string {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'plantilla';
  let n = 1;
  while (c.estado.nombresMeta.has(`${base}_v${n}`)) n++;
  c.estado.nombresMeta.add(`${base}_v${n}`);
  return `${base}_v${n}`;
}

export function dtoPlantilla(t: PlantillaOW) {
  return { id: t.id, sessionId: t.sessionId, name: t.name, body: t.body, header: t.header, footer: t.footer, createdAt: t.createdAt, updatedAt: t.updatedAt, metaName: t.metaNombre, metaStatus: t.metaEstado };
}

/** Lee el estado de revisión de Meta para las plantillas de la sesión. */
export async function refrescaPlantillas(c: Contexto, s: Sesion, n: NumeroDeSesion | undefined): Promise<PlantillaOW[]> {
  const propias = [...c.estado.plantillas.values()].filter((t) => t.sessionId === s.id);
  if (!n || !propias.length) return propias;
  const deMeta = await c.p.administracion.plantillas(n.wabaId);
  for (const t of propias) {
    const m = deMeta.find((x) => x.nombre === t.metaNombre);
    if (m) t.metaEstado = m.estado === 'APPROVED' ? 'approved' : m.estado === 'REJECTED' ? 'rejected' : 'pending';
  }
  return propias;
}

/** El número de la sesión (aunque no esté iniciada): la WABA hace falta para hablar con la Template API. */
async function conNumero(c: Contexto): Promise<{ ok: true; s: Sesion; n: NumeroDeSesion } | { ok: false; r: Respuesta }> {
  const d = sesionDe(c);
  if (!d.ok) return d;
  const n = await c.p.altas.numero(d.s.id);
  if (!n) return { ok: false, r: falla(409, 'Las plantillas viven en la cuenta de WhatsApp Business: primero el alta del número', { code: 'ALTA_PENDIENTE', alternativa: `Termina el alta (Embedded Signup) en ${c.p.altas.ligaDeAlta(d.s.id)}` }) };
  return { ok: true, s: d.s, n };
}

type CuerpoPlantilla = { name?: string; body?: string; header?: string; footer?: string };
const CAMPOS = { name: { tipo: 'texto', max: 100 }, body: { tipo: 'texto', max: 4096 }, header: { tipo: 'texto', max: 1024 }, footer: { tipo: 'texto', max: 1024 } } as const;

async function aRevision(c: Contexto, n: NumeroDeSesion, v: Required<Pick<CuerpoPlantilla, 'name' | 'body'>> & CuerpoPlantilla) {
  const { cuerpo, variables } = aCuerpoMeta(v.body);
  const metaNombre = nombreMeta(c, v.name);
  const r = await c.p.administracion.creaPlantilla(n.wabaId, {
    nombre: metaNombre, idioma: c.p.idiomaPlantillas, categoria: c.p.categoriaPlantillas, cuerpo, ejemplos: variables,
    ...(v.header ? { encabezado: v.header } : {}), ...(v.footer ? { pie: v.footer } : {}),
  });
  if (!r.ok) return { ok: false as const, r: falla(422, `Meta no aceptó la plantilla: ${r.error}`, { code: 'PLANTILLA_RECHAZADA_AL_CREAR', alternativa: 'Cuerpo de 1 a 1024 caracteres, encabezado y pie de hasta 60, sin variables al inicio ni al final.' }) };
  return { ok: true as const, metaNombre, variables, metaEstado: r.estado === 'APPROVED' ? 'approved' as const : 'pending' as const };
}

export const creaPlantilla: Manejador = async (c) => {
  const l = await conNumero(c);
  if (!l.ok) return l.r;
  const v = valida<CuerpoPlantilla>(c.peticion.cuerpo, { ...CAMPOS, name: { ...CAMPOS.name, requerido: true }, body: { ...CAMPOS.body, requerido: true } });
  if (!v.ok) return v.r;
  const meta = await aRevision(c, l.n, { ...v.v, name: v.v.name!, body: v.v.body! });
  if (!meta.ok) return meta.r;
  const t: PlantillaOW = {
    id: c.p.ids(), sessionId: l.s.id, name: v.v.name!, body: v.v.body!, header: v.v.header ?? null, footer: v.v.footer ?? null,
    createdAt: ahora(c), updatedAt: ahora(c), metaNombre: meta.metaNombre, variables: meta.variables, metaEstado: meta.metaEstado,
  };
  c.estado.plantillas.set(t.id, t);
  return responde(201, dtoPlantilla(t));
};

export const plantillasDeSesion: Manejador = async (c) => {
  const d = sesionDe(c);
  if (!d.ok) return d.r;
  return responde(200, (await refrescaPlantillas(c, d.s, (await c.p.altas.numero(d.s.id)) ?? undefined)).map(dtoPlantilla));
};

const plantillaDe = (c: Contexto, s: Sesion) => {
  const t = c.estado.plantillas.get(c.params.id ?? '');
  return t && t.sessionId === s.id ? t : undefined;
};

export const unaPlantilla: Manejador = async (c) => {
  const d = sesionDe(c);
  if (!d.ok) return d.r;
  await refrescaPlantillas(c, d.s, (await c.p.altas.numero(d.s.id)) ?? undefined);
  const t = plantillaDe(c, d.s);
  return t ? responde(200, dtoPlantilla(t)) : noEncontrado('Template');
};

export const actualizaPlantilla: Manejador = async (c) => {
  const l = await conNumero(c);
  if (!l.ok) return l.r;
  const t = plantillaDe(c, l.s);
  if (!t) return noEncontrado('Template');
  const v = valida<CuerpoPlantilla>(c.peticion.cuerpo, CAMPOS);
  if (!v.ok) return v.r;
  const nueva = { name: v.v.name ?? t.name, body: v.v.body ?? t.body, header: v.v.header ?? t.header ?? undefined, footer: v.v.footer ?? t.footer ?? undefined };
  const meta = await aRevision(c, l.n, nueva);
  if (!meta.ok) return meta.r;
  await c.p.administracion.borraPlantilla(l.n.wabaId, t.metaNombre);
  Object.assign(t, { ...nueva, header: nueva.header ?? null, footer: nueva.footer ?? null, metaNombre: meta.metaNombre, variables: meta.variables, metaEstado: meta.metaEstado, updatedAt: ahora(c) });
  return responde(200, dtoPlantilla(t));
};

export const borraPlantilla: Manejador = async (c) => {
  const d = sesionDe(c);
  if (!d.ok) return d.r;
  const t = plantillaDe(c, d.s);
  if (!t) return noEncontrado('Template');
  const n = await c.p.altas.numero(d.s.id);
  if (n) await c.p.administracion.borraPlantilla(n.wabaId, t.metaNombre);
  c.estado.plantillas.delete(t.id);
  return responde(204);
};
