/**
 * La conversación de la capa, sin React: un turno entra (escrito o dictado), se resuelve por intención y sale
 * una respuesta en el tono de la capa: cálido, directo y sin inventar. Lo que no sabe, lo dice y ofrece lo que
 * sí sabe; si duda entre dos, pregunta; lo que cambia algo pregunta según «cuánto pregunta»; lo irreversible
 * pasa por el freno y solo avanza con el clic.
 *
 * Quien resuelve cada intención es su módulo (`Manejadores`). La conversación se guarda en la memoria del
 * producto, en el espacio de la capa: tras recargar, sigue ahí.
 */
import { creaFreno, type Freno, type OrigenConfirmacion, type SolicitudFreno } from './freno.js'
import { creaEnrutador, type CerebroDeIntencion, type Enrutador, type IntencionRuteable, type Veredicto } from './intencion.js'
import { MODULO_CAPA, type MemoriaProducto } from './memoria.js'
import { antesDe, type NivelPregunta } from './primer-arranque.js'

export type Estado = 'hecho' | 'no-se' | 'ambigua' | 'pregunta' | 'freno' | 'freno-negado' | 'error'

export interface Mensaje {
  id: string
  de: 'persona' | 'asistente'
  texto: string
  cuando: number
  via?: 'teclado' | 'voz'
  intencion?: string
  estado?: Estado
  /** La pantalla del módulo que muestra el resultado, si la hay. */
  ir?: string
  freno?: Pick<SolicitudFreno, 'id' | 'accion' | 'categoria' | 'porque' | 'cita' | 'vence'>
  opciones?: string[]
}

export interface ContextoManejador { texto: string; intencion: IntencionRuteable; memoria: MemoriaProducto; senal?: AbortSignal }
export type Manejador = (ctx: ContextoManejador) => Promise<{ texto: string; ir?: string }>
export type Manejadores = Readonly<Record<string, Manejador>>

export const CLAVE_CONVERSACION = 'conversacion'
export const CLAVE_RECUERDOS = 'recuerdos'
export const TOPE_MENSAJES = 60
export const TOPE_RECUERDOS = 50

/** Las intenciones propias de la capa: la memoria del producto, por intención. Solo si el producto enciende `memoria`. */
export const INTENCIONES_DE_LA_CAPA: readonly IntencionRuteable[] = [
  { modulo: 'capa', id: 'capa.recuerda', queHace: 'Recordar lo que me pidas para la próxima vez.', ejemplos: ['recuerda que los viernes cerramos a las dos', 'acuérdate de que el proveedor viene el martes', 'anota que hay que pedir más papel'], efecto: 'escribe', irreversible: false },
  { modulo: 'capa', id: 'capa.recuerdos', queHace: 'Decirte lo que me pediste recordar.', ejemplos: ['qué recuerdas', 'qué te pedí que recordaras', 'dime lo que tienes anotado'], efecto: 'lee', irreversible: false },
]

/** «recuerda que…», «acuérdate de que…», «anota que…», «apunta que…»: lo que va después es lo que se guarda. */
const PIDE_RECORDAR = /^(?:oye,?\s+)?(?:recuerda|acu[eé]rdate de|anota|apunta)\s+(?:que\s+)?(.+)$/i

export interface Conversacion {
  carga(): Promise<readonly Mensaje[]>
  mensajes(): readonly Mensaje[]
  envia(texto: string, via?: 'teclado' | 'voz', senal?: AbortSignal): Promise<Mensaje | null>
  /** Responde a una pregunta pendiente («¿lo hago?»). */
  contesta(id: string, si: boolean): Promise<Mensaje>
  /** Confirma lo irreversible. Solo un clic humano lo mueve: voz, texto o teclado no. */
  confirma(id: string, origen: OrigenConfirmacion): Promise<Mensaje>
  /** Cancela lo irreversible pendiente: nada se hace y queda dicho en el hilo. */
  descarta(id: string): Promise<Mensaje>
  /** Cambia «cuánto pregunta» sin perder lo pendiente (preguntas y frenos abiertos). */
  ajustaNivel(n: NivelPregunta): void
  nivel(): NivelPregunta
  enrutador: Enrutador
  freno: Freno
}

