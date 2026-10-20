/**
 * Los mensajes salientes que no son texto ni interactivos: medios por liga (imagen, video, audio, documento, sticker),
 * ubicación, tarjetas de contacto y reacciones, en la forma interna y en la de la Graph API. Viven aparte de
 * `mensajes.ts` para no inflarlo; ahí solo se enganchan.
 *
 * Formas y límites de la documentación consultada el 2026-10-20 (developers.facebook.com/documentation/
 * business-messaging/whatsapp/messages/send-messages y la referencia de la Message API): el medio va por `link` (https) o
 * por un id de subida; el pie de foto de imagen, video y documento ≤ 1024; el documento lleva `filename`; audio y sticker
 * no llevan pie; la reacción lleva el id del mensaje y un emoji (vacío quita la reacción). SUPUESTO: este módulo solo
 * manda medios por `link` (la fachada no sube medios todavía).
 */
import { esObjeto, numero, texto } from '../comun/base.js';

export const TIPOS_MEDIO = ['imagen', 'video', 'audio', 'documento', 'sticker'] as const;
export type TipoMedio = (typeof TIPOS_MEDIO)[number];
const GRAPH_DE: Record<TipoMedio, string> = { imagen: 'image', video: 'video', audio: 'audio', documento: 'document', sticker: 'sticker' };
const DE_GRAPH = Object.fromEntries(Object.entries(GRAPH_DE).map(([k, v]) => [v, k])) as Record<string, TipoMedio>;
const CON_PIE = new Set<TipoMedio>(['imagen', 'video', 'documento']);

export interface ContactoTarjeta { nombre: string; telefonos: string[] }

export type MensajeMultimedia =
  | { tipo: TipoMedio; enlace: string; pie?: string; archivo?: string }
  | { tipo: 'ubicacion'; latitud: number; longitud: number; nombre?: string; direccion?: string }
  | { tipo: 'contactos'; contactos: ContactoTarjeta[] }
  | { tipo: 'reaccion'; mensajeId: string; emoji: string };

export const esMedio = (t: string): t is TipoMedio => (TIPOS_MEDIO as readonly string[]).includes(t);

export function validaMultimedia(m: MensajeMultimedia): string[] {
  const f: string[] = [];
  if (esMedio(m.tipo) && 'enlace' in m) {
    if (!/^https:\/\//.test(m.enlace)) f.push('el medio va por una liga https');
    if (m.pie !== undefined && !CON_PIE.has(m.tipo)) f.push(`${m.tipo} no lleva pie`);
    if (m.pie !== undefined && [...m.pie].length > 1024) f.push('pie excede 1024 caracteres');
  } else if (m.tipo === 'ubicacion') {
    if (!(Math.abs(m.latitud) <= 90 && Math.abs(m.longitud) <= 180)) f.push('latitud o longitud fuera de rango');
  } else if (m.tipo === 'contactos') {
    if (!m.contactos.length) f.push('sin contactos');
    if (m.contactos.some((c) => !c.nombre.trim())) f.push('contacto sin nombre');
  } else if (m.tipo === 'reaccion') {
    if (!m.mensajeId) f.push('reacción sin mensaje');
    if ([...m.emoji].length > 8) f.push('la reacción es un solo emoji');
  }
  return f;
}

/** Forma interna → la parte del cuerpo de `POST /{phone_number_id}/messages` que depende del tipo. */
export function aCuerpoMultimedia(m: MensajeMultimedia): Record<string, unknown> {
  if (esMedio(m.tipo) && 'enlace' in m) {
    const t = GRAPH_DE[m.tipo];
    return { type: t, [t]: { link: m.enlace, ...(m.pie !== undefined ? { caption: m.pie } : {}), ...(m.archivo ? { filename: m.archivo } : {}) } };
  }
  if (m.tipo === 'ubicacion') return { type: 'location', location: { latitude: m.latitud, longitude: m.longitud, ...(m.nombre ? { name: m.nombre } : {}), ...(m.direccion ? { address: m.direccion } : {}) } };
  if (m.tipo === 'contactos') {
    return { type: 'contacts', contacts: m.contactos.map((c) => ({ name: { formatted_name: c.nombre, first_name: c.nombre }, phones: c.telefonos.map((t) => ({ phone: t, type: 'CELL' })) })) };
  }
  if (m.tipo === 'reaccion') return { type: 'reaction', reaction: { message_id: m.mensajeId, emoji: m.emoji } };
  return {};
}

/** Lo que hace el lado de Meta: el cuerpo Graph de un tipo multimedia → forma interna (o `null` si no es de estos). */
export function desdeCuerpoMultimedia(c: Record<string, unknown>): MensajeMultimedia | null | 'mal' {
  const t = texto(c.type) ?? '';
  const medio = DE_GRAPH[t];
  if (medio) {
    const d = esObjeto(c[t]) ? c[t] : null;
    const enlace = d ? texto(d.link) : undefined;
    if (!d || !enlace) return 'mal';
    const pie = texto(d.caption);
    const archivo = texto(d.filename);
    return { tipo: medio, enlace, ...(pie !== undefined ? { pie } : {}), ...(archivo ? { archivo } : {}) };
  }
  if (t === 'location' && esObjeto(c.location)) {
    const l = c.location;
    const nombre = texto(l.name);
    const direccion = texto(l.address);
    return { tipo: 'ubicacion', latitud: numero(l.latitude) ?? NaN, longitud: numero(l.longitude) ?? NaN, ...(nombre ? { nombre } : {}), ...(direccion ? { direccion } : {}) };
  }
  if (t === 'contacts' && Array.isArray(c.contacts)) {
    const contactos = c.contacts.filter(esObjeto).map((k) => ({
      nombre: esObjeto(k.name) ? texto(k.name.formatted_name) ?? '' : '',
      telefonos: (Array.isArray(k.phones) ? k.phones : []).filter(esObjeto).map((p) => texto(p.phone) ?? ''),
    }));
    return { tipo: 'contactos', contactos };
  }
  if (t === 'reaction' && esObjeto(c.reaction)) return { tipo: 'reaccion', mensajeId: texto(c.reaction.message_id) ?? '', emoji: texto(c.reaction.emoji) ?? '' };
  return null;
}

export function resumeMultimedia(m: MensajeMultimedia): string {
  if (esMedio(m.tipo) && 'enlace' in m) return `[${m.tipo}${m.archivo ? ` ${m.archivo}` : ''}]${m.pie ? ` ${m.pie}` : ''}`;
  if (m.tipo === 'ubicacion') return `[ubicación ${m.nombre ?? `${m.latitud},${m.longitud}`}]`;
  if (m.tipo === 'contactos') return `[contactos: ${m.contactos.map((c) => c.nombre).join(', ')}]`;
  if (m.tipo === 'reaccion') return m.emoji ? `[reacción ${m.emoji}]` : '[quita la reacción]';
  return '';
}
