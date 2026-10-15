/**
 * LA PLUMA: el unico sitio por donde se escribe. Cada escritura es una transaccion proveedor → espejo:
 *
 * 1. Se anota la INTENCION en el espejo antes de tocar el proveedor (si eso falla, no se toca nada).
 * 2. Se escribe en el proveedor, con reintentos ante `limite`/`red` y el id derivado de la clave
 *    (un reintento choca con 409 y se lee lo que ya existia: nunca un duplicado).
 * 3. Se asienta en el espejo y se cierra la intencion guardando el resultado bajo la clave: repetir
 *    la misma clave devuelve lo mismo sin volver a escribir.
 *
 * Si el proveedor acepto y el espejo fallo, la escritura NO se repite: queda `espejo: 'pendiente'` y
 * `repara()` relee del proveedor lo afectado. La fuente tragaba ese error y el espejo quedaba rancio
 * sin que nadie lo supiera.
 *
 * Lo que notifica a terceros (invitados) exige `confirmaNotificar`: es irreversible y lo decide una persona.
 */
import { ErrorCalendario, DESTRABA_CREDENCIAL, esErrorCalendario } from './errores.js'
import { esquemaDatosEvento, type Alcance, type DatosEvento, type EntradaEvento, type Evento, type Notificar, type RefCalendario } from './tipos.js'
import { relojDelSistema, type Almacen, type Intencion, type Proveedor, type Reloj, type ResultadoGuardado } from './puertos.js'
import { conCuenta, cuentaAntes, filtraExcluidas, parseaRecurrencia, terminaAntes } from './recurrencia.js'
import { idInstancia, ocurrenciaDe } from './instancias.js'
import { idDesdeClave } from './ids.js'
import { desplazaLocal, esTextoFecha, leeFecha, ordinalFecha, sumaDias, textoFecha } from './tiempo.js'

export interface OpEscritura {
  /** Clave de idempotencia: la misma clave nunca escribe dos veces. */
  clave: string
  notificar?: Notificar
  /** Confirmacion humana explicita para mandar correo a invitados. */
  confirmaNotificar?: boolean
}

/** Lo que identifica lo que el usuario toco: un evento suelto o una ocurrencia de una serie. */
export interface RefInstancia extends RefCalendario {
  id: string
  serie?: string | null
  inicioOriginal?: string | null
  /** El etag que se vio: si cambio, la escritura falla con `conflicto` en vez de pisar. */
  etag?: string | null
}

export interface ResultadoEscritura {
  eventos: Evento[]
  borrados: string[]
  espejo: 'al-dia' | 'pendiente'
  repetida: boolean
}

export interface DepsPluma { proveedor: Proveedor; almacen: Almacen; reloj?: Reloj; reintentos?: number }

interface Efecto { guardar: Evento[]; borrar: string[] }

/** Errores en los que el proveedor RECHAZO antes de escribir: no hay nada que reparar. */
const RECHAZOS = new Set(['credencial', 'conflicto', 'no-encontrado', 'solo-lectura', 'validacion', 'requiere-confirmacion', 'limite', 'recurrencia', 'duplicado', 'no-soportado'])

const CAMPOS: ReadonlyArray<keyof DatosEvento> = ['titulo', 'descripcion', 'lugar', 'inicio', 'fin', 'todoElDia', 'zona', 'recurrencia', 'invitados', 'recordatorios', 'color', 'visibilidad', 'transparencia', 'vinculos', 'estado']

function soloDatos(e: Evento): DatosEvento {
  return Object.fromEntries(CAMPOS.map((k) => [k, e[k]])) as DatosEvento
}

export function validaEntrada(entrada: unknown): DatosEvento {
  const r = esquemaDatosEvento.safeParse(entrada)
  if (r.success) return r.data
  throw new ErrorCalendario('validacion', r.error.issues.map((i) => `${i.path.join('.') || 'evento'}: ${i.message}`).join('; '), { detalle: r.error.issues })
}

