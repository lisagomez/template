/**
 * Proveedor Google Calendar por el CLI `gog` (CLI-first: es el `cli-oficial` del manifiesto de la
 * imprenta). **NO MEDIDO**: escrito contra la forma de los comandos que usa la fuente
 * (`calendar calendars|events|create|update|delete`) y la que documenta el skill google-workspace,
 * pero nunca corrido contra Google. `medido = false` hasta la prueba en vivo con una cuenta de prueba.
 *
 * Lo que `gog` no da, se declara en vez de fingirlo:
 * - sin id propio al crear → la idempotencia vive solo en el espejo (un corte de red en un `crea`
 *   no se reintenta: podria duplicar);
 * - sin lectura por id → la reparacion del espejo la hace una sincronizacion completa;
 * - sin `If-Match` → no hay concurrencia optimista: gana la ultima escritura;
 * - sin token de sync → siempre completa sobre una ventana; si el listado llega al tope, no se poda.
 *
 * La ejecucion se inyecta (`ejecuta`): las pruebas usan una falsa y `./gog/proceso` la real.
 */
import { ErrorCalendario, DESTRABA_CREDENCIAL, type CodigoError, type OpcionesError } from '../errores.js'
import type { CapacidadesProveedor, OpcionesEscritura, PaginaDeEventos, PeticionLista, Proveedor } from '../puertos.js'
import type { Calendario, DatosEvento, Evento, Notificar, RefCalendario } from '../tipos.js'
import { idInstancia } from '../instancias.js'

export type EjecutaGog = (args: string[]) => Promise<string>

interface GogFecha { dateTime?: string; date?: string; timeZone?: string }
export interface GogEvento {
  id: string
  summary?: string
  description?: string
  location?: string
  start?: GogFecha
  end?: GogFecha
  status?: string
  htmlLink?: string
  colorId?: string
  recurringEventId?: string
  originalStartTime?: GogFecha
  attendees?: Array<{ email?: string; displayName?: string; responseStatus?: string; optional?: boolean }>
  reminders?: { overrides?: Array<{ method: string; minutes: number }> }
  recurrence?: string[]
  updated?: string
  etag?: string
  transparency?: string
  visibility?: string
  extendedProperties?: { private?: Record<string, string> }
}
interface GogCalendario { id: string; summary?: string; backgroundColor?: string; accessRole?: string; timeZone?: string; primary?: boolean; hidden?: boolean }
/** `create` y `update` devuelven el evento a secas o envuelto en `event`. */
type GogEscrito = GogEvento | { event?: GogEvento }

// El vocabulario de Google y el del nucleo. De Google se lee con `segun` (lo que no esta, cae al defecto).
const ROLES: Record<string, Calendario['rol']> = { owner: 'propietario', writer: 'escritor', reader: 'lector', freeBusyReader: 'libre-ocupado' }
const RESPUESTAS: Record<string, 'pendiente' | 'acepta' | 'rechaza' | 'tal-vez'> = { needsAction: 'pendiente', accepted: 'acepta', declined: 'rechaza', tentative: 'tal-vez' }
const ESTADOS: Record<string, Evento['estado']> = { cancelled: 'cancelado', tentative: 'tentativo' }
const VISIBILIDADES: Record<string, Evento['visibilidad']> = { public: 'publica', private: 'privada', confidential: 'privada' }
const TRANSPARENCIAS: Record<string, Evento['transparencia']> = { transparent: 'libre', opaque: 'ocupado' }
const VISIBILIDAD_GOOGLE: Record<Evento['visibilidad'], string> = { publica: 'public', privada: 'private', predeterminada: 'default' }
const TRANSPARENCIA_GOOGLE: Record<Evento['transparencia'], string> = { libre: 'transparent', ocupado: 'opaque' }
const ENVIOS = { nadie: 'none', externos: 'externalOnly', todos: 'all' } as const

