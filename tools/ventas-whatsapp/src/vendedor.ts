/**
 * El vendedor completo, armado: canal (webhook con firma, cola, idempotencia, ventanas, costeo,
 * coexistencia), orquestador, dominios por A2A, pagos, endpoint de Flows y el panel del dueño.
 * Todo lo de fuera se INYECTA: almacén, transporte a Meta, procesador de pagos, modelo, reloj.
 *
 * Fase 0 (fuente §Fases): «respuesta 200 inmediata y procesamiento en cola», idempotencia por
 * `message.id`, estados y `pricing` guardados.
 */
import type { KeyLike } from 'node:crypto';
import { idsAleatorios, paisDeWaId, relojDelSistema, type GeneradorIds, type Reloj } from './comun/base.js';
import { colaEnMemoria, type Almacen, type AlmacenInquilino, type ColaDurable } from './almacen/almacen.js';
import { respondeVerificacion, verificaFirmaMeta, type RespuestaHttp } from './meta/firma.js';
import { leeWebhook, type EcoDelDueno, type EstadoEntrante, type EventoCanal, type MensajeEntrante } from './meta/webhook.js';
import { aCuerpoGraph, resumeMensaje, validaMensaje, type CategoriaPlantilla, type MensajeSaliente } from './meta/mensajes.js';
import { decidePrecio, mesDeFacturacion, registraEntrante, registraSaliente, TARJETA_LABORATORIO, type CategoriaPrecio, type TarjetaDeTarifas } from './meta/tarifas.js';
import type { ClienteGraph } from './meta/graph.js';
import type { Contacto, Conversacion, Inquilino, Origen } from './modelo.js';
import { creaBus, artefacto, type BusA2A, type Destino, type TrazaA2A } from './agente/a2a-modelo.js';
import { creaOrquestador, type Optimizacion } from './agente/orquestador.js';
import { minimiza } from './agente/barreras.js';
import { formatoPrecio, type ModeloLenguaje } from './agente/modelos.js';
import { agenteCatalogo } from './dominios/catalogo.js';
import { agentePedidos } from './dominios/pedidos.js';
import { agenteCitas } from './dominios/citas.js';
import { agenteSoporte } from './dominios/soporte.js';
import { agenteVentas } from './dominios/ventas.js';
import { agenteAtribucion } from './atribucion/dominio.js';
import { tableroDelDueno } from './atribucion/tablero.js';
import { cronometro } from './meta/cronometro.js';
import { creaTrazabilidad, verificaAnclas, type AlmacenAnclas, type Ancla, type Eslabon, type Trazabilidad } from './trazabilidad/cadena.js';
import { partesDeReferencia, type ConectorPagos } from './dominios/pagos.js';
import { atiendeEndpointFlows } from './flows/endpoint.js';
import { aplicaFrontera, bloqueaContacto, evaluaFrontera } from './agente/frontera.js';
import { idConversacionDe, nuevaConversacion } from './agente/conversacion.js';

/** Plantillas aprobadas (en el laboratorio, las que el simulador tiene registradas con su categoría). */
export const PLANTILLAS: Record<string, CategoriaPlantilla> = { estado_pedido: 'utility', recordatorio_reserva: 'utility' };

const ETIQUETA = /\[([A-Z0-9-]{2,20})\]/;

export interface OpcionesVendedor {
  almacen: Almacen;
  graph: ClienteGraph;
  pagos: ConectorPagos;
  modelo: ModeloLenguaje;
  secretos: { app: string; verifyToken: string; tokensFlow: string };
  llavePrivadaFlows: KeyLike;
  dominiosLiga: string[];
  reloj?: Reloj;
  ids?: GeneradorIds;
  tarjeta?: TarjetaDeTarifas;
  /** Fase 3: `pedidos` y `atribucion` como agentes A2A reales. Sin esto, todo en proceso. */
  remotos?: Partial<Record<'pedidos' | 'atribucion', Destino>>;
  alTrazar?: (t: TrazaA2A) => void;
  /** La cola durable del webhook (en la app, un archivo por lote). Sin ella, en memoria. */
  colaDurable?: ColaDurable;
  /** Palancas de costo del orquestador (todas encendidas por omisión). */
  optimizacion?: Partial<Optimizacion>;
  /** Cadena de hashes por inquilino. Sin llave, no hay cadena (y el panel lo dice). */
  trazabilidad?: { llaveHuella: string };
}

/** Las tareas que cambian algo (las de solo lectura no se encadenan: la cadena no es un log de consultas). */
const TAREAS_TRAZADAS = new Set(['crear_pedido', 'agregar_entrega', 'liga_pago', 'confirmar_pago', 'conciliar', 'reportar_conversion', 'registrar_origen', 'registrar_automatico', 'abrir_caso', 'tomar_caso', 'liberar_caso', 'reservar', 'reprogramar', 'calificar_lead', 'sincronizar_csv', 'registrar_gasto', 'crear_qr', 'descontar']);
/** Campos de los artefactos que entran a la cadena como datos (ninguno es personal). */
const CAMPOS_TRAZADOS = ['id', 'estado', 'totalCentavos', 'eventId', 'nombre', 'motivo', 'servicioId', 'calificado', 'duplicado'];

