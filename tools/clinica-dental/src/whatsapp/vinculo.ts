/**
 * VINCULAR EL WHATSAPP sin mandarle nada a un desconocido. Dos riesgos (C3, T-6 y T-14):
 *  - el celular del registro mal escrito: un recordatorio a un tercero dice que alguien va al dentista;
 *  - un enlace reenviado: otra persona se vincula antes que el paciente y recibe sus avisos.
 *
 * Por eso NADIE recibe nada por la sola razon de aparecer en un formulario:
 *  1. la persona, CON SU CUENTA, pide un codigo de un solo uso (30 min) y un enlace `wa.me` con el mensaje escrito;
 *  2. el codigo tiene que llegar por WhatsApp DESDE el numero que se va a vincular (prueba que es suyo);
 *  3. ese numero queda PENDIENTE, y la persona confirma en su cuenta «sí, el que termina en 1234 es mío». Si no
 *     coincide con el celular de su registro, tiene que escribir esos 4 digitos (friccion proporcional al riesgo).
 * Hasta el paso 3, a ese numero solo se le contesta que confirme en el portal: ni una cita, ni un dato.
 */
import { randomInt } from 'node:crypto';
import type { Paciente, Token } from '../almacen.js';
import { ErrorPortal, vigentes, type Contexto } from '../portal/contexto.js';
import { cambiaConsentimiento } from '../portal/registro.js';
import { mismoTelefono, normalizaWaId, ultimos4 } from './numero.js';

const VIGENCIA_CODIGO_MS = 30 * 60_000;
const VIGENCIA_PENDIENTE_MS = 24 * 3_600_000;
/** Sin I, L, O, 0 ni 1: un codigo que se dicta o se copia a mano no se confunde. */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const reCodigoVinculo = /\bVINC-?([A-HJ-NP-Z2-9]{6})\b/i;

const codigoNuevo = (): string => `VINC-${Array.from({ length: 6 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('')}`;

export type EstadoVinculo =
  | { estado: 'sin_vincular' }
  | { estado: 'codigo'; codigo: string; enlace: string; expira: number }
  /** `ultimos4` solo si coincide con el celular del registro: si no, la persona tiene que SABERLOS (no se le muestran). */
  | { estado: 'pendiente'; ultimos4: string | null; coincideCelular: boolean }
  | { estado: 'vinculado'; ultimos4: string; vinculadoEn: number };

/** El paciente cuyo WhatsApp vinculado es este numero, si lo hay. */
export async function pacientePorWaId(ctx: Contexto, clinica: string, waId: string): Promise<Paciente | null> {
  if (!waId) return null;
  return (await ctx.almacen.pacientes(clinica)).find((p) => p.whatsapp?.waId && mismoTelefono(p.whatsapp.waId, waId)) ?? null;
}

async function codigosDe(ctx: Contexto, clinica: string, seudonimo: string): Promise<Token[]> {
  return (await ctx.almacen.tokensDe(clinica, seudonimo)).filter((t) => t.tipo === 'whatsapp' && t.usado === null).sort((a, b) => b.creado - a.creado);
}

/** El codigo vivo (sin usar y sin pendiente), si lo hay. */
async function vigente(ctx: Contexto, clinica: string, seudonimo: string): Promise<Token | null> {
  return (await codigosDe(ctx, clinica, seudonimo)).find((t) => !t.pendiente) ?? null;
}

export function enlaceWa(telefonoVisible: string, texto: string): string {
  return `https://wa.me/${telefonoVisible.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`;
}

/** Paso 1: el codigo y el enlace. Pedir otro invalida el anterior (un solo codigo vivo por paciente). */
export async function emiteCodigo(ctx: Contexto, clinica: string, usuario: string): Promise<{ codigo: string; enlace: string; expira: number }> {
  const p = await ctx.exigePaciente(clinica, usuario);
  if (p.whatsapp?.waId) throw new ErrorPortal('estado', 'Ya tienes un WhatsApp vinculado. Desvincúlalo primero si quieres cambiarlo.');
  const ahora = ctx.reloj();
  for (const previo of await codigosDe(ctx, clinica, p.seudonimo)) await ctx.almacen.guardaToken({ ...previo, usado: ahora });
  let codigo = codigoNuevo();
  while (await ctx.almacen.token(codigo)) codigo = codigoNuevo();
  await ctx.almacen.guardaToken({ id: codigo, clinica, paciente: p.seudonimo, tipo: 'whatsapp', creado: ahora, expira: ahora + VIGENCIA_CODIGO_MS, usado: null, pendiente: null });
  await ctx.emite({ clinica, sujeto: p.seudonimo, tipo: 'whatsapp_vinculo', paso: 'codigo_emitido', coincide_celular: null }, `wa-vinculo|${codigo}|emitido`);
  const c = ctx.clinica(clinica);
  return { codigo, enlace: enlaceWa(ctx.numeroDe(clinica).telefonoVisible, `Hola, quiero vincular mi WhatsApp a ${c.nombre}. Mi código es ${codigo}`), expira: ahora + VIGENCIA_CODIGO_MS };
}