/** Lee un mapa sin caer en lo heredado del prototipo (`toString`, `constructor`…) si llega algo raro. */
const segun = <T>(mapa: Record<string, T>, clave: string | undefined): T | undefined =>
  clave !== undefined && Object.hasOwn(mapa, clave) ? mapa[clave] : undefined

const comoIso = (f: GogFecha | undefined): string => (f?.dateTime ? new Date(f.dateTime).toISOString() : f?.date ?? '')

function vinculosDe(privadas: Record<string, string> | undefined): Evento['vinculos'] {
  const fuera: Evento['vinculos'] = []
  for (const [k, v] of Object.entries(privadas ?? {})) {
    if (k.startsWith('vinculo:')) fuera.push({ tipo: k.slice(8), id: v })
    else if (k === 'mc_task_id') fuera.push({ tipo: 'tarea', id: v }) // lo que escribia business-os
  }
  return fuera
}

function invitadosDe(asistentes: GogEvento['attendees']): Evento['invitados'] {
  return (asistentes ?? []).filter((a) => a.email).map((a) => ({
    correo: a.email as string, nombre: a.displayName, respuesta: segun(RESPUESTAS, a.responseStatus) ?? 'pendiente', opcional: a.optional,
  }))
}

/** Un evento de `gog --json` como Evento del nucleo. */
export function normalizaGog(ref: RefCalendario, g: GogEvento, zonaCalendario: string, ahora = Date.now()): Evento {
  const todoElDia = !g.start?.dateTime
  return {
    id: g.id, cuenta: ref.cuenta, calendario: ref.calendario,
    titulo: g.summary || 'Sin titulo', descripcion: g.description ?? '', lugar: g.location ?? '',
    inicio: comoIso(g.start), fin: comoIso(g.end ?? g.start), todoElDia,
    zona: g.start?.timeZone ?? zonaCalendario,
    recurrencia: g.recurrence?.length ? g.recurrence : null,
    invitados: invitadosDe(g.attendees),
    recordatorios: (g.reminders?.overrides ?? []).map((r) => ({ metodo: r.method === 'email' ? 'correo' : 'aviso', minutos: r.minutes })),
    color: g.colorId ?? null,
    visibilidad: segun(VISIBILIDADES, g.visibility) ?? 'predeterminada',
    transparencia: segun(TRANSPARENCIAS, g.transparency) ?? (todoElDia ? 'libre' : 'ocupado'),
    vinculos: vinculosDe(g.extendedProperties?.private),
    estado: segun(ESTADOS, g.status) ?? 'confirmado',
    serie: g.recurringEventId ?? null,
    inicioOriginal: g.originalStartTime ? comoIso(g.originalStartTime) : null,
    etag: g.etag ?? `"${g.updated ?? ahora}"`,
    actualizado: g.updated ?? new Date(ahora).toISOString(),
    enlace: g.htmlLink ?? null,
  }
}

/** El borrado de `gog` no devuelve el evento: se compone la ocurrencia cancelada. */
function instanciaCancelada(serie: string, inicioOriginal: string): GogEvento {
  const instante = { dateTime: inicioOriginal }
  return {
    id: idInstancia(serie, inicioOriginal), status: 'cancelled', recurringEventId: serie,
    originalStartTime: instante, start: instante, end: instante, updated: new Date().toISOString(),
  }
}

function agrega(args: string[], bandera: string, valor: string | null | undefined): void {
  if (valor !== undefined && valor !== null && valor !== '') args.push(bandera, valor)
}

