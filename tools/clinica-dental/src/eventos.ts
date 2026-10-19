/**
 * EL CONTRATO DE EVENTOS, version 2 (la 1, con WhatsApp: SOLO cambios aditivos, asi que un evento v1 sigue
 * siendo valido y el libro del laboratorio del 2026-10-16 se sigue verificando con este codigo). Todo lo que el portal registra pasa por aqui; dbt, MetricFlow, el grafo
 * de atencion y el dataLayer leen esto y nada mas.
 *
 * Reglas que el esquema hace cumplir (no una convencion):
 *  - **Ningun evento lleva PII ni texto libre.** Cada campo es un enum, un numero, un instante o un
 *    identificador con forma fija (prefijo + hex): un nombre, un correo o un celular no caben en ninguno.
 *    Los objetos son `.strict()`: un campo de mas se rechaza, no se ignora.
 *  - **La persona es un seudonimo**: `pac_` + HMAC (paciente registrado) o `vis_` + azar (visitante).
 *  - **La categoria y el servicio son datos de salud frente a un tercero**: viajan en el libro interno y
 *    NUNCA en el dataLayer (`datalayer.ts` lo hace cumplir con una lista de permitidos).
 *  - El turno del asistente lleva intencion, ruta, latencia y costo; **nunca lo que se dijo**.
 *
 * Cambiar este archivo es cambiar el contrato: se sube `VERSION_CONTRATO` y dbt se ajusta en el mismo cambio.
 *
 * v2 (2026-10-19, canal WhatsApp): `whatsapp` como canal de aviso y consentimiento; motivos de fallo de Meta; `via`
 * en reprogramar/cancelar y `canal` en el turno del asistente y la urgencia (opcionales: un v1 no los trae); y
 * los tipos `whatsapp_vinculo`, `aviso_leido`, `asistencia_confirmada`, `whatsapp_entrante`, `whatsapp_cobro` y
 * `recepcion_atiende`. El numero de telefono NUNCA viaja: la persona sigue siendo `pac_`/`vis_`.
 */
import { z } from 'zod';
import { CATEGORIAS } from './clinicas.js';

export const VERSION_CONTRATO = 2 as const;
/** Versiones que este codigo lee: la 2 es un superconjunto de la 1. */
export const VERSIONES_LEIDAS = [1, 2] as const;

export const reSeudonimoPaciente = /^pac_[0-9a-f]{20}$/;
export const reVisitante = /^vis_[0-9a-f]{20}$/;
const hexId = (prefijo: string) => z.string().regex(new RegExp(`^${prefijo}_[0-9a-f]{16,24}$`));

export const sujeto = z.string().regex(/^(pac|vis)_[0-9a-f]{20}$/);
const paciente = z.string().regex(reSeudonimoPaciente);
const visitante = z.string().regex(reVisitante);
const idCita = hexId('cit');
const idAviso = hexId('avi');
const idConversacion = hexId('cnv');
const instante = z.string().datetime({ offset: false });
const idCorto = z.string().regex(/^[a-z][a-z0-9-]{1,40}$/);

export const CANALES_AVISO = ['correo', 'telegram', 'whatsapp'] as const;
export const CLASES_AVISO = ['confirmacion', 'recordatorio_24h', 'recordatorio_2h', 'cancelacion', 'newsletter'] as const;
export const CANALES_ADQUISICION = ['busqueda', 'redes', 'referido', 'convenio', 'directo'] as const;
export const TIPOS_CONSENTIMIENTO = ['aviso_privacidad', 'datos_salud', 'recordatorios', 'newsletter', 'telegram', 'tutor', 'whatsapp'] as const;
export const MOTIVOS_FALLO = ['rebote', 'bot_no_iniciado', 'sin_vincular', 'limite', 'otro', 'no_whatsapp', 'plantilla', 'fuera_de_ventana', 'canal_desconectado'] as const;
export const CANALES_CONVERSACION = ['portal', 'whatsapp'] as const;
export const PASOS_VINCULO = ['codigo_emitido', 'mensaje_recibido', 'confirmado', 'rechazado', 'desvinculado'] as const;
export const TIPOS_MENSAJE_WA = ['texto', 'boton', 'interactivo', 'flow', 'audio', 'imagen', 'otro'] as const;
export const MANEJOS_WA = ['asistente', 'vinculacion', 'boton', 'flow', 'foto', 'otro_medio', 'nota_voz_ilegible', 'baja', 'recepcion', 'silenciado', 'frontera'] as const;
export const RUTAS_ASISTENTE = ['enrutador', 'cerebro', 'urgencia', 'barrera'] as const;
export const INTENCIONES = [
  'mis_citas', 'agendar', 'cancelar', 'reprogramar', 'horario', 'ubicacion', 'precios', 'servicios', 'preparacion', 'politicas',
  'promociones', 'conversacion', 'fuera_de_dominio', 'diagnostico', 'urgencia', 'inyeccion', 'accion_no_permitida', 'error',
] as const;

