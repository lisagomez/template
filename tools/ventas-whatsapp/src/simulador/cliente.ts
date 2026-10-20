/**
 * El cliente final, simulado: el celular de alguien que escribe al negocio. Escribe, toca
 * botones y filas, llega por un anuncio (con su `ctwa_clid`), manda el carrito del catálogo
 * (`order`) y llena Flows: los dinámicos hablan con el endpoint de datos de la app CIFRADOS como
 * lo hace WhatsApp, y al terminar llega el `nfm_reply`.
 */
import type { Reloj } from '../comun/base.js';
import { firmaMeta, CABECERA_FIRMA } from '../meta/firma.js';
import type { MensajeSaliente } from '../meta/mensajes.js';
import { cifraPeticionComoMeta, descifraRespuestaComoMeta } from '../flows/cifrado.js';
import type { NumeroSimulado, RecibidoPorCliente } from './meta.js';

export type RespuestaPantalla = Record<string, unknown> | ((datos: Record<string, unknown>) => Record<string, unknown>);

export interface ClienteSimulado {
  waId: string;
  nombre: string;
  recibidos: RecibidoPorCliente[];
  recibe(r: RecibidoPorCliente): void;
  escribe(texto: string): string;
  /** Reacciona a un mensaje que recibió (emoji vacío quita la reacción). */
  reacciona(wamid: string, emoji: string): string;
  /** Llega por un anuncio Click-to-WhatsApp. `conClid: false` = anuncio en Estados (sin `ctwa_clid`). */
  llegaPorAnuncio(adId: string, texto: string, conClid?: boolean): { wamid: string; ctwaClid?: string };
  toca(idOTitulo: string): string;
  /** El carrito nativo de WhatsApp: productos del catálogo de Meta. */
  pide(items: Array<{ retailerId: string; cantidad: number }>, texto?: string): string;
  /** Abre el último Flow recibido y lo llena pantalla por pantalla. */
  llenaFlow(respuestas: Record<string, RespuestaPantalla>): Promise<{ pantallas: string[]; cierre: Record<string, unknown> | null; errores: string[] }>;
  ultimo(): RecibidoPorCliente | undefined;
}

export interface DepsCliente {
  numero: NumeroSimulado;
  waId: string;
  nombre: string;
  reloj: Reloj;
  secretoApp: string;
  entrante: (m: Record<string, unknown>) => string;
  catalogo: () => Map<string, { nombre: string; precioCentavos: number }> | undefined;
  clic: (adId: string, conClid: boolean) => string | undefined;
  endpointFlows?: (cuerpo: string, cabeceras: Record<string, string>) => Promise<{ status: number; cuerpo: string }>;
}