export type ResultadoCodigo = { tipo: 'pendiente' | 'invalido' | 'usado' | 'vencido' | 'otro_paciente'; respuesta: string; paciente: string | null };

/** Paso 2: un numero manda un codigo. Queda PENDIENTE; el codigo ya no sirve para nadie mas. */
export async function recibeCodigo(ctx: Contexto, clinica: string, waIdCrudo: string, codigoCrudo: string): Promise<ResultadoCodigo> {
  const waId = normalizaWaId(waIdCrudo);
  const codigo = `VINC-${(reCodigoVinculo.exec(codigoCrudo)?.[1] ?? '').toUpperCase()}`;
  const t = await ctx.almacen.token(codigo);
  const c = ctx.clinica(clinica);
  const no = (tipo: ResultadoCodigo['tipo'], respuesta: string): ResultadoCodigo => ({ tipo, respuesta, paciente: null });
  if (!t || t.tipo !== 'whatsapp' || t.clinica !== clinica) return no('invalido', `Ese código no es válido. Pide uno nuevo desde tu cuenta en el portal de ${c.nombre}.`);
  if (t.usado !== null || t.pendiente) return no('usado', 'Ese código ya se usó. Si no fuiste tú, avísale a la clínica y pide otro desde el portal.');
  if (t.expira !== null && t.expira < ctx.reloj()) return no('vencido', 'Ese código caducó. Pide uno nuevo desde el portal.');
  const ajeno = await pacientePorWaId(ctx, clinica, waId);
  if (ajeno && ajeno.seudonimo !== t.paciente) return no('otro_paciente', `Este número ya está vinculado a otra cuenta de ${c.nombre}. Si es un error, llama a la clínica al ${c.telefono}.`);
  await ctx.almacen.guardaToken({ ...t, pendiente: { waId, recibido: ctx.reloj() } });
  const p = await ctx.almacen.pacientePorSeudonimo(clinica, t.paciente);
  const coincide = p ? mismoTelefono(waId, p.datos.celular) : false;
  await ctx.emite({ clinica, sujeto: t.paciente, tipo: 'whatsapp_vinculo', paso: 'mensaje_recibido', coincide_celular: coincide }, `wa-vinculo|${codigo}|recibido`);
  return {
    tipo: 'pendiente', paciente: t.paciente,
    respuesta: `Recibimos tu código. Para terminar, entra a tu cuenta en el portal de ${c.nombre} y confirma que este número (termina en ${ultimos4(waId)}) es tuyo. Hasta entonces no te mandamos nada de tus citas por aquí.`,
  };
}

/** El numero que mando el codigo y espera que la persona lo confirme (vale 24 h desde que llego). */
async function pendienteDe(ctx: Contexto, clinica: string, seudonimo: string): Promise<Token | null> {
  const t = (await codigosDe(ctx, clinica, seudonimo)).find((x) => x.pendiente) ?? null;
  return t?.pendiente && t.pendiente.recibido + VIGENCIA_PENDIENTE_MS > ctx.reloj() ? t : null;
}

