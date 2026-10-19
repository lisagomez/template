/**
 * Un aviso, de verdad hacia su canal: el correo con su `.ics` y, si es newsletter, la baja de un clic; el
 * Telegram con el reel en la confirmacion. Devuelve un resultado del portal, no el del proveedor.
 */
import type { Aviso, Paciente } from '../almacen.js';
import { servicio as servicioDe } from '../clinicas.js';
import { construyeIcs } from '../canales/ics.js';
import { idDeClave } from '../seudonimo.js';
import { fechaLarga, mensajeCorreo, mensajeTelegram, type DatosAviso } from './plantillas.js';
import type { Contexto } from './contexto.js';
import type { MotivoFallo } from '../eventos.js';
import { mensajeAviso, type ClasePlantilla } from '../whatsapp/plantillas.js';
import { payloadDe } from '../whatsapp/firma.js';

async function datosAviso(ctx: Contexto, p: Paciente, a: Aviso, token: string | null): Promise<DatosAviso> {
  const c = ctx.clinica(p.clinica);
  const cita = a.cita ? await ctx.almacen.cita(p.clinica, a.cita) : null;
  return { clinica: c, servicio: cita ? servicioDe(c, cita.servicio) : null, nombre: p.datos.nombre, inicio: cita?.inicio ?? null, urlPortal: ctx.urlPortal(c.id), urlBaja: token ? ctx.urlBaja(c.id, token) : null };
}

/** El token de baja del paciente (uno estable por paciente y clinica). */
export async function tokenBaja(ctx: Contexto, p: Paciente): Promise<string> {
  const id = idDeClave('tok', `baja|${p.clinica}|${p.seudonimo}|${ctx.seudonimos.firma(p.seudonimo)}`);
  if (!(await ctx.almacen.token(id))) await ctx.almacen.guardaToken({ id, clinica: p.clinica, paciente: p.seudonimo, tipo: 'baja', creado: ctx.reloj(), expira: null, usado: null });
  return id;
}

const ESPERA_REINTENTO_MS = 60_000;

/** `wamid`: el envio de WhatsApp quedo ACEPTADO por Meta; la entrega llega despues por webhook. */
export type Envio = { ok: true; wamid?: string } | { ok: false; motivo: MotivoFallo; definitivo: boolean; esperaMs?: number };