/** Más allá de esto, un remitente no gasta modelo: denial-of-wallet (C3). */
/** Un origen (anuncio o etiqueta) atribuye durante 7 días; después, lo nuevo cuenta como directo. */
export const VENTANA_ATRIBUCION = 7 * 24 * 3_600_000;

export interface Metricas {
  webhooksRecibidos: number;
  firmasRechazadas: number;
  duplicadosIgnorados: number;
  eventosProcesados: number;
  /** Milisegundos entre recibir el POST y devolver el 200 (medido con `performance.now()`). */
  acusesMs: number[];
  mensajesInvalidosNoEnviados: number;
  rechazadosPorVentana: number;
  /** Milisegundos de procesamiento propio por mensaje entrante (sin red ni modelo real). */
  procesamientoMs: number[];
}

export function creaVendedor(o: OpcionesVendedor) {
  const reloj = o.reloj ?? relojDelSistema;
  const ids = o.ids ?? idsAleatorios();
  const tarjeta = o.tarjeta ?? TARJETA_LABORATORIO;
  const cola: Array<{ evento: EventoCanal; lote: string }> = [];
  const durable = o.colaDurable ?? colaEnMemoria();
  const faltanDelLote = new Map<string, number>();
  const metricas: Metricas = { webhooksRecibidos: 0, firmasRechazadas: 0, duplicadosIgnorados: 0, eventosProcesados: 0, acusesMs: [], mensajesInvalidosNoEnviados: 0, rechazadosPorVentana: 0, procesamientoMs: [] };
  let trabajando: Promise<void> | null = null;
  /** Estados que llegaron antes que su mensaje (Meta no garantiza orden): se aplican al guardarlo. */
  const huerfanos = new Map<string, EstadoEntrante[]>();

  const traza: Trazabilidad | null = o.trazabilidad ? creaTrazabilidad({
    llaveHuella: o.trazabilidad.llaveHuella, reloj,
    eslabones: (i) => o.almacen.de(i).lista('cadena'),
    guarda: (e: Eslabon) => o.almacen.de(e.inquilino).guarda('cadena', String(e.seq).padStart(10, '0'), e),
  }) : null;
  const trazaTarea = (t: TrazaA2A) => {
    o.alTrazar?.(t);
    if (!traza || !TAREAS_TRAZADAS.has(t.skill)) return;
    const datos: Eslabon['datos'] = { dominio: t.dominio, skill: t.skill, estado: t.estado, contextId: t.contextId };
    for (const a of t.tarea?.artefactos ?? []) for (const k of CAMPOS_TRAZADOS) {
      const v = a.datos[k];
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') datos[`${a.nombre}.${k}`] = v;
    }
    void traza.registra(t.tenant, 'TAREA_A2A', t.taskId, t.tarea?.artefactos ?? [], datos, `dominio:${t.dominio}`);
  };
  const contexto = async (tenant: string) => {
    const inquilino = await o.almacen.inquilino(tenant);
    if (!inquilino) throw new Error('inquilino desconocido');
    return { inquilino, datos: o.almacen.de(tenant), reloj, ids, servicios: { graph: o.graph, pagos: o.pagos } };
  };
  const bus: BusA2A = creaBus({
    destinos: {
      catalogo: { tipo: 'local', agente: agenteCatalogo }, ventas: { tipo: 'local', agente: agenteVentas },
      citas: { tipo: 'local', agente: agenteCitas }, soporte: { tipo: 'local', agente: agenteSoporte },
      pedidos: o.remotos?.pedidos ?? { tipo: 'local', agente: agentePedidos },
      atribucion: o.remotos?.atribucion ?? { tipo: 'local', agente: agenteAtribucion },
    },
    contexto, alTrazar: trazaTarea,
  });
  const orquestador = creaOrquestador({ modelo: o.modelo, bus, reloj, ids, secretoTokens: o.secretos.tokensFlow, tarjeta, dominiosLiga: o.dominiosLiga, ...(o.optimizacion ? { optimizacion: o.optimizacion } : {}) });

  const bitacora = async (datos: AlmacenInquilino, conversacionId: string, tipo: string, detalle: string) => {
    const id = ids('bit'); await datos.guarda('bitacora', id, { id, instante: reloj(), conversacionId, tipo, detalle });
  };
  const alerta = async (datos: AlmacenInquilino, nivel: 'info' | 'aviso' | 'grave', texto: string) => {
    const id = ids('alerta'); await datos.guarda('alertas', id, { id, instante: reloj(), nivel, texto });
  };
  const servicioEnElMes = async (datos: AlmacenInquilino, ahora: number) => {
    const mes = mesDeFacturacion(ahora, tarjeta);
    return (await datos.lista('mensajes')).filter((m) => m.direccion === 'saliente' && m.categoria === 'service' && mesDeFacturacion(m.instante, tarjeta) === mes).length;
  };

  /** Envía UN mensaje: valida límites, decide precio y ventana como Meta, y lo registra. */
  async function enviaSaliente(i: Inquilino, datos: AlmacenInquilino, conv: Conversacion, m: MensajeSaliente, autor: 'agente' | 'dueno' | 'sistema'): Promise<Conversacion> {
    const fallas = validaMensaje(m);
    if (fallas.length) { metricas.mensajesInvalidosNoEnviados++; await bitacora(datos, conv.id, 'mensaje_invalido', fallas.join('; ')); return conv; }
    const ahora = reloj();
    const categoria: CategoriaPrecio = m.tipo === 'plantilla' ? PLANTILLAS[m.nombre] ?? 'utility' : 'service';
    const d = decidePrecio({ categoria, ventanas: conv.ventanas, ahora, pais: paisDeWaId(conv.waId), servicioEnElMes: await servicioEnElMes(datos, ahora), tarjeta });
    if (!d.permitido) { metricas.rechazadosPorVentana++; await bitacora(datos, conv.id, 'fuera_de_ventana', d.errorMeta?.titulo ?? ''); return conv; }
    const r = await o.graph.enviaMensaje(i.canal.phoneNumberId, aCuerpoGraph(conv.waId, m));
    if (!r.ok) { await bitacora(datos, conv.id, 'envio_fallido', `${r.codigo}: ${r.error}`); return conv; }
    await datos.guarda('mensajes', r.wamid, {
      wamid: r.wamid, conversacionId: conv.id, waId: conv.waId, direccion: 'saliente', autor, tipo: m.tipo, resumen: resumeMensaje(m),
      instante: ahora, costoEstimadoMicros: d.costoMicros, categoria,
    });
    if (traza) void traza.registra(i.id, 'MENSAJE_SALIENTE', r.wamid, resumeMensaje(m), { tipo: m.tipo, categoria, costoEstimadoMicros: d.costoMicros, conversacion: conv.id }, autor);
    for (const e of huerfanos.get(r.wamid) ?? []) await aplicaEstado(datos, e);
    huerfanos.delete(r.wamid);
    return { ...conv, ventanas: registraSaliente(conv.ventanas, ahora) };
  }

  const idConversacion = (waId: string) => idConversacionDe(o.secretos.app, waId);

  async function procesaMensaje(e: MensajeEntrante) {
    const tenant = await o.almacen.inquilinoPorTelefono(e.phoneNumberId);
    if (!tenant) return;
    if (!await o.almacen.primeraVez(`${tenant}:in:${e.wamid}`)) { metricas.duplicadosIgnorados++; return; }
    const inquilino = (await o.almacen.inquilino(tenant))!;
    const datos = o.almacen.de(tenant);
    let contacto: Contacto = (await datos.lee('contactos', e.waId)) ?? { waId: e.waId, creadoEn: e.instante };
    if (e.nombre) contacto.nombre = e.nombre;
    let conv = (await datos.lee('conversaciones', idConversacion(e.waId))) ?? nuevaConversacion(idConversacion(e.waId), e.waId, e.instante);
    const etiqueta = e.texto?.match(ETIQUETA)?.[1];
    const textoLimpio = (e.texto ?? '').replace(ETIQUETA, '').replace(/\s+/g, ' ').trim();
    const deAnuncio = !!e.referencia && (e.referencia.sourceType === 'ad' || !!e.referencia.ctwaClid);
    let origen: Origen | null = null;
    const vencido = conv.origen.tipo !== 'directo' && e.instante - conv.origen.registradoEn > VENTANA_ATRIBUCION;
    if (deAnuncio) origen = { tipo: 'anuncio', ...(e.referencia?.ctwaClid ? { ctwaClid: e.referencia.ctwaClid } : {}), ...(e.referencia?.sourceId ? { anuncioId: e.referencia.sourceId } : {}), registradoEn: e.instante };
    else if (etiqueta && (conv.origen.tipo === 'directo' || vencido)) origen = { tipo: 'organico', etiqueta, registradoEn: e.instante };
    else if (vencido) origen = { tipo: 'directo', registradoEn: e.instante };
    if (origen) {
      conv = { ...conv, origen, historialOrigenes: [...conv.historialOrigenes, origen] };
      await bus.envia('atribucion', { tenant, contextId: conv.contextId, skill: 'registrar_origen', datos: { conversacionId: conv.id, waId: e.waId, origen }, messageId: `${e.wamid}:origen` });
    }
    conv = { ...conv, ventanas: registraEntrante(conv.ventanas, e.instante, deAnuncio), ultimoMensajeEn: e.instante, primerEntranteEn: conv.primerEntranteEn ?? e.instante };
    const { texto: seguro, ocultado } = minimiza(textoLimpio);
    const resumen = e.pedido ? `[pedido: ${e.pedido.items.map((x) => `${x.cantidad}×${x.retailerId}`).join(', ')}]`
      : e.interactivo ? (e.interactivo.tipo === 'flow' ? '[formulario enviado]' : `[${e.interactivo.titulo}]`) : seguro;
    await datos.guarda('mensajes', e.wamid, { wamid: e.wamid, conversacionId: conv.id, waId: e.waId, direccion: 'entrante', autor: 'cliente', tipo: e.tipo, resumen, instante: e.instante });
    if (traza) void traza.registra(tenant, 'MENSAJE_ENTRANTE', e.wamid, resumen, { tipo: e.tipo, conversacion: conv.id, origen: conv.origen.tipo }, traza.seudonimo(e.waId));
    if (ocultado) await bitacora(datos, conv.id, 'dato_oculto', 'el cliente mandó un dato de tarjeta o clave: no se guardó');
    if (inquilino.estado === 'pausado') {
      await datos.guarda('conversaciones', conv.id, conv); await datos.guarda('contactos', e.waId, contacto);
      await alerta(datos, 'aviso', `Mensaje de ${e.waId} sin responder: el canal está desconectado (${inquilino.motivoPausa ?? ''})`);
      return;
    }
    const limites = inquilino.politicas.frontera;
    const f = await evaluaFrontera(datos, { conversacionId: conv.id, contacto, instante: e.instante, limites });
    const fr = await aplicaFrontera(f, { datos, negocio: inquilino.nombre, conv, contacto, waId: e.waId, instante: e.instante, limites }, {
      bitacora: (tipo, detalle) => bitacora(datos, conv.id, tipo, detalle), alerta: (nivel, texto) => alerta(datos, nivel, texto),
      envia: (texto) => enviaSaliente(inquilino, datos, conv, { tipo: 'texto', texto }, 'agente'),
    });
    conv = fr.conv; contacto = fr.contacto;
    if (fr.detener) { await datos.guarda('conversaciones', conv.id, conv); await datos.guarda('contactos', e.waId, contacto); return; }
    // Leído + «escribiendo…» solo si el agente va a contestar (no si lo lleva el dueño).
    if (conv.estado === 'agente' || (conv.estado === 'pausada_eco' && e.instante >= (conv.pausadaHasta ?? 0))) await o.graph.marcaLeido(e.phoneNumberId, e.wamid);
    const r = await orquestador.atiende({ inquilino, datos, conversacion: conv, contacto, mensaje: e, texto: seguro, protegido: fr.protegido });
    conv = r.conversacion; contacto = r.contacto;
    for (const b of r.bitacora) await bitacora(datos, conv.id, b.tipo, b.detalle);
    for (const s of r.salientes) conv = await enviaSaliente(inquilino, datos, conv, s, 'agente');
    await datos.guarda('conversaciones', conv.id, conv);
    await datos.guarda('contactos', e.waId, contacto);
  }

  async function procesaEstado(e: EstadoEntrante) {
    const tenant = await o.almacen.inquilinoPorTelefono(e.phoneNumberId);
    if (!tenant) return;
    if (!await o.almacen.primeraVez(`${tenant}:st:${e.wamid}:${e.estado}`)) { metricas.duplicadosIgnorados++; return; }
    await aplicaEstado(o.almacen.de(tenant), e);
  }

  /** El estado solo AVANZA (sent < delivered < read < played; failed es terminal): uno tardío no lo regresa. */
  async function aplicaEstado(datos: AlmacenInquilino, e: EstadoEntrante) {
    const m = await datos.lee('mensajes', e.wamid);
    if (!m) { huerfanos.set(e.wamid, [...(huerfanos.get(e.wamid) ?? []), e]); return; }
    const rango: Record<string, number> = { sent: 1, delivered: 2, read: 3, played: 4, failed: 5 };
    const avanza = (rango[e.estado] ?? 0) > (rango[m.estado ?? ''] ?? 0);
    const tarifas = tarjeta.paises[paisDeWaId(m.waId)] ?? tarjeta.paises.OTRO;
    const tarifa = e.precio ? (e.precio.categoria === 'marketing' ? tarifas?.marketing : e.precio.categoria === 'authentication' ? tarifas?.authentication : tarifas?.utility) ?? 0 : 0;
    await datos.guarda('mensajes', e.wamid, {
      ...m, ...(avanza ? { estado: e.estado } : {}),
      ...(e.precio ? { precio: e.precio, costoMicros: e.precio.billable ? tarifa : 0 } : {}),
    });
    if (e.estado === 'failed') await bitacora(datos, m.conversacionId, 'entrega_fallida', (e.errores ?? []).map((x) => `${x.codigo}: ${x.titulo}`).join('; '));
  }

  async function procesaEco(e: EcoDelDueno) {
    const tenant = await o.almacen.inquilinoPorTelefono(e.phoneNumberId);
    if (!tenant) return;
    if (!await o.almacen.primeraVez(`${tenant}:eco:${e.wamid}`)) { metricas.duplicadosIgnorados++; return; }
    const inquilino = (await o.almacen.inquilino(tenant))!;
    const datos = o.almacen.de(tenant);
    const conv = (await datos.lee('conversaciones', idConversacion(e.waId))) ?? nuevaConversacion(idConversacion(e.waId), e.waId, e.instante);
    await datos.guarda('mensajes', e.wamid, { wamid: e.wamid, conversacionId: conv.id, waId: e.waId, direccion: 'eco', autor: 'dueno', tipo: e.tipo, resumen: e.texto ?? `[${e.tipo}]`, instante: e.instante });
    // El eco NO abre ni extiende la ventana de 24 h: solo pausa al agente en ese chat.
    const pausada: Conversacion = conv.estado === 'humano' ? conv : { ...conv, estado: 'pausada_eco', pausadaHasta: e.instante + inquilino.politicas.pausaPorEcoMs };
    await datos.guarda('conversaciones', conv.id, pausada);
    await bitacora(datos, conv.id, 'pausa_por_eco', 'el dueño contestó desde la app: el agente se calla en este chat');
  }

  async function procesa(e: EventoCanal) {
    metricas.eventosProcesados++;
    if (e.clase === 'mensaje' && !e.waId) {
      // Solo BSUID (nombre de usuario, 2026): el vendedor indexa por teléfono y no sabe contestar por BSUID todavía.
      const tenant = await o.almacen.inquilinoPorTelefono(e.phoneNumberId);
      if (tenant) await alerta(o.almacen.de(tenant), 'aviso', 'Llegó un mensaje sin teléfono (solo BSUID): el agente no lo contesta todavía; contéstalo desde la app.');
      return;
    }
    if (e.clase === 'mensaje') { const t0 = performance.now(); await procesaMensaje(e); metricas.procesamientoMs.push(performance.now() - t0); return; }
    if (e.clase === 'estado') return procesaEstado(e);
    if (e.clase === 'eco') return procesaEco(e);
    if (e.clase === 'cuenta') {
      for (const tenant of await o.almacen.inquilinosPorWaba(e.wabaId)) {
        const i = (await o.almacen.inquilino(tenant))!;
        const datos = o.almacen.de(tenant);
        if (traza) void traza.registra(tenant, 'CANAL', e.evento, e, { evento: e.evento }, 'sistema');
        if (e.evento === 'PARTNER_REMOVED') {
          await o.almacen.guardaInquilino({ ...i, estado: 'pausado', motivoPausa: `la pyme desconectó la plataforma desde la app (${e.iniciadoPor ?? '¿?'})` });
          await alerta(datos, 'grave', 'Canal desconectado (PARTNER_REMOVED): los envíos del negocio quedan pausados. Reconecta desde la app de WhatsApp Business.');
        } else if (e.evento === 'ACCOUNT_RECONNECTED') {
          const activo: Inquilino = { ...i, estado: 'activo' };
          delete activo.motivoPausa;
          await o.almacen.guardaInquilino(activo);
          await alerta(datos, 'info', 'Canal reconectado (ACCOUNT_RECONNECTED): el agente vuelve a atender.');
        }
      }
      return;
    }
    if (e.clase === 'historial') {
      const tenant = await o.almacen.inquilinoPorTelefono(e.phoneNumberId);
      if (!tenant) return;
      const datos = o.almacen.de(tenant);
      if (e.errorCodigo === 2593109) { await alerta(datos, 'info', 'El dueño no compartió su historial (2593109): el agente empieza sin él.'); return; }
      for (const h of e.hilos) {
        const previo = (await datos.lee('historial', h.waId)) ?? { waId: h.waId, mensajes: [], fases: [] };
        const nuevos = h.mensajes.filter((m) => !previo.mensajes.some((x) => x.wamid === m.wamid));
        await datos.guarda('historial', h.waId, { waId: h.waId, mensajes: [...previo.mensajes, ...nuevos].sort((a, b) => a.instante - b.instante), fases: [...new Set([...previo.fases, e.fase ?? 0])] });
      }
      return;
    }
    if (e.clase === 'evento_automatico') {
      const tenant = await o.almacen.inquilinoPorTelefono(e.phoneNumberId);
      if (!tenant) return;
      await bus.envia('atribucion', { tenant, contextId: `ctx_auto`, skill: 'registrar_automatico', datos: { evento: { wamid: e.wamid, nombre: e.nombre, instante: e.instante, ...(e.ctwaClid ? { ctwaClid: e.ctwaClid } : {}), ...(e.valorCentavos !== undefined ? { valorCentavos: e.valorCentavos } : {}) } }, messageId: `auto:${e.wamid}` });
    }
  }

  async function trabaja() {
    while (cola.length) {
      const { evento: e, lote } = cola.shift()!;
      try { await procesa(e); } catch (err) {
        const tenant = 'phoneNumberId' in e ? await o.almacen.inquilinoPorTelefono(e.phoneNumberId) : undefined;
        if (tenant) await alerta(o.almacen.de(tenant), 'grave', `error al procesar ${e.clase}: ${(err as Error).message}`);
      }
      const faltan = (faltanDelLote.get(lote) ?? 1) - 1;
      if (faltan <= 0) { faltanDelLote.delete(lote); durable.hecho(lote); } else faltanDelLote.set(lote, faltan);
    }
  }
  const encolaLote = (lote: string, eventos: EventoCanal[]) => {
    if (!eventos.length) { durable.hecho(lote); return; }
    faltanDelLote.set(lote, eventos.length);
    cola.push(...eventos.map((evento) => ({ evento, lote })));
  };
  // Al arrancar: lo que quedó guardado y sin procesar (el proceso se cayó después del 200).
  let reanudados = 0;
  for (const p of durable.pendientes()) {
    try { const l = leeWebhook(JSON.parse(p.cuerpo)); if (l.ok) { encolaLote(p.id, l.eventos); reanudados++; } else durable.hecho(p.id); } catch { durable.hecho(p.id); }
  }
  if (reanudados) queueMicrotask(() => despierta());
  function despierta() {
    if (!trabajando) trabajando = trabaja().finally(() => { trabajando = null; if (cola.length) despierta(); });
  }

  async function avisaPago(tenant: string, pedidoId: string, texto: string) {
    const i = (await o.almacen.inquilino(tenant))!;
    const datos = o.almacen.de(tenant);
    const p = await datos.lee('pedidos', pedidoId);
    if (!p) return;
    const conv = await datos.lee('conversaciones', p.conversacionId);
    if (!conv) return;
    // Dentro de la ventana, texto libre (puede caer en el cupo gratis); fuera, la plantilla de utilidad.
    const ahora = reloj();
    const abierta = decidePrecio({ categoria: 'service', ventanas: conv.ventanas, ahora, pais: paisDeWaId(conv.waId), servicioEnElMes: 0, tarjeta }).permitido;
    const m: MensajeSaliente = abierta ? { tipo: 'texto', texto } : { tipo: 'plantilla', nombre: 'estado_pedido', idioma: 'es_MX', parametros: [p.id, formatoPrecio(p.totalCentavos)] };
    const nueva = await enviaSaliente(i, datos, conv, m, 'sistema');
    await datos.guarda('conversaciones', conv.id, nueva);
  }

  return {
    bus,
    metricas,
    tarjeta,
    reanudados,
    webhook: {
      verifica: (parametros: URLSearchParams | Record<string, string | undefined>): RespuestaHttp => respondeVerificacion(parametros, o.secretos.verifyToken),
      /** Verifica, encola y responde. El trabajo va después: el acuse no espera al agente. */
      recibe(cuerpoCrudo: string, firma: string | null | undefined): RespuestaHttp {
        const t0 = performance.now();
        metricas.webhooksRecibidos++;
        if (!verificaFirmaMeta(o.secretos.app, cuerpoCrudo, firma)) { metricas.firmasRechazadas++; return { status: 401, cuerpo: 'firma inválida' }; }
        let json: unknown;
        try { json = JSON.parse(cuerpoCrudo); } catch { return { status: 400, cuerpo: 'json inválido' }; }
        const l = leeWebhook(json);
        if (!l.ok) return { status: 400, cuerpo: l.error };
        encolaLote(durable.guarda(cuerpoCrudo), l.eventos);
        queueMicrotask(despierta);
        metricas.acusesMs.push(performance.now() - t0);
        return { status: 200, cuerpo: 'ok' };
      },
      /** Espera a que la cola quede vacía (pruebas y laboratorio). */
      async drena() { while (cola.length || trabajando) { despierta(); await trabajando; } },
      pendientes: () => cola.length,
    },
    pagos: {
      async recibe(cuerpoCrudo: string, firma: string | null | undefined): Promise<RespuestaHttp> {
        const l = o.pagos.leeWebhook(cuerpoCrudo, firma);
        if (!l.ok) return { status: 401, cuerpo: l.error };
        const partes = partesDeReferencia(l.evento.referencia);
        if (!partes || !await o.almacen.inquilino(partes.inquilinoId)) return { status: 404, cuerpo: 'referencia desconocida' };
        const datos = o.almacen.de(partes.inquilinoId);
        const pedido = await datos.lee('pedidos', partes.pedidoId);
        const t = await bus.envia('pedidos', { tenant: partes.inquilinoId, contextId: `ctx_${pedido?.conversacionId ?? 'pagos'}`, skill: 'confirmar_pago', datos: { evento: { ...l.evento } }, messageId: ids('pago') });
        if (artefacto(t, 'duplicado')) return { status: 200, cuerpo: 'duplicado' };
        if (t.estado === 'TASK_STATE_COMPLETED') await avisaPago(partes.inquilinoId, partes.pedidoId, `¡Pago recibido! Tu pedido ${partes.pedidoId} ya está en preparación. Te avisamos cuando salga.`);
        else if (t.motivo === 'pago rechazado') await avisaPago(partes.inquilinoId, partes.pedidoId, 'Tu pago no pasó. Puedes intentar de nuevo con la misma liga.');
        else if (t.motivo === 'monto no cuadra') {
          await alerta(datos, 'grave', `El pago del pedido ${partes.pedidoId} no cuadra con el total: queda en revisión.`);
          if (pedido) await bus.envia('soporte', { tenant: partes.inquilinoId, contextId: `ctx_${pedido.conversacionId}`, skill: 'abrir_caso', datos: { conversacionId: pedido.conversacionId, waId: pedido.waId, motivo: 'monto', detalle: 'el pago no cuadra con el total' }, messageId: `${l.evento.pagoId}:caso` });
        }
        return { status: 200, cuerpo: 'ok' };
      },
    },
    flows: {
      endpoint: (cuerpoCrudo: string, firma: string | null | undefined) => atiendeEndpointFlows(cuerpoCrudo, firma, {
        secretoApp: o.secretos.app, secretoTokens: o.secretos.tokensFlow, llavePrivada: o.llavePrivadaFlows, reloj,
        inquilino: (id) => o.almacen.inquilino(id), bus,
      }),
    },
    panel: creaPanel({ almacen: o.almacen, bus, reloj, enviaSaliente, tarjeta, traza }),
    trazabilidad: traza,
  };
}

