/**
 * Lo que el nucleo NO sabe hacer solo y se le inyecta: el proveedor de calendario (Google por `gog`,
 * el simulador), el almacen del espejo (memoria, archivo, Supabase), el reloj y el origen de los
 * trabajos programados. El nucleo no importa React, ni Next, ni Supabase: solo estos contratos.
 */
import type { Calendario, DatosEvento, Evento, Notificar, RefCalendario, Ventana } from './tipos.js'

export interface Reloj {
  ahora(): number
  espera(ms: number): Promise<void>
}

export const relojDelSistema: Reloj = {
  ahora: () => Date.now(),
  espera: (ms) => new Promise((r) => setTimeout(r, ms)),
}

export interface PeticionLista {
  /** Token de sincronizacion incremental; null = listado completo. */
  token?: string | null
  pagina?: string | null
  /** Solo en el listado completo: acota a una ventana (lo que exige un proveedor sin token). */
  ventana?: Ventana | null
}

export interface PaginaDeEventos {
  /** En incremental incluye los borrados (`estado: 'cancelado'`), para quitarlos del espejo. */
  eventos: Evento[]
  siguientePagina: string | null
  /** Solo en la ultima pagina. null si el proveedor no da tokens (entonces siempre es completo). */
  tokenSync: string | null
  /** false si el proveedor corto el listado: entonces NO se poda el espejo (la fuente borraba de mas). */
  completo: boolean
}

export interface OpcionesEscritura {
  notificar: Notificar
  /** Concurrencia optimista: si el etag del proveedor no es este, falla con `conflicto`. */
  siEtag?: string | null
}

export interface CapacidadesProveedor {
  /** Acepta un id propuesto al crear (idempotencia en el proveedor: un reintento choca con 409). */
  idPropio: boolean
  /** Puede leer un evento por id (lo necesitan la reparacion y el 409). */
  obtienePorId: boolean
  /** Compara el etag en la misma operacion (si no, el adaptador compara y escribe en dos pasos). */
  etagAtomico: boolean
}

export interface Proveedor {
  readonly nombre: string
  /** false = adaptador escrito pero nunca corrido contra el servicio real. */
  readonly medido: boolean
  readonly capacidades: CapacidadesProveedor
  calendarios(cuenta: string): Promise<Calendario[]>
  lista(ref: RefCalendario, peticion: PeticionLista): Promise<PaginaDeEventos>
  obtiene(ref: RefCalendario, id: string): Promise<Evento | null>
  crea(ref: RefCalendario, datos: DatosEvento, opciones: OpcionesEscritura & { id?: string }): Promise<Evento>
  actualiza(ref: RefCalendario, id: string, datos: Partial<DatosEvento>, opciones: OpcionesEscritura): Promise<Evento>
  /** Crea o cambia la excepcion de UNA ocurrencia (con `estado: 'cancelado'` la quita). */
  modificaInstancia(ref: RefCalendario, serie: string, inicioOriginal: string, datos: Partial<DatosEvento>, opciones: OpcionesEscritura): Promise<Evento>
  borra(ref: RefCalendario, id: string, opciones: OpcionesEscritura): Promise<void>
}

export interface ErrorDeSync { codigo: string; mensaje: string; destraba: string | null }

export interface EstadoSync extends RefCalendario {
  token: string | null
  ultimaSync: number | null
  ultimoIntento: number | null
  error: ErrorDeSync | null
}

/** Lo que la pluma anota ANTES de tocar el proveedor: si algo se cae a medias, se sabe que reparar. */
export interface Intencion extends RefCalendario {
  clave: string
  operacion: 'crea' | 'actualiza' | 'instancia' | 'serie' | 'borra'
  /** Ids que hay que releer del proveedor para reparar el espejo. */
  ids: string[]
  creada: number
}

export interface ResultadoGuardado { clave: string; ids: string[]; borrados: string[] }

export type EstadoReserva = 'tentativa' | 'confirmada' | 'liberada'

export interface Reserva {
  id: string
  /** Donde se agenda: `claveCalendario(ref)`. */
  recurso: string
  clave: string
  inicio: number
  fin: number
  /** Lo que ocupa con margenes: [inicio - antes, fin + despues). Dos reservas no pueden solaparse aqui. */
  bloqueDesde: number
  bloqueHasta: number
  estado: EstadoReserva
  expira: number | null
  /** Referencia opaca del consumidor (un id de conversacion, de lead…), nunca los datos de la persona. */
  referencia: string
  evento: string | null
  creada: number
}

export interface Almacen {
  calendarios(): Promise<Calendario[]>
  guardaCalendarios(calendarios: Calendario[]): Promise<void>
  /** Sueltos que tocan la ventana + TODAS las series y excepciones de esos calendarios. */
  eventos(refs: RefCalendario[], ventana: Ventana): Promise<Evento[]>
  evento(ref: RefCalendario, id: string): Promise<Evento | null>
  excepciones(ref: RefCalendario, serie: string): Promise<Evento[]>
  guardaEventos(eventos: Evento[]): Promise<void>
  borraEventos(ref: RefCalendario, ids: string[]): Promise<void>
  /** Sync completa: deja el calendario exactamente como `eventos` (dentro de la ventana, si la hay). */
  reemplazaCalendario(ref: RefCalendario, eventos: Evento[], ventana: Ventana | null): Promise<void>
  estadoSync(ref: RefCalendario): Promise<EstadoSync | null>
  guardaEstadoSync(estado: EstadoSync): Promise<void>
  anotaIntencion(intencion: Intencion): Promise<void>
  intenciones(): Promise<Intencion[]>
  /** Cierra la intencion y guarda el resultado bajo su clave (idempotencia). */
  cierraIntencion(clave: string, resultado: ResultadoGuardado | null): Promise<void>
  resultado(clave: string): Promise<ResultadoGuardado | null>
  reservas(recurso: string, ventana: Ventana): Promise<Reserva[]>
  reserva(id: string): Promise<Reserva | null>
  reservaPorClave(clave: string): Promise<Reserva | null>
  /** ATOMICO: inserta si ningun bloque vigente se solapa. Vigente = confirmada, o tentativa no expirada. */
  reservaSiLibre(reserva: Reserva, ahora: number): Promise<boolean>
  actualizaReserva(reserva: Reserva): Promise<void>
}

export interface TrabajoProgramado {
  id: string
  nombre: string
  /** Cron de 5 campos: minuto hora dia-del-mes mes dia-de-la-semana. */
  expresion: string
  zona: string
  pausado: boolean
  grupo: string | null
  duracionMin: number
}

export interface OrigenDeTrabajos {
  trabajos(): Promise<TrabajoProgramado[]>
}
