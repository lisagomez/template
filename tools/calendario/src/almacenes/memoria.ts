/**
 * Almacen en memoria: el del laboratorio, el de las pruebas y la REFERENCIA de semantica que el de
 * Supabase tiene que reproducir. `reservaSiLibre` comprueba e inserta sin un solo `await` en medio:
 * en el hilo unico de JavaScript eso lo hace atomico frente a peticiones concurrentes.
 *
 * `programaFalla` hace fallar la proxima llamada a un metodo: asi se demuestra la reparacion del espejo.
 */
import type { Almacen, EstadoSync, Intencion, Reserva, ResultadoGuardado } from '../puertos.js'
import { claveCalendario, type Calendario, type Evento, type RefCalendario, type Ventana } from '../tipos.js'
import { limites } from '../instancias.js'
import { ErrorCalendario } from '../errores.js'

export interface InstantaneaMemoria {
  calendarios: Calendario[]
  eventos: Evento[]
  estados: EstadoSync[]
  intenciones: Intencion[]
  resultados: ResultadoGuardado[]
  reservas: Reserva[]
}

const vigente = (r: Reserva, ahora: number) => r.estado === 'confirmada' || (r.estado === 'tentativa' && (r.expira ?? Infinity) > ahora)
const claveEvento = (e: RefCalendario & { id: string }) => `${claveCalendario(e)}::${e.id}`

export class AlmacenEnMemoria implements Almacen {
  private cals = new Map<string, Calendario>()
  private evs = new Map<string, Evento>()
  private estados = new Map<string, EstadoSync>()
  private abiertas = new Map<string, Intencion>()
  private resultados = new Map<string, ResultadoGuardado>()
  private res = new Map<string, Reserva>()
  private fallas = new Map<string, number>()

  /** La proxima llamada (o las proximas `veces`) a `metodo` falla con un error de espejo. */
  programaFalla(metodo: keyof Almacen, veces = 1): void {
    this.fallas.set(metodo, (this.fallas.get(metodo) ?? 0) + veces)
  }

  private compruebaFalla(metodo: keyof Almacen): void {
    const n = this.fallas.get(metodo) ?? 0
    if (n <= 0) return
    this.fallas.set(metodo, n - 1)
    throw new ErrorCalendario('espejo', `el almacen fallo en ${metodo} (falla programada)`)
  }

  async calendarios(): Promise<Calendario[]> {
    return [...this.cals.values()]
  }

  async guardaCalendarios(calendarios: Calendario[]): Promise<void> {
    this.compruebaFalla('guardaCalendarios')
    for (const c of calendarios) this.cals.set(claveCalendario({ cuenta: c.cuenta, calendario: c.id }), c)
  }

  async eventos(refs: RefCalendario[], v: Ventana): Promise<Evento[]> {
    this.compruebaFalla('eventos')
    const claves = new Set(refs.map(claveCalendario))
    return [...this.evs.values()].filter((e) => {
      if (!claves.has(claveCalendario(e))) return false
      if (e.recurrencia || e.serie) return true
      const { inicioMs, finMs } = limites(e, 'UTC')
      // Holgura de un dia: los de todo el dia se anclan a la zona de quien mira.
      return inicioMs < v.hasta + 86_400_000 && finMs > v.desde - 86_400_000
    })
  }

  async evento(ref: RefCalendario, id: string): Promise<Evento | null> {
    return this.evs.get(claveEvento({ ...ref, id })) ?? null
  }

  async excepciones(ref: RefCalendario, serie: string): Promise<Evento[]> {
    const clave = claveCalendario(ref)
    return [...this.evs.values()].filter((e) => e.serie === serie && claveCalendario(e) === clave)
  }

  async guardaEventos(eventos: Evento[]): Promise<void> {
    this.compruebaFalla('guardaEventos')
    for (const e of eventos) this.evs.set(claveEvento(e), e)
  }