/** Valida el evento COMPLETO tras el cambio, y devuelve solo lo cambiado (ya normalizado). */
function mezcla(actual: DatosEvento, cambios: Partial<EntradaEvento>): { datos: DatosEvento; delta: Partial<DatosEvento> } {
  const datos = validaEntrada({ ...actual, ...cambios })
  const claves = new Set(Object.keys(cambios) as Array<keyof DatosEvento>)
  if (claves.has('todoElDia')) claves.add('transparencia')
  return { datos, delta: Object.fromEntries([...claves].filter((k) => CAMPOS.includes(k)).map((k) => [k, datos[k]])) as Partial<DatosEvento> }
}

export class Pluma {
  private readonly proveedor: Proveedor
  private readonly almacen: Almacen
  private readonly reloj: Reloj
  private readonly reintentos: number
  private readonly pendientes = new Map<string, Intencion>()

  constructor(deps: DepsPluma) {
    this.proveedor = deps.proveedor
    this.almacen = deps.almacen
    this.reloj = deps.reloj ?? relojDelSistema
    this.reintentos = deps.reintentos ?? 3
  }

  async crea(ref: RefCalendario, entrada: EntradaEvento, op: OpEscritura): Promise<ResultadoEscritura> {
    const datos = validaEntrada(entrada)
    this.compruebaNotificacion(datos.invitados.length, op)
    const id = this.proveedor.capacidades.idPropio ? idDesdeClave(op.clave) : undefined
    return this.escribe(op.clave, ref, 'crea', id ? [id] : [], async () => {
      const ev = await this.creaIdempotente(ref, datos, op, id)
      return { guardar: [ev], borrar: [] }
    })
  }

  async actualiza(inst: RefInstancia, cambios: Partial<EntradaEvento>, op: OpEscritura & { alcance?: Alcance }): Promise<ResultadoEscritura> {
    if (!inst.serie || !inst.inicioOriginal) return this.actualizaSuelto(inst, cambios, op)
    const alcance = op.alcance ?? 'este'
    if (alcance === 'este') return this.actualizaOcurrencia(inst, cambios, op)
    const madre = await this.lee(inst, inst.serie)
    if (alcance === 'todos' || this.esPrimera(madre, inst.inicioOriginal)) return this.actualizaSerie(inst, madre, cambios, op)
    return this.parteSerie(inst, madre, cambios, op)
  }

  async borra(inst: RefInstancia, op: OpEscritura & { alcance?: Alcance }): Promise<ResultadoEscritura> {
    if (!inst.serie || !inst.inicioOriginal) return this.borraEntero(inst, inst.id, op)
    const alcance = op.alcance ?? 'este'
    const madre = await this.lee(inst, inst.serie)
    if (alcance === 'todos' || (alcance === 'siguientes' && this.esPrimera(madre, inst.inicioOriginal))) return this.borraEntero(inst, madre.id, op)
    if (alcance === 'siguientes') return this.recortaSerie(inst, madre, op)
    this.compruebaNotificacion(madre.invitados.length, op)
    const idExc = idInstancia(madre.id, inst.inicioOriginal)
    return this.escribe(op.clave, inst, 'instancia', [idExc], async () => {
      const ev = await this.conConflicto(inst, idExc, () => this.llama(() =>
        this.proveedor.modificaInstancia(inst, madre.id, inst.inicioOriginal as string, { estado: 'cancelado' }, { notificar: op.notificar ?? 'nadie', siEtag: inst.etag ?? null })))
      return { guardar: [ev], borrar: [] }
    })
  }

  /** Relee del proveedor lo que quedo a medias y lo asienta en el espejo. */
  async repara(): Promise<{ reparadas: number; pendientes: number }> {
    const abiertas = new Map((await this.almacen.intenciones()).map((i) => [i.clave, i]))
    for (const [k, i] of this.pendientes) abiertas.set(k, i)
    let reparadas = 0
    for (const i of abiertas.values()) if (await this.reparaUna(i)) reparadas++
    return { reparadas, pendientes: abiertas.size - reparadas }
  }

  get reparacionesPendientes(): number {
    return this.pendientes.size
  }

  private compruebaNotificacion(invitados: number, op: OpEscritura): void {
    if ((op.notificar ?? 'nadie') === 'nadie' || invitados === 0 || op.confirmaNotificar === true) return
    throw new ErrorCalendario('requiere-confirmacion', `Esto manda correo a ${invitados} invitado(s): es irreversible y lo confirma una persona.`, {
      destraba: 'quien opera la agenda: confirmarlo de forma explicita (confirmaNotificar)',
    })
  }

