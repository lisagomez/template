/**
 * La plataforma de Meta, simulada: lo que la app VE de Meta (webhooks firmados) y lo que la app
 * LLAMA (Graph API: mensajes, QR, Conversions API), con las reglas de Meta que importan al negocio:
 * ventanas de 24 h y 72 h, precio por mensaje, límites de los mensajes interactivos, plantillas
 * registradas, catálogo, Flows publicados y el Administrador de anuncios.
 *
 * Cada forma sale de la documentación consultada el 2026-09-30 (ver `meta/*.ts`). Lo que el
 * simulador SUPONE, porque la documentación no lo dice, está marcado con «SUPUESTO».
 *
 * La app no sabe que habla con esto: el transporte se inyecta (`graph`) y los webhooks llegan por
 * la función `entrega` (en proceso) o por HTTP (`servidorHttp`).
 */
import { createHash, randomBytes, type KeyLike } from 'node:crypto';
import { normalizaWaId, paisDeWaId, relojDelSistema, type Reloj } from '../comun/base.js';
import { firmaMeta, CABECERA_FIRMA } from '../meta/firma.js';
import { desdeCuerpoGraph, validaMensaje, resumeMensaje, type CategoriaPlantilla, type MensajeSaliente } from '../meta/mensajes.js';
import { decidePrecio, mesDeFacturacion, registraEntrante, registraSaliente, TARJETA_LABORATORIO, DIAS_CAPI_MAXIMO, type TarjetaDeTarifas, type Ventanas } from '../meta/tarifas.js';
import type { ClienteGraph, EventoCapi, RespuestaCapi, RespuestaEnvio, RespuestaMedio, RespuestaQr } from '../meta/graph.js';
import { creaCliente, type ClienteSimulado } from './cliente.js';

/** Estado de una plantilla en el Administrador de WhatsApp: solo APPROVED se puede mandar. */
export type EstadoPlantilla = 'APPROVED' | 'PAUSED' | 'DISABLED' | 'REJECTED';

/**
 * Una plantilla registrada con su texto: el cuerpo con `{{1}}`, `{{2}}`… y los textos de sus botones de respuesta
 * rápida. Sin texto basta la categoría (la forma de antes, que sigue valiendo).
 */
export interface DefinicionPlantilla {
  categoria: CategoriaPlantilla;
  estado?: EstadoPlantilla;
  idioma?: string;
  cuerpo?: string;
  botones?: string[];
}

const categoriaDe = (p: CategoriaPlantilla | DefinicionPlantilla): CategoriaPlantilla => (typeof p === 'string' ? p : p.categoria);
const marcadores = (cuerpo: string): number => new Set([...cuerpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1])).size;

/** El texto que ve la persona: el cuerpo con sus parámetros y los botones de la plantilla. */
export function renderizaPlantilla(def: DefinicionPlantilla, parametros: readonly string[], payloads: readonly string[] = []): { texto: string; botones: Array<{ texto: string; payload: string }> } {
  const texto = (def.cuerpo ?? '').replace(/\{\{(\d+)\}\}/g, (_, n: string) => parametros[Number(n) - 1] ?? '');
  return { texto, botones: (def.botones ?? []).map((t, i) => ({ texto: t, payload: payloads[i] ?? t })) };
}

export interface NumeroSimulado {
  wabaId: string;
  phoneNumberId: string;
  telefonoVisible: string;
  datasetId: string;
  catalogoId: string;
  /** Token de usuario de sistema que el servidor HTTP exige (Bearer). */
  token: string;
  llavePublicaFlows: KeyLike;
  plantillas: Record<string, CategoriaPlantilla | DefinicionPlantilla>;
  flows: Record<string, { id: string; definicion: Record<string, unknown> }>;
  conectado: boolean;
}

export interface RecibidoPorCliente {
  wamid: string;
  instante: number;
  mensaje: MensajeSaliente;
  resumen: string;
  precio?: { billable: boolean; tipo: string; categoria: string; costoMicros: number };
  /** Una plantilla con texto registrado, como la ve la persona. */
  plantilla?: { texto: string; botones: Array<{ texto: string; payload: string }> };
}

