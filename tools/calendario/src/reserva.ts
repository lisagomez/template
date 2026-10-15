/**
 * Reservar tiempo para los productos que agendan (vendedor por WhatsApp, asesor por voz…):
 *
 *   huecos() → tentativa(inicio) → confirma(id)   ·   libera(id) en cualquier momento
 *
 * - La TENTATIVA aparta el hueco unos minutos (`ttlMin`) mientras la persona confirma; si no confirma,
 *   expira sola y el hueco vuelve.
 * - La doble reserva es IMPOSIBLE, tambien con peticiones simultaneas: el almacen comprueba e inserta
 *   en un solo paso atomico (en Supabase, una restriccion de exclusion).
 * - Todo es idempotente por clave: un reintento del consumidor no aparta dos huecos.
 * - El evento que crea la confirmacion lleva una REFERENCIA, no los datos de la persona: que datos
 *   suyos salen hacia el calendario (y a quien) lo decide el producto que consume (C4), no esta pieza.
 */
import { calculaHuecos, esquemaReglas, ocupados, type EntradaReglas, type ReglasDeDisponibilidad, type ResultadoHuecos } from './disponibilidad.js'
import type { Lector } from './espejo.js'
import type { Pluma } from './pluma.js'
import { relojDelSistema, type Almacen, type Reloj, type Reserva } from './puertos.js'
import { claveCalendario, type RefCalendario } from './tipos.js'
import { idDesdeClave } from './ids.js'
import { fechaEnZona, textoFecha, DIA, MINUTO } from './tiempo.js'
import { esErrorCalendario } from './errores.js'

export type MotivoRechazo = 'ocupado' | 'fuera-de-regla' | 'expirada' | 'no-encontrada' | 'ya-liberada'

export type ResultadoReserva =
  | { ok: true; reserva: Reserva; repetida: boolean }
  | { ok: false; motivo: MotivoRechazo; detalle: string }

export interface DepsReservas {
  almacen: Almacen
  pluma: Pluma
  lector: Lector
  /** El calendario donde se agenda. */
  recurso: RefCalendario
  /** Calendarios cuyo ocupado cuenta (por defecto, solo el recurso). */
  ocupan?: RefCalendario[]
  reglas: EntradaReglas
  /** Minutos que dura apartado un hueco sin confirmar. */
  ttlMin?: number
  reloj?: Reloj
}

const no = (motivo: MotivoRechazo, detalle: string): ResultadoReserva => ({ ok: false, motivo, detalle })

export class Reservas {
  private readonly d: DepsReservas
  readonly reglas: ReglasDeDisponibilidad
  private readonly reloj: Reloj
  private readonly clave: string

  constructor(d: DepsReservas) {
    this.d = d
    this.reglas = esquemaReglas.parse(d.reglas)
    this.reloj = d.reloj ?? relojDelSistema
    this.clave = claveCalendario(d.recurso)
  }

  private vigente(r: Reserva, ahora: number): boolean {
    return r.estado === 'confirmada' || (r.estado === 'tentativa' && (r.expira ?? Infinity) > ahora)
  }

  private async contexto(desde: number, hasta: number) {
    const ahora = this.reloj.ahora()
    const lectura = await this.d.lector.consulta({ calendarios: this.d.ocupan ?? [this.d.recurso], desde: desde - DIA, hasta: hasta + DIA, zona: this.reglas.zona })
    const reservas = (await this.d.almacen.reservas(this.clave, { desde: desde - DIA, hasta: hasta + DIA })).filter((r) => this.vigente(r, ahora))
    const porDia = new Map<string, number>()
    for (const r of reservas) {
      const f = textoFecha(fechaEnZona(r.inicio, this.reglas.zona))
      porDia.set(f, (porDia.get(f) ?? 0) + 1)
    }
    return { ahora, ocupados: ocupados(lectura.instancias), bloques: reservas.map((r) => ({ desde: r.bloqueDesde, hasta: r.bloqueHasta })), porDia }
  }

  async huecos(op: { desde?: number; hasta?: number; maximo?: number } = {}): Promise<ResultadoHuecos> {
    const ahora = this.reloj.ahora()
    const desde = op.desde ?? ahora
    const hasta = op.hasta ?? ahora + this.reglas.horizonteDias * DIA
    const c = await this.contexto(desde, hasta)
    return calculaHuecos(this.reglas, { ...c, desde, hasta, maximo: op.maximo })
  }