export type CanalAviso = (typeof CANALES_AVISO)[number];
export type ClaseAviso = (typeof CLASES_AVISO)[number];
export type CanalAdquisicion = (typeof CANALES_ADQUISICION)[number];
export type TipoConsentimiento = (typeof TIPOS_CONSENTIMIENTO)[number];
export type RutaAsistente = (typeof RUTAS_ASISTENTE)[number];
export type MotivoFallo = (typeof MOTIVOS_FALLO)[number];
export type CanalConversacion = (typeof CANALES_CONVERSACION)[number];
export type ManejoWa = (typeof MANEJOS_WA)[number];
export type TipoMensajeWa = (typeof TIPOS_MENSAJE_WA)[number];
export type Intencion = (typeof INTENCIONES)[number];

const base = {
  v: z.union([z.literal(1), z.literal(VERSION_CONTRATO)]),
  id: hexId('evt'),
  en: instante,
  clinica: idCorto,
};

const ev = <T extends string, S extends z.ZodRawShape>(tipo: T, forma: S) => z.object({ ...base, tipo: z.literal(tipo), ...forma }).strict();

export const esquemaEvento = z.discriminatedUnion('tipo', [
  ev('portal_visitado', { sujeto: visitante, canal_adquisicion: z.enum(CANALES_ADQUISICION), dispositivo: z.enum(['escritorio', 'celular']) }),
  ev('registro_iniciado', { sujeto: visitante, via: z.enum(['escrito', 'voz']) }),
  ev('paciente_registrado', {
    sujeto: paciente, visitante: visitante.nullable(), via: z.enum(['escrito', 'voz']), menor: z.boolean(), convenio: z.boolean(),
    categorias: z.array(z.enum(CATEGORIAS)).min(1).max(4), canal_adquisicion: z.enum(CANALES_ADQUISICION), segundos_registro: z.number().int().min(0).nullable(),
  }),
  ev('consentimiento_otorgado', { sujeto: paciente, consentimiento: z.enum(TIPOS_CONSENTIMIENTO), version_aviso: idCorto }),
  ev('consentimiento_retirado', { sujeto: paciente, consentimiento: z.enum(TIPOS_CONSENTIMIENTO), version_aviso: idCorto }),
  ev('cita_solicitada', { sujeto: paciente, cita: idCita, categoria: z.enum(CATEGORIAS), servicio: idCorto }),
  ev('cita_confirmada', {
    sujeto: paciente, cita: idCita, categoria: z.enum(CATEGORIAS), servicio: idCorto, inicio: instante, duracion_min: z.number().int().positive(),
    anticipacion_horas: z.number().min(0), canales: z.array(z.enum(CANALES_AVISO)).max(3), via: z.enum(['portal', 'asistente', 'whatsapp']),
  }),
  ev('cita_reprogramada', { sujeto: paciente, cita: idCita, cita_anterior: idCita, inicio_anterior: instante, inicio_nuevo: instante, via: z.enum(['portal', 'whatsapp']).optional() }),
  ev('cita_cancelada', { sujeto: paciente, cita: idCita, motivo: z.enum(['paciente', 'clinica', 'reprogramada']), horas_antes: z.number(), via: z.enum(['portal', 'whatsapp']).optional() }),
  ev('cita_asistencia', { sujeto: paciente, cita: idCita, asistio: z.boolean(), simulada: z.literal(true) }),
  ev('aviso_programado', {
    sujeto: paciente, aviso: idAviso, cita: idCita.nullable(), canal: z.enum(CANALES_AVISO), clase: z.enum(CLASES_AVISO), para: instante,
  }),
  ev('aviso_enviado', { sujeto: paciente, aviso: idAviso, canal: z.enum(CANALES_AVISO), clase: z.enum(CLASES_AVISO), intento: z.number().int().min(1) }),
  ev('aviso_entregado', { sujeto: paciente, aviso: idAviso, canal: z.enum(CANALES_AVISO), clase: z.enum(CLASES_AVISO), costo_usd: z.number().min(0).nullable() }),
  ev('aviso_fallido', {
    sujeto: paciente, aviso: idAviso, canal: z.enum(CANALES_AVISO), clase: z.enum(CLASES_AVISO),
    motivo: z.enum(MOTIVOS_FALLO), definitivo: z.boolean(),
  }),
  ev('aviso_cancelado', { sujeto: paciente, aviso: idAviso, canal: z.enum(CANALES_AVISO), clase: z.enum(CLASES_AVISO), motivo: z.enum(['cita_cancelada', 'cita_reprogramada', 'baja', 'consentimiento_retirado']) }),
  ev('newsletter_baja', { sujeto: paciente, via: z.enum(['un_clic', 'enlace', 'portal']) }),
  ev('telegram_vinculado', { sujeto: paciente }),
  ev('asistente_turno', {
    sujeto, conversacion: idConversacion, modo: z.enum(['texto', 'voz']), ruta: z.enum(RUTAS_ASISTENTE), intencion: z.enum(INTENCIONES),
    latencia_ms: z.number().int().min(0), costo_usd: z.number().min(0).nullable(), tokens_entrada: z.number().int().min(0).nullable(),
    tokens_salida: z.number().int().min(0).nullable(), uso_padecimiento: z.boolean(), canal: z.enum(CANALES_CONVERSACION).optional(),
  }),
  ev('urgencia_derivada', { sujeto, conversacion: idConversacion, regla: z.string().regex(/^U\d{1,2}$/), destino: z.enum(['emergencias_911', 'clinica_hoy']), canal: z.enum(CANALES_CONVERSACION).optional() }),
  ev('preferencia_cambiada', { sujeto, preferencia: z.enum(['voz', 'chatbot']), habilitado: z.boolean() }),
  // ── v2: WhatsApp ──────────────────────────────────────────────────────────────────────────────────────────
  /** El embudo de la vinculacion: codigo emitido → mensaje recibido de un numero → confirmado (o rechazado) en la cuenta. */
  ev('whatsapp_vinculo', { sujeto: paciente, paso: z.enum(PASOS_VINCULO), coincide_celular: z.boolean().nullable() }),
  ev('aviso_leido', { sujeto: paciente, aviso: idAviso, canal: z.enum(CANALES_AVISO), clase: z.enum(CLASES_AVISO) }),
  ev('asistencia_confirmada', { sujeto: paciente, cita: idCita, canal: z.enum(['whatsapp']) }),
  /** Cada mensaje que entra por WhatsApp y como se atendio. Ni el texto ni el numero: solo su forma. */
  ev('whatsapp_entrante', { sujeto, conversacion: idConversacion, tipo_mensaje: z.enum(TIPOS_MENSAJE_WA), manejo: z.enum(MANEJOS_WA), vinculado: z.boolean() }),
  /** Lo que Meta cobra por un mensaje saliente (llega en el estado del mensaje): la cifra del unit economics. */
  ev('whatsapp_cobro', {
    sujeto, categoria: z.enum(['utility', 'service', 'marketing', 'authentication']), tipo_precio: z.enum(['regular', 'free_customer_service', 'free_entry_point']),
    billable: z.boolean(), costo_usd: z.number().min(0).nullable(), mensaje: z.enum(['aviso', 'respuesta']),
  }),
  ev('recepcion_atiende', { sujeto, conversacion: idConversacion, motivo: z.enum(['eco_de_recepcion', 'pedido_del_paciente']) }),
]);

export type Evento = z.infer<typeof esquemaEvento>;
export type TipoEvento = Evento['tipo'];
export const TIPOS_EVENTO = esquemaEvento.options.map((o) => o.shape.tipo.value) as readonly TipoEvento[];

/** Lo que el emisor pone; `v`, `id` y `en` los pone el libro. */
export type EventoSinSello = Evento extends infer E ? (E extends Evento ? Omit<E, 'v' | 'id' | 'en'> : never) : never;

export function validaEvento(e: unknown): { ok: true; evento: Evento } | { ok: false; error: string } {
  const r = esquemaEvento.safeParse(e);
  return r.success ? { ok: true, evento: r.data } : { ok: false, error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
}
