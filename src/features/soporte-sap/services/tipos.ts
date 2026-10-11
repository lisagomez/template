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
/** `vence`: cuándo se borra el original (D8); null si el adjunto se rechazó y no se guardó. */
export interface AdjuntoVista { readonly nombre: string; readonly aceptado: boolean; readonly via: string | null; readonly aviso: string | null; readonly motivo: string | null; readonly campos: readonly CampoVista[]; readonly vence: string | null }
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
  readonly impugnaciones: readonly ImpugnacionVista[]
  /** Lo que la consultora le pidió al cliente mientras el reloj espera; null si no espera nada. */
  readonly pide: string | null
  /** Quién de la consultora lo escaló al laboratorio (DP-3), y lo que el consultor le respondió al cliente (DP-4). */
  readonly escaladaPor: string | null
  readonly respuestas: ReadonlyArray<{ readonly texto: string; readonly por: string; readonly fecha: string }>
  /** D8: la salida de su cliente está registrada, y nada de la incidencia cambia. */
  readonly congelada: boolean
  /** D13: cuánto tardó (o lleva) el laboratorio en responder lo escalado; lo ven la consultora y el laboratorio. */
  readonly respuestaLaboratorio: string | null
}
/**
 * D8: la salida de un cliente. Sin registrar, quién puede registrarla y la gracia de su contrato; registrada, quién y
 * cuándo, en qué punto va y su export (que el laboratorio no ve).
 */
export interface SalidaVista {
  readonly cliente: string; readonly nombre: string; readonly gracia: string; readonly puedeRegistrar: boolean
  readonly registrada: {
    readonly por: string; readonly fecha: string; readonly borrarDesde: string | null; readonly estado: string
    readonly export: { readonly sha256: string; readonly incidencias: number; readonly bytes: number } | null
  } | null
}
export interface MensajeSalaVista {
  readonly id: string; readonly hilo: string | null; readonly autor: string; readonly tipoAutor: string; readonly cuerpo: string; readonly origen: string
  readonly acciones: readonly string[] | null; readonly decisiones: readonly string[]
}
export interface MensajeChatVista { readonly autor: 'humano' | 'agente'; readonly texto: string; readonly tipo: string | null; readonly fuentes: readonly string[] }
/** `alcance`: «a medida de <consultora>» o «núcleo»; `id`, la enseñanza que el superadministrador puede subir al núcleo. */
/** `falta`: lo que le falta para subir al núcleo (D1), solo para el superadministrador; dice qué, nunca de quién. */
export interface PropuestaVista { readonly id: string | null; readonly alcance: string | null; readonly tipo: string; readonly titulo: string; readonly detalle: string; readonly estado: string; readonly por: string; readonly falta?: string | null }
/** El consentimiento de una organización para el núcleo común (D1): vigente desde cuándo y por quién, o null. */
export interface ConsentimientoVista { readonly organizacion: string; readonly nombre: string; readonly vigente: { readonly por: string; readonly fecha: string } | null }
export interface AccionableVista {
  readonly id: string; readonly para: string; readonly titulo: string; readonly evidencia: readonly string[]; readonly formula: string
  readonly supuestos: readonly string[]; readonly bajo: number; readonly central: number; readonly alto: number; readonly confianza: string; readonly responsable: string; readonly aviso: string
}
/** Una impugnación tal como la ven el cliente, su consultora y el laboratorio en lo escalado. */
export interface ImpugnacionVista {
  readonly id: string; readonly campo: string; readonly motivo: string; readonly por: string; readonly creada: string
  readonly estado: 'abierta' | 'aceptada' | 'rechazada'; readonly resueltaPor: string | null; readonly resuelta: string | null
}
export interface PuntoFodaVista { readonly texto: string; readonly datos: readonly string[]; readonly criterio: string; readonly confianza: 'baja' | 'media' }
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
  /** D1: el consentimiento de la propia organización y, para la consultora, el de sus clientes. Vacío en el laboratorio. */
  readonly conocimientoComun: readonly ConsentimientoVista[]
  readonly tablero: readonly GrupoTarjetas[]
  readonly sla: SlaVista | null
  readonly horas: readonly Tarjeta[]
  readonly relojesDemo: ReadonlyArray<{ readonly titulo: string; readonly reloj: RelojVista }>
  readonly accionables: readonly AccionableVista[]
  readonly foda: FodaVista | null
  readonly sandbox: ReadonlyArray<{ readonly incidencia: string; readonly veredicto: string; readonly texto: string | null; readonly senales: readonly string[] }>
  /** El presupuesto del mes que ve cada quien: el consultor el de su consultora; el superadministrador el de todas. */
  readonly presupuesto: readonly PresupuestoVista[]
  /** La ficha de servidor de cada consultora: solo el superadministrador (PRP-010, fase 3). */
  readonly fichas: readonly FichaVista[]
  /** D8: las salidas que ve cada quien. */
  readonly salidas: readonly SalidaVista[]
}

