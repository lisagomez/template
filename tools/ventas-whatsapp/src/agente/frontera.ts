/**
 * La frontera del número: qué mensajes llegan al agente y cuáles no, ANTES del orquestador. Cierra
 * la brecha del C3 «una granja de números quema el presupuesto»: el límite por contacto no la ve,
 * porque cada número de la granja escribe poco.
 *
 *  - **bloqueado**: el dueño bloqueó al contacto. Se guarda lo que escribe y no se le responde.
 *  - **remitente**: un contacto escribe más de 20 mensajes en 10 min.
 *  - **contención**: en la ventana ya llegaron más contactos NUEVOS que el límite del número. Los que
 *    llegan después reciben UNA respuesta de cortesía con el menú (sin modelo, sin pasar a la
 *    bandeja: una granja no debe enterrar al dueño) y nada más hasta que pase la ventana.
 *  - **protegido**: el número recibe más mensajes que su límite. Todos siguen atendidos por el
 *    enrutador determinista y los traspasos, pero nadie gasta modelo.
 *
 * Los clientes que ya existían antes de la ráfaga nunca caen en contención. Los conteos salen del
 * almacén, así que un reinicio no los olvida.
 */
import type { AlmacenInquilino } from '../almacen/almacen.js';
import type { Contacto, Conversacion } from '../modelo.js';

export const LIMITE_POR_CONTACTO = { mensajes: 20, ventanaMs: 10 * 60_000 };
/** Por número de la pyme y por hora. FICTICIO: se ajusta por inquilino (`politicas.frontera`) al medir el piloto. */
export const LIMITE_POR_NUMERO = { contactosNuevos: 40, mensajes: 400, ventanaMs: 60 * 60_000 };

export type Frontera =
  | { paso: 'pasa' }
  | { paso: 'bloqueado'; motivo: string }
  | { paso: 'remitente'; recientes: number }
  | { paso: 'contencion'; lugar: number }
  | { paso: 'protegido'; mensajes: number };

export interface EntradaFrontera {
  conversacionId: string;
  contacto: Contacto;
  instante: number;
  limites?: { contactosNuevos: number; mensajes: number; ventanaMs: number };
}

export async function evaluaFrontera(datos: AlmacenInquilino, e: EntradaFrontera): Promise<Frontera> {
  if (e.contacto.bloqueado) return { paso: 'bloqueado', motivo: e.contacto.bloqueado.motivo };
  const lim = e.limites ?? LIMITE_POR_NUMERO;
  const mensajes = (await datos.lista('mensajes')).filter((m) => m.direccion === 'entrante');
  const desdeContacto = e.instante - LIMITE_POR_CONTACTO.ventanaMs;
  const recientes = mensajes.filter((m) => m.conversacionId === e.conversacionId && m.instante > desdeContacto).length;
  if (recientes > LIMITE_POR_CONTACTO.mensajes) return { paso: 'remitente', recientes };
  const desde = e.instante - lim.ventanaMs;
  if (e.contacto.creadoEn > desde) {
    // Su lugar entre los contactos nuevos de la ventana: los primeros pasan aunque después llegue la ráfaga.
    const antes = (await datos.lista('contactos')).filter((c) => c.waId !== e.contacto.waId && c.creadoEn > desde && c.creadoEn <= e.contacto.creadoEn).length;
    if (antes + 1 > lim.contactosNuevos) return { paso: 'contencion', lugar: antes + 1 };
  }
  const delNumero = mensajes.filter((m) => m.instante > desde).length;
  if (delNumero > lim.mensajes) return { paso: 'protegido', mensajes: delNumero };
  return { paso: 'pasa' };
}

export const CORTESIA_RAFAGA = (negocio: string) => `Gracias por escribir a ${negocio}. Ahorita tenemos muchos mensajes: te respondemos en cuanto podamos.`;

/** Un aviso por tipo y por ventana: la ráfaga no debe convertirse en una ráfaga de alertas. */
export async function yaAvisado(datos: AlmacenInquilino, prefijo: string, desde: number): Promise<boolean> {
  return (await datos.lista('alertas')).some((a) => a.instante > desde && a.texto.startsWith(prefijo));
}

