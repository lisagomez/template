'use server';

/**
 * Las acciones de Ágora: cada una relee la sesión (la persona del laboratorio), llama al núcleo con ESA sesión y
 * devuelve lo que la base dijo. Ninguna confía en lo que manda el navegador más que el id y el cambio pedido; la
 * base vuelve a comprobar rol, matriz, huella y periodo. Las irreversibles llegan aquí DESPUÉS del freno de la capa.
 */
import { cookies } from 'next/headers';
import { refresh } from 'next/cache';
import { z } from 'zod';
import * as agora from '../../../../tools/agora/dist/index.js';
import type { Resultado } from '../types';
import { COOKIE_PERSONA, laboratorio, personaActual, PERSONAS_DEL_LABORATORIO } from './laboratorio';

async function corre<T>(fn: (e: agora.Entorno, persona: string) => Promise<T>, refrescar = true): Promise<Resultado<T>> {
  const lab = laboratorio();
  if (!lab.activo) return { ok: false, motivo: lab.motivo };
  const p = await personaActual();
  try {
    const valor = await fn(lab.entorno, p.id);
    if (refrescar) refresh();
    return { ok: true, valor };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) };
  }
}

const Uuid = z.uuid();
const Sha = z.string().regex(/^[0-9a-f]{64}$/);

export async function cambiaPersona(clave: string): Promise<Resultado<string>> {
  const p = PERSONAS_DEL_LABORATORIO.find((x) => x.clave === clave);
  if (!p) return { ok: false, motivo: 'esa persona no es del laboratorio' };
  (await cookies()).set(COOKIE_PERSONA, p.clave, { httpOnly: true, sameSite: 'strict', path: '/agora' });
  return { ok: true, valor: p.nombre };
}

export async function publicaEnHilo(entrada: { categoria: string; cuerpo: string; hilo?: string | null }) {
  const d = z.object({ categoria: Uuid, cuerpo: z.string().trim().min(1).max(4000), hilo: Uuid.nullish() }).parse(entrada);
  return corre((e, p) => agora.publica(e, p, d));
}

export async function decidePropuesta(entrada: { propuesta: string; sha256: string; decision: 'aprobar' | 'rechazar' | 'a_revision'; motivo?: string }) {
  const d = z.object({ propuesta: Uuid, sha256: Sha, decision: z.enum(['aprobar', 'rechazar', 'a_revision']), motivo: z.string().max(400).optional() }).parse(entrada);
  return corre((e, p) => agora.decideYAplica(e, p, d));
}

export async function editaCampo(entrada: { item: string; campo: string; valor: unknown }) {
  const Campo = z.enum(['nombre', 'estado', 'prioridad', 'inicio', 'fin', 'progreso', 'etiquetas', 'vinculo', 'responsable_persona', 'responsable_agente', 'archivo']);
  const d = z.object({ item: Uuid, campo: Campo, valor: z.unknown() }).parse(entrada);
  return corre((e, p) => agora.editaItem(e, p, d));
}

export async function cambiaDependencia(entrada: { item: string; dependeDe: string; quita?: boolean }) {
  const d = z.object({ item: Uuid, dependeDe: Uuid, quita: z.boolean().optional() }).parse(entrada);
  return corre(async (e, p) => { await agora.cambiaDependencia(e, p, d); return true; });
}

export async function proponeCambio(entrada: { payload: unknown; resumen: string }) {
  const d = z.object({ payload: agora.EsquemaPayload, resumen: z.string().min(3).max(400) }).parse(entrada);
  return corre((e, p) => agora.proponeComoPersona(e, p, d));
}

export async function registraEjercido(entrada: agora.CostoNuevo) {
  const d = z.object({
    categoria: Uuid, item: Uuid.nullish(), compromiso: Uuid.nullish(), periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), importe: z.number().positive(),
    concepto: z.string().min(3).max(200), tipo: z.enum(['cfdi', 'comprobante']), uuid: Uuid.nullish(), comprobanteSha256: Sha.nullish(),
    rfc: z.string().max(13).nullish(), proveedor: z.string().max(200).nullish(),
  }).parse(entrada);
  return corre((e, p) => agora.registraCosto(e, p, d));
}

export async function cierraPeriodoConCita(entrada: { periodo: string; cita: string }) {
  const d = z.object({ periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), cita: z.string().min(8).max(500) }).parse(entrada);
  return corre(async (e, p) => {
    const org = (await e.base.consulta<{ org_id: string }>('select org_id from agora.persona where id = $1', [p]))[0]!.org_id;
    return agora.cierraPeriodo(e, p, { org, periodo: d.periodo, cita: d.cita });
  });
}

export async function decideLaPoliza(entrada: { poliza: string; sha256: string; decision: 'acepta' | 'devuelve'; motivo?: string }) {
  const d = z.object({ poliza: Uuid, sha256: Sha, decision: z.enum(['acepta', 'devuelve']), motivo: z.string().max(400).optional() }).parse(entrada);
  return corre((e, p) => agora.decidePoliza(e, p, d));
}

export async function suspendeAgente(entrada: { agente: string; motivo: string }) {
  const d = z.object({ agente: Uuid, motivo: z.string().min(3).max(300) }).parse(entrada);
  return corre((e, p) => agora.suspende(e, p, d.agente, d.motivo));
}

export async function reactivaAgente(entrada: { agente: string; motivo: string }) {
  const d = z.object({ agente: Uuid, motivo: z.string().min(3).max(300) }).parse(entrada);
  return corre((e, p) => agora.reactiva(e, p, d.agente, d.motivo));
}

export async function revocaAgenteConCita(entrada: { agente: string; motivo: string; cita: string }) {
  const d = z.object({ agente: Uuid, motivo: z.string().min(3).max(300), cita: z.string().min(8).max(500) }).parse(entrada);
  return corre((e, p) => agora.revoca(e, p, d.agente, d.motivo, d.cita));
}

export async function bajaTopeDe(entrada: { agente: string; tope: 'gasto' | 'mensajes' | 'propuestas'; valor: number }) {
  const d = z.object({ agente: Uuid, tope: z.enum(['gasto', 'mensajes', 'propuestas']), valor: z.number().nonnegative() }).parse(entrada);
  return corre((e, p) => agora.bajaTope(e, p, d.agente, d.tope, d.valor));
}

export async function deshazCambio(historial: number) {
  const id = z.number().int().positive().parse(historial);
  return corre((e, p) => agora.deshaz(e, p, id));
}

export async function quitaSegregacionConCita(cita: string) {
  const c = z.string().min(8).max(500).parse(cita);
  return corre(async (e, p) => {
    const org = (await e.base.consulta<{ org_id: string }>('select org_id from agora.persona where id = $1', [p]))[0]!.org_id;
    return agora.cambiaSegregacion(e, p, org, false, c);
  });
}

/** Lee el disponible de una categoría este mes (lo calcula el libro, no la pantalla). */
export async function disponibleDe(categoria: string) {
  const id = Uuid.parse(categoria);
  return corre((e, p) => agora.como(e.base, { tipo: 'persona', id: p }, async (s) => (await s.consulta<{ nombre: string; disponible: string | null; presupuesto: string | null; periodo: string }>(
    `select n.nombre, v.disponible_mxn::text disponible, v.presupuesto_mxn::text presupuesto, to_char(now() at time zone 'America/Mexico_City', 'YYYY-MM') periodo
       from agora.nodo n left join agora.v_centro_periodo v on v.categoria_id = n.id and v.periodo = to_char(now() at time zone 'America/Mexico_City', 'YYYY-MM') where n.id = $1`, [id]))[0] ?? null), false);
}