  private esPrimera(madre: Evento, inicioOriginal: string): boolean {
    return madre.todoElDia ? madre.inicio === inicioOriginal : Date.parse(madre.inicio) === Date.parse(inicioOriginal)
  }

  private async lee(ref: RefCalendario, id: string): Promise<Evento> {
    const local = await this.almacen.evento(ref, id)
    if (local) return local
    const remoto = this.proveedor.capacidades.obtienePorId ? await this.llama(() => this.proveedor.obtiene(ref, id)) : null
    if (remoto && remoto.estado !== 'cancelado') return remoto
    throw new ErrorCalendario('no-encontrado', `no existe el evento ${id}`)
  }

  private async llama<T>(f: () => Promise<T>, reintentaRed = true): Promise<T> {
    for (let intento = 0; ; intento++) {
      try {
        return await f()
      } catch (e) {
        const reintentable = esErrorCalendario(e) && (e.codigo === 'limite' || (reintentaRed && e.codigo === 'red'))
        if (!reintentable || intento >= this.reintentos) throw e
        await this.reloj.espera(e.reintentarEnMs ?? 250 * 2 ** intento)
      }
    }
  }

  private async creaIdempotente(ref: RefCalendario, datos: DatosEvento, op: OpEscritura, id: string | undefined): Promise<Evento> {
    try {
      // Sin id propio, un reintento por `red` podria duplicar: solo se reintenta el 429.
      return await this.llama(() => this.proveedor.crea(ref, datos, { notificar: op.notificar ?? 'nadie', id }), id !== undefined)
    } catch (e) {
      if (!id || !esErrorCalendario(e, 'duplicado')) throw e
      const existente = await this.llama(() => this.proveedor.obtiene(ref, id))
      if (!existente) throw e
      return existente
    }
  }

  private async conConflicto<T>(ref: RefCalendario, id: string, f: () => Promise<T>): Promise<T> {
    try {
      return await f()
    } catch (e) {
      if (!esErrorCalendario(e, 'conflicto')) throw e
      const vigente = this.proveedor.capacidades.obtienePorId ? await this.proveedor.obtiene(ref, id).catch(() => null) : null
      if (vigente) await this.almacen.guardaEventos([vigente]).catch(() => undefined)
      throw new ErrorCalendario('conflicto', 'Alguien cambio el evento despues de que lo leiste; el espejo ya tiene la version vigente.', { detalle: vigente, causa: e })
    }
  }

  private async actualizaSuelto(inst: RefInstancia, cambios: Partial<EntradaEvento>, op: OpEscritura): Promise<ResultadoEscritura> {
    const actual = await this.lee(inst, inst.id)
    const { datos, delta } = mezcla(soloDatos(actual), cambios)
    this.compruebaNotificacion(datos.invitados.length, op)
    return this.escribe(op.clave, inst, 'actualiza', [inst.id], async () => {
      const ev = await this.conConflicto(inst, inst.id, () => this.llama(() =>
        this.proveedor.actualiza(inst, inst.id, delta, { notificar: op.notificar ?? 'nadie', siEtag: inst.etag ?? null })))
      return { guardar: [ev], borrar: [] }
    })
  }

  private async actualizaOcurrencia(inst: RefInstancia, cambios: Partial<EntradaEvento>, op: OpEscritura): Promise<ResultadoEscritura> {
    const serie = inst.serie as string
    const original = inst.inicioOriginal as string
    const idExc = idInstancia(serie, original)
    const actual = (await this.almacen.evento(inst, idExc)) ?? ocurrenciaDe(await this.lee(inst, serie), original)
    const { datos, delta } = mezcla(soloDatos(actual), cambios)
    this.compruebaNotificacion(datos.invitados.length, op)
    return this.escribe(op.clave, inst, 'instancia', [idExc], async () => {
      const ev = await this.conConflicto(inst, idExc, () => this.llama(() =>
        this.proveedor.modificaInstancia(inst, serie, original, { ...delta, recurrencia: null }, { notificar: op.notificar ?? 'nadie', siEtag: inst.etag ?? null })))
      return { guardar: [ev], borrar: [] }
    })
  }

