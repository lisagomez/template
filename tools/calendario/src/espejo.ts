/**
 * EL ESPEJO: por aqui se lee siempre. Rapido, sin red, y con la salud a la vista: si esta rancio o la
 * credencial caduco, se sigue leyendo lo que hay y se dice desde cuando y por que.
 */
import type { Almacen, Reloj } from './puertos.js'
import { relojDelSistema } from './puertos.js'
import { expandeVentana } from './instancias.js'
import { calculaSalud, type Salud } from './salud.js'
import type { Instancia, RefCalendario } from './tipos.js'

export interface Consulta {
  calendarios: RefCalendario[]
  desde: number
  hasta: number
  /** Zona de quien mira: ancla los eventos de todo el dia. */
  zona: string
}

export interface Lectura { instancias: Instancia[]; salud: Salud }

export class Lector {
  private readonly almacen: Almacen
  private readonly reloj: Reloj
  private readonly umbralMs: number | undefined

  constructor(deps: { almacen: Almacen; reloj?: Reloj; umbralRancioMs?: number }) {
    this.almacen = deps.almacen
    this.reloj = deps.reloj ?? relojDelSistema
    this.umbralMs = deps.umbralRancioMs
  }

  async consulta(c: Consulta, reparacionesEnCurso = 0): Promise<Lectura> {
    const ventana = { desde: c.desde, hasta: c.hasta }
    const [eventos, estados, abiertas] = await Promise.all([
      this.almacen.eventos(c.calendarios, ventana),
      Promise.all(c.calendarios.map(async (ref) => ({ ref, estado: await this.almacen.estadoSync(ref) }))),
      this.almacen.intenciones(),
    ])
    const pendientes = Math.max(abiertas.length, reparacionesEnCurso)
    return {
      instancias: expandeVentana(eventos, ventana, c.zona),
      salud: calculaSalud(estados, this.reloj.ahora(), { umbralMs: this.umbralMs, reparacionesPendientes: pendientes }),
    }
  }

  async salud(calendarios: RefCalendario[], reparacionesEnCurso = 0): Promise<Salud> {
    const estados = await Promise.all(calendarios.map(async (ref) => ({ ref, estado: await this.almacen.estadoSync(ref) })))
    const abiertas = await this.almacen.intenciones()
    return calculaSalud(estados, this.reloj.ahora(), { umbralMs: this.umbralMs, reparacionesPendientes: Math.max(abiertas.length, reparacionesEnCurso) })
  }
}