export interface Campana { id: string; nombre: string; gastoCentavos: number; anuncios: string[] }

export interface OpcionesMetaSimulada {
  secretoApp: string;
  reloj?: Reloj;
  tarjeta?: TarjetaDeTarifas;
  /** Entrega un webhook a la app. Devuelve el status HTTP (200 = recibido). */
  entrega: (cuerpo: string, cabeceras: Record<string, string>) => Promise<number>;
  /** El endpoint de datos de Flows de la app. */
  endpointFlows?: (cuerpo: string, cabeceras: Record<string, string>) => Promise<{ status: number; cuerpo: string }>;
  /** Duplica la entrega N° k de webhooks (Meta reintenta y puede duplicar: se prueba). */
  duplicaSi?: (n: number) => boolean;
  /** Invierte el orden de entrega en ráfagas (Meta no garantiza orden). */
  desordena?: boolean;
  /**
   * El número no tiene WhatsApp. Meta acepta la llamada (200 con `wamid`) y el fallo llega DESPUÉS, por webhook:
   * `failed` con 131026 «Message undeliverable». No se sabe al enviar.
   */
  sinWhatsApp?: (waId: string) => boolean;
}

const EVENTOS_CAPI = new Set(['Purchase', 'LeadSubmitted', 'InitiateCheckout', 'AddToCart', 'ViewContent', 'OrderCreated', 'OrderShipped', 'OrderDelivered', 'OrderCanceled', 'OrderReturned', 'CartAbandoned', 'QualifiedLead', 'RatingProvided', 'ReviewProvided']);