  /** «Todos»: el cambio de hora se aplica a la serie en hora LOCAL (no se corre con el horario de verano). */
  private desplazaSerie(madre: Evento, original: string, cambios: Partial<EntradaEvento>): Partial<EntradaEvento> {
    const ocurrencia = ocurrenciaDe(madre, original)
    const fuera: Partial<EntradaEvento> = { ...cambios }
    if (madre.todoElDia || cambios.todoElDia !== undefined) {
      if (cambios.inicio && esTextoFecha(cambios.inicio) && madre.todoElDia) {
        const dias = ordinalFecha(leeFecha(cambios.inicio)) - ordinalFecha(leeFecha(ocurrencia.inicio))
        const finDias = cambios.fin && esTextoFecha(cambios.fin) ? ordinalFecha(leeFecha(cambios.fin)) - ordinalFecha(leeFecha(ocurrencia.fin)) : dias
        fuera.inicio = textoFecha(sumaDias(leeFecha(madre.inicio), dias))
        fuera.fin = textoFecha(sumaDias(leeFecha(madre.fin), finDias))
      }
      return fuera
    }
    if (cambios.inicio) {
      const nuevoInicio = desplazaLocal(Date.parse(madre.inicio), Date.parse(ocurrencia.inicio), Date.parse(cambios.inicio), madre.zona)
      const duracion = Date.parse(cambios.fin ?? ocurrencia.fin) - Date.parse(cambios.inicio)
      fuera.inicio = new Date(nuevoInicio).toISOString()
      fuera.fin = new Date(nuevoInicio + duracion).toISOString()
    } else if (cambios.fin) {
      fuera.fin = new Date(Date.parse(madre.inicio) + Date.parse(cambios.fin) - Date.parse(ocurrencia.inicio)).toISOString()
    }
    return fuera
  }

  private async actualizaSerie(inst: RefInstancia, madre: Evento, cambios: Partial<EntradaEvento>, op: OpEscritura): Promise<ResultadoEscritura> {
    const { datos, delta } = mezcla(soloDatos(madre), this.desplazaSerie(madre, inst.inicioOriginal as string, cambios))
    this.compruebaNotificacion(datos.invitados.length, op)
    return this.escribe(op.clave, inst, 'serie', [madre.id], async () => {
      const ev = await this.conConflicto(inst, madre.id, () => this.llama(() =>
        this.proveedor.actualiza(inst, madre.id, delta, { notificar: op.notificar ?? 'nadie', siEtag: madre.etag })))
      return { guardar: [ev], borrar: [] }
    })
  }

  /** Corta la serie en `inicioOriginal`: la cabeza termina antes y la cola es una serie nueva. */
  private corte(madre: Evento, original: string): { cabeza: string[]; cola: string[] } {
    const lineas = madre.recurrencia ?? []
    const serie = { inicio: madre.inicio, todoElDia: madre.todoElDia, zona: madre.zona }
    const rec = parseaRecurrencia(lineas, madre.zona)
    const cabeza = filtraExcluidas(terminaAntes(lineas, original), original, true, madre.zona)
    let cola = filtraExcluidas(lineas, original, false, madre.zona)
    if (rec.regla.cuenta !== null) cola = conCuenta(cola, Math.max(1, rec.regla.cuenta - cuentaAntes(rec, serie, original)))
    return { cabeza, cola }
  }

  private async excepcionesDesde(ref: RefCalendario, madre: Evento, original: string): Promise<Evento[]> {
    const corte = madre.todoElDia ? original : Date.parse(original)
    return (await this.almacen.excepciones(ref, madre.id)).filter((x) => {
      const o = x.inicioOriginal ?? ''
      return madre.todoElDia ? o >= (corte as string) : Date.parse(o) >= (corte as number)
    })
  }

