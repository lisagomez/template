/**
 * Del contrato de eventos al `dataLayer` de Google Tag Manager, con consent mode v2.
 *
 *  - **Consentimiento denegado por defecto** en los cuatro parametros de v2 (`ad_storage`,
 *    `analytics_storage`, `ad_user_data`, `ad_personalization`). El `consent default` va ANTES que nada.
 *  - **El contenedor solo se carga con un ID valido Y el consentimiento de analitica.** Sin ID (el laboratorio)
 *    no hay contenedor: se prueba el `dataLayer`, no Google.
 *  - **Lista de permitidos, no de prohibidos.** Solo salen los eventos de producto de esta tabla y solo sus
 *    campos declarados. Nunca el seudonimo (un identificador estable es dato personal frente a un tercero),
 *    nunca la categoria ni el servicio (dato de salud frente a un tercero), nunca la edad ni el convenio.
 */
import type { Evento, TipoEvento } from './eventos.js';

export type EstadoConsentimiento = 'granted' | 'denied';
export interface ConsentimientoGtm {
  ad_storage: EstadoConsentimiento;
  analytics_storage: EstadoConsentimiento;
  ad_user_data: EstadoConsentimiento;
  ad_personalization: EstadoConsentimiento;
}

export const CONSENTIMIENTO_POR_DEFECTO: Readonly<ConsentimientoGtm> = Object.freeze({
  ad_storage: 'denied',
  analytics_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
});
/** Cuanto espera GTM a que el banner actualice antes de disparar etiquetas. */
export const ESPERA_ACTUALIZACION_MS = 500;

/** Lo que la persona elige en el banner: solo analitica; la publicidad no se ofrece en un portal de salud. */
export function consentimientoDesdeEleccion(analitica: boolean): ConsentimientoGtm {
  return { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: analitica ? 'granted' : 'denied' };
}

export const reIdGtm = /^GTM-[A-Z0-9]{4,10}$/;
export function debeCargarContenedor(idGtm: string | undefined, c: ConsentimientoGtm): boolean {
  return Boolean(idGtm && reIdGtm.test(idGtm)) && c.analytics_storage === 'granted';
}

export type ValorDataLayer = string | number | boolean;
export type EventoDataLayer = { event: string } & Record<string, ValorDataLayer>;

const anticipacion = (h: number): string => (h < 24 ? 'menos_de_1_dia' : h < 24 * 7 ? '1_a_7_dias' : 'mas_de_7_dias');

const MAPEO: Partial<{ [T in TipoEvento]: (e: Extract<Evento, { tipo: T }>) => EventoDataLayer }> = {
  portal_visitado: (e) => ({ event: 'clinica_portal_visitado', clinica: e.clinica, dispositivo: e.dispositivo, canal_adquisicion: e.canal_adquisicion }),
  registro_iniciado: (e) => ({ event: 'clinica_registro_iniciado', clinica: e.clinica, via: e.via }),
  paciente_registrado: (e) => ({ event: 'clinica_registro_completado', clinica: e.clinica, via: e.via, canal_adquisicion: e.canal_adquisicion }),
  cita_confirmada: (e) => ({ event: 'clinica_cita_confirmada', clinica: e.clinica, canales_aviso: e.canales.length, anticipacion: anticipacion(e.anticipacion_horas) }),
  cita_cancelada: (e) => ({ event: 'clinica_cita_cancelada', clinica: e.clinica }),
  preferencia_cambiada: (e) => ({ event: 'clinica_preferencia', clinica: e.clinica, preferencia: e.preferencia, habilitado: e.habilitado }),
};

/** Las claves que pueden aparecer en un evento del dataLayer, sean del evento que sean. */
export const CLAVES_PERMITIDAS = new Set(['event', 'clinica', 'dispositivo', 'canal_adquisicion', 'via', 'canales_aviso', 'anticipacion', 'preferencia', 'habilitado']);

/** El evento para el dataLayer, o `null` si ese tipo no sale. Cualquier clave fuera de la lista se tira. */
export function aDataLayer(e: Evento): EventoDataLayer | null {
  const f = MAPEO[e.tipo] as ((x: Evento) => EventoDataLayer) | undefined;
  if (!f) return null;
  const crudo = f(e);
  return Object.fromEntries(Object.entries(crudo).filter(([k]) => CLAVES_PERMITIDAS.has(k))) as EventoDataLayer;
}

export const TIPOS_EN_DATALAYER = Object.keys(MAPEO) as TipoEvento[];

/** Busca valores sembrados (nombres, correos, celulares, padecimientos) en cualquier carga serializable. */
export function buscaSembrados(carga: unknown, sembrados: readonly string[]): string[] {
  const texto = JSON.stringify(carga).toLowerCase();
  return sembrados.filter((s) => s.trim().length >= 4 && texto.includes(s.trim().toLowerCase()));
}