export function creaMetaSimulada(o: OpcionesMetaSimulada) {
  const reloj = o.reloj ?? relojDelSistema;
  const tarjeta = o.tarjeta ?? TARJETA_LABORATORIO;
  const numeros = new Map<string, NumeroSimulado>();
  const catalogos = new Map<string, Map<string, { nombre: string; precioCentavos: number }>>();
  const ventanas = new Map<string, Ventanas>();
  const servicioMes = new Map<string, number>();
  const clientes = new Map<string, ClienteSimulado>();
  const precios = new Map<string, RecibidoPorCliente['precio']>();
  const clics = new Map<string, { adId: string; campanaId: string; waId: string }>();
  const campanas = new Map<string, Campana>();
  const capi = { aceptados: [] as Array<EventoCapi & { datasetId: string }>, rechazados: [] as Array<{ evento: unknown; error: string }>, duplicados: 0 };
  const qrs = new Map<string, { code: string; prefilled_message: string; deep_link_url: string; qr_image_url: string; phoneNumberId: string }>();
  const cola: Array<{ cuerpo: string; intentos: number }> = [];
  const medios = new Map<string, { bytes: Uint8Array; mime: string; sha256: string; phoneNumberId: string }>();
  const registro: Array<{ instante: number; tipo: string; detalle: string }> = [];
  let secuencia = 0;
  let entregas = 0;

  const wamid = () => `wamid.SIM${(++secuencia).toString().padStart(8, '0')}${randomBytes(4).toString('hex')}`;
  const seg = () => String(Math.floor(reloj() / 1000));

  function emite(wabaId: string, campo: string, valor: Record<string, unknown>) {
    const cuerpo = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: wabaId, changes: [{ value: { messaging_product: 'whatsapp', ...valor }, field: campo }] }] });
    cola.push({ cuerpo, intentos: 0 });
    if (o.duplicaSi?.(++entregas)) cola.push({ cuerpo, intentos: 0 });
  }
  const metadata = (n: NumeroSimulado) => ({ display_phone_number: n.telefonoVisible, phone_number_id: n.phoneNumberId });

  /** El lado del cliente final: mensaje entrante (lo usa `cliente.ts`). */
  function entrante(n: NumeroSimulado, waId: string, nombre: string, mensaje: Record<string, unknown>) {
    const id = wamid();
    const llave = `${n.phoneNumberId}|${normalizaWaId(waId)}`;
    ventanas.set(llave, registraEntrante(ventanas.get(llave) ?? {}, reloj(), !!(mensaje.referral as Record<string, unknown> | undefined)?.ctwa_clid || (mensaje.referral as Record<string, unknown> | undefined)?.source_type === 'ad'));
    emite(n.wabaId, 'messages', { metadata: metadata(n), contacts: [{ profile: { name: nombre }, wa_id: waId }], messages: [{ from: waId, id, timestamp: seg(), ...mensaje }] });
    registro.push({ instante: reloj(), tipo: 'webhook', detalle: `${waId} → ${n.phoneNumberId}: ${String(mensaje.type)}` });
    return id;
  }

  function estados(n: NumeroSimulado, id: string, para: string, precio: NonNullable<RecibidoPorCliente['precio']>) {
    const pricing = { billable: precio.billable, pricing_model: 'PMP', type: precio.tipo, category: precio.categoria };
    for (const status of ['sent', 'delivered', 'read']) {
      emite(n.wabaId, 'messages', { metadata: metadata(n), statuses: [{ id, status, timestamp: seg(), recipient_id: para, pricing }] });
    }
  }

  const error = (codigo: number, mensaje: string): RespuestaEnvio => { registro.push({ instante: reloj(), tipo: 'rechazo', detalle: `${codigo} ${mensaje}` }); return { ok: false, codigo, error: mensaje }; };

  const graph: ClienteGraph = {
    async enviaMensaje(phoneNumberId, cuerpo) {
      const n = numeros.get(phoneNumberId);
      if (!n) return error(100, '(#100) phone_number_id desconocido');
      // SUPUESTO: el código exacto con el número desconectado de coexistencia no está en la documentación consultada.
      if (!n.conectado) return error(131000, 'el número fue desconectado de la plataforma');
      const p = desdeCuerpoGraph(cuerpo);
      if (!p.ok) return error(100, p.error);
      const fallas = validaMensaje(p.mensaje);
      if (fallas.length) return error(100, `(#100) ${fallas.join('; ')}`);
      const m = p.mensaje;
      const catalogo = catalogos.get(n.catalogoId);
      if ((m.tipo === 'producto' || m.tipo === 'carrusel' || m.tipo === 'productos')) {
        if (m.catalogo !== n.catalogoId) return error(131009, '(#131009) catalog_id no conectado al número');
        const idsProd = m.tipo === 'producto' ? [m.retailerId] : m.tipo === 'carrusel' ? m.retailerIds : m.secciones.flatMap((s) => s.retailerIds);
        const falta = idsProd.find((r) => !catalogo?.has(r));
        if (falta) return error(131009, `(#131009) producto ${falta} no está en el catálogo`);
      }
      if (m.tipo === 'flow' && !Object.values(n.flows).some((f) => f.id === m.flowId)) return error(131009, '(#131009) flow_id no publicado para este número');
      if (m.tipo === 'plantilla') {
        const def = n.plantillas[m.nombre];
        if (!def) return error(132001, '(#132001) la plantilla no existe');
        const falla = typeof def === 'string' ? null : fallaDePlantilla(def, m);
        if (falla) return error(falla.codigo, falla.mensaje);
      }
      const para = normalizaWaId(p.para);
      const llave = `${n.phoneNumberId}|${para}`;
      const defPlantilla = m.tipo === 'plantilla' ? n.plantillas[m.nombre]! : undefined;
      const categoria = defPlantilla ? categoriaDe(defPlantilla) : 'service';
      const mes = `${n.phoneNumberId}|${mesDeFacturacion(reloj(), tarjeta)}`;
      const d = decidePrecio({ categoria, ventanas: ventanas.get(llave) ?? {}, ahora: reloj(), pais: paisDeWaId(para), servicioEnElMes: servicioMes.get(mes) ?? 0, tarjeta });
      if (!d.permitido) return error(d.errorMeta?.codigo ?? 131047, d.errorMeta?.titulo ?? 'fuera de ventana');
      if (d.usaCupo) servicioMes.set(mes, (servicioMes.get(mes) ?? 0) + 1);
      ventanas.set(llave, registraSaliente(ventanas.get(llave) ?? {}, reloj()));
      const id = wamid();
      const precio = { billable: d.billable, tipo: d.tipo, categoria: d.categoria, costoMicros: d.costoMicros };
      precios.set(id, precio);
      if (o.sinWhatsApp?.(para)) {
        emite(n.wabaId, 'messages', { metadata: metadata(n), statuses: [{ id, status: 'failed', timestamp: seg(), recipient_id: para, errors: [{ code: 131026, title: 'Message undeliverable' }] }] });
        registro.push({ instante: reloj(), tipo: 'graph', detalle: `${n.phoneNumberId} → ${para}: ${m.tipo} (sin WhatsApp: 131026 por webhook)` });
        return { ok: true, wamid: id };
      }
      const plantilla = m.tipo === 'plantilla' && defPlantilla && typeof defPlantilla !== 'string' && defPlantilla.cuerpo ? renderizaPlantilla(defPlantilla, m.parametros, (m.botones ?? []).map((b) => b.payload)) : undefined;
      clientes.get(llave)?.recibe({ wamid: id, instante: reloj(), mensaje: m, resumen: plantilla ? `${plantilla.texto}${plantilla.botones.length ? ` [${plantilla.botones.map((b) => b.texto).join(' | ')}]` : ''}` : resumeMensaje(m), precio, ...(plantilla ? { plantilla } : {}) });
      estados(n, id, para, precio);
      registro.push({ instante: reloj(), tipo: 'graph', detalle: `${n.phoneNumberId} → ${para}: ${m.tipo}` });
      return { ok: true, wamid: id };
    },
    async descargaMedio(phoneNumberId, mediaId): Promise<RespuestaMedio> {
      const md = medios.get(mediaId);
      if (!md || md.phoneNumberId !== phoneNumberId) return { ok: false, codigo: 100, error: '(#100) el medio no existe o no es de este número' };
      registro.push({ instante: reloj(), tipo: 'medio', detalle: `${phoneNumberId}: ${mediaId}` });
      return { ok: true, bytes: md.bytes, mime: md.mime, sha256: md.sha256 };
    },
    async marcaLeido(phoneNumberId, wamid) { registro.push({ instante: reloj(), tipo: 'leido', detalle: `${phoneNumberId}: ${wamid}` }); return numeros.has(phoneNumberId); },
    async creaQr(phoneNumberId, mensajePrellenado, formato): Promise<RespuestaQr> {
      const n = numeros.get(phoneNumberId);
      if (!n) return { ok: false, error: '(#100) phone_number_id desconocido' };
      if ([...mensajePrellenado].length > 140) return { ok: false, error: '(#100) prefilled_message excede 140 caracteres' };
      if ([...qrs.values()].filter((q) => q.phoneNumberId === phoneNumberId).length >= 2000) return { ok: false, error: '(#100) límite de 2,000 QR por número' };
      const code = randomBytes(6).toString('hex').toUpperCase();
      const q = { code, prefilled_message: mensajePrellenado, deep_link_url: `https://wa.me/message/${code}`, qr_image_url: `https://scontent.simulado.test/qr/${code}.${formato.toLowerCase()}`, phoneNumberId };
      qrs.set(code, q);
      return { ok: true, codigo: code, ligaCorta: q.deep_link_url, urlImagen: q.qr_image_url, mensaje: mensajePrellenado };
    },
    async enviaEventos(datasetId, eventos): Promise<RespuestaCapi> {
      const n = [...numeros.values()].find((x) => x.datasetId === datasetId);
      if (!n) return { ok: false, codigo: 100, error: 'dataset desconocido' };
      for (const ev of eventos) {
        const mal = validaEventoCapi(ev, n.wabaId, reloj(), clics);
        if (mal) { capi.rechazados.push({ evento: ev, error: mal }); return { ok: false, codigo: 100, error: mal }; }
      }
      for (const ev of eventos) {
        if (capi.aceptados.some((a) => a.event_id === ev.event_id && a.event_name === ev.event_name)) { capi.duplicados++; continue; }
        capi.aceptados.push({ ...ev, datasetId });
      }
      return { ok: true, recibidos: eventos.length, traza: `A${randomBytes(8).toString('hex')}` };
    },
  };

  return {
    graph,
    capi,
    registro,
    tarjeta,
    registraNumero(n: Omit<NumeroSimulado, 'conectado' | 'flows'> & { flows?: Record<string, Record<string, unknown>> }) {
      const flows: NumeroSimulado['flows'] = {};
      for (const [tipo, definicion] of Object.entries(n.flows ?? {})) {
        if (typeof definicion.version !== 'string' || !Array.isArray(definicion.screens)) throw new Error(`Flow ${tipo} inválido: falta version o screens`);
        flows[tipo] = { id: `flow_${tipo}_${n.phoneNumberId}`, definicion };
      }
      numeros.set(n.phoneNumberId, { ...n, flows, conectado: true });
      return Object.fromEntries(Object.entries(flows).map(([k, v]) => [k, v.id]));
    },
    cargaCatalogo(catalogoId: string, productos: Array<{ retailerId: string; nombre: string; precioCentavos: number }>) {
      catalogos.set(catalogoId, new Map(productos.map((p) => [p.retailerId, { nombre: p.nombre, precioCentavos: p.precioCentavos }])));
    },
    cliente(phoneNumberId: string, waId: string, nombre: string): ClienteSimulado {
      const n = numeros.get(phoneNumberId);
      if (!n) throw new Error('número no registrado');
      const llave = `${phoneNumberId}|${normalizaWaId(waId)}`;
      const previo = clientes.get(llave);
      if (previo) return previo;
      const c = creaCliente({
        numero: n, waId, nombre, reloj, secretoApp: o.secretoApp,
        entrante: (m) => entrante(n, waId, nombre, m),
        subeMedio: (bytes, mime) => {
          const id = `${randomBytes(8).toString('hex')}${(++secuencia).toString().padStart(6, '0')}`;
          medios.set(id, { bytes, mime, sha256: createHash('sha256').update(bytes).digest('hex'), phoneNumberId: n.phoneNumberId });
          return { id, sha256: medios.get(id)!.sha256 };
        },
        catalogo: () => catalogos.get(n.catalogoId),
        clic: (adId, conClid) => {
          const campana = [...campanas.values()].find((x) => x.anuncios.includes(adId));
          const clid = conClid ? `ARclid${randomBytes(12).toString('base64url')}` : undefined;
          if (clid && campana) clics.set(clid, { adId, campanaId: campana.id, waId });
          return clid;
        },
        ...(o.endpointFlows ? { endpointFlows: o.endpointFlows } : {}),
      });
      clientes.set(llave, c);
      return c;
    },
    /** El dueño contesta desde la app de WhatsApp Business (coexistencia): llega un eco. */
    duenoContesta(phoneNumberId: string, waId: string, texto: string) {
      const n = numeros.get(phoneNumberId)!;
      const id = wamid();
      emite(n.wabaId, 'smb_message_echoes', { metadata: metadata(n), message_echoes: [{ from: n.telefonoVisible, to: waId, id, timestamp: seg(), type: 'text', text: { body: texto } }] });
      clientes.get(`${phoneNumberId}|${normalizaWaId(waId)}`)?.recibe({ wamid: id, instante: reloj(), mensaje: { tipo: 'texto', texto }, resumen: `(dueño desde la app) ${texto}` });
      return id;
    },
    /** Historial de coexistencia en fases y fragmentos (0–1 día, 1–90, 90–180). */
    enviaHistorial(phoneNumberId: string, hilos: Array<{ waId: string; mensajes: Array<{ de: string; texto: string; hace: number }> }>, comparte = true) {
      const n = numeros.get(phoneNumberId)!;
      if (!comparte) { emite(n.wabaId, 'history', { metadata: metadata(n), errors: [{ code: 2593109, title: 'History sync is turned off by the business from the WhatsApp Business App' }] }); return; }
      const fases = [[0, 1], [1, 90], [90, 180]] as const;
      fases.forEach(([desde, hasta], fase) => {
        const enFase = hilos.map((h) => ({ id: h.waId, messages: h.mensajes.filter((m) => m.hace / 86_400_000 >= desde && m.hace / 86_400_000 < hasta).map((m) => ({ from: m.de, to: m.de === h.waId ? n.telefonoVisible : h.waId, id: wamid(), timestamp: String(Math.floor((reloj() - m.hace) / 1000)), type: 'text', text: { body: m.texto }, history_context: { status: 'READ' } })) })).filter((h) => h.messages.length);
        emite(n.wabaId, 'history', { metadata: metadata(n), history: [{ metadata: { phase: fase, chunk_order: 1, progress: Math.round(((fase + 1) / 3) * 100) }, threads: enFase }] });
      });
    },
    /** Meta cambia el estado de una plantilla (la pausa por calidad, la desactiva o la reactiva). */
    cambiaPlantilla(phoneNumberId: string, nombre: string, estado: EstadoPlantilla) {
      const n = numeros.get(phoneNumberId)!;
      const def = n.plantillas[nombre];
      if (!def) throw new Error(`la plantilla ${nombre} no está registrada`);
      n.plantillas[nombre] = typeof def === 'string' ? { categoria: def, estado } : { ...def, estado };
      emite(n.wabaId, 'message_template_status_update', { event: estado, message_template_name: nombre });
    },
    /** Meta recategoriza una plantilla (p. ej. una «utility» con tono promocional pasa a marketing). */
    recategoriza(phoneNumberId: string, nombre: string, categoria: CategoriaPlantilla) {
      const n = numeros.get(phoneNumberId)!;
      const def = n.plantillas[nombre];
      if (!def) throw new Error(`la plantilla ${nombre} no está registrada`);
      n.plantillas[nombre] = typeof def === 'string' ? categoria : { ...def, categoria };
      emite(n.wabaId, 'template_category_update', { message_template_name: nombre, new_category: categoria.toUpperCase() });
    },
    plantillasDe: (phoneNumberId: string) => ({ ...(numeros.get(phoneNumberId)?.plantillas ?? {}) }),
    desconecta(phoneNumberId: string) {
      const n = numeros.get(phoneNumberId)!;
      n.conectado = false;
      emite(n.wabaId, 'account_update', { phone_number: n.telefonoVisible, event: 'PARTNER_REMOVED', disconnection_info: { reason: 'Business app user removed the partner', initiated_by: 'USER' } });
    },
    reconecta(phoneNumberId: string) {
      const n = numeros.get(phoneNumberId)!;
      n.conectado = true;
      emite(n.wabaId, 'account_update', { event: 'ACCOUNT_RECONNECTED' });
    },
    /** Meta detectó una compra en un chat de anuncio (`automatic_events`, valor en milésimas). */
    eventoAutomatico(phoneNumberId: string, nombre: 'Purchase' | 'LeadSubmitted', ctwaClid: string, valorCentavos?: number) {
      const n = numeros.get(phoneNumberId)!;
      emite(n.wabaId, 'automatic_events', { metadata: metadata(n), automatic_events: [{ id: wamid(), event_name: nombre, timestamp: Math.floor(reloj() / 1000), ctwa_clid: ctwaClid, ...(valorCentavos !== undefined ? { custom_data: { currency: 'MXN', value: valorCentavos * 10 } } : {}) }] });
    },
    anuncios: {
      creaCampana(nombre: string, gastoCentavos: number, nAnuncios = 1): Campana {
        const id = `camp_${campanas.size + 1}`;
        const c = { id, nombre, gastoCentavos, anuncios: Array.from({ length: nAnuncios }, (_, i) => `${id}_ad${i + 1}`) };
        campanas.set(id, c);
        return c;
      },
      /** El Administrador de anuncios: compras y valor que Meta atribuye a cada campaña (por CAPI). */
      reporte() {
        return [...campanas.values()].map((c) => {
          const compras = capi.aceptados.filter((e) => e.event_name === 'Purchase' && e.user_data.ctwa_clid && clics.get(e.user_data.ctwa_clid)?.campanaId === c.id);
          const valorCentavos = Math.round(compras.reduce((a, e) => a + (e.custom_data?.value ?? 0) * 100, 0));
          return { campanaId: c.id, nombre: c.nombre, gastoCentavos: c.gastoCentavos, anuncios: c.anuncios, compras: compras.length, valorCentavos, roas: c.gastoCentavos ? Math.round((valorCentavos / c.gastoCentavos) * 100) / 100 : null };
        });
      },
    },
    /** Entrega los webhooks en cola. Un no-200 se reintenta (Meta reintenta hasta 7 días). */
    async drena(maxRondas = 50) {
      for (let ronda = 0; ronda < maxRondas && cola.length; ronda++) {
        const lote = cola.splice(0, cola.length);
        if (o.desordena) lote.reverse();
        for (const w of lote) {
          const status = await o.entrega(w.cuerpo, { 'content-type': 'application/json', [CABECERA_FIRMA]: firmaMeta(o.secretoApp, w.cuerpo) });
          if (status !== 200 && w.intentos < 5) cola.push({ cuerpo: w.cuerpo, intentos: w.intentos + 1 });
        }
      }
    },
    pendientes: () => cola.length,
    precioDe: (id: string) => precios.get(id),
  };
}

