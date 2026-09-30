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