  private async parteSerie(inst: RefInstancia, madre: Evento, cambios: Partial<EntradaEvento>, op: OpEscritura): Promise<ResultadoEscritura> {
    const original = inst.inicioOriginal as string
    const { cabeza, cola } = this.corte(madre, original)
    const { datos: nueva } = mezcla({ ...soloDatos(ocurrenciaDe(madre, original)), recurrencia: cola }, { ...cambios, recurrencia: cola })
    this.compruebaNotificacion(nueva.invitados.length, op)
    const cola2 = await this.excepcionesDesde(inst, madre, original)
    const idNueva = this.proveedor.capacidades.idPropio ? idDesdeClave(op.clave) : undefined
    const ids = [madre.id, ...(idNueva ? [idNueva] : []), ...cola2.map((x) => x.id)]
    return this.escribe(op.clave, inst, 'serie', ids, async () => {
      const notificar = op.notificar ?? 'nadie'
      const cortada = await this.conConflicto(inst, madre.id, () => this.llama(() =>
        this.proveedor.actualiza(inst, madre.id, { recurrencia: cabeza }, { notificar, siEtag: madre.etag })))
      let creada: Evento
      try {
        creada = await this.creaIdempotente(inst, nueva, op, idNueva)
      } catch (e) {
        await this.deshaceCorte(inst, madre, cortada, e)
        throw e
      }
      for (const x of cola2) await this.llama(() => this.proveedor.borra(inst, x.id, { notificar: 'nadie' })).catch(() => undefined)
      return { guardar: [cortada, creada], borrar: cola2.map((x) => x.id) }
    })
  }

  /** Compensacion: si la serie nueva no se pudo crear, la vieja vuelve a como estaba. */
  private async deshaceCorte(ref: RefCalendario, madre: Evento, cortada: Evento, causa: unknown): Promise<void> {
    try {
      await this.llama(() => this.proveedor.actualiza(ref, madre.id, { recurrencia: madre.recurrencia }, { notificar: 'nadie', siEtag: cortada.etag }))
    } catch (e) {
      throw new ErrorCalendario('proveedor', 'La serie quedo cortada y no se pudo deshacer el corte: el espejo se repara desde el proveedor.', { causa: e, detalle: { causaOriginal: causa } })
    }
  }

  private async recortaSerie(inst: RefInstancia, madre: Evento, op: OpEscritura): Promise<ResultadoEscritura> {
    const original = inst.inicioOriginal as string
    const { cabeza } = this.corte(madre, original)
    this.compruebaNotificacion(madre.invitados.length, op)
    const cola = await this.excepcionesDesde(inst, madre, original)
    return this.escribe(op.clave, inst, 'serie', [madre.id, ...cola.map((x) => x.id)], async () => {
      const cortada = await this.conConflicto(inst, madre.id, () => this.llama(() =>
        this.proveedor.actualiza(inst, madre.id, { recurrencia: cabeza }, { notificar: op.notificar ?? 'nadie', siEtag: madre.etag })))
      for (const x of cola) await this.llama(() => this.proveedor.borra(inst, x.id, { notificar: 'nadie' })).catch(() => undefined)
      return { guardar: [cortada], borrar: cola.map((x) => x.id) }
    })
  }

  private async borraEntero(ref: RefInstancia, id: string, op: OpEscritura): Promise<ResultadoEscritura> {
    const actual = await this.lee(ref, id)
    this.compruebaNotificacion(actual.invitados.length, op)
    const excepciones = actual.recurrencia ? (await this.almacen.excepciones(ref, id)).map((x) => x.id) : []
    return this.escribe(op.clave, ref, 'borra', [id, ...excepciones], async () => {
      await this.conConflicto(ref, id, () => this.llama(() =>
        this.proveedor.borra(ref, id, { notificar: op.notificar ?? 'nadie', siEtag: id === ref.id ? ref.etag ?? null : actual.etag })))
      return { guardar: [], borrar: [id, ...excepciones] }
    })
  }

  private async escribe(clave: string, ref: RefCalendario, operacion: Intencion['operacion'], ids: string[], f: () => Promise<Efecto>): Promise<ResultadoEscritura> {
    const repetida = await this.yaHecha(clave, ref)
    if (repetida) return repetida
    const intencion: Intencion = { clave, operacion, ids, creada: this.reloj.ahora(), cuenta: ref.cuenta, calendario: ref.calendario }
    try {
      await this.almacen.anotaIntencion(intencion)
    } catch (e) {
      throw new ErrorCalendario('espejo', 'No se pudo anotar la escritura en el espejo: no se toco el proveedor.', { causa: e })
    }
    let efecto: Efecto
    try {
      efecto = await f()
    } catch (e) {
      await this.trasFalla(intencion, e)
      throw this.traduce(e)
    }
    return this.asienta(intencion, efecto)
  }

