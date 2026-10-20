/**
 * Lo que la Graph API administra además de mandar mensajes, y que la puerta de salida de OpenWA necesita: las
 * plantillas de la WABA (se crean en revisión), el bloqueo de usuarios del número y el perfil de negocio. El adaptador
 * HTTP real va contra las rutas de Meta; el simulador implementa la misma interfaz.
 *
 * Rutas de la documentación consultada el 2026-10-20: `POST|GET|DELETE /{waba_id}/message_templates` (Template API),
 * `POST|DELETE|GET /{phone_number_id}/block_users` (Block Users API) y `POST /{phone_number_id}/whatsapp_business_profile`.
 */
import { esObjeto, texto } from '../comun/base.js';
import { VERSION_GRAPH } from './graph.js';
import type { CategoriaPlantilla } from './mensajes.js';

export type EstadoPlantillaMeta = 'PENDING' | 'APPROVED' | 'REJECTED';
export interface PlantillaMeta { id: string; nombre: string; idioma: string; categoria: CategoriaPlantilla; cuerpo: string; estado: EstadoPlantillaMeta }
export type ResultadoGraph<T> = ({ ok: true } & T) | { ok: false; codigo: number; error: string };

/** Lo que se manda a revisión: el cuerpo con `{{1}}`, `{{2}}`… y un ejemplo por variable (Meta lo exige). */
export type NuevaPlantilla = Pick<PlantillaMeta, 'nombre' | 'idioma' | 'categoria' | 'cuerpo'> & { encabezado?: string; pie?: string; ejemplos?: string[] };

export interface AdministracionGraph {
  creaPlantilla(wabaId: string, p: NuevaPlantilla): Promise<ResultadoGraph<{ id: string; estado: EstadoPlantillaMeta }>>;
  plantillas(wabaId: string): Promise<PlantillaMeta[]>;
  borraPlantilla(wabaId: string, nombre: string): Promise<ResultadoGraph<object>>;
  bloquea(phoneNumberId: string, waIds: readonly string[], bloquear: boolean): Promise<ResultadoGraph<{ usuarios: string[] }>>;
  bloqueados(phoneNumberId: string): Promise<string[]>;
  actualizaPerfil(phoneNumberId: string, campos: { about?: string }): Promise<ResultadoGraph<object>>;
}

type FetchGraph = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ status: number; json(): Promise<unknown> }>;

const errorDe = (cuerpo: unknown, status: number) => {
  const e = esObjeto(cuerpo) && esObjeto(cuerpo.error) ? cuerpo.error : {};
  return { ok: false as const, codigo: typeof e.code === 'number' ? e.code : status, error: texto(e.message) ?? `HTTP ${status}` };
};
const lista = (c: unknown) => (esObjeto(c) && Array.isArray(c.data) ? c.data.filter(esObjeto) : []);

/**
 * El adaptador HTTP real (en el laboratorio apunta al simulador). El token es uno, o uno por recurso (WABA o número) de
 * un almacén de secretos inyectado, como `clienteGraphMultiInquilino`. Nunca se registra ni se imprime.
 */
export function administracionGraphHttp(o: { base: string; token: string | ((idRecurso: string) => string | undefined); fetch: FetchGraph; version?: string }): AdministracionGraph {
  const url = (ruta: string) => `${o.base.replace(/\/$/, '')}/${o.version ?? VERSION_GRAPH}/${ruta}`;
  const llama = async (metodo: string, ruta: string, cuerpo?: unknown) => {
    const id = ruta.split('/')[0] ?? '';
    const token = typeof o.token === 'string' ? o.token : o.token(id);
    if (!token) throw new Error(`sin token para el recurso ${id}`);
    const r = await o.fetch(url(ruta), { method: metodo, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }) });
    return { status: r.status, cuerpo: await r.json().catch(() => null) };
  };
  return {
    async creaPlantilla(wabaId, p) {
      const components = [
        ...(p.encabezado ? [{ type: 'HEADER', format: 'TEXT', text: p.encabezado }] : []),
        { type: 'BODY', text: p.cuerpo, ...(p.ejemplos?.length ? { example: { body_text: [p.ejemplos] } } : {}) },
        ...(p.pie ? [{ type: 'FOOTER', text: p.pie }] : []),
      ];
      const r = await llama('POST', `${wabaId}/message_templates`, { name: p.nombre, language: p.idioma, category: p.categoria.toUpperCase(), components });
      const c = esObjeto(r.cuerpo) ? r.cuerpo : {};
      return r.status === 200 && texto(c.id) ? { ok: true, id: texto(c.id)!, estado: (texto(c.status) ?? 'PENDING') as EstadoPlantillaMeta } : errorDe(r.cuerpo, r.status);
    },
    async plantillas(wabaId) {
      const r = await llama('GET', `${wabaId}/message_templates`);
      return lista(r.cuerpo).map((t) => {
        const cuerpo = (Array.isArray(t.components) ? t.components : []).find((x) => esObjeto(x) && x.type === 'BODY');
        return { id: texto(t.id) ?? '', nombre: texto(t.name) ?? '', idioma: texto(t.language) ?? '', categoria: (texto(t.category) ?? 'utility').toLowerCase() as CategoriaPlantilla, cuerpo: esObjeto(cuerpo) ? texto(cuerpo.text) ?? '' : '', estado: (texto(t.status) ?? 'PENDING') as EstadoPlantillaMeta };
      });
    },
    async borraPlantilla(wabaId, nombre) {
      const r = await llama('DELETE', `${wabaId}/message_templates?name=${encodeURIComponent(nombre)}`);
      return r.status === 200 ? { ok: true } : errorDe(r.cuerpo, r.status);
    },
    async bloquea(phoneNumberId, waIds, bloquear) {
      const r = await llama(bloquear ? 'POST' : 'DELETE', `${phoneNumberId}/block_users`, { messaging_product: 'whatsapp', block_users: waIds.map((u) => ({ user: u })) });
      const c = esObjeto(r.cuerpo) && esObjeto(r.cuerpo.block_users) ? r.cuerpo.block_users : {};
      const usuarios = (Array.isArray(c.added_users) ? c.added_users : Array.isArray(c.removed_users) ? c.removed_users : []).filter(esObjeto).map((u) => texto(u.wa_id) ?? '');
      return r.status === 200 ? { ok: true, usuarios } : errorDe(r.cuerpo, r.status);
    },
    async bloqueados(phoneNumberId) {
      const r = await llama('GET', `${phoneNumberId}/block_users`);
      return lista(r.cuerpo).map((u) => texto(u.wa_id) ?? '').filter(Boolean);
    },
    async actualizaPerfil(phoneNumberId, campos) {
      const r = await llama('POST', `${phoneNumberId}/whatsapp_business_profile`, { messaging_product: 'whatsapp', ...campos });
      return r.status === 200 ? { ok: true } : errorDe(r.cuerpo, r.status);
    },
  };
}
