/**
 * Sesiones: una sesión es un número del BSP. Iniciarla NO da un QR: da la liga de alta (Embedded Signup) y queda en
 * `action_required` hasta que la pyme termina el alta; entonces `ready`. Detenerla o cerrarla deja de enviar y de
 * entregar eventos, sin dar de baja el número en Meta. El proxy y la configuración del motor no aplican: la Cloud
 * API corre en Meta, y pedirlos contesta 422 con la razón (no se aceptan para luego ignorarlos).
 */
import { ahora, sesionDe, type Contexto, type Manejador } from './contexto.js';
import { falla, noEncontrado, pagina, responde, valida } from './respuestas.js';
import type { AltasOpenWA, Sesion } from './tipos.js';

export type EstadoSesion = 'created' | 'ready' | 'disconnected' | 'action_required';

export function estadoDe(s: Sesion): EstadoSesion {
  if (!s.iniciada) return 'created';
  if (s.detenida) return 'disconnected';
  return s.numero?.estado === 'activa' ? 'ready' : 'action_required';
}

export function dtoSesion(s: Sesion, altas: AltasOpenWA) {
  const status = estadoDe(s);
  const sinAlta = status === 'action_required' && !s.numero;
  const lastError = status !== 'action_required' ? null
    : sinAlta ? 'Falta dar de alta el número: abre signupUrl (Embedded Signup de Meta). La vía oficial no usa QR.'
      : 'Falta el método de pago en WhatsApp Manager: hasta entonces el número no envía.';
  return {
    id: s.id, name: s.name, status, phone: s.numero?.telefono ?? null, pushName: null, connectedAt: s.connectedAt ?? null,
    lastActive: s.lastActive ?? null, createdAt: s.createdAt, updatedAt: s.updatedAt, lastError, restriction: null,
    engineLoaded: status === 'ready', engine: 'meta-cloud-api', ...(sinAlta ? { signupUrl: altas.ligaDeAlta(s.id) } : {}),
  };
}

/** Refresca el número con el BSP y publica `session.status` (y `session.authenticated` la primera vez que queda lista). */
export async function sincroniza(c: Pick<Contexto, 'p'>, s: Sesion): Promise<Sesion> {
  if (s.iniciada) {
    const n = await c.p.altas.numero(s.id);
    if (n) s.numero = n; else delete s.numero;
  }
  const status = estadoDe(s);
  if (status === s.publicado) return s;
  const antes = s.publicado;
  s.publicado = status;
  s.updatedAt = new Date(c.p.reloj()).toISOString();
  if (status === 'ready' && !s.connectedAt) s.connectedAt = s.updatedAt;
  if (antes === undefined && status === 'created') return s;
  await c.p.entregador.publica(s.id, 'session.status', { sessionId: s.id, status });
  if (status === 'ready') await c.p.entregador.publica(s.id, 'session.authenticated', { sessionId: s.id, phone: s.numero?.telefono ?? null, pushName: null });
  return s;
}

const NO_APLICA = 'La Cloud API corre en Meta: no hay motor, proxy de salida ni reconexión que configurar.';

export const creaSesion: Manejador = async (c) => {
  if (c.llave.allowedSessions.length) return falla(403, 'Crear una sesión pide una llave sin alcance por sesión');
  const v = valida<{ name: string; config?: Record<string, unknown>; proxyUrl?: string; proxyType?: string }>(c.peticion.cuerpo, {
    name: { tipo: 'texto', requerido: true, min: 3, max: 50 }, config: { tipo: 'objeto' }, proxyUrl: { tipo: 'texto', max: 255 },
    proxyType: { tipo: 'texto', enumeracion: ['http', 'https', 'socks4', 'socks5'] },
  });
  if (!v.ok) return v.r;
  if (v.v.proxyUrl || v.v.proxyType) return falla(422, 'El proxy de salida no aplica a la Cloud API', { code: 'PROXY_NO_APLICA', alternativa: NO_APLICA });
  if (v.v.config && Object.keys(v.v.config).length) return falla(422, 'La configuración del motor no aplica a la Cloud API', { code: 'CONFIG_NO_APLICA', alternativa: NO_APLICA });
  if ([...c.estado.sesiones.values()].some((s) => s.name === v.v.name)) return falla(409, `Ya existe una sesión llamada ${v.v.name}`);
  const s: Sesion = { id: c.p.ids(), name: v.v.name, createdAt: ahora(c), updatedAt: ahora(c), iniciada: false, detenida: false, publicado: 'created' };
  c.estado.sesiones.set(s.id, s);
  return responde(201, dtoSesion(s, c.p.altas));
};

export const listaSesiones: Manejador = async (c) => {
  const nombre = c.peticion.consulta.get('name');
  const visibles = [...c.estado.sesiones.values()].filter((s) => (!c.llave.allowedSessions.length || c.llave.allowedSessions.includes(s.id)) && (!nombre || s.name.includes(nombre)));
  const filas = await Promise.all(pagina(visibles, c.peticion.consulta).map((s) => sincroniza(c, s)));
  return responde(200, filas.map((s) => dtoSesion(s, c.p.altas)));
};

export const unaSesion: Manejador = async (c) => {
  const d = sesionDe(c);
  return d.ok ? responde(200, dtoSesion(await sincroniza(c, d.s), c.p.altas)) : d.r;
};

const cambia = (cambio: (s: Sesion) => void): Manejador => async (c) => {
  const d = sesionDe(c);
  if (!d.ok) return d.r;
  cambio(d.s);
  d.s.updatedAt = ahora(c);
  return responde(200, dtoSesion(await sincroniza(c, d.s), c.p.altas));
};

export const iniciaSesion = cambia((s) => { s.iniciada = true; s.detenida = false; });
/** Detener y cerrar son lo mismo aquí: el número sigue dado de alta en Meta. */
export const detieneSesion = cambia((s) => { s.detenida = true; });

export const borraSesion: Manejador = async (c) => {
  const d = sesionDe(c);
  if (!d.ok) return d.r;
  const id = d.s.id;
  c.estado.sesiones.delete(id);
  for (const [k, w] of c.estado.webhooks) if (w.sessionId === id) c.estado.webhooks.delete(k);
  for (const [k, t] of c.estado.plantillas) if (t.sessionId === id) c.estado.plantillas.delete(k);
  for (const [k, x] of c.estado.contactos) if (x.sessionId === id) c.estado.contactos.delete(k);
  c.estado.mensajes = c.estado.mensajes.filter((m) => m.sessionId !== id);
  return responde(204);
};

export const sesionInexistente = () => noEncontrado('Session');