export function creaCliente(d: DepsCliente): ClienteSimulado {
  const recibidos: RecibidoPorCliente[] = [];
  const buscaInteractivo = (idOTitulo: string) => {
    for (let k = recibidos.length - 1; k >= 0; k--) {
      const m = recibidos[k]!.mensaje;
      if (m.tipo === 'botones') { const b = m.botones.find((x) => x.id === idOTitulo || x.titulo === idOTitulo); if (b) return { tipo: 'button_reply', id: b.id, title: b.titulo }; }
      if (m.tipo === 'lista') for (const s of m.secciones) { const r = s.filas.find((x) => x.id === idOTitulo || x.titulo === idOTitulo); if (r) return { tipo: 'list_reply', id: r.id, title: r.titulo, ...(r.descripcion ? { description: r.descripcion } : {}) }; }
    }
    return null;
  };

  const c: ClienteSimulado = {
    waId: d.waId,
    nombre: d.nombre,
    recibidos,
    recibe(r) { recibidos.push(r); },
    escribe(texto) { return d.entrante({ type: 'text', text: { body: texto } }); },
    reacciona(wamid, emoji) { return d.entrante({ type: 'reaction', reaction: { message_id: wamid, emoji } }); },
    llegaPorAnuncio(adId, texto, conClid = true) {
      const ctwaClid = d.clic(adId, conClid);
      const wamid = d.entrante({
        type: 'text', text: { body: texto },
        referral: {
          source_url: `https://fb.me/${adId}`, source_id: adId, source_type: 'ad', headline: 'Escríbenos por WhatsApp', body: 'Pide hoy', media_type: 'image',
          image_url: 'https://scontent.simulado.test/anuncio.jpg', ...(ctwaClid ? { ctwa_clid: ctwaClid } : {}),
        },
      });
      return { wamid, ...(ctwaClid ? { ctwaClid } : {}) };
    },
    toca(idOTitulo) {
      const i = buscaInteractivo(idOTitulo);
      if (!i) throw new Error(`no hay botón ni fila «${idOTitulo}» en lo recibido`);
      const { tipo, ...resto } = i;
      const contexto = recibidos[recibidos.length - 1]?.wamid;
      return d.entrante({ type: 'interactive', ...(contexto ? { context: { from: d.numero.telefonoVisible, id: contexto } } : {}), interactive: { type: tipo, [tipo]: resto } });
    },
    pide(items, texto) {
      const cat = d.catalogo();
      const product_items = items.map((it) => {
        const p = cat?.get(it.retailerId);
        if (!p) throw new Error(`el producto ${it.retailerId} no está en el catálogo de Meta`);
        return { product_retailer_id: it.retailerId, quantity: it.cantidad, item_price: p.precioCentavos / 100, currency: 'MXN' };
      });
      return d.entrante({ type: 'order', order: { catalog_id: d.numero.catalogoId, ...(texto ? { text: texto } : {}), product_items } });
    },
    async llenaFlow(respuestas) {
      const flow = [...recibidos].reverse().find((r) => r.mensaje.tipo === 'flow')?.mensaje as Extract<MensajeSaliente, { tipo: 'flow' }> | undefined;
      if (!flow) throw new Error('no hay Flow recibido');
      const def = Object.values(d.numero.flows).find((f) => f.id === flow.flowId)?.definicion;
      if (!def) throw new Error('Flow no publicado');
      const pantallas: string[] = [];
      const errores: string[] = [];
      const dinamico = typeof def.data_api_version === 'string';
      if (!dinamico) {
        const pantalla = flow.pantalla;
        const r = respuestas[pantalla];
        const datos = typeof r === 'function' ? r({}) : r ?? {};
        pantallas.push(pantalla);
        const cierre = { flow_token: flow.flowToken, ...datos };
        d.entrante({ type: 'interactive', interactive: { type: 'nfm_reply', nfm_reply: { response_json: JSON.stringify(cierre), body: 'Sent', name: 'flow' } } });
        return { pantallas, cierre, errores };
      }
      if (!d.endpointFlows) throw new Error('sin endpoint de datos');
      const llama = async (carga: Record<string, unknown>) => {
        const { peticion, llaveAes, iv } = cifraPeticionComoMeta({ version: '3.0', flow_token: flow.flowToken, ...carga }, d.numero.llavePublicaFlows);
        const cuerpo = JSON.stringify(peticion);
        const r = await d.endpointFlows!(cuerpo, { 'content-type': 'application/json', [CABECERA_FIRMA]: firmaMeta(d.secretoApp, cuerpo) });
        if (r.status !== 200) return { status: r.status, datos: null };
        return { status: 200, datos: descifraRespuestaComoMeta(r.cuerpo, llaveAes, iv) as { screen?: string; data?: Record<string, unknown> } };
      };
      let r = await llama({ action: 'INIT' });
      for (let paso = 0; paso < 8; paso++) {
        if (r.status !== 200 || !r.datos) { errores.push(`HTTP ${r.status}`); return { pantallas, cierre: null, errores }; }
        const pantalla = r.datos.screen ?? '';
        const datos = r.datos.data ?? {};
        if (pantalla === 'SUCCESS') {
          const params = ((datos.extension_message_response as Record<string, unknown> | undefined)?.params ?? {}) as Record<string, unknown>;
          d.entrante({ type: 'interactive', interactive: { type: 'nfm_reply', nfm_reply: { response_json: JSON.stringify(params), body: 'Sent', name: 'flow' } } });
          return { pantallas, cierre: params, errores };
        }
        pantallas.push(pantalla);
        if (typeof datos.error === 'string' && datos.error) errores.push(`${pantalla}: ${datos.error}`);
        const resp = respuestas[pantalla];
        if (!resp) { errores.push(`sin respuesta para ${pantalla}`); return { pantallas, cierre: null, errores }; }
        r = await llama({ action: 'data_exchange', screen: pantalla, data: typeof resp === 'function' ? resp(datos) : resp });
      }
      errores.push('demasiados pasos');
      return { pantallas, cierre: null, errores };
    },
    ultimo: () => recibidos[recibidos.length - 1],
  };
  return c;
}
