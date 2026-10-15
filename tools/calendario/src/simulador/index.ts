/**
 * Simulador de Google Calendar con su contrato, no un mock que siempre dice que si:
 *
 * - etag por version y `siEtag` → `conflicto` (el 412 de Google);
 * - id propio al crear y `duplicado` si ya existe (el 409: lo que hace idempotente un reintento);
 * - token de sync incremental que incluye los borrados, y `token-invalido` tras `invalidaTokens()` (el 410);
 * - paginacion (`tamanoPagina`), series con excepciones y canceladas como en `singleEvents=false`;
 * - fallas programables (`limite` con `reintentarEnMs`, `red`…) y `caducaCredencial()` (el `invalid_grant`);
 * - un registro de NOTIFICACIONES: cada correo que Google mandaria a un invitado queda aqui, para
 *   poder demostrar que por defecto no se manda ninguno.
 */
import { ErrorCalendario, DESTRABA_CREDENCIAL, type CodigoError } from '../errores.js'
import { esquemaDatosEvento, claveCalendario, puedeEscribir, type Calendario, type DatosEvento, type EntradaEvento, type Evento, type RefCalendario } from '../tipos.js'
import type { OpcionesEscritura, PaginaDeEventos, PeticionLista, Proveedor, Reloj } from '../puertos.js'
import { relojDelSistema } from '../puertos.js'
import { esOcurrencia, parseaRecurrencia } from '../recurrencia.js'
import { idInstancia, limites, ocurrenciaDe } from '../instancias.js'

type Op = 'calendarios' | 'lista' | 'obtiene' | 'crea' | 'actualiza' | 'modificaInstancia' | 'borra'
interface Guardado { evento: Evento; seq: number; version: number }

export interface Notificacion { para: string; evento: string; tipo: 'invitacion' | 'cambio' | 'cancelacion'; cuando: number }
export interface Llamada { op: Op; calendario: string | null; id: string | null; cuando: number }
export interface OpcionesSimulador { reloj?: Reloj; tamanoPagina?: number }

export class SimuladorGoogle implements Proveedor {
  readonly nombre = 'simulador-google'
  readonly medido = true
  readonly capacidades = { idPropio: true, obtienePorId: true, etagAtomico: true }
  readonly notificaciones: Notificacion[] = []
  readonly llamadas: Llamada[] = []
  credencialCaducada = false
  tamanoPagina: number
  private reloj: Reloj
  private cals = new Map<string, Calendario>()
  private evs = new Map<string, Map<string, Guardado>>()
  private seq = 0
  private minimoValido = 0
  private contador = 0
  private fallas: Array<{ op: Op | '*'; codigo: CodigoError; reintentarEnMs: number | null }> = []

  constructor(opciones: OpcionesSimulador = {}) {
    this.reloj = opciones.reloj ?? relojDelSistema
    this.tamanoPagina = opciones.tamanoPagina ?? 50
  }

  agregaCalendario(c: Calendario): void {
    const ref = { cuenta: c.cuenta, calendario: c.id }
    this.cals.set(claveCalendario(ref), c)
    if (!this.evs.has(claveCalendario(ref))) this.evs.set(claveCalendario(ref), new Map())
  }

  /** Mete un evento como si ya estuviera en Google (sin notificar a nadie). */
  siembra(ref: RefCalendario, entrada: EntradaEvento & { id?: string }): Evento {
    const datos = esquemaDatosEvento.parse(entrada)
    return this.guarda(ref, { ...datos, ...this.identidad(ref, entrada.id ?? this.nuevoId()) }, 1).evento
  }

  programaFalla(op: Op | '*', codigo: CodigoError, veces = 1, reintentarEnMs: number | null = null): void {
    for (let i = 0; i < veces; i++) this.fallas.push({ op, codigo, reintentarEnMs })
  }

  /** Invalida todos los tokens emitidos: la proxima sync incremental recibe `token-invalido` (410). */
  invalidaTokens(): void {
    this.seq++
    this.minimoValido = this.seq
  }

  caducaCredencial(caducada = true): void {
    this.credencialCaducada = caducada
  }

  eventosDe(ref: RefCalendario): Evento[] {
    return [...(this.evs.get(claveCalendario(ref))?.values() ?? [])].map((g) => g.evento)
  }

