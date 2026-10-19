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

/** Lo que la persona mandó desde su celular, para pintar la conversación completa. */
export interface EnviadoPorCliente { wamid: string; instante: number; tipo: string; texto?: string; medio?: { id: string; mime: string; voz?: boolean } }

export interface ClienteSimulado {
  waId: string;
  nombre: string;
  recibidos: RecibidoPorCliente[];
  enviados: EnviadoPorCliente[];
  recibe(r: RecibidoPorCliente): void;
  escribe(texto: string): string;
  /** Llega por un anuncio Click-to-WhatsApp. `conClid: false` = anuncio en Estados (sin `ctwa_clid`). */
  llegaPorAnuncio(adId: string, texto: string, conClid?: boolean): { wamid: string; ctwaClid?: string };
  toca(idOTitulo: string): string;
  /** Toca un botón de respuesta rápida de la última PLANTILLA que lo traiga (por su texto o su payload). */
  tocaBotonPlantilla(textoOPayload: string): string;
  /** Una nota de voz grabada en WhatsApp (`audio` con `voice: true`). */
  mandaAudio(bytes: Uint8Array, mime?: string): string;
  /** Una foto, con su pie si lo trae. */
  mandaImagen(bytes: Uint8Array, caption?: string, mime?: string): string;
  /** El carrito nativo de WhatsApp: productos del catálogo de Meta. */
  pide(items: Array<{ retailerId: string; cantidad: number }>, texto?: string): string;
  /** Abre el último Flow recibido y lo llena pantalla por pantalla. */
  llenaFlow(respuestas: Record<string, RespuestaPantalla>): Promise<{ pantallas: string[]; cierre: Record<string, unknown> | null; errores: string[] }>;
  /**
   * Abre el último Flow (dinámico) recibido y lo deja en su primera pantalla: lo que pinta un teléfono de
   * laboratorio, que avanza con `envia` lo que la persona eligió. Al llegar a SUCCESS manda el `nfm_reply`.
   */
  abreFlow(): Promise<PasoFlow>;
  ultimo(): RecibidoPorCliente | undefined;
}

/** Una pantalla de un Flow abierto. `definicion`: la pantalla del Flow JSON publicado, para pintarla. */
export interface PasoFlow {
  pantalla: string;
  datos: Record<string, unknown>;
  definicion: Record<string, unknown> | null;
  error: string | null;
  cierre: Record<string, unknown> | null;
  envia(respuesta: Record<string, unknown>): Promise<PasoFlow>;
}

export interface DepsCliente {
  numero: NumeroSimulado;
  waId: string;
  nombre: string;
  reloj: Reloj;
  secretoApp: string;
  entrante: (m: Record<string, unknown>) => string;
  /** El medio queda en Meta: el mensaje solo lleva su id. */
  subeMedio: (bytes: Uint8Array, mime: string) => { id: string; sha256: string };
  catalogo: () => Map<string, { nombre: string; precioCentavos: number }> | undefined;
  clic: (adId: string, conClid: boolean) => string | undefined;
  endpointFlows?: (cuerpo: string, cabeceras: Record<string, string>) => Promise<{ status: number; cuerpo: string }>;
}

