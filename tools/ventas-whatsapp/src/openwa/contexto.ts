/**
 * El estado de la fachada (en memoria: SUPUESTO de laboratorio, ver el reporte) y el contexto de cada petición:
 * la llave que la autenticó, los parámetros de la ruta y los puertos. Aquí viven las comprobaciones que comparten
 * los manejadores: que la sesión exista y esté en el alcance de la llave, que el chat esté en su alcance y que la
 * sesión tenga un número listo para enviar.
 */
import type { Reloj } from '../comun/base.js';
import type { Entregador } from './eventos.js';
import { destino, falla, iso, noEncontrado } from './respuestas.js';
import type {
  ContactoOW, FallaEntrega, Llave, LoteOW, MensajeOW, NumeroDeSesion, OpcionesFachada, Peticion, PlantillaOW, Respuesta, Sesion, WebhookOW,
} from './tipos.js';

export interface RegistroIdempotencia { huella: string; estado: 'en_curso' | 'hecho' | 'desconocido'; respuesta?: Respuesta; vence: number }

export interface EstadoOpenWA {
  llaves: Map<string, Llave>;
  sesiones: Map<string, Sesion>;
  webhooks: Map<string, WebhookOW>;
  plantillas: Map<string, PlantillaOW>;
  mensajes: MensajeOW[];
  contactos: Map<string, ContactoOW>;
  lotes: Map<string, LoteOW>;
  fallas: FallaEntrega[];
  idempotencia: Map<string, RegistroIdempotencia>;
  /** Por sesión: cuándo se escribió por primera vez a cada contacto nuevo (la frontera de salida). */
  nuevos: Map<string, number[]>;
  /** Nombres de plantilla ya usados en Meta: uno borrado no se reusa en 30 días, así que cada versión lleva sufijo. */
  nombresMeta: Set<string>;
}

export const creaEstadoOpenWA = (): EstadoOpenWA => ({
  llaves: new Map(), sesiones: new Map(), webhooks: new Map(), plantillas: new Map(), mensajes: [], contactos: new Map(),
  lotes: new Map(), fallas: [], idempotencia: new Map(), nuevos: new Map(), nombresMeta: new Set(),
});

/** Lo que los manejadores ven de la fachada. */
export interface Puertos extends Required<Pick<OpcionesFachada, 'graph' | 'administracion' | 'altas' | 'entregaWebhook' | 'espera' | 'idiomaPlantillas' | 'categoriaPlantillas' | 'contactosNuevosPorHora'>> {
  reloj: Reloj;
  ids: () => string;
  /** Publica a los webhooks de la sesión (sobre, cabeceras y firma de OpenWA), prueba y reintenta. */
  entregador: Entregador;
  /** Refresca el número de la sesión con el BSP y publica `session.status` si cambió. */
  sincroniza(s: Sesion): Promise<Sesion>;
  /** Registra trabajo de fondo (lotes) para que `asienta()` lo pueda esperar. */
  fondo(trabajo: Promise<void>): void;
}

export interface Contexto {
  p: Puertos;
  estado: EstadoOpenWA;
  llave: Llave;
  params: Record<string, string>;
  peticion: Peticion;
}

export type Manejador = (c: Contexto) => Promise<Respuesta>;

export const ahora = (c: Contexto) => iso(c.p.reloj());

/** La sesión del parámetro `sessionId`, si existe y la llave la alcanza. */
export function sesionDe(c: Contexto): { ok: true; s: Sesion } | { ok: false; r: Respuesta } {
  const s = c.estado.sesiones.get(c.params.sessionId ?? '');
  if (!s) return { ok: false, r: noEncontrado('Session') };
  if (c.llave.allowedSessions.length && !c.llave.allowedSessions.includes(s.id)) return { ok: false, r: falla(403, 'La llave no alcanza esta sesión') };
  return { ok: true, s };
}

export const normaliza = (chatId: string) => { const d = destino(chatId); return d.ok ? d.chatId : chatId; };
/** La forma pública de un chat conocido por la sesión (o la normalizada, si no se conoce). */
export const publicoDe = (estado: EstadoOpenWA, sessionId: string, chatId: string) => estado.contactos.get(llaveContacto(sessionId, normaliza(chatId)))?.chatPublico ?? chatId;
/** El alcance por chat compara en la forma normalizada (`5215…@c.us` y `525…@c.us` son el mismo chat). */
export const alcanzaChat = (c: Contexto, chatId: string) => !c.llave.allowedChats.length || c.llave.allowedChats.some((x) => normaliza(x) === normaliza(chatId));

/** La sesión lista para enviar: iniciada, no detenida y con el alta del número activa. */
export async function sesionLista(c: Contexto): Promise<{ ok: true; s: Sesion; n: NumeroDeSesion } | { ok: false; r: Respuesta }> {
  const d = sesionDe(c);
  if (!d.ok) return d;
  if (!d.s.iniciada) return { ok: false, r: falla(400, 'La sesión no se ha iniciado: POST /sessions/{id}/start') };
  const s = await c.p.sincroniza(d.s);
  if (s.detenida) return { ok: false, r: falla(409, 'La sesión está detenida: POST /sessions/{id}/start') };
  if (!s.numero) return { ok: false, r: falla(409, 'El número de la sesión todavía no está dado de alta', { code: 'ALTA_PENDIENTE', alternativa: `Termina el alta (Embedded Signup) en ${c.p.altas.ligaDeAlta(s.id)}` }) };
  if (s.numero.estado !== 'activa') return { ok: false, r: falla(409, 'Falta el método de pago en WhatsApp Manager: hasta entonces el número no envía', { code: 'FALTA_METODO_DE_PAGO', alternativa: 'La pyme agrega su método de pago en WhatsApp Manager (Tech Provider: Meta le cobra directo).' }) };
  return { ok: true, s, n: s.numero };
}

export const llaveContacto = (sessionId: string, chatId: string) => `${sessionId}|${chatId}`;