  private nuevoId(): string {
    return `ev${(++this.contador).toString(32).padStart(4, '0')}`
  }

  private identidad(ref: RefCalendario, id: string) {
    return { id, cuenta: ref.cuenta, calendario: ref.calendario, serie: null, inicioOriginal: null, enlace: `https://calendar.simulado/evento/${id}` }
  }

  private consume(op: Op, ref: RefCalendario | null, id: string | null): void {
    this.llamadas.push({ op, calendario: ref ? claveCalendario(ref) : null, id, cuando: this.reloj.ahora() })
    if (this.credencialCaducada) {
      throw new ErrorCalendario('credencial', 'invalid_grant: el token de Google caduco o fue revocado', { destraba: DESTRABA_CREDENCIAL })
    }
    const i = this.fallas.findIndex((f) => f.op === op || f.op === '*')
    if (i < 0) return
    const [f] = this.fallas.splice(i, 1)
    if (!f) return
    const mensajes: Partial<Record<CodigoError, string>> = { limite: 'rateLimitExceeded (429)', red: 'la conexion se corto' }
    throw new ErrorCalendario(f.codigo, mensajes[f.codigo] ?? `falla programada: ${f.codigo}`, { reintentarEnMs: f.reintentarEnMs })
  }

  private mapa(ref: RefCalendario): Map<string, Guardado> {
    const m = this.evs.get(claveCalendario(ref))
    if (!m) throw new ErrorCalendario('no-encontrado', `calendario inexistente: ${claveCalendario(ref)}`)
    return m
  }

  private escribible(ref: RefCalendario): void {
    const c = this.cals.get(claveCalendario(ref))
    if (!c) throw new ErrorCalendario('no-encontrado', `calendario inexistente: ${claveCalendario(ref)}`)
    if (!puedeEscribir(c)) throw new ErrorCalendario('solo-lectura', `el calendario ${c.nombre} es de solo lectura`)
  }

  private guarda(ref: RefCalendario, evento: Omit<Evento, 'etag' | 'actualizado'>, version: number): Guardado {
    this.seq++
    const g = { evento: { ...evento, etag: `"${version}"`, actualizado: new Date(this.reloj.ahora()).toISOString() } as Evento, seq: this.seq, version }
    this.mapa(ref).set(evento.id, g)
    return g
  }

  private notifica(e: Evento, notificar: OpcionesEscritura['notificar'], tipo: Notificacion['tipo']): void {
    if (notificar === 'nadie') return
    const dominio = e.cuenta.split('@')[1] ?? ''
    for (const inv of e.invitados) {
      if (notificar === 'externos' && inv.correo.endsWith(`@${dominio}`)) continue
      this.notificaciones.push({ para: inv.correo, evento: e.id, tipo, cuando: this.reloj.ahora() })
    }
  }

  private vivo(ref: RefCalendario, id: string): Guardado {
    const g = this.mapa(ref).get(id)
    if (!g || g.evento.estado === 'cancelado') throw new ErrorCalendario('no-encontrado', `no existe el evento ${id}`)
    return g
  }

  private compruebaEtag(g: Guardado, siEtag: string | null | undefined): void {
    if (siEtag && siEtag !== g.evento.etag) {
      throw new ErrorCalendario('conflicto', 'preconditionFailed (412): el evento cambio desde que se leyo', { detalle: g.evento })
    }
  }

  async calendarios(cuenta: string): Promise<Calendario[]> {
    this.consume('calendarios', null, null)
    return [...this.cals.values()].filter((c) => c.cuenta === cuenta)
  }

