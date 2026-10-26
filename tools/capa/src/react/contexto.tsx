'use client'

/**
 * El proveedor de la capa: arma la memoria del producto, la conversación (intención + freno) y la voz, y se los
 * da a la ventana y a las ranuras. El producto le pasa SU composición resuelta, sus manejadores y sus
 * componentes por ranura: la capa no conoce a ningún módulo por nombre.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import type { ProductoResuelto } from '../composicion.js'
import { creaConversacion, type Conversacion, type Manejadores, type Mensaje } from '../conversacion.js'
import { esClicHumano } from '../freno.js'
import { creaMemoria, MODULO_CAPA, type Almacen, type MemoriaProducto } from '../memoria.js'
import { ESTADO_INICIAL, leeEstado, type EstadoPrimerArranque, type NivelPregunta } from '../primer-arranque.js'
import type { Ranura } from '../ranuras.js'
import { microfonoAbierto, type AvisoConversacion, type ControlConversacion, type EstadoConversacion, type ModuloDeVoz } from '../voz.js'
import { AlmacenNavegador } from './almacen-navegador.js'

/** Lo que un módulo pinta en una ranura. Recibe la capa por contexto (`useCapa`). */
export type ComponentesDeModulo = Partial<Record<Ranura, ComponentType>>

export interface PropsCapa {
  producto: ProductoResuelto
  inquilino: string
  manejadores: Manejadores
  componentes?: Readonly<Record<string, ComponentesDeModulo>>
  voz?: ModuloDeVoz
  almacen?: Almacen
  ruta?: string
  navega?: (ruta: string) => void
  children: ReactNode
}

export interface ValorCapa {
  producto: ProductoResuelto
  memoria: MemoriaProducto
  conversacion: Conversacion
  mensajes: readonly Mensaje[]
  cargada: boolean
  ocupada: boolean
  envia(texto: string, via?: 'teclado' | 'voz'): Promise<void>
  contesta(id: string, si: boolean): Promise<void>
  /** Confirma lo irreversible con el EVENTO del clic: solo un clic humano pasa (`esClicHumano`). */
  confirma(idFreno: string, evento: { detail: number; isTrusted: boolean }): Promise<void>
  descarta(idFreno: string): Promise<void>
  primerArranque: EstadoPrimerArranque
  guardaPrimerArranque(e: EstadoPrimerArranque): void
  nivel: NivelPregunta
  cambiaNivel(n: NivelPregunta): void
  voz: ModuloDeVoz | null
  control: ControlConversacion | null
  estadoVoz: EstadoConversacion
  ultimoAviso: AvisoConversacion | null
  componentes: Readonly<Record<string, ComponentesDeModulo>>
  ruta: string
  navega(ruta: string): void
  persistente: boolean
}

const Contexto = createContext<ValorCapa | null>(null)

export function useCapa(): ValorCapa {
  const v = useContext(Contexto)
  if (!v) throw new Error('useCapa fuera de <CapaProveedor>')
  return v
}

function useConversacion(p: PropsCapa, memoria: MemoriaProducto) {
  const conversacion = useMemo(
    () => creaConversacion({ intenciones: p.producto.intenciones, manejadores: p.manejadores, memoria, nivel: ESTADO_INICIAL.nivel }),
    [p.producto.intenciones, p.manejadores, memoria],
  )
  const [mensajes, setMensajes] = useState<readonly Mensaje[]>([])
  const [cargada, setCargada] = useState(false)
  const [ocupada, setOcupada] = useState(false)
  useEffect(() => {
    let vivo = true
    conversacion.carga().then((m) => { if (vivo) { setMensajes(m); setCargada(true) } }, () => { if (vivo) setCargada(true) })
    return () => { vivo = false }
  }, [conversacion])
  const corre = useCallback(async (fn: () => Promise<unknown>) => {
    setOcupada(true)
    try { await fn() } finally { setMensajes([...conversacion.mensajes()]); setOcupada(false) }
  }, [conversacion])
  return { conversacion, mensajes, cargada, ocupada, corre }
}