export async function estadoVinculo(ctx: Contexto, clinica: string, usuario: string): Promise<EstadoVinculo> {
  const p = await ctx.exigePaciente(clinica, usuario);
  if (p.whatsapp?.waId) return { estado: 'vinculado', ultimos4: ultimos4(p.whatsapp.waId), vinculadoEn: p.whatsapp.vinculadoEn ?? 0 };
  const pend = await pendienteDe(ctx, clinica, p.seudonimo);
  if (pend?.pendiente) {
    const coincide = mismoTelefono(pend.pendiente.waId, p.datos.celular);
    // Si no es su celular, mostrar «termina en 5432» y pedir esos 4 dígitos no prueba nada: se copian de la pantalla.
    return { estado: 'pendiente', ultimos4: coincide ? ultimos4(pend.pendiente.waId) : null, coincideCelular: coincide };
  }
  const t = await vigente(ctx, clinica, p.seudonimo);
  if (t && (t.expira ?? 0) > ctx.reloj()) return { estado: 'codigo', codigo: t.id, enlace: enlaceWa(ctx.numeroDe(clinica).telefonoVisible, `Hola, quiero vincular mi WhatsApp a ${ctx.clinica(clinica).nombre}. Mi código es ${t.id}`), expira: t.expira ?? 0 };
  return { estado: 'sin_vincular' };
}

export type ResultadoConfirma = { ok: true; ultimos4: string } | { ok: false; motivo: 'sin_pendiente' | 'faltan_digitos' | 'digitos'; mensaje: string };

/** Paso 3: la persona, en su cuenta, dice que el numero pendiente es suyo. Hasta aqui no se le escribio nada. */
export async function confirmaVinculo(ctx: Contexto, clinica: string, usuario: string, op: { ultimos4?: string } = {}): Promise<ResultadoConfirma> {
  const p = await ctx.exigePaciente(clinica, usuario);
  const t = await pendienteDe(ctx, clinica, p.seudonimo);
  if (!t?.pendiente) return { ok: false, motivo: 'sin_pendiente', mensaje: 'No hay un número esperando confirmación. Pide un código y mándalo por WhatsApp.' };
  const waId = t.pendiente.waId;
  if (!mismoTelefono(waId, p.datos.celular)) {
    if (!op.ultimos4) return { ok: false, motivo: 'faltan_digitos', mensaje: 'Nos escribió un número que no es el celular de tu registro: si fuiste tú, escribe los 4 últimos dígitos del WhatsApp desde el que nos escribiste.' };
    if (op.ultimos4.replace(/\D/g, '') !== ultimos4(waId)) return { ok: false, motivo: 'digitos', mensaje: 'Esos dígitos no coinciden con el número que nos escribió. Si no fuiste tú, rechaza la vinculación.' };
  }
  const ahora = ctx.reloj();
  await ctx.almacen.guardaToken({ ...t, usado: ahora });
  await ctx.almacen.guardaPaciente({ ...p, whatsapp: { waId, vinculadoEn: ahora } });
  if ((await vigentes(ctx, clinica, p.seudonimo)).whatsapp !== true) await cambiaConsentimiento(ctx, clinica, usuario, 'whatsapp', true);
  for (const a of await ctx.almacen.avisos(clinica, p.seudonimo)) {
    if (a.canal === 'whatsapp' && a.estado === 'esperando_vinculo') await ctx.almacen.guardaAviso({ ...a, estado: 'programado', actualizado: ahora });
  }
  await ctx.emite({ clinica, sujeto: p.seudonimo, tipo: 'whatsapp_vinculo', paso: 'confirmado', coincide_celular: mismoTelefono(waId, p.datos.celular) }, `wa-vinculo|${t.id}|confirmado`);
  const c = ctx.clinica(clinica);
  // La persona acaba de escribir (la ventana de 24 h esta abierta): mensaje de servicio, sin plantilla.
  await ctx.wa().puerto.envia(clinica, waId, { tipo: 'texto', texto: `¡Listo! Este número quedó vinculado a tu cuenta en ${c.nombre}. Aquí te avisaremos de tus citas. Para dejar de recibirlos, escribe BAJA o desactívalo en el portal.` }).catch(() => undefined);
  return { ok: true, ultimos4: ultimos4(waId) };
}

/** «No es mi numero»: el pendiente se descarta. Al numero no se le dice nada (puede ser de otra persona). */
export async function rechazaVinculo(ctx: Contexto, clinica: string, usuario: string): Promise<boolean> {
  const p = await ctx.exigePaciente(clinica, usuario);
  const t = await pendienteDe(ctx, clinica, p.seudonimo);
  if (!t) return false;
  await ctx.almacen.guardaToken({ ...t, usado: ctx.reloj() });
  await ctx.emite({ clinica, sujeto: p.seudonimo, tipo: 'whatsapp_vinculo', paso: 'rechazado', coincide_celular: mismoTelefono(t.pendiente!.waId, p.datos.celular) }, `wa-vinculo|${t.id}|rechazado`);
  return true;
}
