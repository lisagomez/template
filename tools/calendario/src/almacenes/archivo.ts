/**
 * El espejo en un archivo JSON (Node): el del CLI, para que un agente o una persona tengan espejo entre
 * invocaciones sin base de datos. Misma semantica que el de memoria (hereda de el), y cada cambio se
 * escribe entero a un temporal y se renombra: un corte a medias no deja un JSON roto.
 *
 * Lo que se lee del disco es DATO NO CONFIABLE y pasa por Zod antes de entrar.
 */
import { readFile, rename, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { AlmacenEnMemoria } from './memoria.js'
import { esquemaCalendario, esquemaEvento, type Calendario, type Evento, type RefCalendario, type Ventana } from '../tipos.js'
import type { EstadoSync, Intencion, Reserva, ResultadoGuardado } from '../puertos.js'
import { ErrorCalendario } from '../errores.js'

const ref = { cuenta: z.string(), calendario: z.string() }
const esquemaInstantanea = z.object({
  calendarios: z.array(esquemaCalendario),
  eventos: z.array(esquemaEvento),
  estados: z.array(z.object({ ...ref, token: z.string().nullable(), ultimaSync: z.number().nullable(), ultimoIntento: z.number().nullable(), error: z.object({ codigo: z.string(), mensaje: z.string(), destraba: z.string().nullable() }).nullable() })),
  intenciones: z.array(z.object({ ...ref, clave: z.string(), operacion: z.enum(['crea', 'actualiza', 'instancia', 'serie', 'borra']), ids: z.array(z.string()), creada: z.number() })),
  resultados: z.array(z.object({ clave: z.string(), ids: z.array(z.string()), borrados: z.array(z.string()) })),
  reservas: z.array(z.object({
    id: z.string(), recurso: z.string(), clave: z.string(), inicio: z.number(), fin: z.number(), bloqueDesde: z.number(), bloqueHasta: z.number(),
    estado: z.enum(['tentativa', 'confirmada', 'liberada']), expira: z.number().nullable(), referencia: z.string(), evento: z.string().nullable(), creada: z.number(),
  })),
})

export class AlmacenEnArchivo extends AlmacenEnMemoria {
  private readonly ruta: string

  private constructor(ruta: string) {
    super()
    this.ruta = ruta
  }

  /** Abre (o crea vacio) el espejo de `ruta`. */
  static async abre(ruta: string): Promise<AlmacenEnArchivo> {
    const a = new AlmacenEnArchivo(ruta)
    let texto: string | null = null
    try {
      texto = await readFile(ruta, 'utf8')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
    if (texto !== null) {
      const r = esquemaInstantanea.safeParse(JSON.parse(texto))
      if (!r.success) throw new ErrorCalendario('espejo', `el espejo ${ruta} no tiene la forma esperada: ${r.error.issues[0]?.message ?? ''}`)
      a.importa(r.data)
    }
    return a
  }

  private async persiste(): Promise<void> {
    const temporal = `${this.ruta}.${process.pid}.tmp`
    await writeFile(temporal, JSON.stringify(this.exporta()), 'utf8')
    await rename(temporal, this.ruta)
  }

  override async guardaCalendarios(c: Calendario[]): Promise<void> { await super.guardaCalendarios(c); await this.persiste() }
  override async guardaEventos(e: Evento[]): Promise<void> { await super.guardaEventos(e); await this.persiste() }
  override async borraEventos(r: RefCalendario, ids: string[]): Promise<void> { await super.borraEventos(r, ids); await this.persiste() }
  override async reemplazaCalendario(r: RefCalendario, e: Evento[], v: Ventana | null): Promise<void> { await super.reemplazaCalendario(r, e, v); await this.persiste() }
  override async guardaEstadoSync(e: EstadoSync): Promise<void> { await super.guardaEstadoSync(e); await this.persiste() }
  override async anotaIntencion(i: Intencion): Promise<void> { await super.anotaIntencion(i); await this.persiste() }
  override async cierraIntencion(c: string, r: ResultadoGuardado | null): Promise<void> { await super.cierraIntencion(c, r); await this.persiste() }
  override async reservaSiLibre(r: Reserva, ahora: number): Promise<boolean> {
    const ok = await super.reservaSiLibre(r, ahora)
    if (ok) await this.persiste()
    return ok
  }
  override async actualizaReserva(r: Reserva): Promise<void> { await super.actualizaReserva(r); await this.persiste() }
}
