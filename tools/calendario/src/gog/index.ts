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
import { ErrorCalendario, DESTRABA_CREDENCIAL } from '../errores.js'
import type { CapacidadesProveedor, OpcionesEscritura, PaginaDeEventos, PeticionLista, Proveedor } from '../puertos.js'
import type { Calendario, DatosEvento, Evento, RefCalendario } from '../tipos.js'
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

const ROLES: Record<string, Calendario['rol']> = { owner: 'propietario', writer: 'escritor', reader: 'lector', freeBusyReader: 'libre-ocupado' }
const RESPUESTAS: Record<string, 'pendiente' | 'acepta' | 'rechaza' | 'tal-vez'> = { needsAction: 'pendiente', accepted: 'acepta', declined: 'rechaza', tentative: 'tal-vez' }
const ENVIOS = { nadie: 'none', externos: 'externalOnly', todos: 'all' } as const

const comoIso = (f: GogFecha | undefined): string => (f?.dateTime ? new Date(f.dateTime).toISOString() : f?.date ?? '')

function vinculosDe(privadas: Record<string, string> | undefined): Evento['vinculos'] {
  const fuera: Evento['vinculos'] = []
  for (const [k, v] of Object.entries(privadas ?? {})) {
    if (k.startsWith('vinculo:')) fuera.push({ tipo: k.slice(8), id: v })
    else if (k === 'mc_task_id') fuera.push({ tipo: 'tarea', id: v }) // lo que escribia business-os
  }
  return fuera
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
    invitados: (g.attendees ?? []).filter((a) => a.email).map((a) => ({ correo: a.email as string, nombre: a.displayName, respuesta: RESPUESTAS[a.responseStatus ?? ''] ?? 'pendiente', opcional: a.optional })),
    recordatorios: (g.reminders?.overrides ?? []).map((r) => ({ metodo: r.method === 'email' ? 'correo' : 'aviso', minutos: r.minutes })),
    color: g.colorId ?? null,
    visibilidad: g.visibility === 'public' ? 'publica' : g.visibility === 'private' || g.visibility === 'confidential' ? 'privada' : 'predeterminada',
    transparencia: g.transparency === 'transparent' ? 'libre' : g.transparency === 'opaque' ? 'ocupado' : todoElDia ? 'libre' : 'ocupado',
    vinculos: vinculosDe(g.extendedProperties?.private),
    estado: g.status === 'cancelled' ? 'cancelado' : g.status === 'tentative' ? 'tentativo' : 'confirmado',
    serie: g.recurringEventId ?? null,
    inicioOriginal: g.originalStartTime ? comoIso(g.originalStartTime) : null,
    etag: g.etag ?? `"${g.updated ?? ahora}"`,
    actualizado: g.updated ?? new Date(ahora).toISOString(),
    enlace: g.htmlLink ?? null,
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
  if (d.visibilidad) a.push('--visibility', d.visibilidad === 'publica' ? 'public' : d.visibilidad === 'privada' ? 'private' : 'default')
  if (d.transparencia) a.push('--transparency', d.transparencia === 'libre' ? 'transparent' : 'opaque')
  a.push('--send-updates', ENVIOS[notificar])
  if (d.todoElDia) a.push('--all-day')
  for (const linea of d.recurrencia ?? []) a.push('--rrule', linea)
  for (const r of d.recordatorios ?? []) a.push('--reminder', `${r.metodo === 'correo' ? 'email' : 'popup'}:${r.minutos}m`)
  for (const v of d.vinculos ?? []) a.push('--private-prop', `vinculo:${v.tipo}=${v.id}`)
  return a
}