/** Las banderas de `gog calendar create|update` para lo que cambia. */
export function banderasDeEvento(d: Partial<DatosEvento>, notificar: OpcionesEscritura['notificar']): string[] {
  const a: string[] = []
  agrega(a, '--summary', d.titulo)
  agrega(a, '--from', d.inicio)
  agrega(a, '--to', d.fin)
  agrega(a, '--description', d.descripcion)
  agrega(a, '--location', d.lugar)
  agrega(a, '--attendees', d.invitados?.map((i) => i.correo).join(','))
  agrega(a, '--event-color', d.color)
  if (d.visibilidad) a.push('--visibility', VISIBILIDAD_GOOGLE[d.visibilidad])
  if (d.transparencia) a.push('--transparency', TRANSPARENCIA_GOOGLE[d.transparencia])
  a.push('--send-updates', ENVIOS[notificar])
  if (d.todoElDia) a.push('--all-day')
  for (const linea of d.recurrencia ?? []) a.push('--rrule', linea)
  for (const r of d.recordatorios ?? []) a.push('--reminder', `${r.metodo === 'correo' ? 'email' : 'popup'}:${r.minutos}m`)
  for (const v of d.vinculos ?? []) a.push('--private-prop', `vinculo:${v.tipo}=${v.id}`)
  return a
}

interface Traduccion { patron: RegExp; codigo: CodigoError; mensaje: string; extra?: OpcionesError }

/** Gana la primera que casa: el orden importa (un ENOENT con 401 en el texto sigue siendo ENOENT). */
const TRADUCCIONES: Traduccion[] = [
  { patron: /ENOENT/, codigo: 'proveedor', mensaje: 'gog no esta instalado en esta maquina', extra: { destraba: 'quien administra la maquina: instalar gog y autenticar la cuenta' } },
  { patron: /invalid_grant|unauthorized|\b401\b|token (has been )?expired/i, codigo: 'credencial', mensaje: 'invalid_grant: el token de Google caduco o fue revocado', extra: { destraba: DESTRABA_CREDENCIAL } },
  { patron: /\b412\b|precondition/i, codigo: 'conflicto', mensaje: 'el evento cambio desde que se leyo' },
  { patron: /\b410\b|fullSyncRequired/i, codigo: 'token-invalido', mensaje: 'el proveedor pide sincronizacion completa' },
  { patron: /\b409\b|duplicate/i, codigo: 'duplicado', mensaje: 'ya existe' },
  { patron: /\b429\b|rateLimitExceeded|userRateLimitExceeded/i, codigo: 'limite', mensaje: 'limite de Google alcanzado', extra: { reintentarEnMs: 2_000 } },
  { patron: /\b404\b|not ?found/i, codigo: 'no-encontrado', mensaje: 'no existe en Google' },
  { patron: /ETIMEDOUT|ECONNRESET|EAI_AGAIN|timed out/i, codigo: 'red', mensaje: 'la conexion con Google se corto' },
]

/** Del mensaje de `gog` (stderr) a un codigo que el nucleo sabe decidir. */
export function traduceErrorGog(e: unknown): ErrorCalendario {
  if (e instanceof ErrorCalendario) return e
  const m = e instanceof Error ? e.message : String(e)
  const t = TRADUCCIONES.find((x) => x.patron.test(m))
  if (t) return new ErrorCalendario(t.codigo, t.mensaje, { ...t.extra, causa: e })
  return new ErrorCalendario('proveedor', `gog fallo: ${m.slice(0, 300)}`, { causa: e })
}

export interface OpcionesGog {
  ejecuta: EjecutaGog
  /** Tope del listado: si se alcanza, el listado se marca incompleto y no se poda el espejo. */
  maximo?: number
  /** Zona de respaldo cuando un evento no trae la suya. */
  zona?: string
}

export class ProveedorGog implements Proveedor {
  readonly nombre = 'gog'
  readonly medido = false
  readonly capacidades: CapacidadesProveedor = { idPropio: false, obtienePorId: false, etagAtomico: false }
  private readonly ejecuta: EjecutaGog
  private readonly maximo: number
  private readonly zona: string

  constructor(op: OpcionesGog) {
    this.ejecuta = op.ejecuta
    this.maximo = op.maximo ?? 2_500
    this.zona = op.zona ?? 'UTC'
  }