  async lista(ref: RefCalendario, p: PeticionLista): Promise<PaginaDeEventos> {
    this.consume('lista', ref, null)
    const pagina = p.pagina ? JSON.parse(p.pagina) as { desde: number; corte: number } : null
    let desde = pagina?.desde ?? 0
    const corte = pagina?.corte ?? this.seq
    let filas: Guardado[]
    if (p.token) {
      const s = Number(p.token.replace(/^sim:/, ''))
      if (!Number.isInteger(s) || s < this.minimoValido) {
        throw new ErrorCalendario('token-invalido', 'fullSyncRequired (410): el token de sincronizacion ya no vale')
      }
      filas = [...this.mapa(ref).values()].filter((g) => g.seq > s && g.seq <= corte)
    } else {
      filas = [...this.mapa(ref).values()].filter((g) => g.seq <= corte && (g.evento.estado !== 'cancelado' || g.evento.serie))
      if (p.ventana) {
        const v = p.ventana
        filas = filas.filter((g) => {
          if (g.evento.recurrencia || g.evento.serie) return true
          const l = limites(g.evento, 'UTC')
          return l.inicioMs < v.hasta && l.finMs > v.desde
        })
      }
    }
    filas.sort((a, b) => a.seq - b.seq)
    const trozo = filas.slice(desde, desde + this.tamanoPagina)
    desde += trozo.length
    const ultima = desde >= filas.length
    return {
      eventos: trozo.map((g) => g.evento),
      siguientePagina: ultima ? null : JSON.stringify({ desde, corte }),
      tokenSync: ultima ? `sim:${corte}` : null,
      completo: true,
    }
  }

  async obtiene(ref: RefCalendario, id: string): Promise<Evento | null> {
    this.consume('obtiene', ref, id)
    return this.mapa(ref).get(id)?.evento ?? null
  }

  async crea(ref: RefCalendario, datos: DatosEvento, op: OpcionesEscritura & { id?: string }): Promise<Evento> {
    this.consume('crea', ref, op.id ?? null)
    this.escribible(ref)
    const id = op.id ?? this.nuevoId()
    if (this.mapa(ref).has(id)) throw new ErrorCalendario('duplicado', `duplicate (409): ya existe el evento ${id}`)
    const g = this.guarda(ref, { ...datos, ...this.identidad(ref, id) }, 1)
    this.notifica(g.evento, op.notificar, 'invitacion')
    return g.evento
  }

  async actualiza(ref: RefCalendario, id: string, datos: Partial<DatosEvento>, op: OpcionesEscritura): Promise<Evento> {
    this.consume('actualiza', ref, id)
    this.escribible(ref)
    const g = this.vivo(ref, id)
    this.compruebaEtag(g, op.siEtag)
    const nuevo = { ...g.evento, ...datos }
    if (nuevo.recurrencia) parseaRecurrencia(nuevo.recurrencia, nuevo.zona)
    const h = this.guarda(ref, nuevo, g.version + 1)
    this.notifica(h.evento, op.notificar, 'cambio')
    return h.evento
  }

  async modificaInstancia(ref: RefCalendario, serie: string, inicioOriginal: string, datos: Partial<DatosEvento>, op: OpcionesEscritura): Promise<Evento> {
    this.consume('modificaInstancia', ref, serie)
    this.escribible(ref)
    const madre = this.vivo(ref, serie)
    const m = madre.evento
    if (!m.recurrencia || !esOcurrencia(parseaRecurrencia(m.recurrencia, m.zona), { inicio: m.inicio, todoElDia: m.todoElDia, zona: m.zona }, inicioOriginal)) {
      throw new ErrorCalendario('no-encontrado', `${inicioOriginal} no es una ocurrencia de ${serie}`)
    }
    const id = idInstancia(serie, inicioOriginal)
    const previa = this.mapa(ref).get(id)
    this.compruebaEtag(previa ?? madre, op.siEtag)
    const base: Evento = previa?.evento ?? ocurrenciaDe(m, inicioOriginal)
    const h = this.guarda(ref, { ...base, ...datos, id, serie, inicioOriginal, recurrencia: null }, (previa?.version ?? 0) + 1)
    this.notifica(h.evento, op.notificar, h.evento.estado === 'cancelado' ? 'cancelacion' : 'cambio')
    return h.evento
  }

  async borra(ref: RefCalendario, id: string, op: OpcionesEscritura): Promise<void> {
    this.consume('borra', ref, id)
    this.escribible(ref)
    const g = this.vivo(ref, id)
    this.compruebaEtag(g, op.siEtag)
    this.guarda(ref, { ...g.evento, estado: 'cancelado' }, g.version + 1)
    this.notifica(g.evento, op.notificar, 'cancelacion')
    if (!g.evento.recurrencia) return
    for (const x of this.mapa(ref).values()) {
      if (x.evento.serie === id && x.evento.estado !== 'cancelado') this.guarda(ref, { ...x.evento, estado: 'cancelado' }, x.version + 1)
    }
  }
}
