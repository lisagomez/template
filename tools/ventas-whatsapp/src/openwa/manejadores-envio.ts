/**
 * Cada ruta de envío de OpenWA traducida a un mensaje de la Cloud API. Lo que la vía oficial no hace contesta 422
 * con su alternativa, nunca se acepta para luego ignorarlo.
 */
import type { MensajeSaliente } from '../meta/mensajes.js';
import type { TipoMedio } from '../meta/multimedia.js';
import { alcanzaChat, sesionLista, type Contexto, type Manejador } from './contexto.js';
import { conIdempotencia, envia, manejadorDeEnvio } from './envios.js';
import { refrescaPlantillas } from './plantillas.js';
import { destino, falla, noEncontrado, responde, valida, type Campo } from './respuestas.js';
import type { NumeroDeSesion, Respuesta, Sesion } from './tipos.js';

const CHAT = { tipo: 'texto', requerido: true, max: 255 } as const;
const MENCIONES = { tipo: 'textos', max: 1024 } as const;
type Lectura<T> = { ok: true; v: T; m: MensajeSaliente } | { ok: false; r: Respuesta };

const sinMenciones = (menciones: string[] | undefined): Respuesta | null => (menciones?.length
  ? falla(422, 'Las menciones son de grupos y la Cloud API no las manda en un chat 1:1', { code: 'MENCIONES_NO_DISPONIBLES', alternativa: 'Quita mentions: en un chat 1:1 el texto llega igual.' })
  : null);

function lee<T extends Record<string, unknown>>(c: Contexto, campos: Record<string, Campo>, arma: (v: T) => MensajeSaliente | Respuesta): Lectura<T & { chatId: string }> {
  const v = valida<T & { chatId: string; mentions?: string[] }>(c.peticion.cuerpo, campos);
  if (!v.ok) return v;
  const mal = sinMenciones(v.v.mentions);
  if (mal) return { ok: false, r: mal };
  const m = arma(v.v);
  return 'status' in m ? { ok: false, r: m } : { ok: true, v: v.v, m };
}

type CuerpoTexto = { chatId: string; text: string; linkPreview?: boolean; customLinkPreview?: object; quotedMessageId?: string };
export const enviaTexto = manejadorDeEnvio<CuerpoTexto>(async (c) => lee<CuerpoTexto>(c, {
  chatId: CHAT, text: { tipo: 'texto', requerido: true, max: 4096 }, mentions: MENCIONES, linkPreview: { tipo: 'booleano' }, customLinkPreview: { tipo: 'objeto' }, quotedMessageId: { tipo: 'texto' },
}, (v) => (v.customLinkPreview
  ? falla(422, 'La Cloud API arma la vista previa de la liga; no acepta título ni descripción propios', { code: 'VISTA_PREVIA_PROPIA_NO_DISPONIBLE', alternativa: 'Manda linkPreview: true y la liga en el texto.' })
  : { tipo: 'texto', texto: v.text, ...(v.linkPreview ? { vistaPrevia: true } : {}) })));

type CuerpoRespuesta = { chatId: string; quotedMessageId: string; text: string };
export const respondeMensaje = manejadorDeEnvio<CuerpoRespuesta>(async (c) => lee<CuerpoRespuesta>(c, {
  chatId: CHAT, quotedMessageId: { tipo: 'texto', requerido: true }, text: { tipo: 'texto', requerido: true, max: 4096 }, mentions: MENCIONES,
}, (v) => ({ tipo: 'texto', texto: v.text })));

type CuerpoMedio = { chatId: string; url?: string; base64?: string; mimetype?: string; filename?: string; caption?: string; quotedMessageId?: string; ptt?: boolean };
const CAMPOS_MEDIO: Record<string, Campo> = {
  chatId: CHAT, url: { tipo: 'texto' }, base64: { tipo: 'texto' }, mimetype: { tipo: 'texto' }, filename: { tipo: 'texto', max: 255 },
  caption: { tipo: 'texto', max: 1024 }, mentions: MENCIONES, quotedMessageId: { tipo: 'texto' },
};

function armaMedio(tipo: TipoMedio, v: CuerpoMedio): MensajeSaliente | Respuesta {
  if (v.base64 !== undefined) return falla(422, 'La Cloud API recibe los medios por liga: no acepta base64', { code: 'SOLO_URL', alternativa: 'Sube el archivo a una liga https y mándala en url (Meta la descarga).' });
  if (!v.url) return falla(400, ['url should not be empty']);
  if (v.caption && (tipo === 'audio' || tipo === 'sticker')) return falla(422, `Un ${tipo} no lleva pie en la Cloud API`, { code: 'PIE_NO_DISPONIBLE', alternativa: 'Manda el texto aparte con send-text.' });
  if (v.ptt) return falla(422, 'La nota de voz (ptt) no se verificó contra la Cloud API en esta fachada', { code: 'PTT_NO_DISPONIBLE', alternativa: 'Manda el audio sin ptt: llega como audio.' });
  return { tipo, enlace: v.url, ...(v.caption ? { pie: v.caption } : {}), ...(tipo === 'documento' && v.filename ? { archivo: v.filename } : {}) };
}

export const enviaMedio = (tipo: TipoMedio) => manejadorDeEnvio<CuerpoMedio>(async (c) => lee<CuerpoMedio>(c, tipo === 'audio' ? { ...CAMPOS_MEDIO, ptt: { tipo: 'booleano' } } : CAMPOS_MEDIO, (v) => armaMedio(tipo, v)));