/**
 * Por qué Meta rechazaría mandar ESTA plantilla (o `null`). Códigos de la tabla de errores de la Cloud API:
 * 132015 pausada, 132016 desactivada, 132000 parámetros que no cuadran con el cuerpo, 132001 sin el idioma.
 */
function fallaDePlantilla(def: DefinicionPlantilla, m: Extract<MensajeSaliente, { tipo: 'plantilla' }>): { codigo: number; mensaje: string } | null {
  const estado = def.estado ?? 'APPROVED';
  if (estado === 'PAUSED') return { codigo: 132015, mensaje: '(#132015) la plantilla está pausada por su calidad' };
  if (estado === 'DISABLED') return { codigo: 132016, mensaje: '(#132016) la plantilla está desactivada' };
  if (estado !== 'APPROVED') return { codigo: 132001, mensaje: '(#132001) la plantilla no está aprobada' };
  if (def.idioma && def.idioma !== m.idioma) return { codigo: 132001, mensaje: `(#132001) la plantilla no existe en ${m.idioma}` };
  if (def.cuerpo !== undefined && marcadores(def.cuerpo) !== m.parametros.length) return { codigo: 132000, mensaje: `(#132000) el cuerpo pide ${marcadores(def.cuerpo)} parámetros y llegaron ${m.parametros.length}` };
  if ((m.botones?.length ?? 0) > (def.botones?.length ?? 0)) return { codigo: 132000, mensaje: '(#132000) más payloads que botones en la plantilla' };
  return null;
}

