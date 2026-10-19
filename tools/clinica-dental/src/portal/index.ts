/**
 * El portal del paciente, armado: registro, consentimientos, citas, avisos, baja, Telegram y el libro.
 * Todo lo que habla con el mundo llega en `DepsPortal`; aqui no hay red, ni React, ni Supabase.
 */
import type { TipoConsentimiento } from '../eventos.js';
import type { EventoSinSello } from '../eventos.js';
import { creaContexto, vigentes, type DepsPortal } from './contexto.js';
import { cambiaConsentimiento, registra, type EntradaAlta } from './registro.js';
import { cancela, proximas, reprograma, reserva, simulaAsistencia, type EntradaReserva } from './citas.js';
import { bajaPorToken, creaDespachador, enlaceTelegram, procesaActualizacion } from './despacho.js';
import { programaNewsletter } from './avisos.js';
import type { ActualizacionBot } from '../canales/telegram.js';
import { confirmaVinculo, emiteCodigo, estadoVinculo, rechazaVinculo } from '../whatsapp/vinculo.js';

export function creaPortal(d: DepsPortal) {
  const ctx = creaContexto(d);
  const despacha = creaDespachador(ctx);
  return {
    ctx,
    despacha,
    registra: (a: EntradaAlta) => registra(ctx, a),
    paciente: (clinica: string, usuario: string) => d.almacen.paciente(clinica, usuario),
    consentimientos: async (clinica: string, usuario: string) => vigentes(ctx, clinica, (await ctx.exigePaciente(clinica, usuario)).seudonimo),
    cambiaConsentimiento: (clinica: string, usuario: string, tipo: Exclude<TipoConsentimiento, 'aviso_privacidad' | 'tutor'>, otorgado: boolean) => cambiaConsentimiento(ctx, clinica, usuario, tipo, otorgado),
    reserva: (e: EntradaReserva) => reserva(ctx, e),
    cancela: (clinica: string, usuario: string, id: string) => cancela(ctx, clinica, usuario, id),
    reprograma: (clinica: string, usuario: string, id: string, inicio: string, clave: string) => reprograma(ctx, clinica, usuario, id, inicio, clave),
    proximas: (clinica: string, usuario: string) => proximas(ctx, clinica, usuario),
    simulaAsistencia: (clinica: string, id: string, asistio: boolean) => simulaAsistencia(ctx, clinica, id, asistio),
    baja: (token: string, via: 'un_clic' | 'enlace') => bajaPorToken(ctx, token, via),
    enlaceTelegram: (clinica: string, usuario: string) => enlaceTelegram(ctx, clinica, usuario),
    procesaActualizacion: (clinica: string, u: ActualizacionBot) => procesaActualizacion(ctx, clinica, u),
    /** WhatsApp: el codigo de vinculacion, su estado, confirmar o rechazar el numero pendiente y desvincular. */
    whatsapp: {
      codigo: (clinica: string, usuario: string) => emiteCodigo(ctx, clinica, usuario),
      estado: (clinica: string, usuario: string) => estadoVinculo(ctx, clinica, usuario),
      confirma: (clinica: string, usuario: string, op: { ultimos4?: string } = {}) => confirmaVinculo(ctx, clinica, usuario, op),
      rechaza: (clinica: string, usuario: string) => rechazaVinculo(ctx, clinica, usuario),
      desvincula: (clinica: string, usuario: string) => cambiaConsentimiento(ctx, clinica, usuario, 'whatsapp', false),
    },
    /** Una edicion del newsletter a todos los suscritos de la clinica (los dados de baja no reciben nada). */
    async enviaNewsletter(clinica: string, edicion: string): Promise<number> {
      let n = 0;
      for (const p of await d.almacen.pacientes(clinica)) if (await programaNewsletter(ctx, p, edicion)) n++;
      return n;
    },
    /** Eventos que nacen fuera del nucleo (visita, inicio de registro, preferencia, turno del asistente). */
    emite: (e: EventoSinSello, clave: string) => ctx.emite(e, clave),
  };
}

export type Portal = ReturnType<typeof creaPortal>;
export { ErrorPortal, type DepsPortal } from './contexto.js';
export type { EntradaAlta, ResultadoAlta } from './registro.js';
export type { EntradaReserva, ResultadoReserva, VistaCita, VistaAviso } from './citas.js';
export type { ResumenDespacho, Vinculacion } from './despacho.js';
export type { DepsWhatsApp } from './contexto.js';
export { HORA_MS } from './contexto.js';
export { LIMITE_CAMBIO_HORAS } from './citas.js';
export { edicionDelMes } from './avisos.js';
export { VERSION_PLANTILLAS, mensajeCorreo, mensajeTelegram, fechaLarga } from './plantillas.js';