export type Vendedor = ReturnType<typeof creaVendedor>;

interface DepsPanel {
  traza: Trazabilidad | null;
  almacen: Almacen;
  bus: BusA2A;
  reloj: Reloj;
  tarjeta: TarjetaDeTarifas;
  enviaSaliente: (i: Inquilino, d: AlmacenInquilino, c: Conversacion, m: MensajeSaliente, a: 'agente' | 'dueno' | 'sistema') => Promise<Conversacion>;
}

/** Lo que el dueño hace desde su panel. Cada acción va acotada a SU inquilino. */
function creaPanel(d: DepsPanel) {
  const pide = (tenant: string, dominio: string, skill: string, datos: Record<string, unknown>) =>
    d.bus.envia(dominio, { tenant, contextId: 'ctx_panel', skill, datos, messageId: `panel:${skill}:${d.reloj()}:${Math.random().toString(36).slice(2)}` });
  return {
    async bandeja(tenant: string) {
      const datos = d.almacen.de(tenant);
      const [casos, conversaciones, mensajes, alertas] = await Promise.all([datos.lista('casos'), datos.lista('conversaciones'), datos.lista('mensajes'), datos.lista('alertas')]);
      return {
        casos: casos.filter((c) => c.estado !== 'liberado').sort((a, b) => b.abiertoEn - a.abiertoEn).map((c) => {
          const conversacion = conversaciones.find((x) => x.id === c.conversacionId);
          return {
            ...c,
            conversacion,
            ventana: conversacion ? cronometro(conversacion.ventanas, d.reloj()) : null,
            mensajes: mensajes.filter((m) => m.conversacionId === c.conversacionId).sort((a, b) => a.instante - b.instante),
          };
        }),
        pausadasPorEco: conversaciones.filter((c) => c.estado === 'pausada_eco'),
        alertas: alertas.sort((a, b) => b.instante - a.instante).slice(0, 20),
      };
    },
    /**
     * El cronómetro, del lado del dueño: por cada conversación que lleva él (o que tiene un pedido
     * sin pagar), si una ventana cierra en menos de 2 h, una alerta — una sola vez por ventana.
     */
    async revisaVentanas(tenant: string) {
      const datos = d.almacen.de(tenant);
      const ahora = d.reloj();
      const [conversaciones, pedidos] = await Promise.all([datos.lista('conversaciones'), datos.lista('pedidos')]);
      const conPendiente = new Set(pedidos.filter((p) => p.estado === 'carrito' || p.estado === 'por_pagar').map((p) => p.conversacionId));
      const avisos: string[] = [];
      for (const c of conversaciones) {
        if (c.estado === 'agente' && !conPendiente.has(c.id)) continue;
        const cr = cronometro(c.ventanas, ahora);
        const cierre = cr.anuncioPorResponder?.vence ?? (cr.entradaGratis.abierta ? cr.entradaGratis.cierraEn : cr.atencion.cierraEn);
        if (!cr.aviso || cierre === null || c.avisoVentanaHasta === cierre) continue;
        const texto = `+${c.waId}: ${cr.aviso}`;
        const id = `alerta_ventana_${c.id}_${cierre}`;
        await datos.guarda('alertas', id, { id, instante: ahora, nivel: 'aviso', texto });
        await datos.guarda('conversaciones', c.id, { ...c, avisoVentanaHasta: cierre });
        avisos.push(texto);
      }
      return avisos;
    },
    tomaCaso: (tenant: string, casoId: string) => pide(tenant, 'soporte', 'tomar_caso', { casoId }),
    async responde(tenant: string, conversacionId: string, texto: string) {
      const i = await d.almacen.inquilino(tenant);
      const datos = d.almacen.de(tenant);
      const conv = await datos.lee('conversaciones', conversacionId);
      if (!i || !conv) return { ok: false as const, error: 'no existe' };
      if (conv.estado !== 'humano') return { ok: false as const, error: 'toma el caso antes de responder' };
      await datos.guarda('conversaciones', conv.id, await d.enviaSaliente(i, datos, conv, { tipo: 'texto', texto }, 'dueno'));
      return { ok: true as const };
    },
    async liberaCaso(tenant: string, casoId: string) {
      const t = await pide(tenant, 'soporte', 'liberar_caso', { casoId });
      const caso = artefacto(t, 'caso') as { conversacionId: string } | undefined;
      if (caso) {
        const datos = d.almacen.de(tenant);
        const conv = await datos.lee('conversaciones', caso.conversacionId);
        if (conv) await datos.guarda('conversaciones', conv.id, { ...conv, estado: 'agente', fallosComprension: 0, turnos: 0, tokens: 0 });
      }
      return t;
    },
    async liberaPausa(tenant: string, conversacionId: string) {
      const datos = d.almacen.de(tenant);
      const conv = await datos.lee('conversaciones', conversacionId);
      if (conv && d.traza) void d.traza.registra(tenant, 'ACCION_DUENO', conversacionId, { accion: 'liberar_pausa' }, { accion: 'liberar_pausa' }, 'dueno');
      if (conv?.estado === 'pausada_eco') { const libre: Conversacion = { ...conv, estado: 'agente' }; delete libre.pausadaHasta; await datos.guarda('conversaciones', conv.id, libre); }
    },
    /** Lista de bloqueo del dueño (`motivo` nulo desbloquea); queda en la cadena como acción del dueño. */
    async bloquea(tenant: string, conversacionId: string, motivo: string | null) {
      const c = await bloqueaContacto(d.almacen.de(tenant), conversacionId, d.reloj(), motivo);
      if (c && d.traza) void d.traza.registra(tenant, 'ACCION_DUENO', conversacionId, { accion: motivo ? 'bloquear' : 'desbloquear' }, { accion: motivo ? 'bloquear' : 'desbloquear' }, 'dueno');
      return c;
    },
    sincronizaCatalogo: (tenant: string, csv: string) => pide(tenant, 'catalogo', 'sincronizar_csv', { csv }),
    creaQr: (tenant: string, etiqueta: string, mensaje: string) => pide(tenant, 'atribucion', 'crear_qr', { etiqueta, mensaje }),
    registraGasto: (tenant: string, campanaId: string, nombre: string, gastoCentavos: number, anuncios: string[]) => pide(tenant, 'atribucion', 'registrar_gasto', { campanaId, nombre, gastoCentavos, anuncios }),
    reintentaConversiones: (tenant: string) => pide(tenant, 'atribucion', 'reintentar', {}),
    concilia: (tenant: string) => pide(tenant, 'pedidos', 'conciliar', {}),
    tablero: (tenant: string) => tableroDelDueno(d.almacen.de(tenant), d.tarjeta),
    /**
     * Integridad de la cadena del inquilino: se recorre entera y se compara contra sus anclas.
     * `anclas` y `verificaFirma` vienen de fuera: el inquilino no escribe donde viven.
     */
    async integridad(tenant: string, anclas?: AlmacenAnclas, verificaFirma?: (a: Omit<Ancla, 'firma'>, firma: string) => boolean) {
      if (!d.traza) return { activa: false as const };
      await d.traza.drena();
      const eslabones = await d.almacen.de(tenant).lista('cadena');
      const cadena = await d.traza.verifica(tenant);
      const conAnclas = anclas && verificaFirma ? verificaAnclas(eslabones, await anclas.anclas(tenant), verificaFirma) : null;
      return { activa: true as const, cadena, anclas: conAnclas };
    },
    /** Alta de un inquilino (la app solo lo permite en el laboratorio; la fase 4 es Embedded Signup). */
    alta: (i: Inquilino) => d.almacen.guardaInquilino(i),
    inquilino: (tenant: string) => d.almacen.inquilino(tenant),
  };
}