export interface OpcionesConversacion {
  intenciones: readonly IntencionRuteable[]
  manejadores: Manejadores
  memoria: MemoriaProducto
  /** El nivel con el que arranca; después lo cambia `ajustaNivel`. */
  nivel: NivelPregunta
  cerebro?: CerebroDeIntencion | null
  ahora?: () => number
}

/** «sí», «va», «dale»… al principio. Sin acentos y sin `\b`, que en JS no ve la frontera tras una «í». */
const afirma = (t: string) => /^(si|claro|va|dale|hazlo|adelante|de acuerdo|ok|confirmo)([\s,.!]|$)/.test(t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim())

export function creaConversacion(o: OpcionesConversacion): Conversacion {
  const ahora = o.ahora ?? Date.now
  const enrutador = creaEnrutador(o.intenciones)
  const freno = creaFreno({ ahora })
  let nivel = o.nivel
  let lista: Mensaje[] = []
  let n = 0
  const pendientes = new Map<string, { intencion: IntencionRuteable; texto: string }>()
  const id = () => `m-${ahora().toString(36)}-${(n++).toString(36)}`
  const guarda = () => o.memoria.recuerda(MODULO_CAPA, CLAVE_CONVERSACION, lista.slice(-TOPE_MENSAJES))
  const agrega = async (m: Omit<Mensaje, 'id' | 'cuando'>): Promise<Mensaje> => {
    const mensaje = { ...m, id: id(), cuando: ahora() } as Mensaje
    lista = [...lista, mensaje].slice(-TOPE_MENSAJES)
    await guarda()
    return mensaje
  }
  const deLaPersona = () => lista.filter((m) => m.de === 'persona').map((m) => m.texto)
  const recuerdos = async () => (await o.memoria.recuerdo<string[]>(MODULO_CAPA, CLAVE_RECUERDOS)) ?? []
  /** Las intenciones de la capa se resuelven aquí: la memoria es de la capa, no de un módulo. */
  const propios: Manejadores = {
    'capa.recuerda': async ({ texto }) => {
      const dicho = (texto.trim().match(PIDE_RECORDAR)?.[1] ?? texto).trim().replace(/[.!]+$/, '')
      await o.memoria.recuerda(MODULO_CAPA, CLAVE_RECUERDOS, [...(await recuerdos()), dicho].slice(-TOPE_RECUERDOS))
      return { texto: `Lo recuerdo: «${dicho}».` }
    },
    'capa.recuerdos': async () => {
      const r = await recuerdos()
      return { texto: r.length ? `Me pediste recordar: ${r.map((x) => `«${x}»`).join('; ')}.` : 'Todavía no me has pedido recordar nada.' }
    },
  }
  const ejecuta = async (intencion: IntencionRuteable, texto: string, senal?: AbortSignal) => {
    const manejador = propios[intencion.id] ?? o.manejadores[intencion.id]
    if (!manejador) return agrega({ de: 'asistente', texto: `Sé que quieres ${intencion.queHace.toLowerCase()}, pero el módulo ${intencion.modulo} no está conectado aquí.`, estado: 'error', intencion: intencion.id })
    try {
      const r = await manejador({ texto, intencion, memoria: o.memoria, senal })
      return agrega({ de: 'asistente', texto: r.texto, ir: r.ir ?? intencion.pantalla, estado: 'hecho', intencion: intencion.id })
    } catch (e) {
      return agrega({ de: 'asistente', texto: `No pude: ${(e as Error).message}`, estado: 'error', intencion: intencion.id })
    }
  }
  const contesta = async (idPregunta: string, si: boolean): Promise<Mensaje> => {
    const p = pendientes.get(idPregunta)
    if (!p) return agrega({ de: 'asistente', texto: 'Esa pregunta ya no está abierta.', estado: 'error' })
    pendientes.delete(idPregunta)
    return si ? ejecuta(p.intencion, p.texto) : agrega({ de: 'asistente', texto: 'Va, no lo hago.', estado: 'hecho', intencion: p.intencion.id })
  }
  const responde = async (v: Veredicto, texto: string, senal?: AbortSignal): Promise<Mensaje> => {
    if (v.motivo === 'ambigua') {
      const opciones = v.alternativas.slice(0, 2).map((a) => o.intenciones.find((i) => i.id === a.id)?.queHace ?? a.id)
      return agrega({ de: 'asistente', texto: `¿Te refieres a ${opciones.map((x) => x.toLowerCase()).join(' o a ')}?`, estado: 'ambigua', opciones })
    }
    if (!v.intencion) {
      const sabe = [...new Set(o.intenciones.map((i) => i.queHace.replace(/\.$/, '').toLowerCase()))].slice(0, 4)
      return agrega({ de: 'asistente', texto: `Eso todavía no lo sé hacer, y prefiero decírtelo a inventarlo.${sabe.length ? ` Lo que sí puedo: ${sabe.join('; ')}.` : ''}`, estado: 'no-se' })
    }
    const i = v.intencion
    // La memoria de la capa solo toca lo que el asistente recuerda (se ve y se olvida en Ajustes): no pregunta.
    const paso = i.modulo === 'capa' && !i.irreversible ? 'directo' : antesDe(nivel, i)
    if (paso === 'directo') return ejecuta(i, texto, senal)
    if (paso === 'pregunta') {
      const m = await agrega({ de: 'asistente', texto: `¿Lo hago? ${i.queHace}`, estado: 'pregunta', intencion: i.id, opciones: ['Sí', 'No'] })
      pendientes.set(m.id, { intencion: i, texto })
      return m
    }
    const porque = o.intenciones.find((x) => x.id === i.id)?.queHace ?? i.id
    const s = freno.pide({ accion: i.id, porque, cita: texto, mensajesDeLaPersona: deLaPersona() })
    if (!s.ok) return agrega({ de: 'asistente', texto: `No lo hago: ${s.motivo}.`, estado: 'freno-negado', intencion: i.id })
    const { id: idFreno, accion, categoria, cita, vence } = s.valor
    const m = await agrega({ de: 'asistente', texto: `Esto no tiene vuelta atrás: ${porque.toLowerCase()} Para hacerlo, revisa la cita y dale clic a «Confirmar».`, estado: 'freno', intencion: i.id, freno: { id: idFreno, accion, categoria, porque, cita, vence } })
    pendientes.set(idFreno, { intencion: i, texto })
    return m
  }
  return {
    enrutador,
    freno,
    ajustaNivel: (n) => { nivel = n },
    nivel: () => nivel,
    mensajes: () => lista,
    async carga() {
      const guardados = await o.memoria.recuerdo<Mensaje[]>(MODULO_CAPA, CLAVE_CONVERSACION)
      lista = Array.isArray(guardados) ? guardados.filter((m) => m && typeof m.texto === 'string') : []
      return lista
    },
    async envia(texto, via = 'teclado', senal) {
      const limpio = texto.trim()
      if (!limpio) return null
      const abierta = [...lista].reverse().find((m) => m.de === 'asistente' && m.estado === 'pregunta' && pendientes.has(m.id))
      await agrega({ de: 'persona', texto: limpio, via })
      if (abierta && lista.at(-2)?.id === abierta.id) return contesta(abierta.id, afirma(limpio))
      const recordar = INTENCIONES_DE_LA_CAPA[0]!
      if (o.intenciones.some((i) => i.id === recordar.id) && PIDE_RECORDAR.test(limpio)) {
        return responde({ intencion: recordar, confianza: 1, alternativas: [], motivo: 'coincide' }, limpio, senal)
      }
      return responde(await enrutador.resuelveConCerebro(limpio, o.cerebro ?? null, senal), limpio, senal)
    },
    contesta,
    async descarta(idFreno) {
      freno.descarta(idFreno)
      const p = pendientes.get(idFreno)
      pendientes.delete(idFreno)
      return agrega({ de: 'asistente', texto: 'Va, lo dejo como estaba.', estado: 'hecho', intencion: p?.intencion.id })
    },
    async confirma(idFreno, origen) {
      const p = pendientes.get(idFreno)
      const r = freno.confirma(idFreno, { origen, cita: p?.texto ?? '' })
      if (!r.ok) return agrega({ de: 'asistente', texto: `Sigue en pausa: ${r.motivo}.`, estado: 'freno-negado', intencion: p?.intencion.id })
      pendientes.delete(idFreno)
      return ejecuta(p!.intencion, p!.texto)
    },
  }
}
