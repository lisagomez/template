/**
 * /api/ventas-whatsapp/openwa/api/... — la API de OpenWA 0.25.0 servida sobre el BSP oficial (puerta de salida). Quien
 * usa OpenWA cambia su `baseUrl` a `<esta app>/api/ventas-whatsapp/openwa` y su llave; las rutas siguen siendo las de
 * OpenWA. Compatible con la API de OpenWA; no es OpenWA. Solo laboratorio: sin él, 503.
 */
import { fachadaOpenWA } from '@/features/ventas-whatsapp/services/servidor/openwa';

export const dynamic = 'force-dynamic';

const PREFIJO = '/api/ventas-whatsapp/openwa';
const json = (status: number, cuerpo?: unknown, cabeceras: Record<string, string> = {}) =>
  new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json', ...cabeceras } });

async function atiende(peticion: Request): Promise<Response> {
  const url = new URL(peticion.url);
  const f = fachadaOpenWA(url.origin);
  if (!f.ok) return json(503, { statusCode: 503, message: f.error, error: 'Service Unavailable' });
  const crudo = peticion.method === 'GET' || peticion.method === 'HEAD' ? '' : await peticion.text();
  let cuerpo: unknown;
  try { cuerpo = crudo ? JSON.parse(crudo) : undefined; } catch { return json(400, { statusCode: 400, message: ['el cuerpo no es JSON'], error: 'Bad Request' }); }
  const r = await f.fachada.atiende({
    metodo: peticion.method, ruta: url.pathname.slice(PREFIJO.length) || '/', consulta: url.searchParams, cuerpo,
    cabeceras: Object.fromEntries(peticion.headers.entries()), ip: peticion.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '',
  });
  return json(r.status, r.cuerpo, r.cabeceras);
}

export { atiende as GET, atiende as POST, atiende as PUT, atiende as PATCH, atiende as DELETE, atiende as OPTIONS, atiende as HEAD };
