/**
 * EL RECEPTOR del webhook de WhatsApp. Lo que Meta exige y lo que se probo:
 *  - la firma `X-Hub-Signature-256` sobre los BYTES CRUDOS, antes de parsear (la verificacion se inyecta);
 *  - el 200 DE INMEDIATO: el cuerpo se escribe en una COLA DURABLE y se procesa despues. Lo que se acuso no se
 *    pierde si el proceso se cae a medias (al arrancar, `drena` procesa lo pendiente);
 *  - Meta reintenta hasta 7 dias y no garantiza orden ni que llegue `delivered`: todo es IDEMPOTENTE (un `wamid`
 *    entrante se atiende una vez; un estado de un mensaje, una vez) y el estado de un aviso solo AVANZA
 *    (enviado → entregado → leido; un `failed` tardio no deshace una entrega);
 *  - coexistencia: el eco de la recepcion calla al asistente en ese chat; `PARTNER_REMOVED` y una plantilla
 *    pausada o recategorizada quedan como ALERTA para la clinica (y lo que falle cae al correo de respaldo).
 */
import type { Aviso } from '../almacen.js';
import type { Contexto } from '../portal/contexto.js';
import { programaRespaldoCorreo } from '../portal/avisos.js';
import { motivoMeta } from '../portal/envio.js';
import { pacientePorWaId } from './vinculo.js';
import { atiendeMensaje, memoriaNueva, SILENCIO_MS, visitanteWa, type DepsEntrada } from './entrada.js';
import { idDeClave } from '../seudonimo.js';
import type { EcoWa, EstadoWa, EventoWa } from './tipos.js';

export interface ElementoCola { id: string; cuerpo: string; recibido: number }

/** La cola durable del webhook: se escribe ANTES de contestar 200 y se marca hecho DESPUES de procesar. */
export interface ColaEntrada {
  agrega(cuerpo: string, recibido: number): Promise<string>;
  pendientes(): Promise<ElementoCola[]>;
  hecho(id: string): Promise<void>;
  /** Tira lo ya procesado: el cuerpo crudo (número y texto) no se queda en disco más de lo necesario. */
  compacta?(): Promise<void>;
}

export function colaEnMemoria(): ColaEntrada {
  const items: ElementoCola[] = [];
  const hechos = new Set<string>();
  let n = 0;
  return {
    async agrega(cuerpo, recibido) {
      const id = `w${++n}`;
      items.push({ id, cuerpo, recibido });
      return id;
    },
    async pendientes() {
      return items.filter((i) => !hechos.has(i.id));
    },
    async hecho(id) {
      hechos.add(id);
    },
  };
}

export interface AlertaCanal { en: number; clinica: string | null; nivel: 'aviso' | 'grave'; texto: string }

export interface DepsReceptor extends DepsEntrada {
  verificaFirma(cuerpoCrudo: string, firma: string | null | undefined): boolean;
  lee(cuerpo: unknown): { ok: true; eventos: readonly EventoWa[] } | { ok: false; error: string };
  cola: ColaEntrada;
  /** Tras procesar un lote (p. ej. despachar los avisos que un Flow acaba de programar). */
  alProcesar?: () => Promise<unknown>;
}

const ORDEN: Record<string, number> = { enviado: 1, entregado: 2, leido: 3 };