  private async yaHecha(clave: string, ref: RefCalendario): Promise<ResultadoEscritura | null> {
    const abierta = (await this.almacen.intenciones()).find((i) => i.clave === clave) ?? this.pendientes.get(clave)
    if (abierta) await this.reparaUna(abierta)
    const previo = await this.almacen.resultado(clave)
    if (!previo) {
      if (abierta) throw new ErrorCalendario('espejo', 'Esta escritura quedo a medias y aun no se puede reparar: reintentalo cuando vuelva el proveedor.')
      return null
    }
    return this.repetida(ref, previo)
  }

  private async repetida(ref: RefCalendario, previo: ResultadoGuardado): Promise<ResultadoEscritura> {
    const eventos = (await Promise.all(previo.ids.map((id) => this.almacen.evento(ref, id)))).filter((e): e is Evento => e !== null)
    return { eventos, borrados: previo.borrados, espejo: 'al-dia', repetida: true }
  }

  private async asienta(i: Intencion, ef: Efecto): Promise<ResultadoEscritura> {
    try {
      if (ef.guardar.length) await this.almacen.guardaEventos(ef.guardar)
      if (ef.borrar.length) await this.almacen.borraEventos(i, ef.borrar)
      await this.almacen.cierraIntencion(i.clave, { clave: i.clave, ids: ef.guardar.map((e) => e.id), borrados: ef.borrar })
      return { eventos: ef.guardar, borrados: ef.borrar, espejo: 'al-dia', repetida: false }
    } catch {
      // El proveedor YA acepto: no se repite la escritura. Se anota con los ids reales para repararla.
      this.pendientes.set(i.clave, { ...i, ids: [...new Set([...i.ids, ...ef.guardar.map((e) => e.id), ...ef.borrar])] })
      return { eventos: ef.guardar, borrados: ef.borrar, espejo: 'pendiente', repetida: false }
    }
  }

  private async trasFalla(i: Intencion, e: unknown): Promise<void> {
    if (esErrorCalendario(e) && RECHAZOS.has(e.codigo)) {
      await this.almacen.cierraIntencion(i.clave, null).catch(() => undefined)
      if (e.codigo === 'credencial') await this.marcaCredencial(i, e)
      return
    }
    // No se sabe si el proveedor aplico algo (se corto la red, fallo una compensacion): se relee.
    if (!(await this.reparaUna(i))) this.pendientes.set(i.clave, i)
  }

  private async marcaCredencial(ref: RefCalendario, e: ErrorCalendario): Promise<void> {
    const previo = await this.almacen.estadoSync(ref).catch(() => null)
    const base = previo ?? { cuenta: ref.cuenta, calendario: ref.calendario, token: null, ultimaSync: null, ultimoIntento: null, error: null }
    await this.almacen.guardaEstadoSync({ ...base, ultimoIntento: this.reloj.ahora(), error: { codigo: 'credencial', mensaje: e.message, destraba: e.destraba ?? DESTRABA_CREDENCIAL } }).catch(() => undefined)
  }

  private traduce(e: unknown): unknown {
    if (esErrorCalendario(e, 'credencial')) {
      return new ErrorCalendario('credencial', 'No se puede escribir: la credencial del calendario caduco. Lo que ya esta en el espejo se sigue leyendo.', { destraba: e.destraba ?? DESTRABA_CREDENCIAL, causa: e })
    }
    return e
  }

  private async reparaUna(i: Intencion): Promise<boolean> {
    if (!this.proveedor.capacidades.obtienePorId) return false // la cierra una sincronizacion completa
    try {
      const guardar: Evento[] = []
      const borrar: string[] = []
      for (const id of i.ids) {
        const ev = await this.proveedor.obtiene(i, id)
        if (ev && (ev.estado !== 'cancelado' || ev.serie)) guardar.push(ev)
        else borrar.push(id)
      }
      if (guardar.length) await this.almacen.guardaEventos(guardar)
      if (borrar.length) await this.almacen.borraEventos(i, borrar)
      await this.almacen.cierraIntencion(i.clave, { clave: i.clave, ids: guardar.map((e) => e.id), borrados: borrar })
      this.pendientes.delete(i.clave)
      return true
    } catch {
      return false
    }
  }
}
