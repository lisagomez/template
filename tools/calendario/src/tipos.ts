/**
 * El modelo de datos, validado con Zod en la frontera: todo lo que entra a la pluma y todo lo que sale
 * de un almacen ajeno (Supabase, un archivo) pasa por estos esquemas.
 *
 * Un evento tiene `inicio`/`fin` como instante ISO (con hora) o como AAAA-MM-DD (todo el dia, `fin`
 * EXCLUSIVO, como en Google). Una serie recurrente es UN evento con `recurrencia`; una instancia
 * modificada o cancelada es una EXCEPCION: otro evento con `serie` + `inicioOriginal`.
 */
import { z } from 'zod'
import { parseaRecurrencia } from './recurrencia.js'
import { esTextoFecha, esZonaValida } from './tiempo.js'
import { esErrorCalendario } from './errores.js'

export const esquemaZona = z.string().refine(esZonaValida, 'zona horaria IANA desconocida')

export const esquemaInvitado = z.object({
  correo: z.email().max(320),
  nombre: z.string().max(200).optional(),
  respuesta: z.enum(['pendiente', 'acepta', 'rechaza', 'tal-vez']).optional(),
  opcional: z.boolean().optional(),
})

export const esquemaRecordatorio = z.object({
  metodo: z.enum(['aviso', 'correo']),
  minutos: z.number().int().min(0).max(40_320),
})

/** Vinculo a una entidad de quien consume: tarea, lead, ticket, reserva… (lo que en la fuente era `mc_task_id`). */
export const esquemaVinculo = z.object({
  tipo: z.string().regex(/^[a-z0-9-]{1,40}$/, 'tipo en minusculas, digitos o guiones'),
  id: z.string().min(1).max(200),
})

const esInstante = (s: string) => /T/.test(s) && !Number.isNaN(Date.parse(s))

const camposEvento = {
  titulo: z.string().trim().min(1).max(500),
  descripcion: z.string().max(8_000).default(''),
  lugar: z.string().max(500).default(''),
  inicio: z.string(),
  fin: z.string(),
  todoElDia: z.boolean().default(false),
  zona: esquemaZona,
  recurrencia: z.array(z.string().max(2_000)).max(20).nullable().default(null),
  invitados: z.array(esquemaInvitado).max(200).default([]),
  recordatorios: z.array(esquemaRecordatorio).max(5).default([]),
  color: z.string().max(40).nullable().default(null),
  visibilidad: z.enum(['predeterminada', 'publica', 'privada']).default('predeterminada'),
  /** Si no se dice: un evento con hora ocupa; uno de todo el dia no (como en Google). */
  transparencia: z.enum(['ocupado', 'libre']).optional(),
  vinculos: z.array(esquemaVinculo).max(20).default([]),
  estado: z.enum(['confirmado', 'tentativo', 'cancelado']).default('confirmado'),
}

type Comprobable = { inicio: string; fin: string; todoElDia: boolean; zona: string; recurrencia: string[] | null }

function compruebaTiempos(d: Comprobable, ctx: z.RefinementCtx): void {
  const forma = d.todoElDia ? esTextoFecha : esInstante
  if (!forma(d.inicio) || !forma(d.fin)) {
    ctx.addIssue({ code: 'custom', path: ['inicio'], message: d.todoElDia ? 'todo el dia: inicio y fin AAAA-MM-DD' : 'inicio y fin deben ser instantes ISO con hora' })
    return
  }
  const orden = d.todoElDia ? d.fin > d.inicio : Date.parse(d.fin) > Date.parse(d.inicio)
  if (!orden) ctx.addIssue({ code: 'custom', path: ['fin'], message: 'fin debe ser posterior a inicio' })
  if (d.recurrencia) {
    try { parseaRecurrencia(d.recurrencia, d.zona) } catch (e) {
      ctx.addIssue({ code: 'custom', path: ['recurrencia'], message: esErrorCalendario(e) ? e.message : 'recurrencia invalida' })
    }
  }
}

const resuelveTransparencia = <T extends { transparencia?: 'ocupado' | 'libre'; todoElDia: boolean }>(d: T) =>
  ({ ...d, transparencia: d.transparencia ?? (d.todoElDia ? 'libre' : 'ocupado') }) as T & { transparencia: 'ocupado' | 'libre' }

export const esquemaDatosEvento = z.object(camposEvento).superRefine(compruebaTiempos).transform(resuelveTransparencia)

export type EntradaEvento = z.input<typeof esquemaDatosEvento>
export type DatosEvento = z.output<typeof esquemaDatosEvento>

export const esquemaEvento = z.object({
  ...camposEvento,
  id: z.string().min(1).max(1_024),
  cuenta: z.string().min(1).max(320),
  calendario: z.string().min(1).max(1_024),
  serie: z.string().max(1_024).nullable().default(null),
  inicioOriginal: z.string().nullable().default(null),
  etag: z.string().max(200),
  actualizado: z.string(),
  enlace: z.string().max(2_000).nullable().default(null),
}).transform(resuelveTransparencia)

export type Evento = z.output<typeof esquemaEvento>

export const esquemaCalendario = z.object({
  cuenta: z.string().min(1).max(320),
  id: z.string().min(1).max(1_024),
  nombre: z.string().max(500),
  color: z.string().max(40).nullable().default(null),
  zona: esquemaZona,
  rol: z.enum(['propietario', 'escritor', 'lector', 'libre-ocupado']),
  principal: z.boolean().default(false),
  visible: z.boolean().default(true),
})

export type Calendario = z.output<typeof esquemaCalendario>

export const puedeEscribir = (c: Pick<Calendario, 'rol'>): boolean => c.rol === 'propietario' || c.rol === 'escritor'

/** Una instancia lista para pintar: un evento suelto, una excepcion, o una ocurrencia de una serie. */
export interface Instancia extends Evento {
  /** true si viene de una serie (sintetizada o excepcion). */
  recurrente: boolean
  inicioMs: number
  finMs: number
}

export type Alcance = 'este' | 'siguientes' | 'todos'
export type Notificar = 'nadie' | 'externos' | 'todos'

export interface Ventana { desde: number; hasta: number }

export interface RefCalendario { cuenta: string; calendario: string }

export const claveCalendario = (r: RefCalendario): string => `${r.cuenta}::${r.calendario}`