/** El control del Modo conversación existe solo si la ranura de voz puede conversar con lo que declaró el producto. */
function useVoz(voz: ModuloDeVoz | undefined, puede: boolean, conversacion: Conversacion, refresca: () => void) {
  const [estadoVoz, setEstadoVoz] = useState<EstadoConversacion>('apagado')
  const [ultimoAviso, setUltimoAviso] = useState<AvisoConversacion | null>(null)
  const control = useMemo(() => (!puede ? null : voz?.creaControl?.({
    responde: async (texto) => {
      const m = await conversacion.envia(texto, 'voz')
      refresca()
      return { texto: m?.texto ?? '', frenada: m?.estado === 'freno' }
    },
  })) ?? null, [voz, puede, conversacion, refresca])
  useEffect(() => {
    if (!control) return
    const quita = control.suscribe((a) => { setEstadoVoz(a.estado); setUltimoAviso(a) })
    return () => { quita(); control.apaga() }
  }, [control])
  return { control, estadoVoz, ultimoAviso }
}

export function CapaProveedor(p: PropsCapa) {
  const almacen = useMemo(() => p.almacen ?? new AlmacenNavegador(), [p.almacen])
  const { composicion } = p.producto
  const memoria = useMemo(
    () => creaMemoria({ almacen, producto: composicion.producto, inquilino: p.inquilino, permisos: p.producto.permisos }),
    [almacen, composicion.producto, p.inquilino, p.producto.permisos],
  )
  const [primerArranque, setPrimerArranque] = useState<EstadoPrimerArranque>(ESTADO_INICIAL)
  const { conversacion, mensajes, cargada, ocupada, corre } = useConversacion(p, memoria)
  const [, setTic] = useState(0)
  const refresca = useCallback(() => setTic((t) => t + 1), [])
  const puedeConversar = p.producto.voz.puede.conversar && Boolean(p.producto.ranuras.voz.quien)
  const { control, estadoVoz, ultimoAviso } = useVoz(p.voz, puedeConversar, conversacion, refresca)
  useEffect(() => {
    let vivo = true
    memoria.recuerdo(MODULO_CAPA, 'primer-arranque').then((x) => {
      if (!vivo) return
      const e = leeEstado(x)
      conversacion.ajustaNivel(e.nivel)
      setPrimerArranque(e)
    }, () => undefined)
    return () => { vivo = false }
  }, [memoria, conversacion])
  const guardaPrimerArranque = useCallback((e: EstadoPrimerArranque) => {
    conversacion.ajustaNivel(e.nivel)
    setPrimerArranque(e)
    void memoria.recuerda(MODULO_CAPA, 'primer-arranque', e)
  }, [memoria, conversacion])
  const valor: ValorCapa = {
    producto: p.producto,
    memoria,
    conversacion,
    // Tras cargar, la lista viva es la de la conversación (los turnos hablados también la cambian).
    mensajes: cargada ? conversacion.mensajes() : mensajes,
    cargada,
    ocupada,
    envia: (texto, via = 'teclado') => corre(() => conversacion.envia(texto, via)),
    contesta: (id, si) => corre(() => conversacion.contesta(id, si)),
    confirma: (id, evento) => corre(() => conversacion.confirma(id, esClicHumano(evento) ? 'clic' : evento.detail === 0 ? 'teclado' : 'agente')),
    descarta: (id) => corre(() => conversacion.descarta(id)),
    primerArranque,
    guardaPrimerArranque,
    nivel: primerArranque.nivel,
    cambiaNivel: (nivel) => guardaPrimerArranque({ ...primerArranque, nivel }),
    // Sin ranura de voz visible no se ofrece nada de voz, aunque el producto haya pasado un módulo.
    voz: p.producto.voz.visible ? p.voz ?? null : null,
    control,
    estadoVoz,
    ultimoAviso,
    componentes: p.componentes ?? {},
    ruta: p.ruta ?? '',
    navega: p.navega ?? (() => undefined),
    persistente: !(almacen instanceof AlmacenNavegador) || almacen.persistente,
  }
  return <Contexto.Provider value={valor}>{p.children}</Contexto.Provider>
}

export { microfonoAbierto }
