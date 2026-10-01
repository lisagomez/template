/**
 * Dominio `atribucion`: registra el origen de cada conversación, manda `LeadSubmitted` y
 * `Purchase` por la Conversions API y lleva el LEDGER que impide contar dos veces un pedido. Es el
 * único que escribe orígenes, eventos, QR y gasto de anuncios.
 *
 * Conversions API for Business Messaging (verificada el 2026-09-30,
 * developers.facebook.com/docs/marketing-api/conversions-api/business-messaging/):
 * `POST /{dataset_id}/events` con `action_source: business_messaging`, `messaging_channel:
 * whatsapp`, `user_data.whatsapp_business_account_id` y `user_data.ctwa_clid`; `custom_data`
 * con `currency` y `value` en compras. El `ctwa_clid` no llega en anuncios de Estados de WhatsApp:
 * esas conversaciones se atribuyen por el id del anuncio en el tablero propio, no por CAPI.
 */
import { tarea, type AgenteDominio, type ContextoDominio, type Solicitud } from '../agente/a2a-modelo.js';
import type { EventoConversion, Origen } from '../modelo.js';
import { tableroDelDueno } from './tablero.js';
import { TARJETA_LABORATORIO } from '../meta/tarifas.js';
import type { EventoCapi } from '../meta/graph.js';

const idDeEvento = (nombre: string, conversacionId: string, pedidoId?: string) =>
  nombre === 'Purchase' ? `${pedidoId}:Purchase` : `${conversacionId}:LeadSubmitted`;

async function campanaDe(ctx: ContextoDominio, anuncioId?: string): Promise<string | undefined> {
  if (!anuncioId) return undefined;
  return (await ctx.datos.lista('gastoAnuncios')).find((g) => g.anuncios.includes(anuncioId))?.campanaId;
}

async function envia(ctx: ContextoDominio, ev: EventoConversion): Promise<EventoConversion> {
  const graph = ctx.servicios.graph;
  if (!ev.ctwaClid) return { ...ev, estado: 'sin_clid' };
  if (!graph) return { ...ev, estado: 'pendiente', ultimaRespuesta: 'sin transporte' };
  const cuerpo: EventoCapi = {
    event_name: ev.nombre, event_time: Math.floor(ev.instante / 1000), event_id: ev.eventId,
    action_source: 'business_messaging', messaging_channel: 'whatsapp',
    user_data: { whatsapp_business_account_id: ctx.inquilino.canal.wabaId, ctwa_clid: ev.ctwaClid },
    ...(ev.nombre === 'Purchase' && ev.valorCentavos !== undefined ? { custom_data: { currency: ev.moneda ?? ctx.inquilino.moneda, value: ev.valorCentavos / 100 } } : {}),
  };
  const r = await graph.enviaEventos(ctx.inquilino.canal.datasetId, [cuerpo]);
  const ahora = ctx.reloj();
  return r.ok
    ? { ...ev, estado: 'aceptado', intentos: ev.intentos + 1, enviadoEn: ahora, ultimaRespuesta: `events_received=${r.recibidos}` }
    : { ...ev, estado: 'rechazado', intentos: ev.intentos + 1, ultimaRespuesta: `${r.codigo}: ${r.error}` };
}

async function reporta(s: Solicitud, ctx: ContextoDominio) {
  const ahora = ctx.reloj();
  const nombre = s.datos.nombre === 'Purchase' ? 'Purchase' : 'LeadSubmitted';
  const conversacionId = String(s.datos.conversacionId ?? '');
  const pedidoId = s.datos.pedidoId ? String(s.datos.pedidoId) : undefined;
  const eventId = idDeEvento(nombre, conversacionId, pedidoId);
  const previo = await ctx.datos.lee('eventos', eventId);
  if (previo && (previo.estado === 'aceptado' || previo.estado === 'sin_clid')) {
    return tarea(s, 'atribucion', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'evento', datos: { ...previo, duplicado: true } }]);
  }
  const origen = await ctx.datos.lee('origenes', conversacionId);
  const base: EventoConversion = previo ?? {
    eventId, nombre, conversacionId, ...(pedidoId ? { pedidoId } : {}),
    ...(s.datos.valorCentavos !== undefined ? { valorCentavos: Number(s.datos.valorCentavos) } : {}),
    ...(s.datos.moneda ? { moneda: String(s.datos.moneda) } : {}),
    ...(origen?.ctwaClid ? { ctwaClid: origen.ctwaClid } : {}),
    ...(origen?.campanaId ? { campanaId: origen.campanaId } : {}),
    estado: 'pendiente', intentos: 0, instante: ahora,
  };
  const enviado = await envia(ctx, base);
  await ctx.datos.guarda('eventos', eventId, enviado);
  return tarea(s, 'atribucion', enviado.estado === 'rechazado' ? 'TASK_STATE_FAILED' : 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'evento', datos: { ...enviado } }], enviado.estado === 'rechazado' ? enviado.ultimaRespuesta : undefined);
}

/** Purchases que Meta detectó sola (`automatic_events`) contra nuestro ledger. */
export async function comparaAutomaticos(ctx: Pick<ContextoDominio, 'datos'>) {
  const automaticos = (await ctx.datos.lista('automaticos')).filter((a) => a.nombre === 'Purchase');
  const nuestros = (await ctx.datos.lista('eventos')).filter((e) => e.nombre === 'Purchase' && e.estado === 'aceptado');
  const coinciden: string[] = [];
  const soloMeta: string[] = [];
  const valorDistinto: string[] = [];
  for (const a of automaticos) {
    const n = nuestros.find((e) => e.ctwaClid && e.ctwaClid === a.ctwaClid);
    if (!n) soloMeta.push(a.wamid);
    else if (a.valorCentavos !== undefined && n.valorCentavos !== undefined && a.valorCentavos !== n.valorCentavos) valorDistinto.push(n.eventId);
    else coinciden.push(n.eventId);
  }
  const soloNuestros = nuestros.filter((e) => !automaticos.some((a) => a.ctwaClid === e.ctwaClid)).map((e) => e.eventId);
  return { coinciden, soloMeta, soloNuestros, valorDistinto };
}