  async tentativa(p: { inicio: string; referencia: string; clave: string }): Promise<ResultadoReserva> {
    const previa = await this.d.almacen.reservaPorClave(p.clave)
    if (previa) {
      if (this.vigente(previa, this.reloj.ahora())) return { ok: true, reserva: previa, repetida: true }
      return no(previa.estado === 'liberada' ? 'ya-liberada' : 'expirada', 'Esa clave ya se uso para una reserva que ya no esta vigente: usa una clave nueva.')
    }
    const inicio = Date.parse(p.inicio)
    if (Number.isNaN(inicio)) return no('fuera-de-regla', 'inicio no es un instante ISO')
    if (!p.referencia || p.referencia.length > 200 || !p.clave) return no('fuera-de-regla', 'la referencia (1 a 200 caracteres) y la clave son obligatorias')
    const fin = inicio + this.reglas.duracionMin * MINUTO
    const c = await this.contexto(inicio, fin)
    const enRegla = calculaHuecos(this.reglas, { ocupados: [], bloques: [], ahora: c.ahora, desde: inicio, hasta: fin, maximo: 1 })
    if (enRegla.tipo !== 'huecos' || enRegla.huecos[0]?.inicioMs !== inicio) {
      return no('fuera-de-regla', 'Ese inicio no es un hueco del horario (o no respeta el aviso minimo o el horizonte).')
    }
    const libre = calculaHuecos(this.reglas, { ...c, desde: inicio, hasta: fin, maximo: 1 })
    if (libre.tipo !== 'huecos') return no('ocupado', 'Ese hueco ya esta ocupado.')
    const reserva: Reserva = {
      id: `res${idDesdeClave(p.clave).slice(3)}`, recurso: this.clave, clave: p.clave, inicio, fin,
      bloqueDesde: inicio - this.reglas.margenAntesMin * MINUTO, bloqueHasta: fin + this.reglas.margenDespuesMin * MINUTO,
      estado: 'tentativa', expira: c.ahora + (this.d.ttlMin ?? 10) * MINUTO, referencia: p.referencia, evento: null, creada: c.ahora,
    }
    if (!(await this.d.almacen.reservaSiLibre(reserva, c.ahora))) return no('ocupado', 'Otra persona aparto ese hueco un instante antes.')
    return { ok: true, reserva, repetida: false }
  }

  async confirma(id: string, p: { titulo: string; clave: string; descripcion?: string }): Promise<ResultadoReserva> {
    const r = await this.d.almacen.reserva(id)
    if (!r) return no('no-encontrada', `no existe la reserva ${id}`)
    if (r.estado === 'confirmada') return { ok: true, reserva: r, repetida: true }
    if (r.estado === 'liberada') return no('ya-liberada', 'La reserva se libero.')
    const ahora = this.reloj.ahora()
    if ((r.expira ?? Infinity) <= ahora) {
      await this.d.almacen.actualizaReserva({ ...r, estado: 'liberada' })
      return no('expirada', 'El hueco estuvo apartado y expiro sin confirmar.')
    }
    // La exclusion del almacen cubre a las RESERVAS; un evento que alguien puso en Google mientras el
    // hueco estaba apartado solo se ve en el espejo: se vuelve a mirar antes de escribir la cita.
    const c = await this.contexto(r.inicio, r.fin)
    if (c.ocupados.some((o) => o.desde < r.bloqueHasta && o.hasta > r.bloqueDesde)) {
      await this.d.almacen.actualizaReserva({ ...r, estado: 'liberada', expira: null })
      return no('ocupado', 'Mientras estaba apartado, algo se agendo en ese hueco: se libero y hay que elegir otro.')
    }
    const escrito = await this.d.pluma.crea(this.d.recurso, {
      titulo: p.titulo, descripcion: p.descripcion ?? '', inicio: new Date(r.inicio).toISOString(), fin: new Date(r.fin).toISOString(),
      zona: this.reglas.zona, vinculos: [{ tipo: 'reserva', id: r.id }], invitados: [],
    }, { clave: p.clave })
    const confirmada: Reserva = { ...r, estado: 'confirmada', expira: null, evento: escrito.eventos[0]?.id ?? null }
    await this.d.almacen.actualizaReserva(confirmada)
    return { ok: true, reserva: confirmada, repetida: false }
  }

  async libera(id: string, p: { clave: string }): Promise<ResultadoReserva> {
    const r = await this.d.almacen.reserva(id)
    if (!r) return no('no-encontrada', `no existe la reserva ${id}`)
    if (r.estado === 'liberada') return { ok: true, reserva: r, repetida: true }
    if (r.estado === 'confirmada' && r.evento) {
      try {
        await this.d.pluma.borra({ ...this.d.recurso, id: r.evento }, { clave: p.clave })
      } catch (e) {
        if (!esErrorCalendario(e, 'no-encontrado')) throw e
      }
    }
    const liberada: Reserva = { ...r, estado: 'liberada', expira: null }
    await this.d.almacen.actualizaReserva(liberada)
    return { ok: true, reserva: liberada, repetida: false }
  }

  reserva(id: string): Promise<Reserva | null> {
    return this.d.almacen.reserva(id)
  }
}