export function creaCliente(d: DepsCliente): ClienteSimulado {
  const recibidos: RecibidoPorCliente[] = [];
  const enviados: EnviadoPorCliente[] = [];
  const anota = (wamid: string, tipo: string, extra: Partial<EnviadoPorCliente> = {}) => { enviados.push({ wamid, instante: d.reloj(), tipo, ...extra }); return wamid; };
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
    enviados,
    recibe(r) { recibidos.push(r); },
    escribe(texto) { return anota(d.entrante({ type: 'text', text: { body: texto } }), 'texto', { texto }); },
    tocaBotonPlantilla(textoOPayload) {
      for (let k = recibidos.length - 1; k >= 0; k--) {
        const r = recibidos[k]!;
        const b = r.plantilla?.botones.find((x) => x.texto === textoOPayload || x.payload === textoOPayload);
        if (b) return anota(d.entrante({ type: 'button', context: { from: d.numero.telefonoVisible, id: r.wamid }, button: { text: b.texto, payload: b.payload } }), 'boton', { texto: b.texto });
      }
      throw new Error(`no hay botón «${textoOPayload}» en las plantillas recibidas`);
    },
    mandaAudio(bytes, mime = 'audio/ogg; codecs=opus') {
      const m = d.subeMedio(bytes, mime);
      return anota(d.entrante({ type: 'audio', audio: { mime_type: mime, sha256: m.sha256, id: m.id, voice: true } }), 'audio', { medio: { id: m.id, mime, voz: true } });
    },
    mandaImagen(bytes, caption, mime = 'image/jpeg') {
      const m = d.subeMedio(bytes, mime);
      return anota(d.entrante({ type: 'image', image: { mime_type: mime, sha256: m.sha256, id: m.id, ...(caption ? { caption } : {}) } }), 'imagen', { ...(caption ? { texto: caption } : {}), medio: { id: m.id, mime } });
    },
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
      return anota(d.entrante({ type: 'interactive', ...(contexto ? { context: { from: d.numero.telefonoVisible, id: contexto } } : {}), interactive: { type: tipo, [tipo]: resto } }), 'interactivo', { texto: resto.title });
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
      const llama = llamadorFlow(d, flow.flowToken);
      let r = await llama({ action: 'INIT' });
      for (let paso = 0; paso < 8; paso++) {
        if (r.status !== 200 || !r.datos) { errores.push(`HTTP ${r.status}`); return { pantallas, cierre: null, errores }; }
        const pantalla = r.datos.screen ?? '';
        const datos = r.datos.data ?? {};
        if (pantalla === 'SUCCESS') {
          const params = ((datos.extension_message_response as Record<string, unknown> | undefined)?.params ?? {}) as Record<string, unknown>;
          anota(d.entrante({ type: 'interactive', interactive: { type: 'nfm_reply', nfm_reply: { response_json: JSON.stringify(params), body: 'Sent', name: 'flow' } } }), 'flow', { texto: 'Formulario enviado' });
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
    async abreFlow() {
      const flow = [...recibidos].reverse().find((r) => r.mensaje.tipo === 'flow')?.mensaje as Extract<MensajeSaliente, { tipo: 'flow' }> | undefined;
      if (!flow) throw new Error('no hay Flow recibido');
      const def = Object.values(d.numero.flows).find((f) => f.id === flow.flowId)?.definicion;
      if (!def || typeof def.data_api_version !== 'string' || !d.endpointFlows) throw new Error('el Flow no es dinámico o no hay endpoint de datos');
      const pantallas = (Array.isArray(def.screens) ? def.screens : []) as Array<Record<string, unknown>>;
      const llama = llamadorFlow(d, flow.flowToken);
      const paso = (r: { status: number; datos: { screen?: string; data?: Record<string, unknown> } | null }): PasoFlow => {
        const pantalla = r.datos?.screen ?? '';
        const datos = r.datos?.data ?? {};
        const cierre = pantalla === 'SUCCESS' ? (((datos.extension_message_response as Record<string, unknown> | undefined)?.params ?? {}) as Record<string, unknown>) : null;
        if (cierre) anota(d.entrante({ type: 'interactive', interactive: { type: 'nfm_reply', nfm_reply: { response_json: JSON.stringify(cierre), body: 'Sent', name: 'flow' } } }), 'flow', { texto: 'Formulario enviado' });
        const error = r.status !== 200 ? `HTTP ${r.status}` : typeof datos.error === 'string' && datos.error ? datos.error : null;
        return { pantalla, datos, definicion: pantallas.find((x) => x.id === pantalla) ?? null, error, cierre, envia: async (resp) => paso(await llama({ action: 'data_exchange', screen: pantalla, data: resp })) };
      };
      return paso(await llama({ action: 'INIT' }));
    },
    ultimo: () => recibidos[recibidos.length - 1],
  };
  return c;
}

/** La llamada cifrada al endpoint de datos, como la hace WhatsApp (la comparten `llenaFlow` y `abreFlow`). */
function llamadorFlow(d: DepsCliente, flowToken: string) {
  return async (carga: Record<string, unknown>) => {
    const { peticion, llaveAes, iv } = cifraPeticionComoMeta({ version: '3.0', flow_token: flowToken, ...carga }, d.numero.llavePublicaFlows);
    const cuerpo = JSON.stringify(peticion);
    const r = await d.endpointFlows!(cuerpo, { 'content-type': 'application/json', [CABECERA_FIRMA]: firmaMeta(d.secretoApp, cuerpo) });
    if (r.status !== 200) return { status: r.status, datos: null };
    return { status: 200, datos: descifraRespuestaComoMeta(r.cuerpo, llaveAes, iv) as { screen?: string; data?: Record<string, unknown> } };
  };
}