async function enviaCorreo(ctx: Contexto, p: Paciente, a: Aviso): Promise<Envio> {
  const c = ctx.clinica(p.clinica);
  const token = a.clase === 'newsletter' ? await tokenBaja(ctx, p) : null;
  const d = await datosAviso(ctx, p, a, token);
  const m = mensajeCorreo(a.clase, d);
  const cita = a.cita ? await ctx.almacen.cita(p.clinica, a.cita) : null;
  const ics = cita && d.servicio && (a.clase === 'confirmacion' || a.clase === 'cancelacion')
    ? [{ nombre: 'cita.ics', tipo: 'text/calendar; charset=utf-8; method=PUBLISH', contenido: construyeIcs({ uid: `${cita.origen}@${c.dominio}`, inicio: new Date(cita.inicio), fin: new Date(cita.fin), resumen: `${d.servicio.nombre} · ${c.nombre}`, lugar: c.direccion, descripcion: `${d.servicio.comoPrepararse} Teléfono: ${c.telefono}`, secuencia: cita.secuencia, cancelada: a.clase === 'cancelacion', sello: new Date(ctx.reloj()) }) }]
    : [];
  const cabeceras: Record<string, string> = token
    ? { 'List-Unsubscribe': `<${ctx.urlBaja(c.id, token)}>, <mailto:baja+${token}@${c.dominio}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click', 'List-Id': `Newsletter <newsletter.${c.dominio}>` }
    : { 'Auto-Submitted': 'auto-generated' };
  const r = await ctx.correo.envia({ idMensaje: `${a.id}@${c.dominio}`, de: { nombre: c.nombre, direccion: c.correoAvisos }, para: p.datos.correo, asunto: m.asunto, texto: m.texto, html: m.html, fecha: new Date(ctx.reloj()), adjuntos: ics, cabeceras, masivo: a.clase === 'newsletter' });
  if (r.ok) return { ok: true };
  return { ok: false, motivo: r.motivo === 'rebote' ? 'rebote' : r.motivo === 'limite' ? 'limite' : 'otro', definitivo: r.definitivo, esperaMs: ESPERA_REINTENTO_MS };
}

async function enviaTelegram(ctx: Contexto, p: Paciente, a: Aviso): Promise<Envio> {
  if (p.telegram.chatId === null) return { ok: false, motivo: 'sin_vincular', definitivo: true };
  const canal = ctx.telegram(p.clinica);
  const texto = mensajeTelegram(a.clase, await datosAviso(ctx, p, a, null));
  const reel = a.clase === 'confirmacion' ? await ctx.reel(p.clinica) : null;
  const r = reel ? await canal.video(p.telegram.chatId, reel, texto) : await canal.texto(p.telegram.chatId, texto);
  if (r.ok) return { ok: true };
  return { ok: false, motivo: r.motivo, definitivo: r.definitivo, esperaMs: (r.reintentaEnS ?? 60) * 1000 };
}



/** La ventana de atencion de 24 h, con 10 min de margen: un mensaje de servicio que llegara tarde lo rechaza Meta (131047). */
const VENTANA_MS = 24 * 3_600_000 - 10 * 60_000;

/** Los codigos de la Cloud API que se ven AL ENVIAR, como motivos del portal (los de entrega llegan por webhook). */
export function motivoMeta(codigo: number): { motivo: MotivoFallo; definitivo: boolean; esperaMs?: number } {
  if (codigo >= 132000 && codigo < 133000) return { motivo: 'plantilla', definitivo: true };
  if (codigo === 131026) return { motivo: 'no_whatsapp', definitivo: true };
  if (codigo === 131047) return { motivo: 'fuera_de_ventana', definitivo: true };
  if (codigo === 131056 || codigo === 130429 || codigo === 131048) return { motivo: 'limite', definitivo: false, esperaMs: 5 * 60_000 };
  if (codigo === 131000 || codigo === 131057 || codigo === 133010 || codigo === 368) return { motivo: 'canal_desconectado', definitivo: true };
  return { motivo: 'otro', definitivo: true };
}

async function enviaWhatsApp(ctx: Contexto, p: Paciente, a: Aviso): Promise<Envio> {
  const waId = p.whatsapp?.waId;
  if (!waId) return { ok: false, motivo: 'sin_vincular', definitivo: true };
  const c = ctx.clinica(p.clinica);
  const cita = a.cita ? await ctx.almacen.cita(p.clinica, a.cita) : null;
  if (!cita || a.clase === 'newsletter') return { ok: false, motivo: 'otro', definitivo: true };
  const clase: ClasePlantilla = a.clase === 'confirmacion' && cita.anterior ? 'reprogramada' : a.clase;
  // A media frase («para el jueves, 22 de octubre…»): el día va en minúscula.
  const cuando = fechaLarga(cita.inicio, c.zona).replace(/^\p{Lu}/u, (l) => l.toLowerCase());
  const parametros = clase === 'recordatorio_2h' ? [p.datos.nombre, c.nombre, cuando.split(', ').pop() ?? cuando, c.direccion] : [p.datos.nombre, c.nombre, cuando];
  const chat = await ctx.almacen.chat(p.clinica, waId);
  const abierta = chat?.ultimoEntrante != null && ctx.reloj() - chat.ultimoEntrante < VENTANA_MS;
  const firma = (accion: 'confirma' | 'reprograma' | 'cancela' | 'no_ire') => payloadDe(ctx.seudonimos.firma, p.clinica, accion, cita.id);
  const puerto = ctx.wa().puerto;
  let r = await puerto.envia(p.clinica, waId, mensajeAviso(clase, parametros, abierta, firma));
  // La ventana se cerro entre que se miro y se mando: la plantilla siempre se puede.
  if (!r.ok && r.codigo === 131047 && abierta) r = await puerto.envia(p.clinica, waId, mensajeAviso(clase, parametros, false, firma));
  if (r.ok) return { ok: true, wamid: r.wamid };
  return { ok: false, ...motivoMeta(r.codigo) };
}

export function enviaAviso(ctx: Contexto, p: Paciente, a: Aviso): Promise<Envio> {
  if (a.canal === 'whatsapp') return enviaWhatsApp(ctx, p, a);
  return a.canal === 'correo' ? enviaCorreo(ctx, p, a) : enviaTelegram(ctx, p, a);
}