  async borraEventos(ref: RefCalendario, ids: string[]): Promise<void> {
    this.compruebaFalla('borraEventos')
    for (const id of ids) this.evs.delete(claveEvento({ ...ref, id }))
  }

  async reemplazaCalendario(ref: RefCalendario, eventos: Evento[], v: Ventana | null): Promise<void> {
    this.compruebaFalla('reemplazaCalendario')
    const clave = claveCalendario(ref)
    const llegan = new Set(eventos.map((e) => e.id))
    for (const [k, e] of this.evs) {
      if (claveCalendario(e) !== clave || llegan.has(e.id)) continue
      if (v && !e.recurrencia && !e.serie) {
        const { inicioMs, finMs } = limites(e, 'UTC')
        if (!(inicioMs < v.hasta && finMs > v.desde)) continue
      }
      this.evs.delete(k)
    }
    for (const e of eventos) this.evs.set(claveEvento(e), e)
  }

  async estadoSync(ref: RefCalendario): Promise<EstadoSync | null> {
    return this.estados.get(claveCalendario(ref)) ?? null
  }

  async guardaEstadoSync(estado: EstadoSync): Promise<void> {
    this.compruebaFalla('guardaEstadoSync')
    this.estados.set(claveCalendario(estado), estado)
  }

  async anotaIntencion(i: Intencion): Promise<void> {
    this.compruebaFalla('anotaIntencion')
    this.abiertas.set(i.clave, i)
  }

  async intenciones(): Promise<Intencion[]> {
    return [...this.abiertas.values()]
  }

  async cierraIntencion(clave: string, resultado: ResultadoGuardado | null): Promise<void> {
    this.compruebaFalla('cierraIntencion')
    this.abiertas.delete(clave)
    if (resultado) this.resultados.set(clave, resultado)
  }

  async resultado(clave: string): Promise<ResultadoGuardado | null> {
    return this.resultados.get(clave) ?? null
  }

  async reservas(recurso: string, v: Ventana): Promise<Reserva[]> {
    return [...this.res.values()].filter((r) => r.recurso === recurso && r.bloqueDesde < v.hasta && r.bloqueHasta > v.desde)
  }

  async reserva(id: string): Promise<Reserva | null> {
    return this.res.get(id) ?? null
  }

  async reservaPorClave(clave: string): Promise<Reserva | null> {
    for (const r of this.res.values()) if (r.clave === clave) return r
    return null
  }

  async reservaSiLibre(nueva: Reserva, ahora: number): Promise<boolean> {
    this.compruebaFalla('reservaSiLibre')
    for (const r of this.res.values()) {
      if (r.recurso !== nueva.recurso || !vigente(r, ahora)) continue
      if (r.bloqueDesde < nueva.bloqueHasta && r.bloqueHasta > nueva.bloqueDesde) return false
    }
    this.res.set(nueva.id, nueva)
    return true
  }

  async actualizaReserva(r: Reserva): Promise<void> {
    this.compruebaFalla('actualizaReserva')
    this.res.set(r.id, r)
  }

  exporta(): InstantaneaMemoria {
    return {
      calendarios: [...this.cals.values()], eventos: [...this.evs.values()], estados: [...this.estados.values()],
      intenciones: [...this.abiertas.values()], resultados: [...this.resultados.values()], reservas: [...this.res.values()],
    }
  }

  importa(s: InstantaneaMemoria): void {
    for (const c of s.calendarios) this.cals.set(claveCalendario({ cuenta: c.cuenta, calendario: c.id }), c)
    for (const e of s.eventos) this.evs.set(claveEvento(e), e)
    for (const e of s.estados) this.estados.set(claveCalendario(e), e)
    for (const i of s.intenciones) this.abiertas.set(i.clave, i)
    for (const r of s.resultados) this.resultados.set(r.clave, r)
    for (const r of s.reservas) this.res.set(r.id, r)
  }
}
