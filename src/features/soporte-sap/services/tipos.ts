/**
 * El contrato entre el runtime de laboratorio (servidor) y la interfaz. La interfaz solo PINTA lo que
 * llega aquí: las métricas vienen del corte semántico ya leídas (valor, unidad y fuente), y nada se
 * agrega en el navegador.
 */

export type Rol = 'cliente' | 'consultor' | 'superadmin' | 'experto'

/** Identidades del LABORATORIO (sin Supabase): en producción, la sesión es `auth.uid()`. */
export interface Sesion { readonly rol: Rol; readonly usuario: string; readonly nombre: string; readonly organizacion: string; readonly nivel: 'N1' | 'N2' | 'N3' }

export const SESIONES: Readonly<Record<Rol, Sesion>> = {
  cliente: { rol: 'cliente', usuario: 'usr-cliente-bajio', nombre: 'Usuaria de Alimentos del Bajío', organizacion: 'alimentos-del-bajio', nivel: 'N3' },
  consultor: { rol: 'consultor', usuario: 'usr-consultor-andina', nombre: 'Consultor de Consultora Andina', organizacion: 'andina', nivel: 'N2' },
  superadmin: { rol: 'superadmin', usuario: 'usr-superadmin', nombre: 'Superadministrador del laboratorio', organizacion: 'laboratorio', nivel: 'N1' },
  experto: { rol: 'experto', usuario: 'usr-experto', nombre: 'Experto HIL del laboratorio', organizacion: 'laboratorio', nivel: 'N1' },
}

/** `definicion` y `supuestos` del catálogo: una métrica con supuestos los enseña junto al número (AISIA §4, riesgo de baja). */
export interface Tarjeta { readonly nombre: string; readonly etiqueta: string; readonly valor: number | null; readonly unidad: string | null; readonly fuente: string; readonly definicion: string; readonly supuestos: string | null }

export interface CampoVista { readonly campo: string; readonly valor: string; readonly evidencia: string; readonly via: string; readonly confianza: number | null; readonly estado: string }
export interface AdjuntoVista { readonly nombre: string; readonly aceptado: boolean; readonly via: string | null; readonly aviso: string | null; readonly motivo: string | null; readonly campos: readonly CampoVista[] }
export interface EventoVista { readonly seq: number; readonly tipo: string; readonly actor: string; readonly fecha: string; readonly resumen: string; readonly hash: string }
export interface TramoVista { readonly desde: string; readonly hasta: string; readonly estado: string; readonly minutos: number; readonly porque: string }
export interface RelojVista {
  readonly contrato: string; readonly prioridad: string; readonly metaRespuestaMin: number | null; readonly respuestaMin: number | null
  readonly resolucionMin: number | null; readonly pausadoMin: number; readonly cumpleRespuesta: boolean | null; readonly alerta: string | null
  readonly estado: string; readonly tramos: readonly TramoVista[]
}
export interface ComprobacionVista { readonly que: string; readonly ok: boolean; readonly detalle: string }
export interface PlanVista {
  readonly version: number; readonly sha256: string; readonly pasos: readonly string[]; readonly prevision: readonly string[]; readonly cambios: readonly string[]
  readonly supervisor: { readonly resultado: string; readonly comprobaciones: readonly ComprobacionVista[] }
  readonly mensaje: string | null
  readonly decision: { readonly accion: string; readonly por: string; readonly motivo: string | null } | null
  readonly aplicado: { readonly antes: string; readonly despues: string; readonly errorAntes: boolean; readonly errorDespues: boolean } | null
}
export interface IncidenciaVista {
  readonly id: string; readonly titulo: string; readonly cliente: string; readonly prioridad: string; readonly modulo: string | null
  readonly transaccion: string | null; readonly mensaje: string | null; readonly etiquetas: readonly string[]; readonly razones: readonly string[]
  readonly consulta: { readonly tipo: string; readonly regla: string | null; readonly grado: string | null; readonly cita: string | null; readonly razon: string }
  readonly estado: string; readonly adjuntos: readonly AdjuntoVista[]; readonly cadena: readonly EventoVista[]; readonly cadenaIntegra: boolean
  readonly planes: readonly PlanVista[]; readonly sandbox: { readonly veredicto: string; readonly texto: string | null; readonly senales: readonly string[] } | null
  readonly reloj: RelojVista
}
export interface MensajeSalaVista {
  readonly id: string; readonly hilo: string | null; readonly autor: string; readonly tipoAutor: string; readonly cuerpo: string; readonly origen: string
  readonly acciones: readonly string[] | null; readonly decisiones: readonly string[]
}
export interface MensajeChatVista { readonly autor: 'humano' | 'agente'; readonly texto: string; readonly tipo: string | null; readonly fuentes: readonly string[] }
export interface PropuestaVista { readonly tipo: string; readonly titulo: string; readonly detalle: string; readonly estado: string; readonly por: string }
export interface AccionableVista {
  readonly id: string; readonly para: string; readonly titulo: string; readonly evidencia: readonly string[]; readonly formula: string
  readonly supuestos: readonly string[]; readonly bajo: number; readonly central: number; readonly alto: number; readonly confianza: string; readonly responsable: string; readonly aviso: string
}
export interface PuntoFodaVista { readonly texto: string; readonly datos: readonly string[]; readonly criterio: string }
export interface FodaVista { readonly fortalezas: readonly PuntoFodaVista[]; readonly debilidades: readonly PuntoFodaVista[]; readonly oportunidades: readonly PuntoFodaVista[]; readonly amenazas: readonly PuntoFodaVista[] }
export interface SlaVista { readonly contrato: string; readonly notas: readonly string[]; readonly metas: ReadonlyArray<{ readonly prioridad: string; readonly respuesta: string; readonly resolucion: string; readonly fuente: string }>; readonly tarjetas: readonly Tarjeta[] }
export interface GrupoTarjetas { readonly titulo: string; readonly tarjetas: readonly Tarjeta[] }

export interface Vista {
  readonly sesion: Sesion
  readonly periodo: string
  readonly versionCorte: string
  readonly incidencias: readonly IncidenciaVista[]
  readonly sala: readonly MensajeSalaVista[]
  readonly chat: readonly MensajeChatVista[]
  readonly propuestas: readonly PropuestaVista[]
  readonly tablero: readonly GrupoTarjetas[]
  readonly sla: SlaVista | null
  readonly horas: readonly Tarjeta[]
  readonly relojesDemo: ReadonlyArray<{ readonly titulo: string; readonly reloj: RelojVista }>
  readonly accionables: readonly AccionableVista[]
  readonly foda: FodaVista | null
  readonly sandbox: ReadonlyArray<{ readonly incidencia: string; readonly veredicto: string; readonly texto: string | null; readonly senales: readonly string[] }>
}

export type Accion =
  | { readonly tipo: 'decide'; readonly mensaje: string; readonly accion: 'aprobar' | 'rechazar' | 'a_revision'; readonly motivo?: string }
  | { readonly tipo: 'chat'; readonly texto: string }
  | { readonly tipo: 'espera_cliente'; readonly incidencia: string }
  | { readonly tipo: 'responde_cliente'; readonly incidencia: string }
  | { readonly tipo: 'reinicia' }