export const agenteAtribucion: AgenteDominio = {
  nombre: 'atribucion',
  descripcion: 'Origen de cada conversación, conversiones a Meta con ledger, QR por canal y reporte de ROAS.',
  skills: [
    { id: 'registrar_origen', nombre: 'Registrar origen', descripcion: 'Anuncio (ctwa_clid), etiqueta orgánica o directo' },
    { id: 'reportar_conversion', nombre: 'Enviar conversión', descripcion: 'LeadSubmitted o Purchase por la Conversions API, una sola vez' },
    { id: 'reintentar', nombre: 'Reintentar', descripcion: 'Reenvía los eventos rechazados o pendientes' },
    { id: 'registrar_automatico', nombre: 'Evento automático', descripcion: 'Guarda un automatic_event de Meta para compararlo' },
    { id: 'registrar_gasto', nombre: 'Gasto de campaña', descripcion: 'Gasto y anuncios de una campaña (Administrador de anuncios)' },
    { id: 'crear_qr', nombre: 'Crear QR', descripcion: 'Enlace corto y QR con etiqueta de origen' },
    { id: 'reporte_roas', nombre: 'Reporte de ROAS', descripcion: 'Solo lectura y agregado por canal: conversaciones, pedidos, ingresos, gasto y ROAS. Sin datos de clientes' },
  ],
  async atiende(s, ctx) {
    const ahora = ctx.reloj();
    switch (s.skill) {
      case 'registrar_origen': {
        const conversacionId = String(s.datos.conversacionId ?? '');
        const origen = s.datos.origen as unknown as Origen;
        const campanaId = origen.campanaId ?? await campanaDe(ctx, origen.anuncioId);
        const doc = { ...origen, ...(campanaId ? { campanaId } : {}), conversacionId, waId: String(s.datos.waId ?? '') };
        await ctx.datos.guarda('origenes', conversacionId, doc);
        return tarea(s, 'atribucion', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'origen', datos: { ...doc } }]);
      }
      case 'reportar_conversion':
        return reporta(s, ctx);
      case 'reintentar': {
        const eventos = (await ctx.datos.lista('eventos')).filter((e) => e.estado === 'rechazado' || e.estado === 'pendiente');
        const resultados: string[] = [];
        for (const e of eventos) { const r = await envia(ctx, e); await ctx.datos.guarda('eventos', e.eventId, r); resultados.push(`${e.eventId}: ${r.estado}`); }
        return tarea(s, 'atribucion', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'reintentos', datos: { resultados } }]);
      }
      case 'registrar_automatico': {
        const e = s.datos.evento as { wamid: string; nombre: string; instante: number; ctwaClid?: string; valorCentavos?: number };
        await ctx.datos.guarda('automaticos', e.wamid, { ...e });
        return tarea(s, 'atribucion', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'comparacion', datos: await comparaAutomaticos(ctx) }]);
      }
      case 'registrar_gasto': {
        const campanaId = String(s.datos.campanaId ?? '');
        const doc = { campanaId, nombre: String(s.datos.nombre ?? campanaId), gastoCentavos: Number(s.datos.gastoCentavos ?? 0), anuncios: (s.datos.anuncios as string[] | undefined) ?? [], actualizadoEn: ahora };
        await ctx.datos.guarda('gastoAnuncios', campanaId, doc);
        for (const o of await ctx.datos.lista('origenes')) {
          if (!o.campanaId && o.anuncioId && doc.anuncios.includes(o.anuncioId)) await ctx.datos.guarda('origenes', o.conversacionId, { ...o, campanaId });
        }
        return tarea(s, 'atribucion', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'gasto', datos: { ...doc } }]);
      }
      case 'crear_qr': {
        const graph = ctx.servicios.graph;
        const etiqueta = String(s.datos.etiqueta ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
        if (!graph || !etiqueta) return tarea(s, 'atribucion', 'TASK_STATE_REJECTED', ahora, ctx.ids, [], 'sin transporte o sin etiqueta');
        const mensaje = `${String(s.datos.mensaje ?? 'Hola')} [${etiqueta}]`;
        const r = await graph.creaQr(ctx.inquilino.canal.phoneNumberId, mensaje, 'SVG');
        if (!r.ok) return tarea(s, 'atribucion', 'TASK_STATE_FAILED', ahora, ctx.ids, [], r.error);
        const qr = { codigo: r.codigo, etiqueta, mensaje: r.mensaje, ligaCorta: r.ligaCorta, urlImagen: r.urlImagen };
        await ctx.datos.guarda('qrs', etiqueta, qr);
        return tarea(s, 'atribucion', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'qr', datos: { ...qr } }]);
      }
      case 'reporte_roas': {
        const t = await tableroDelDueno(ctx.datos, TARJETA_LABORATORIO);
        const filas = t.filas.map((f) => ({ canal: f.canal, tipo: f.tipo, conversaciones: f.conversaciones, pedidosPagados: f.pedidosPagados, ingresosCentavos: f.ingresosCentavos, gastoCentavos: f.gastoCentavos, roas: f.roas }));
        return tarea(s, 'atribucion', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'reporte', datos: { filas, roasTotal: t.totales.roas } }]);
      }
      default:
        return tarea(s, 'atribucion', 'TASK_STATE_REJECTED', ahora, ctx.ids, [], `skill desconocida: ${s.skill}`);
    }
  },
};