  private async json<T>(args: string[]): Promise<T> {
    try {
      const salida = await this.ejecuta(args)
      return (salida.trim() ? JSON.parse(salida) : {}) as T
    } catch (e) {
      throw traduceErrorGog(e)
    }
  }

  private base(verbo: string, cuenta: string, ...resto: string[]): string[] {
    return ['calendar', verbo, ...resto, '--account', cuenta, '--json', '--no-input']
  }

  /** Los verbos de eventos llevan el calendario como primer argumento. */
  private enCalendario(verbo: string, ref: RefCalendario, ...resto: string[]): string[] {
    return this.base(verbo, ref.cuenta, ref.calendario, ...resto)
  }

  private async escribe(ref: RefCalendario, args: string[], zona: string): Promise<Evento> {
    const r = await this.json<GogEscrito>(args)
    return normalizaGog(ref, 'event' in r && r.event ? r.event : (r as GogEvento), zona)
  }

  private async quita(ref: RefCalendario, id: string, notificar: Notificar, alcance: string[] = []): Promise<void> {
    await this.json([...this.enCalendario('delete', ref, id), '--force', ...alcance, '--send-updates', ENVIOS[notificar]])
  }

  async calendarios(cuenta: string): Promise<Calendario[]> {
    const r = await this.json<{ calendars?: GogCalendario[] }>(this.base('calendars', cuenta))
    return (r.calendars ?? []).map((c) => ({
      cuenta, id: c.id, nombre: c.summary ?? c.id, color: c.backgroundColor ?? null, zona: c.timeZone ?? this.zona,
      rol: segun(ROLES, c.accessRole) ?? 'lector', principal: Boolean(c.primary), visible: !c.hidden,
    }))
  }

  async lista(ref: RefCalendario, p: PeticionLista): Promise<PaginaDeEventos> {
    if (!p.ventana) throw new ErrorCalendario('no-soportado', 'gog no da token de sincronizacion: el listado necesita una ventana')
    const args = this.enCalendario('events', ref, '--from', new Date(p.ventana.desde).toISOString(), '--to', new Date(p.ventana.hasta).toISOString(), '--max', String(this.maximo))
    const crudos = (await this.json<{ events?: GogEvento[] }>(args)).events ?? []
    return { eventos: crudos.map((g) => normalizaGog(ref, g, this.zona)), siguientePagina: null, tokenSync: null, completo: crudos.length < this.maximo }
  }

  async obtiene(): Promise<Evento | null> {
    throw new ErrorCalendario('no-soportado', 'gog no tiene una lectura por id verificada: la reparacion la hace una sincronizacion completa')
  }

  async crea(ref: RefCalendario, d: DatosEvento, op: OpcionesEscritura): Promise<Evento> {
    return this.escribe(ref, [...this.enCalendario('create', ref), ...banderasDeEvento(d, op.notificar)], d.zona)
  }

  async actualiza(ref: RefCalendario, id: string, d: Partial<DatosEvento>, op: OpcionesEscritura): Promise<Evento> {
    return this.escribe(ref, [...this.enCalendario('update', ref, id), ...banderasDeEvento(d, op.notificar)], d.zona ?? this.zona)
  }

  async modificaInstancia(ref: RefCalendario, serie: string, inicioOriginal: string, d: Partial<DatosEvento>, op: OpcionesEscritura): Promise<Evento> {
    const alcance = ['--scope', 'single', '--original-start', inicioOriginal]
    if (d.estado === 'cancelado') {
      await this.quita(ref, serie, op.notificar, alcance)
      return normalizaGog(ref, instanciaCancelada(serie, inicioOriginal), this.zona)
    }
    return this.escribe(ref, [...this.enCalendario('update', ref, serie), ...banderasDeEvento(d, op.notificar), ...alcance], d.zona ?? this.zona)
  }

  async borra(ref: RefCalendario, id: string, op: OpcionesEscritura): Promise<void> {
    await this.quita(ref, id, op.notificar)
  }
}