/** Del mensaje de `gog` (stderr) a un codigo que el nucleo sabe decidir. */
export function traduceErrorGog(e: unknown): ErrorCalendario {
  const m = e instanceof Error ? e.message : String(e)
  if (e instanceof ErrorCalendario) return e
  if (/ENOENT/.test(m)) return new ErrorCalendario('proveedor', 'gog no esta instalado en esta maquina', { destraba: 'quien administra la maquina: instalar gog y autenticar la cuenta', causa: e })
  if (/invalid_grant|unauthorized|\b401\b|token (has been )?expired/i.test(m)) return new ErrorCalendario('credencial', 'invalid_grant: el token de Google caduco o fue revocado', { destraba: DESTRABA_CREDENCIAL, causa: e })
  if (/\b412\b|precondition/i.test(m)) return new ErrorCalendario('conflicto', 'el evento cambio desde que se leyo', { causa: e })
  if (/\b410\b|fullSyncRequired/i.test(m)) return new ErrorCalendario('token-invalido', 'el proveedor pide sincronizacion completa', { causa: e })
  if (/\b409\b|duplicate/i.test(m)) return new ErrorCalendario('duplicado', 'ya existe', { causa: e })
  if (/\b429\b|rateLimitExceeded|userRateLimitExceeded/i.test(m)) return new ErrorCalendario('limite', 'limite de Google alcanzado', { causa: e, reintentarEnMs: 2_000 })
  if (/\b404\b|not ?found/i.test(m)) return new ErrorCalendario('no-encontrado', 'no existe en Google', { causa: e })
  if (/ETIMEDOUT|ECONNRESET|EAI_AGAIN|timed out/i.test(m)) return new ErrorCalendario('red', 'la conexion con Google se corto', { causa: e })
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

  private base(verbo: string, ref: RefCalendario, ...resto: string[]): string[] {
    return ['calendar', verbo, ...resto, '--account', ref.cuenta, '--json', '--no-input']
  }

  async calendarios(cuenta: string): Promise<Calendario[]> {
    const r = await this.json<{ calendars?: GogCalendario[] }>(['calendar', 'calendars', '--account', cuenta, '--json', '--no-input'])
    return (r.calendars ?? []).map((c) => ({
      cuenta, id: c.id, nombre: c.summary ?? c.id, color: c.backgroundColor ?? null, zona: c.timeZone ?? this.zona,
      rol: ROLES[c.accessRole ?? ''] ?? 'lector', principal: Boolean(c.primary), visible: !c.hidden,
    }))
  }

  async lista(ref: RefCalendario, p: PeticionLista): Promise<PaginaDeEventos> {
    if (!p.ventana) throw new ErrorCalendario('no-soportado', 'gog no da token de sincronizacion: el listado necesita una ventana')
    const args = this.base('events', ref, ref.calendario, '--from', new Date(p.ventana.desde).toISOString(), '--to', new Date(p.ventana.hasta).toISOString(), '--max', String(this.maximo))
    const r = await this.json<{ events?: GogEvento[] }>(args)
    const crudos = r.events ?? []
    return { eventos: crudos.map((g) => normalizaGog(ref, g, this.zona)), siguientePagina: null, tokenSync: null, completo: crudos.length < this.maximo }
  }

  async obtiene(): Promise<Evento | null> {
    throw new ErrorCalendario('no-soportado', 'gog no tiene una lectura por id verificada: la reparacion la hace una sincronizacion completa')
  }

  async crea(ref: RefCalendario, d: DatosEvento, op: OpcionesEscritura): Promise<Evento> {
    const r = await this.json<GogEvento | { event?: GogEvento }>([...this.base('create', ref, ref.calendario), ...banderasDeEvento(d, op.notificar)])
    return normalizaGog(ref, 'event' in r && r.event ? r.event : (r as GogEvento), d.zona)
  }

  async actualiza(ref: RefCalendario, id: string, d: Partial<DatosEvento>, op: OpcionesEscritura): Promise<Evento> {
    const r = await this.json<GogEvento | { event?: GogEvento }>([...this.base('update', ref, ref.calendario, id), ...banderasDeEvento(d, op.notificar)])
    return normalizaGog(ref, 'event' in r && r.event ? r.event : (r as GogEvento), d.zona ?? this.zona)
  }

  async modificaInstancia(ref: RefCalendario, serie: string, inicioOriginal: string, d: Partial<DatosEvento>, op: OpcionesEscritura): Promise<Evento> {
    const alcance = ['--scope', 'single', '--original-start', inicioOriginal]
    if (d.estado === 'cancelado') {
      await this.json([...this.base('delete', ref, ref.calendario, serie), '--force', ...alcance, '--send-updates', ENVIOS[op.notificar]])
      const ahora = new Date().toISOString()
      return normalizaGog(ref, { id: idInstancia(serie, inicioOriginal), status: 'cancelled', recurringEventId: serie, originalStartTime: { dateTime: inicioOriginal }, start: { dateTime: inicioOriginal }, end: { dateTime: inicioOriginal }, updated: ahora }, this.zona)
    }
    const r = await this.json<GogEvento | { event?: GogEvento }>([...this.base('update', ref, ref.calendario, serie), ...banderasDeEvento(d, op.notificar), ...alcance])
    return normalizaGog(ref, 'event' in r && r.event ? r.event : (r as GogEvento), d.zona ?? this.zona)
  }

  async borra(ref: RefCalendario, id: string, op: OpcionesEscritura): Promise<void> {
    await this.json([...this.base('delete', ref, ref.calendario, id), '--force', '--send-updates', ENVIOS[op.notificar]])
  }
}