export function creaReceptorWhatsApp(d: DepsReceptor) {
  const ctx: Contexto = d.ctx;
  const memoria = memoriaNueva();
  const alertas: AlertaCanal[] = [];
  let corrida: Promise<number> = Promise.resolve(0);
  const clinicaDe = (phoneNumberId: string) => ctx.wa().numeros.find((n) => n.phoneNumberId === phoneNumberId)?.clinica ?? null;
  const alerta = (clinica: string | null, nivel: AlertaCanal['nivel'], texto: string) => void alertas.push({ en: ctx.reloj(), clinica, nivel, texto });

  async function avisoPorWamid(clinica: string, wamid: string): Promise<Aviso | null> {
    return (await ctx.almacen.avisos(clinica)).find((a) => a.wamid === wamid) ?? null;
  }

  async function sujetoDe(clinica: string, waId: string): Promise<string> {
    return (await pacientePorWaId(ctx, clinica, waId))?.seudonimo ?? visitanteWa(ctx, clinica, waId);
  }

  /** Lo que Meta cobra: una vez por mensaje, con la tarifa de su categoria si es cobrable. */
  async function cobro(clinica: string, e: EstadoWa, aviso: Aviso | null): Promise<number | null> {
    if (!e.precio || (e.estado !== 'delivered' && e.estado !== 'read')) return null;
    const costo = e.precio.billable ? ctx.wa().tarifaUsd(e.precio.categoria) : 0;
    if (!(await ctx.almacen.marcaProcesado(`cobro|${e.wamid}`))) return costo;
    const categoria = (['utility', 'service', 'marketing', 'authentication'] as const).find((x) => x === e.precio!.categoria) ?? 'service';
    const tipoPrecio = (['regular', 'free_customer_service', 'free_entry_point'] as const).find((x) => x === e.precio!.tipo) ?? 'regular';
    const sujeto = aviso?.paciente ?? (await sujetoDe(clinica, e.destinatario));
    await ctx.emite({ clinica, sujeto, tipo: 'whatsapp_cobro', categoria, tipo_precio: tipoPrecio, billable: e.precio.billable, costo_usd: costo, mensaje: aviso ? 'aviso' : 'respuesta' }, `wa-cobro|${e.wamid}`);
    return costo;
  }

  async function avanza(a: Aviso, a2: 'entregado' | 'leido', costo: number | null): Promise<void> {
    const base = { clinica: a.clinica, sujeto: a.paciente, aviso: a.id, canal: a.canal, clase: a.clase } as const;
    if ((ORDEN[a.estado] ?? 0) < ORDEN.entregado!) await ctx.emite({ ...base, tipo: 'aviso_entregado', costo_usd: costo }, `entregado|${a.id}`);
    if (a2 === 'leido' && (ORDEN[a.estado] ?? 0) < ORDEN.leido!) await ctx.emite({ ...base, tipo: 'aviso_leido' }, `leido|${a.id}`);
    if ((ORDEN[a.estado] ?? 0) < ORDEN[a2]!) await ctx.almacen.guardaAviso({ ...a, estado: a2, actualizado: ctx.reloj() });
  }

  async function falla(a: Aviso, e: EstadoWa): Promise<void> {
    if (a.estado !== 'enviado') return;
    const codigo = e.errores?.[0]?.codigo ?? 0;
    const m = motivoMeta(codigo);
    const ahora = ctx.reloj();
    await ctx.almacen.guardaAviso({ ...a, estado: m.definitivo ? 'fallido' : 'programado', motivo: m.motivo, proximoIntento: ahora + (m.esperaMs ?? 0), actualizado: ahora });
    await ctx.emite({ clinica: a.clinica, sujeto: a.paciente, tipo: 'aviso_fallido', aviso: a.id, canal: a.canal, clase: a.clase, motivo: m.motivo, definitivo: m.definitivo }, `fallido|${a.id}|wa|${e.wamid}`);
    if (m.definitivo) await programaRespaldoCorreo(ctx, a);
  }

  async function estado(e: EstadoWa): Promise<void> {
    const clinica = clinicaDe(e.phoneNumberId);
    if (!clinica || !(await ctx.almacen.marcaProcesado(`estado|${e.wamid}|${e.estado}`))) return;
    const aviso = await avisoPorWamid(clinica, e.wamid);
    const costo = await cobro(clinica, e, aviso);
    if (!aviso) return;
    if (e.estado === 'delivered') await avanza(aviso, 'entregado', costo);
    if (e.estado === 'read') await avanza(aviso, 'leido', costo);
    if (e.estado === 'failed') await falla(aviso, e);
  }

  async function eco(e: EcoWa): Promise<void> {
    const clinica = clinicaDe(e.phoneNumberId);
    if (!clinica || !(await ctx.almacen.marcaProcesado(`eco|${e.wamid}`))) return;
    const conversacion = idDeClave('cnv', `wa|${clinica}|${e.waId}`);
    const previo = await ctx.almacen.chat(clinica, e.waId);
    const chat = previo ?? { clinica, waId: e.waId, conversacion, ultimoEntrante: null, silenciadoHasta: null, actualizado: 0 };
    const yaCallado = chat.silenciadoHasta !== null && chat.silenciadoHasta > e.instante;
    await ctx.almacen.guardaChat({ ...chat, silenciadoHasta: e.instante + SILENCIO_MS, actualizado: ctx.reloj() });
    if (!yaCallado) await ctx.emite({ clinica, sujeto: await sujetoDe(clinica, e.waId), tipo: 'recepcion_atiende', conversacion, motivo: 'eco_de_recepcion' }, `wa-eco|${e.wamid}`);
  }

  async function procesa(e: EventoWa): Promise<void> {
    if (e.clase === 'mensaje') {
      const clinica = clinicaDe(e.phoneNumberId);
      if (clinica && (await ctx.almacen.marcaProcesado(`entrante|${e.wamid}`))) await atiendeMensaje(d, e, clinica, memoria);
    } else if (e.clase === 'estado') await estado(e);
    else if (e.clase === 'eco') await eco(e);
    else if (e.clase === 'cuenta' && e.evento === 'PARTNER_REMOVED') alerta(null, 'grave', 'La clínica desconectó el número desde la app de WhatsApp Business: los avisos por WhatsApp fallan y salen por correo de respaldo hasta reconectarlo.');
    else if (e.clase === 'cuenta' && e.evento === 'ACCOUNT_RECONNECTED') alerta(null, 'aviso', 'El número de WhatsApp se reconectó.');
    else if (e.clase === 'plantilla') {
      if (e.categoria && e.categoria.toLowerCase() !== 'utility') alerta(null, 'grave', `Meta pasó la plantilla ${e.nombre} a ${e.categoria}: cuesta más y exige otro consentimiento. Revísala antes de seguir usándola.`);
      if (e.estado && e.estado !== 'APPROVED') alerta(null, 'grave', `La plantilla ${e.nombre} está ${e.estado}: sus avisos fallan y salen por correo de respaldo.`);
    }
  }

  async function drena(): Promise<number> {
    let n = 0;
    for (const item of await d.cola.pendientes()) {
      let cuerpo: unknown;
      try {
        cuerpo = JSON.parse(item.cuerpo);
      } catch {
        cuerpo = null;
      }
      const l = d.lee(cuerpo);
      for (const e of l.ok ? l.eventos : []) {
        try {
          await procesa(e);
        } catch (err) {
          alerta(null, 'grave', `no se pudo procesar un evento ${e.clase}: ${(err as Error).message}`);
        }
      }
      await d.cola.hecho(item.id);
      n++;
    }
    if (n) await d.cola.compacta?.();
    if (n) await d.alProcesar?.().catch(() => undefined);
    return n;
  }

  /** Una corrida a la vez (la cola es una sola fila): lo que llega durante una corrida lo toma la siguiente. */
  function programa(): Promise<number> {
    corrida = corrida.catch(() => 0).then(drena);
    return corrida;
  }

  return {
    /** El POST del webhook: firma → cola durable → 200. El proceso va despues (`asienta` lo espera). */
    async recibe(cuerpoCrudo: string, firma: string | null | undefined): Promise<{ status: number }> {
      if (!d.verificaFirma(cuerpoCrudo, firma)) return { status: 401 };
      await d.cola.agrega(cuerpoCrudo, ctx.reloj());
      void programa();
      return { status: 200 };
    },
    drena: programa,
    asienta: () => corrida.then(() => programa()),
    alertas,
    memoria,
  };
}

export type ReceptorWhatsApp = ReturnType<typeof creaReceptorWhatsApp>;
