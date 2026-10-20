/**
 * Las llaves de la fachada, con la semántica de OpenWA: `X-API-Key` (o `Authorization: Bearer`), roles ADMIN >
 * OPERATOR > VIEWER, alcance por sesión, por chat y por IP, vencimiento y revocación. La llave en claro sale una
 * sola vez (al crearla); se guarda su sha256 y se compara en tiempo constante. La llave maestra viene inyectada.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Reloj } from '../comun/base.js';
import { ahora, type Contexto, type EstadoOpenWA, type Manejador } from './contexto.js';
import { falla, iso, noEncontrado, responde, valida } from './respuestas.js';
import type { Llave, Peticion, Respuesta, Rol } from './tipos.js';

const huella = (llave: string) => createHash('sha256').update(llave).digest('hex');
const iguales = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const PREFIJO = 'vwa_k1_';
const ROLES_API: readonly Rol[] = ['admin', 'operator', 'viewer'];

export function llaveDeLaPeticion(p: Peticion): string | undefined {
  const directa = p.cabeceras['x-api-key']?.trim();
  if (directa) return directa;
  const m = /^Bearer\s+(\S+)$/i.exec(p.cabeceras.authorization ?? '');
  return m?.[1];
}

/** Quién llama. La maestra es ADMIN sin alcance; las demás salen del almacén y cuentan su uso. */
export function autentica(estado: EstadoOpenWA, maestra: string, p: Peticion, reloj: Reloj): { ok: true; llave: Llave } | { ok: false; r: Respuesta } {
  const presentada = llaveDeLaPeticion(p);
  if (!presentada) return { ok: false, r: falla(401, 'Falta la API key (X-API-Key)') };
  const h = huella(presentada);
  if (maestra && iguales(h, huella(maestra))) {
    return { ok: true, llave: { id: 'maestra', name: 'maestra', keyPrefix: presentada.slice(0, 11), hash: h, role: 'admin', allowedIps: [], allowedSessions: [], allowedChats: [], isActive: true, usageCount: 0, createdAt: iso(0) } };
  }
  const llave = [...estado.llaves.values()].find((l) => iguales(l.hash, h));
  if (!llave || !llave.isActive) return { ok: false, r: falla(401, 'La API key no existe o fue revocada') };
  if (llave.expiresAt && Date.parse(llave.expiresAt) <= reloj()) return { ok: false, r: falla(401, 'La API key venció') };
  if (llave.allowedIps.length && !llave.allowedIps.includes(p.ip ?? '')) return { ok: false, r: falla(403, 'La IP no está en la lista de la llave') };
  llave.usageCount += 1;
  llave.lastUsedAt = iso(reloj());
  return { ok: true, llave };
}

export const alcanza = (llave: Llave, rol: Rol) => ROLES_API.indexOf(llave.role) <= ROLES_API.indexOf(rol);

/** Sin la huella: la llave no se puede reconstruir ni comparar desde fuera. */
export const dtoLlave = (l: Llave) => ({
  id: l.id, name: l.name, keyPrefix: l.keyPrefix, role: l.role, allowedIps: l.allowedIps, allowedSessions: l.allowedSessions, allowedChats: l.allowedChats,
  isActive: l.isActive, usageCount: l.usageCount, createdAt: l.createdAt, ...(l.expiresAt ? { expiresAt: l.expiresAt } : {}), ...(l.lastUsedAt ? { lastUsedAt: l.lastUsedAt } : {}),
});

const CAMPOS = {
  name: { tipo: 'texto', min: 3, max: 100 }, role: { tipo: 'texto', enumeracion: ROLES_API }, allowedIps: { tipo: 'textos' },
  allowedSessions: { tipo: 'textos' }, allowedChats: { tipo: 'textos', max: 2000 }, expiresAt: { tipo: 'texto', nulo: true },
} as const;

type CuerpoLlave = { name?: string; role?: Rol; allowedIps?: string[]; allowedSessions?: string[]; allowedChats?: string[]; expiresAt?: string | null };

const llaveDe = (c: Contexto) => c.estado.llaves.get(c.params.id ?? '');
const fechaValida = (s: string | null | undefined) => s === undefined || s === null || Number.isFinite(Date.parse(s));

export const crea: Manejador = async (c) => {
  const v = valida<CuerpoLlave>(c.peticion.cuerpo, { ...CAMPOS, name: { ...CAMPOS.name, requerido: true }, expiresAt: { tipo: 'texto' } });
  if (!v.ok) return v.r;
  if (!fechaValida(v.v.expiresAt)) return falla(400, ['expiresAt must be a valid ISO 8601 date string']);
  const apiKey = `${PREFIJO}${randomBytes(24).toString('base64url')}`;
  const l: Llave = {
    id: c.p.ids(), name: v.v.name!, keyPrefix: apiKey.slice(0, 11), hash: huella(apiKey), role: v.v.role ?? 'operator',
    allowedIps: v.v.allowedIps ?? [], allowedSessions: v.v.allowedSessions ?? [], allowedChats: v.v.allowedChats ?? [],
    isActive: true, usageCount: 0, createdAt: ahora(c), ...(v.v.expiresAt ? { expiresAt: new Date(v.v.expiresAt).toISOString() } : {}),
  };
  c.estado.llaves.set(l.id, l);
  return responde(201, { ...dtoLlave(l), apiKey });
};

export const lista: Manejador = async (c) => responde(200, [...c.estado.llaves.values()].map(dtoLlave));

export const una: Manejador = async (c) => { const l = llaveDe(c); return l ? responde(200, dtoLlave(l)) : noEncontrado('API key'); };

export const actualiza: Manejador = async (c) => {
  const l = llaveDe(c);
  if (!l) return noEncontrado('API key');
  const v = valida<CuerpoLlave>(c.peticion.cuerpo, CAMPOS);
  if (!v.ok) return v.r;
  if (!fechaValida(v.v.expiresAt)) return falla(400, ['expiresAt must be a valid ISO 8601 date string']);
  const { expiresAt, ...resto } = v.v;
  Object.assign(l, Object.fromEntries(Object.entries(resto).filter(([, x]) => x !== undefined)));
  if (expiresAt === null) delete l.expiresAt;
  else if (expiresAt !== undefined) l.expiresAt = new Date(expiresAt).toISOString();
  return responde(200, dtoLlave(l));
};

export const revoca: Manejador = async (c) => {
  const l = llaveDe(c);
  if (!l) return noEncontrado('API key');
  l.isActive = false;
  return responde(200, dtoLlave(l));
};

export const borra: Manejador = async (c) => (c.estado.llaves.delete(c.params.id ?? '') ? responde(204) : noEncontrado('API key'));

export const validaLlave: Manejador = async (c) => responde(200, { valid: true, role: c.llave.role, engineType: 'meta-cloud-api', scoped: c.llave.allowedSessions.length > 0 });
