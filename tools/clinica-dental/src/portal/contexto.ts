/**
 * Lo que comparten las partes del portal: puertos inyectados, el libro y la forma de emitir un evento.
 */
import type { Agenda } from '../agenda.js';
import type { AlmacenPortal, Paciente } from '../almacen.js';
import { consentimientosVigentes } from '../almacen.js';
import type { PuertoCorreo } from '../canales/correo.js';
import type { CanalTelegram, VideoSubido } from '../canales/telegram.js';
import type { Clinica } from '../clinicas.js';
import type { Evento, EventoSinSello } from '../eventos.js';
import type { Libro } from '../libro.js';
import type { Seudonimos } from '../seudonimo.js';
import type { NumeroClinica, PuertoWhatsApp } from '../whatsapp/tipos.js';

/** El canal de WhatsApp del portal: el puerto (simulador o Cloud API con gate), los numeros y las tarifas. */
export interface DepsWhatsApp {
  puerto: PuertoWhatsApp;
  numeros: readonly NumeroClinica[];
  /** US$ por mensaje entregado y COBRABLE de esa categoria de Meta (`utility`, `service`…); `null` si no se sabe. */
  tarifaUsd: (categoria: string) => number | null;
  /**
   * La URL PUBLICA (https) del portal que va en los botones de WhatsApp: Meta rechaza una liga que no sea https.
   * Por defecto, `https://<dominio de la clinica>/clinica/<id>`.
   */
  urlPublica?: (clinica: string) => string;
}

export interface DepsPortal {
  clinicas: readonly Clinica[];
  almacen: AlmacenPortal;
  libro: Libro;
  agendas: ReadonlyMap<string, Agenda>;
  correo: PuertoCorreo;
  /** El canal de Telegram de cada clinica (su bot). */
  telegram: (clinica: string) => CanalTelegram;
  seudonimos: Seudonimos;
  reloj: () => number;
  /** Donde vive el portal (enlaces de los avisos). */
  urlPortal: (clinica: string) => string;
  /** URL publica HTTPS de la baja de un clic (RFC 8058). */
  urlBaja: (clinica: string, token: string) => string;
  /** El reel de la clinica para el aviso de Telegram, si existe. */
  reel: (clinica: string) => Promise<VideoSubido | null>;
  /** Edicion vigente del newsletter (una por mes). */
  edicionNewsletter?: () => string;
  /** Sin esto el portal no tiene WhatsApp: elegirlo como canal falla cerrado. */
  whatsapp?: DepsWhatsApp;
}

export interface Contexto extends DepsPortal {
  emite(e: EventoSinSello, clave: string): Promise<Evento>;
  clinica(id: string): Clinica;
  agenda(id: string): Agenda;
  exigePaciente(clinica: string, usuario: string): Promise<Paciente>;
  wa(): DepsWhatsApp;
  numeroDe(clinica: string): NumeroClinica;
}

export class ErrorPortal extends Error {
  readonly codigo: 'sin-paciente' | 'no-encontrada' | 'ajena' | 'estado' | 'politica';
  constructor(codigo: ErrorPortal['codigo'], mensaje: string) {
    super(mensaje);
    this.codigo = codigo;
    this.name = 'ErrorPortal';
  }
}

export function creaContexto(d: DepsPortal): Contexto {
  return {
    ...d,
    emite(e, clave) {
      return d.libro.registra(e, clave);
    },
    clinica(id) {
      const c = d.clinicas.find((x) => x.id === id);
      if (!c) throw new ErrorPortal('no-encontrada', `clínica desconocida: ${id}`);
      return c;
    },
    agenda(id) {
      const a = d.agendas.get(id);
      if (!a) throw new ErrorPortal('no-encontrada', `sin agenda para ${id}`);
      return a;
    },
    async exigePaciente(clinica, usuario) {
      const p = await d.almacen.paciente(clinica, usuario);
      if (!p) throw new ErrorPortal('sin-paciente', 'Primero completa tu registro en esta clínica.');
      return p;
    },
    wa() {
      if (!d.whatsapp) throw new ErrorPortal('politica', 'Este portal no tiene WhatsApp configurado.');
      return d.whatsapp;
    },
    numeroDe(clinica) {
      const n = d.whatsapp?.numeros.find((x) => x.clinica === clinica);
      if (!n) throw new ErrorPortal('politica', `La clínica ${clinica} no tiene número de WhatsApp.`);
      return n;
    },
  };
}

export const HORA_MS = 3_600_000;

export async function vigentes(ctx: Pick<Contexto, 'almacen'>, clinica: string, seudonimo: string) {
  return consentimientosVigentes(await ctx.almacen.consentimientos(clinica, seudonimo));
}

