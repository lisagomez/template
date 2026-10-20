/**
 * El banco de la puerta de salida de OpenWA: el simulador de Meta (Graph, administración y webhooks), el BSP con su
 * Embedded Signup simulado, y la fachada, en proceso. Todo sintético: ningún número real, ninguna red fuera de
 * 127.0.0.1. Los webhooks de la fachada caen en receptores en memoria con el status que la prueba elija.
 */
import { generateKeyPairSync } from 'node:crypto';
import { almacenEnMemoria, bovedaEnMemoria, creaBsp, relojManual, CABECERA_FIRMA } from '../dist/index.js';
import { creaMetaBspSimulada, creaMetaSimulada } from '../dist/simulador/index.js';
import { tienda } from '../dist/laboratorio/index.js';
import { altasDelBsp, creaFachada, type EntregaWebhook, type FachadaOpenWA } from '../dist/openwa/index.js';

export const INICIO = Date.parse('2026-10-20T16:00:00Z');
export const MAESTRA = 'llave-maestra-sintetica-del-laboratorio-0001';
export const SECRETO_APP = 'secreto-de-app-sintetico';
export const WA = '5215500000001';
export const WA2 = '5215500000002';
export const TELEFONO = '+52 228 100 0002';
const META = 'https://www.facebook.com';
const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

export interface Entrega { url: string; headers: Record<string, string>; body: string }

export function bancoOpenWA(o: { contactosNuevosPorHora?: number; entrega?: EntregaWebhook } = {}) {
  const reloj = relojManual(INICIO);
  const entregas: Entrega[] = [];
  const statusDe = new Map<string, number>();
  let fachada: FachadaOpenWA | null = null;
  const meta = creaMetaSimulada({ secretoApp: SECRETO_APP, reloj, entrega: async (cuerpo, cab) => (await fachada!.recibeDeMeta(cuerpo, cab[CABECERA_FIRMA])).status });
  meta.registraNumero({ wabaId: 'waba_tienda', phoneNumberId: 'pn_tienda', telefonoVisible: TELEFONO, datasetId: 'ds_tienda', catalogoId: 'cat_tienda', token: 'token-sintetico', llavePublicaFlows: publicKey, plantillas: {} });
  meta.cargaCatalogo('cat_tienda', [{ retailerId: 'sku_cafe', nombre: 'Café de olla', precioCentavos: 12000 }]);
  const metaBsp = creaMetaBspSimulada({ reloj });
  const almacen = almacenEnMemoria();
  const bsp = creaBsp({ graph: metaBsp.graph, boveda: bovedaEnMemoria(), almacen, reloj, modalidad: 'tech_provider', pin: () => '246801', secretoLigas: 'secreto-de-ligas-sintetico' });
  const altas = altasDelBsp(bsp, almacen, (liga) => `https://laboratorio.invalid/plataforma-ventas-whatsapp?liga=${encodeURIComponent(liga)}`);
  let n = 0;
  /** La pausa entre envíos de un lote: inmediata, salvo que la prueba cierre la compuerta para alcanzar a cancelarlo. */
  let compuerta: { abierta: Promise<void>; abre: () => void } | null = null;
  const cierra = () => { let abre = () => {}; const abierta = new Promise<void>((ok) => { abre = ok; }); compuerta = { abierta, abre }; };
  const abre = () => { compuerta?.abre(); compuerta = null; };
  fachada = creaFachada({
    graph: meta.graph, administracion: meta.administracion, altas, llaveMaestra: MAESTRA, secretoApp: SECRETO_APP, reloj, espera: async () => { if (compuerta) await compuerta.abierta; },
    ids: () => `00000000-0000-4000-8000-${(++n).toString().padStart(12, '0')}`,
    entregaWebhook: async (url, init) => {
      entregas.push({ url, headers: init.headers, body: init.body });
      return o.entrega ? o.entrega(url, init) : { status: statusDe.get(url) ?? 200 };
    },
    ...(o.contactosNuevosPorHora !== undefined ? { contactosNuevosPorHora: o.contactosNuevosPorHora } : {}),
  });
  const f = fachada;

  /** La pyme termina Embedded Signup con la liga de la sesión y pone su método de pago (Tech Provider). */
  async function completaAlta(sesionId: string, conPago = true) {
    const s = metaBsp.signup({ wabaId: 'waba_tienda', businessId: 'bm_tienda', phoneNumberId: 'pn_tienda', catalogIds: ['cat_tienda'] });
    const liga = new URL(altas.ligaDeAlta(sesionId)).searchParams.get('liga') ?? '';
    const a = await bsp.recibe({ liga, code: s.code, origen: META, mensaje: s.mensaje, perfil: tienda, telefonoVisible: TELEFONO });
    if ('rechazo' in a) throw new Error(a.rechazo);
    if (conPago) await bsp.confirmaMetodoPago('waba_tienda');
  }

  const pide = (metodo: string, ruta: string, cuerpo?: unknown, cabeceras: Record<string, string> = {}, llave: string | null = MAESTRA) => {
    const [camino, consulta] = ruta.split('?');
    return f.atiende({ metodo, ruta: camino ?? ruta, consulta: new URLSearchParams(consulta ?? ''), cabeceras: { ...(llave ? { 'x-api-key': llave } : {}), ...cabeceras }, cuerpo, ip: '127.0.0.1' });
  };

  /** Una sesión lista: creada, iniciada, con el alta completa y un webhook que lo recibe todo. */
  async function sesionLista(nombre = 'tienda-principal', secreto = 'secreto-de-webhook-sintetico') {
    const s = (await pide('POST', '/api/sessions', { name: nombre })).cuerpo as { id: string };
    await pide('POST', `/api/sessions/${s.id}/start`);
    await completaAlta(s.id);
    const w = (await pide('POST', `/api/sessions/${s.id}/webhooks`, { url: 'https://receptor.invalid/openwa', events: ['*'], secret: secreto })).cuerpo as { id: string };
    await pide('GET', `/api/sessions/${s.id}`);
    return { id: s.id, webhookId: w.id };
  }

  /** Meta entrega lo que tiene en cola y la fachada termina sus entregas de fondo. */
  const drena = async () => { await meta.drena(); await f.asienta(); };
  const cliente = (waId = WA, nombre = 'Ana Sintética') => meta.cliente('pn_tienda', waId, nombre);
  const eventos = (nombre?: string) => entregas.map((e) => JSON.parse(e.body) as { event: string; data: Record<string, unknown> }).filter((e) => !nombre || e.event === nombre);

  return { reloj, meta, metaBsp, bsp, almacen, altas, fachada: f, pide, completaAlta, sesionLista, cliente, entregas, eventos, statusDe, cierra, abre, drena };
}