/** Lo que Meta rechazaría de un evento de Conversions API for Business Messaging. */
export function validaEventoCapi(ev: EventoCapi, wabaId: string, ahora: number, clics: Map<string, unknown>): string | null {
  if (ev.action_source !== 'business_messaging') return 'action_source debe ser business_messaging';
  if (ev.messaging_channel !== 'whatsapp') return 'messaging_channel debe ser whatsapp';
  if (!EVENTOS_CAPI.has(ev.event_name)) return `event_name no soportado: ${ev.event_name}`;
  if (ev.user_data.whatsapp_business_account_id !== wabaId) return 'la WABA no corresponde al dataset';
  if (!ev.user_data.ctwa_clid || !clics.has(ev.user_data.ctwa_clid)) return 'ctwa_clid inválido o de otro anuncio';
  // SUPUESTO: la página de Business Messaging no fija ventana; se toma la de 7 días de la CAPI general.
  if (ev.event_time * 1000 > ahora + 60_000 || ev.event_time * 1000 < ahora - DIAS_CAPI_MAXIMO) return 'event_time fuera de la ventana de 7 días';
  if (ev.event_name === 'Purchase' && (!ev.custom_data?.currency || typeof ev.custom_data.value !== 'number')) return 'Purchase sin currency o value';
  if (!ev.event_id) return 'sin event_id';
  return null;
}

export type MetaSimulada = ReturnType<typeof creaMetaSimulada>;