/** Una ficha de servidor: no dice «apto» sin la restauración probada en esa máquina (GATE 3). */
export interface FichaVista {
  readonly consultora: string; readonly modo: string; readonly medicion: string | null
  readonly preguntas: ReadonlyArray<{ readonly pregunta: string; readonly respuesta: string | null }>
  readonly restauracion: string | null; readonly apto: boolean; readonly faltan: readonly string[]
}

/** Tope y gastado del mes, y los avisos que dejó en la cadena (PRP-010 H-18). Los tokens del laboratorio son estimados. */
export interface PresupuestoVista {
  readonly consultora: string; readonly mes: string
  readonly topeTokens: number | null; readonly tokens: number; readonly topePaginasOcr: number | null; readonly paginasOcr: number
  readonly avisos: ReadonlyArray<{ readonly incidencia: string; readonly tipo: string; readonly aviso: string; readonly fecha: string }>
}

export type Accion =
  | { readonly tipo: 'decide'; readonly mensaje: string; readonly accion: 'aprobar' | 'rechazar' | 'a_revision'; readonly motivo?: string }
  | { readonly tipo: 'chat'; readonly texto: string }
  /** El consultor pausa el reloj diciendo qué le pide al cliente; el cliente (o su consultor) lo reanuda al responder. */
  | { readonly tipo: 'espera_cliente'; readonly incidencia: string; readonly pide: string }
  | { readonly tipo: 'responde_cliente'; readonly incidencia: string }
  /** La consultora escala al laboratorio, a su nombre (DP-3); el consultor da por resuelta la incidencia. */
  | { readonly tipo: 'escala'; readonly incidencia: string }
  /** D1: la consultora (un consultor) o el cliente consienten, o revocan, que lo aprendido de sus casos suba al núcleo. */
  | { readonly tipo: 'consiente_nucleo' }
  | { readonly tipo: 'revoca_nucleo' }
  | { readonly tipo: 'resuelve'; readonly incidencia: string }
  /** El consultor le responde al cliente: su primera respuesta para el reloj (DP-4). */
  | { readonly tipo: 'responde'; readonly incidencia: string; readonly texto: string }
  /** El superadministrador sube una enseñanza al núcleo, generalizada (PRP-010 H-19). */
  | { readonly tipo: 'al_nucleo'; readonly propuesta: string }
  /** El superadministrador fija el tope del mes de una consultora (como `ss_presupuesto_fija`). */
  | { readonly tipo: 'fija_presupuesto'; readonly consultora: string; readonly topeTokens: number | null; readonly topePaginasOcr: number | null }
  /** El cliente impugna un campo de su incidencia; la consultora la resuelve a su nombre (PRP-010 H-10). */
  | { readonly tipo: 'impugna'; readonly incidencia: string; readonly campo: 'prioridad' | 'categoria' | 'complejidad' | 'pausa' | 'resolucion'; readonly motivo: string }
  | { readonly tipo: 'resuelve_impugnacion'; readonly incidencia: string; readonly impugnacion: string; readonly decision: 'aceptada' | 'rechazada' }
  /** D8: una persona del cliente o de su consultora registra la salida del cliente (DP-2). */
  | { readonly tipo: 'registra_salida'; readonly cliente: string }
  | { readonly tipo: 'reinicia' }