type CuerpoUbicacion = { chatId: string; latitude: number; longitude: number; address?: string; quotedMessageId?: string };
export const enviaUbicacion = manejadorDeEnvio<CuerpoUbicacion>(async (c) => lee<CuerpoUbicacion>(c, {
  chatId: CHAT, latitude: { tipo: 'numero', requerido: true }, longitude: { tipo: 'numero', requerido: true }, address: { tipo: 'texto', max: 1024 }, quotedMessageId: { tipo: 'texto' },
}, (v) => ({ tipo: 'ubicacion', latitud: v.latitude, longitud: v.longitude, ...(v.address ? { direccion: v.address } : {}) })));

type CuerpoContacto = { chatId: string; contactName: string; contactNumber: string; quotedMessageId?: string };
export const enviaContacto = manejadorDeEnvio<CuerpoContacto>(async (c) => lee<CuerpoContacto>(c, {
  chatId: CHAT, contactName: { tipo: 'texto', requerido: true, max: 255 }, contactNumber: { tipo: 'texto', requerido: true, max: 30 }, quotedMessageId: { tipo: 'texto' },
}, (v) => ({ tipo: 'contactos', contactos: [{ nombre: v.contactName, telefonos: [v.contactNumber] }] })));

type CuerpoPlantilla = { chatId: string; templateId?: string; templateName?: string; vars?: Record<string, unknown>; linkPreview?: boolean };

async function leePlantilla(c: Contexto, s: Sesion, n: NumeroDeSesion): Promise<Lectura<CuerpoPlantilla>> {
  const v = valida<CuerpoPlantilla & { mentions?: string[] }>(c.peticion.cuerpo, { chatId: CHAT, templateId: { tipo: 'texto' }, templateName: { tipo: 'texto' }, vars: { tipo: 'objeto' }, mentions: MENCIONES, linkPreview: { tipo: 'booleano' } });
  if (!v.ok) return v;
  const mal = sinMenciones(v.v.mentions);
  if (mal) return { ok: false, r: mal };
  if (!v.v.templateId && !v.v.templateName) return { ok: false, r: falla(400, ['templateId or templateName should not be empty']) };
  const t = (await refrescaPlantillas(c, s, n)).find((x) => (v.v.templateId ? x.id === v.v.templateId : x.name === v.v.templateName));
  if (!t) return { ok: false, r: noEncontrado('Template') };
  if (t.metaEstado !== 'approved') {
    const alternativa = t.metaEstado === 'pending' ? 'Meta la revisa (de minutos a 24 h); dentro de la ventana de 24 h manda el texto con send-text.' : 'Corrígela con PUT /templates/{id}: se manda a una revisión nueva.';
    return { ok: false, r: falla(422, `La plantilla está ${t.metaEstado === 'pending' ? 'en revisión' : 'rechazada'} por Meta`, { code: t.metaEstado === 'pending' ? 'PLANTILLA_EN_REVISION' : 'PLANTILLA_RECHAZADA', alternativa }) };
  }
  const falta = t.variables.filter((k) => v.v.vars?.[k] === undefined);
  if (falta.length) return { ok: false, r: falla(400, falta.map((k) => `vars.${k} should not be empty`)) };
  return { ok: true, v: v.v, m: { tipo: 'plantilla', nombre: t.metaNombre, idioma: c.p.idiomaPlantillas, parametros: t.variables.map((k) => String(v.v.vars?.[k])) } };
}
export const enviaPlantilla = manejadorDeEnvio<CuerpoPlantilla>(leePlantilla);

type CuerpoProducto = { chatId: string; productId: string; body?: string };
export const enviaProducto = manejadorDeEnvio<CuerpoProducto>(async (c, _s, n) => lee<CuerpoProducto>(c, {
  chatId: CHAT, productId: { tipo: 'texto', requerido: true, max: 255 }, body: { tipo: 'texto', max: 4096 },
}, (v) => (n.catalogoId
  ? { tipo: 'producto', catalogo: n.catalogoId, retailerId: v.productId, ...(v.body ? { cuerpo: v.body } : {}) }
  : falla(422, 'El número no tiene un catálogo conectado', { code: 'SIN_CATALOGO', alternativa: 'Conecta el catálogo del Commerce Manager al número.' }))), (msg) => ({ status: 201, cuerpo: { id: msg.waMessageId, timestamp: msg.timestamp } }));

/** Reacción: mensaje `reaction` de la Cloud API (vacío la quita). No es un mensaje de la lista: va a su mensaje. */
export const reacciona: Manejador = async (c) => conIdempotencia(c, async () => {
  const l = await sesionLista(c);
  if (!l.ok) return l.r;
  const v = valida<{ chatId: string; messageId: string; emoji: string }>(c.peticion.cuerpo, { chatId: CHAT, messageId: { tipo: 'texto', requerido: true }, emoji: { tipo: 'texto', requerido: true, max: 32 } });
  if (!v.ok) return v.r;
  const d = destino(v.v.chatId);
  if (!d.ok) return d.r;
  if (!alcanzaChat(c, d.chatId)) return falla(403, 'La llave no alcanza este chat');
  const e = await envia(c, l.s, l.n, d.chatId, { tipo: 'reaccion', mensajeId: v.v.messageId, emoji: v.v.emoji }, undefined, false);
  if (!e.ok) return e.r;
  const objetivo = c.estado.mensajes.find((m) => m.sessionId === l.s.id && m.waMessageId === v.v.messageId);
  if (objetivo) {
    const propio = e.msg.from;
    objetivo.reacciones = objetivo.reacciones.filter((r) => r.senderId !== propio);
    if (v.v.emoji) objetivo.reacciones.push({ senderId: propio, emoji: v.v.emoji, timestamp: e.msg.timestamp });
  }
  return responde(200, { success: true });
});
