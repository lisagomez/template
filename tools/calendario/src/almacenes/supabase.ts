/**
 * El espejo en Supabase, por las funciones de `migraciones/0001_calendario.sql` (SECURITY INVOKER: RLS
 * por dueño aplica siempre). No importa `@supabase/supabase-js`: recibe cualquier cosa con `rpc`,
 * por ejemplo `{ rpc: (f, a) => supabase.rpc(f, a) }` con el cliente de la SESION del usuario. Con
 * `service_role` el RLS no aplica: las superficies de negocio no lo usan (C7).
 *
 * Todo lo que vuelve de la base se valida con Zod antes de entrar al nucleo.
 */
import { z } from 'zod'
import type { Almacen, EstadoSync, Intencion, Reserva, ResultadoGuardado } from '../puertos.js'
import { esquemaCalendario, esquemaEvento, type Calendario, type Evento, type RefCalendario, type Ventana } from '../tipos.js'
import { limites } from '../instancias.js'
import { ErrorCalendario } from '../errores.js'

export interface ClienteRpc {
  rpc(funcion: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>
}

const esquemaEstado = z.object({
  cuenta: z.string(), calendario: z.string(), token: z.string().nullable(), ultimaSync: z.number().nullable(), ultimoIntento: z.number().nullable(),
  error: z.object({ codigo: z.string(), mensaje: z.string(), destraba: z.string().nullable() }).nullable(),
})
const esquemaIntencion = z.object({
  cuenta: z.string(), calendario: z.string(), clave: z.string(), operacion: z.enum(['crea', 'actualiza', 'instancia', 'serie', 'borra']), ids: z.array(z.string()), creada: z.number(),
})
const esquemaResultado = z.object({ clave: z.string(), ids: z.array(z.string()), borrados: z.array(z.string()) })
const numero = z.union([z.number(), z.string().regex(/^-?\d+$/).transform(Number)])
const esquemaReserva = z.object({
  id: z.string(), recurso: z.string(), clave: z.string(), inicio: numero, fin: numero, bloqueDesde: numero, bloqueHasta: numero,
  estado: z.enum(['tentativa', 'confirmada', 'liberada']), expira: numero.nullable(), referencia: z.string(), evento: z.string().nullable(), creada: numero,
})

const conLimites = (e: Evento) => ({ evento: e, ...limites(e, 'UTC') })

export class AlmacenSupabase implements Almacen {
  private readonly cliente: ClienteRpc

  constructor(cliente: ClienteRpc) {
    this.cliente = cliente
  }

  private async llama(funcion: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const { data, error } = await this.cliente.rpc(funcion, args)
    if (error) throw new ErrorCalendario('espejo', `${funcion}: ${error.message}`, { detalle: error })
    return data
  }

  private async varios<T>(funcion: string, esquema: z.ZodType<T>, args: Record<string, unknown> = {}): Promise<T[]> {
    return z.array(esquema).parse((await this.llama(funcion, args)) ?? [])
  }

  private async uno<T>(funcion: string, esquema: z.ZodType<T>, args: Record<string, unknown>): Promise<T | null> {
    const data = await this.llama(funcion, args)
    return data === null || data === undefined ? null : esquema.parse(data)
  }

  calendarios(): Promise<Calendario[]> { return this.varios('calendario_calendarios', esquemaCalendario) }
  async guardaCalendarios(c: Calendario[]): Promise<void> { await this.llama('calendario_guarda_calendarios', { p: c }) }

  eventos(refs: RefCalendario[], v: Ventana): Promise<Evento[]> {
    return this.varios('calendario_eventos', esquemaEvento, { p_refs: refs, p_desde: v.desde, p_hasta: v.hasta })
  }

  evento(ref: RefCalendario, id: string): Promise<Evento | null> {
    return this.uno('calendario_evento_uno', esquemaEvento, { p_cuenta: ref.cuenta, p_calendario: ref.calendario, p_id: id })
  }

  excepciones(ref: RefCalendario, serie: string): Promise<Evento[]> {
    return this.varios('calendario_excepciones', esquemaEvento, { p_cuenta: ref.cuenta, p_calendario: ref.calendario, p_serie: serie })
  }

  async guardaEventos(e: Evento[]): Promise<void> {
    if (e.length) await this.llama('calendario_guarda_eventos', { p: e.map(conLimites) })
  }

  async borraEventos(ref: RefCalendario, ids: string[]): Promise<void> {
    if (ids.length) await this.llama('calendario_borra_eventos', { p_cuenta: ref.cuenta, p_calendario: ref.calendario, p_ids: ids })
  }

  async reemplazaCalendario(ref: RefCalendario, e: Evento[], v: Ventana | null): Promise<void> {
    await this.llama('calendario_reemplaza', { p_cuenta: ref.cuenta, p_calendario: ref.calendario, p: e.map(conLimites), p_desde: v?.desde ?? null, p_hasta: v?.hasta ?? null })
  }

  estadoSync(ref: RefCalendario): Promise<EstadoSync | null> {
    return this.uno('calendario_estado_sync_uno', esquemaEstado, { p_cuenta: ref.cuenta, p_calendario: ref.calendario })
  }

  async guardaEstadoSync(e: EstadoSync): Promise<void> { await this.llama('calendario_guarda_estado_sync', { p: e }) }
  async anotaIntencion(i: Intencion): Promise<void> { await this.llama('calendario_anota_intencion', { p: i }) }
  intenciones(): Promise<Intencion[]> { return this.varios('calendario_intenciones', esquemaIntencion) }
  async cierraIntencion(clave: string, r: ResultadoGuardado | null): Promise<void> { await this.llama('calendario_cierra_intencion', { p_clave: clave, p_resultado: r }) }
  resultado(clave: string): Promise<ResultadoGuardado | null> { return this.uno('calendario_resultado', esquemaResultado, { p_clave: clave }) }

  reservas(recurso: string, v: Ventana): Promise<Reserva[]> {
    return this.varios('calendario_reservas', esquemaReserva, { p_recurso: recurso, p_desde: v.desde, p_hasta: v.hasta })
  }

  reserva(id: string): Promise<Reserva | null> { return this.uno('calendario_reserva_uno', esquemaReserva, { p_id: id }) }
  reservaPorClave(clave: string): Promise<Reserva | null> { return this.uno('calendario_reserva_por_clave', esquemaReserva, { p_clave: clave }) }

  async reservaSiLibre(r: Reserva, ahora: number): Promise<boolean> {
    return z.boolean().parse(await this.llama('calendario_reserva_si_libre', { p: r, p_ahora: ahora }))
  }

  async actualizaReserva(r: Reserva): Promise<void> { await this.llama('calendario_actualiza_reserva', { p: r }) }
}
