/**
 * Las PLANTILLAS de WhatsApp de los avisos (categoria utility, es_MX). Versionadas: cambiarlas es un CDC, como las
 * del correo (`portal/plantillas.ts`). Se registran en Meta TAL CUAL: el cuerpo con `{{n}}` y los textos de los
 * botones de respuesta rapida; lo que viaja al mandarlas son los parametros y los payloads firmados.
 *
 * MINIMIZACION (lo que ve Meta ya salio del perimetro: la Cloud API descifra y guarda el mensaje hasta 30 dias,
 * developers.facebook.com/documentation/business-messaging/whatsapp/data-privacy-and-security, 2026-10-19):
 *  - el NOMBRE de pila, sin apellidos;
 *  - la clinica y la FECHA, que es lo minimo de un recordatorio;
 *  - NUNCA el servicio: «Endodoncia» o «Implante» dicen algo de la salud de la persona. El detalle esta en el portal;
 *  - NUNCA una promocion: una utility con contenido de marketing Meta la pasa a marketing (US$0.0397 contra
 *    US$0.0085 en Mexico, y exige otro opt-in). El aviso de Telegram lleva promo; este no.
 *
 * Dentro de la ventana de 24 h (la persona escribio hace poco) el MISMO texto sale como mensaje de servicio con
 * botones interactivos: entra en los 1,000 mensajes de servicio gratis del mes y no paga plantilla.
 */
import type { ClaseAviso } from '../eventos.js';
import type { MensajeWa } from './tipos.js';

export const VERSION_PLANTILLAS_WA = 'whatsapp-avisos-1 (2026-10-19)';
export const IDIOMA_WA = 'es_MX';

/** `no_ire`: «No podré ir» del recordatorio de 24 h; con 24 h o mas abre cancelar, con menos pasa a la recepcion. */
export type AccionBoton = 'confirma' | 'reprograma' | 'cancela' | 'no_ire';
export type ClasePlantilla = Exclude<ClaseAviso, 'newsletter'> | 'reprogramada';

export interface DefinicionPlantillaWa {
  nombre: string;
  categoria: 'utility';
  idioma: string;
  cuerpo: string;
  /** Los botones de respuesta rapida, en orden: el texto (lo aprueba Meta) y la accion que dispara. */
  botones: Array<{ texto: string; accion: AccionBoton }>;
  parametros: string[];
}

const CAMBIAR = { texto: 'Cambiar cita', accion: 'reprograma' } as const;
const CANCELAR = { texto: 'Cancelar cita', accion: 'cancela' } as const;

export const PLANTILLAS_WA: Readonly<Record<ClasePlantilla, DefinicionPlantillaWa>> = {
  confirmacion: {
    nombre: 'cita_confirmada_v1', categoria: 'utility', idioma: IDIOMA_WA, parametros: ['nombre de pila', 'clínica', 'fecha y hora'],
    cuerpo: 'Hola, {{1}}. Tu cita en {{2}} quedó confirmada para el {{3}}. Si necesitas moverla, usa los botones o tu cuenta en el portal.',
    botones: [CAMBIAR, CANCELAR],
  },
  reprogramada: {
    nombre: 'cita_reprogramada_v1', categoria: 'utility', idioma: IDIOMA_WA, parametros: ['nombre de pila', 'clínica', 'fecha y hora nuevas'],
    cuerpo: 'Hola, {{1}}. Tu cita en {{2}} cambió al {{3}}. El horario anterior ya no está apartado.',
    botones: [CAMBIAR, CANCELAR],
  },
  recordatorio_24h: {
    nombre: 'recordatorio_cita_24h_v1', categoria: 'utility', idioma: IDIOMA_WA, parametros: ['nombre de pila', 'clínica', 'fecha y hora'],
    cuerpo: 'Hola, {{1}}. Te recordamos tu cita en {{2}} mañana, {{3}}. ¿Nos confirmas que vienes?',
    // NO lleva «Cambiar cita»: a 24 h la clinica ya no deja moverla por el portal (LIMITE_CAMBIO_HORAS), y un boton
    // que siempre contesta «llama a la clinica» es un callejon. «No podré ir» avisa y lo toma la recepcion.
    botones: [{ texto: 'Confirmo', accion: 'confirma' }, { texto: 'No podré ir', accion: 'no_ire' }],
  },
  recordatorio_2h: {
    nombre: 'recordatorio_cita_2h_v1', categoria: 'utility', idioma: IDIOMA_WA, parametros: ['nombre de pila', 'clínica', 'hora', 'dirección de la clínica'],
    cuerpo: 'Hola, {{1}}. Tu cita en {{2}} es hoy a las {{3}}. Te esperamos en {{4}}.',
    botones: [],
  },
  cancelacion: {
    nombre: 'cita_cancelada_v1', categoria: 'utility', idioma: IDIOMA_WA, parametros: ['nombre de pila', 'clínica', 'fecha y hora'],
    cuerpo: 'Hola, {{1}}. Cancelamos tu cita en {{2}} del {{3}}. Cuando quieras, escribe «agendar» para elegir otro horario.',
    botones: [],
  },
};

export const rellena = (def: DefinicionPlantillaWa, parametros: readonly string[]): string =>
  def.cuerpo.replace(/\{\{(\d+)\}\}/g, (_, n: string) => parametros[Number(n) - 1] ?? '');

/**
 * El aviso como sale: PLANTILLA fuera de la ventana de 24 h (lo unico que Meta deja) o MENSAJE DE SERVICIO con el
 * mismo texto y botones interactivos dentro de ella. `payload(accion)` firma lo que vuelve al tocar un boton.
 */
export function mensajeAviso(clase: ClasePlantilla, parametros: string[], ventanaAbierta: boolean, payload: (a: AccionBoton) => string): MensajeWa {
  const def = PLANTILLAS_WA[clase];
  if (!ventanaAbierta) return { tipo: 'plantilla', nombre: def.nombre, idioma: def.idioma, parametros, ...(def.botones.length ? { botones: def.botones.map((b) => ({ payload: payload(b.accion) })) } : {}) };
  const cuerpo = rellena(def, parametros);
  if (!def.botones.length) return { tipo: 'texto', texto: cuerpo };
  return { tipo: 'botones', cuerpo, botones: def.botones.map((b) => ({ id: payload(b.accion), titulo: b.texto })) };
}

/** Lo que se registra en Meta (y en el simulador): nombre → definicion con texto y botones. */
export function registroDePlantillas(): Record<string, { categoria: 'utility'; idioma: string; cuerpo: string; botones: string[] }> {
  return Object.fromEntries(Object.values(PLANTILLAS_WA).map((d) => [d.nombre, { categoria: d.categoria, idioma: d.idioma, cuerpo: d.cuerpo, botones: d.botones.map((b) => b.texto) }]));
}