/** El dueño bloquea (o desbloquea) al contacto de una conversación desde el panel. */
export async function bloqueaContacto(datos: AlmacenInquilino, conversacionId: string, ahora: number, motivo: string | null): Promise<Contacto | null> {
  const conv = await datos.lee('conversaciones', conversacionId);
  const c = conv ? await datos.lee('contactos', conv.waId) : undefined;
  if (!c) return null;
  const nuevo: Contacto = { ...c };
  if (motivo) nuevo.bloqueado = { en: ahora, motivo }; else delete nuevo.bloqueado;
  await datos.guarda('contactos', c.waId, nuevo);
  return nuevo;
}

export interface AccionesFrontera {
  bitacora(tipo: string, detalle: string): Promise<void>;
  alerta(nivel: 'aviso' | 'grave', texto: string): Promise<void>;
  /** Manda la cortesía y devuelve la conversación actualizada (ventanas, costo). */
  envia(texto: string): Promise<Conversacion>;
}

/**
 * Aplica lo que decidió la frontera. Devuelve `detener: true` si el orquestador no debe correr, y
 * `protegido: true` si corre sin modelo. Cada tipo de ráfaga avisa una sola vez por ventana.
 */
export async function aplicaFrontera(f: Frontera, ctx: { datos: AlmacenInquilino; negocio: string; conv: Conversacion; contacto: Contacto; waId: string; instante: number; limites?: EntradaFrontera['limites'] }, a: AccionesFrontera): Promise<{ detener: boolean; protegido: boolean; conv: Conversacion; contacto: Contacto }> {
  const lim = ctx.limites ?? LIMITE_POR_NUMERO;
  const minutos = lim.ventanaMs / 60_000;
  const igual = { detener: true, protegido: false, conv: ctx.conv, contacto: ctx.contacto };
  if (f.paso === 'pasa') return { ...igual, detener: false };
  if (f.paso === 'bloqueado') { await a.bitacora('contacto_bloqueado', f.motivo); return igual; }
  if (f.paso === 'remitente') {
    await a.bitacora('limite_remitente', `${f.recientes} mensajes en ${LIMITE_POR_CONTACTO.ventanaMs / 60_000} min: no se gasta modelo`);
    if (f.recientes === LIMITE_POR_CONTACTO.mensajes + 1) await a.alerta('aviso', `El contacto ${ctx.waId} rebasó ${LIMITE_POR_CONTACTO.mensajes} mensajes en ${LIMITE_POR_CONTACTO.ventanaMs / 60_000} min: el agente se detuvo con él.`);
    return igual;
  }
  if (f.paso === 'protegido') {
    await a.bitacora('proteccion_rafaga', `${f.mensajes} mensajes en ${minutos} min en el número: sin modelo`);
    if (!await yaAvisado(ctx.datos, 'Ráfaga de mensajes', ctx.instante - lim.ventanaMs)) await a.alerta('grave', `Ráfaga de mensajes: más de ${lim.mensajes} en ${minutos} min. El agente sigue con respuestas fijas y traspasos, sin gastar modelo, hasta que baje.`);
    return { ...igual, detener: false, protegido: true };
  }
  await a.bitacora('contencion_rafaga', `contacto nuevo número ${f.lugar} de la ventana`);
  if (!await yaAvisado(ctx.datos, 'Ráfaga de contactos nuevos', ctx.instante - lim.ventanaMs)) await a.alerta('grave', `Ráfaga de contactos nuevos: más de ${lim.contactosNuevos} en ${minutos} min. Los que siguen reciben una respuesta de cortesía y nada más; si es una granja, bloquéalos desde la bandeja.`);
  if (ctx.contacto.contenidoEn && ctx.contacto.contenidoEn > ctx.instante - lim.ventanaMs) return igual;
  return { ...igual, conv: await a.envia(CORTESIA_RAFAGA(ctx.negocio)), contacto: { ...ctx.contacto, contenidoEn: ctx.instante } };
}
