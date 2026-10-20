/**
 * La puerta de salida de OpenWA en el proceso de Next: la fachada compatible con la API de OpenWA 0.25.0 sobre el BSP
 * del laboratorio. SOLO laboratorio (C3 y CDC sin firmar): sin `VENTAS_WA_LABORATORIO=1` y sin la llave ADMIN de la
 * fachada, contesta 503. El transporte es el mismo de todo el canal (Graph multi-inquilino; en el laboratorio, el
 * simulador) y la configuración ya exige C3 y C4 firmados para apuntar a la Graph API real.
 */
import { administracionGraphHttp, clienteGraphMultiInquilino } from '../nucleo.ts';
import { altasDelBsp, creaFachada, type FachadaOpenWA } from '../../../../../tools/ventas-whatsapp/dist/openwa/index.js';
import { configuracion } from './configuracion.ts';
import { plataformaDelServidor } from './runtime.ts';

let fachada: FachadaOpenWA | null = null;

/** La fachada del proceso. `origen` arma la liga de alta absoluta la primera vez (la URL de esta misma app). */
export function fachadaOpenWA(origen: string): { ok: true; fachada: FachadaOpenWA } | { ok: false; error: string } {
  if (fachada) return { ok: true, fachada };
  const c = configuracion();
  if (!c.ok) return c;
  const cfg = c.valor;
  if (cfg.VENTAS_WA_LABORATORIO !== '1') return { ok: false, error: 'la puerta de salida de OpenWA solo corre en el laboratorio: C3 y CDC sin firmar' };
  if (!cfg.VENTAS_WA_OPENWA_LLAVE) return { ok: false, error: 'sin VENTAS_WA_OPENWA_LLAVE: la fachada no arranca sin su llave ADMIN' };
  const pl = plataformaDelServidor();
  if (!pl.ok) return pl;
  const token = (id: string) => cfg.tokens[id];
  fachada = creaFachada({
    graph: clienteGraphMultiInquilino({ base: cfg.VENTAS_WA_GRAPH_URL, fetch, token }),
    administracion: administracionGraphHttp({ base: cfg.VENTAS_WA_GRAPH_URL, fetch, token }),
    altas: altasDelBsp(pl.bsp, pl.almacen, (liga) => new URL(`/plataforma-ventas-whatsapp?liga=${encodeURIComponent(liga)}`, origen).toString()),
    llaveMaestra: cfg.VENTAS_WA_OPENWA_LLAVE,
    secretoApp: cfg.VENTAS_WA_APP_SECRET,
    // Sin seguir redirecciones (no se reenvía la firma a otro destino) y con tope de 10 s por entrega.
    entregaWebhook: async (url, init) => ({ status: (await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(10_000) })).status }),
  });
  return { ok: true, fachada };
}
