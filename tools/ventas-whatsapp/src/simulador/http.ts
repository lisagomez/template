/**
 * El simulador de Meta y el del procesador, servidos por HTTP (para la corrida de punta a punta
 * con la app construida). Graph API bajo `/{versión}/…` con el token de usuario de sistema de cada
 * número (Bearer); el procesador bajo `/ligas` y `/reporte`. Solo laboratorio: escuchan en
 * 127.0.0.1.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { MetaSimulada } from './meta.js';
import type { ProcesadorSimulado } from './procesador.js';

const lee = (req: IncomingMessage) => new Promise<string>((ok, mal) => {
  let t = '';
  req.setEncoding('utf8');
  req.on('data', (c: string) => { t += c; });
  req.on('end', () => ok(t));
  req.on('error', mal);
});

const escucha = (s: Server, puerto: number) => new Promise<Server>((ok) => s.listen(puerto, '127.0.0.1', () => ok(s)));

export function sirveMetaSimulada(meta: MetaSimulada, puerto: number, tokens: Record<string, string>): Promise<Server> {
  const s = createServer(async (req, res) => {
    const responde = (status: number, cuerpo: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(cuerpo)); };
    try {
      const adm = /^\/v\d+\.\d+\/([^/]+)\/(message_templates|block_users|whatsapp_business_profile)(\?.*)?$/.exec(req.url ?? '');
      if (adm) {
        const [, id, recurso, consulta] = adm;
        if (!id || req.headers.authorization !== `Bearer ${tokens[id] ?? '\u0000'}`) return responde(401, { error: { message: 'token inválido', type: 'OAuthException', code: 190 } });
        const cuerpo = req.method === 'GET' ? {} : (JSON.parse((await lee(req)) || '{}') as Record<string, unknown>);
        const r = await administra(meta, req.method ?? 'GET', id, recurso!, cuerpo, new URLSearchParams(consulta?.slice(1)));
        return responde(r.status, r.cuerpo);
      }
      const m = /^\/v\d+\.\d+\/([^/]+)\/(messages|message_qrdls|events)$/.exec(req.url ?? '');
      if (req.method !== 'POST' || !m) return responde(404, { error: { message: 'ruta desconocida', code: 100 } });
      const [, id, recurso] = m;
      if (!id || req.headers.authorization !== `Bearer ${tokens[id] ?? '\u0000'}`) return responde(401, { error: { message: 'token inválido', type: 'OAuthException', code: 190 } });
      const cuerpo = JSON.parse(await lee(req)) as Record<string, unknown>;
      if (recurso === 'messages') {
        if (cuerpo.status === 'read') return responde(200, { success: true });
        const r = await meta.graph.enviaMensaje(id, cuerpo);
        return r.ok ? responde(200, { messaging_product: 'whatsapp', contacts: [{ input: cuerpo.to, wa_id: cuerpo.to }], messages: [{ id: r.wamid }] }) : responde(400, { error: { message: r.error, code: r.codigo } });
      }
      if (recurso === 'message_qrdls') {
        const r = await meta.graph.creaQr(id, String(cuerpo.prefilled_message ?? ''), cuerpo.generate_qr_image === 'PNG' ? 'PNG' : 'SVG');
        return r.ok ? responde(200, { code: r.codigo, prefilled_message: r.mensaje, deep_link_url: r.ligaCorta, qr_image_url: r.urlImagen }) : responde(400, { error: { message: r.error, code: 100 } });
      }
      const r = await meta.graph.enviaEventos(id, (cuerpo.data as never[]) ?? []);
      return r.ok ? responde(200, { events_received: r.recibidos, messages: [], fbtrace_id: r.traza }) : responde(400, { error: { message: r.error, code: r.codigo } });
    } catch {
      return responde(500, { error: { message: 'fallo del simulador', code: 1 } });
    }
  });
  return escucha(s, puerto);
}

/** Template API, Block Users API y perfil de negocio, en la forma de la Graph API. */
async function administra(meta: MetaSimulada, metodo: string, id: string, recurso: string, c: Record<string, unknown>, q: URLSearchParams): Promise<{ status: number; cuerpo: unknown }> {
  const a = meta.administracion;
  const falla = (r: { codigo: number; error: string }) => ({ status: 400, cuerpo: { error: { message: r.error, code: r.codigo } } });
  if (recurso === 'message_templates') {
    if (metodo === 'GET') return { status: 200, cuerpo: { data: (await a.plantillas(id)).map((p) => ({ id: p.id, name: p.nombre, language: p.idioma, category: p.categoria.toUpperCase(), status: p.estado, components: [{ type: 'BODY', text: p.cuerpo }] })) } };
    if (metodo === 'DELETE') { const r = await a.borraPlantilla(id, q.get('name') ?? ''); return r.ok ? { status: 200, cuerpo: { success: true } } : falla(r); }
    const componentes = (Array.isArray(c.components) ? c.components : []) as Array<{ type?: unknown; text?: unknown; example?: { body_text?: unknown[][] } }>;
    const de = (tipo: string) => componentes.find((x) => x.type === tipo);
    const ejemplos = (de('BODY')?.example?.body_text?.[0] ?? []).map(String);
    const r = await a.creaPlantilla(id, {
      nombre: String(c.name ?? ''), idioma: String(c.language ?? ''), categoria: String(c.category ?? '').toLowerCase() as never, cuerpo: String(de('BODY')?.text ?? ''),
      ...(de('HEADER') ? { encabezado: String(de('HEADER')?.text ?? '') } : {}), ...(de('FOOTER') ? { pie: String(de('FOOTER')?.text ?? '') } : {}), ...(ejemplos.length ? { ejemplos } : {}),
    });
    return r.ok ? { status: 200, cuerpo: { id: r.id, status: r.estado, category: String(c.category ?? '') } } : falla(r);
  }
  if (recurso === 'block_users') {
    if (metodo === 'GET') return { status: 200, cuerpo: { data: (await a.bloqueados(id)).map((wa_id) => ({ messaging_product: 'whatsapp', wa_id })) } };
    const usuarios = (Array.isArray(c.block_users) ? c.block_users : []).map((u) => String((u as { user?: unknown }).user ?? ''));
    const r = await a.bloquea(id, usuarios, metodo === 'POST');
    if (!r.ok) return falla(r);
    return { status: 200, cuerpo: { messaging_product: 'whatsapp', block_users: { [metodo === 'POST' ? 'added_users' : 'removed_users']: r.usuarios.map((u) => ({ input: u, wa_id: u })) } } };
  }
  const r = await a.actualizaPerfil(id, typeof c.about === 'string' ? { about: c.about } : {});
  return r.ok ? { status: 200, cuerpo: { success: true } } : falla(r);
}

export function sirveProcesador(p: ProcesadorSimulado, puerto: number): Promise<Server> {
  const s = createServer(async (req, res) => {
    const responde = (status: number, cuerpo: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(cuerpo)); };
    if (req.method === 'POST' && req.url === '/ligas') {
      const r = await p.conector.creaLiga(JSON.parse(await lee(req)) as Parameters<typeof p.conector.creaLiga>[0]);
      return r.ok ? responde(200, r.liga) : responde(400, { error: r.error });
    }
    if (req.method === 'GET' && req.url === '/reporte') return responde(200, await p.conector.reporte());
    return responde(404, { error: 'ruta desconocida' });
  });
  return escucha(s, puerto);
}
