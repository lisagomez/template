/**
 * Los manejadores de la ranura de conversación de la mesa: lo que pasa cuando el enrutador de la capa (sin LLM) reconoce
 * una de las intenciones de la conversación que declara el enchufe de Soporte SAP. Hablan SOLO con la API de la mesa
 * (`/api/mesa/soporte-sap`), la misma del formulario: el servidor sabe quién es por el JWT de Access, así que lo que se
 * lee es de SU mesa y lo que se corre se guarda en SU almacén, después de los dos cerrojos de dato personal. No hay otra
 * salida: ni un modelo, ni otra API, ni el navegador (ver `almacen-capa.ts`).
 *
 * El canal se inyecta: en la página es `fetch` contra la API; en las pruebas, la ruta de Next llamada directamente.
 */
import { CLAVE_CONVERSACION, MODULO_CAPA, type Manejadores, type MemoriaProducto } from '../../../../../tools/capa/dist/index.js'
import type { CandidatosVista } from './modelo-candidatos'
import type { CasoVista, EntradaCaso, MesaVista } from './modelo'
import { casoEscritoAntes, cuerpoDelPedido, entradaDelTexto, EVENTO_CASO_CORRIDO, explicaPaso, loQueMeEnsenaste, NO_BORRO, pasoPedido, pideBorrar, respuestaDeCorrida, type MensajeDelHilo, type OrigenDelCaso } from './conversacion'

export const API_DE_LA_MESA = '/api/mesa/soporte-sap'
const PANTALLA_DE_LA_MESA = '/mesa/soporte-sap'

/** Las intenciones de la conversación, como las declara `src/features/soporte-sap/enchufe.json`. */
export const INTENCIONES_DE_LA_CONVERSACION = {
  prueba: 'soporte-sap.prueba-caso',
  explica: 'soporte-sap.explica-paso',
  ensenado: 'soporte-sap.ensenado',
} as const

/** Lo que la conversación necesita de la mesa. Todo por la identidad de quien habla: el servidor la pone, no el cliente. */
export interface CanalMesa {
  vista(): Promise<MesaVista>
  candidatos(): Promise<CandidatosVista>
  /** Corre el caso por el agente de la mesa (sin modelo) y lo guarda. Si la mesa lo rechaza, falla con su motivo. */
  ingresa(entrada: EntradaCaso): Promise<CasoVista>
}

type Consulta = (url: string, init?: RequestInit) => Promise<Response>

export function canalHttp(api = API_DE_LA_MESA, consulta: Consulta = (u, i) => fetch(u, i)): CanalMesa {
  const lee = async <T>(q: string): Promise<T> => {
    const r = await consulta(`${api}${q}`, { cache: 'no-store' })
    if (!r.ok) throw new Error(r.status === 404 ? 'la mesa no te reconoce: vuelve a entrar' : `la mesa respondió ${r.status}`)
    return (await r.json()) as T
  }
  return {
    vista: () => lee<MesaVista>(''),
    candidatos: () => lee<CandidatosVista>('?vista=candidatos'),
    async ingresa(entrada) {
      const r = await consulta(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tipo: 'ingresa', entrada }) })
      const d = (await r.json().catch(() => ({}))) as { caso?: CasoVista; error?: string }
      if (!r.ok || !d.caso) throw new Error(d.error ?? `la mesa respondió ${r.status}`)
      return d.caso
    },
  }
}

/** Le avisa a la mesa (el lienzo) que la conversación corrió un caso, para que lo abra. */
export function avisaCasoCorrido(caso: Pick<CasoVista, 'id'>): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENTO_CASO_CORRIDO, { detail: { caso: caso.id } }))
}

const SIN_CASOS = 'Todavía no hay casos en tu mesa. Dímelo así: «prueba este caso: la MIGO da el mensaje M7 053 al contabilizar» (qué pasa, la transacción y el mensaje), y lo corro.'

/** El hilo de la conversación, de la memoria de la capa (en la pestaña): de ahí sale el caso escrito antes del pedido. */
async function hiloDe(memoria: MemoriaProducto): Promise<MensajeDelHilo[]> {
  const h = await memoria.recuerdo<MensajeDelHilo[]>(MODULO_CAPA, CLAVE_CONVERSACION).catch(() => null)
  return Array.isArray(h) ? h : []
}

/** Qué caso correr: el escrito en el pedido, el escrito justo antes, o el último de la mesa (en ese orden). */
async function casoACorrer(canal: CanalMesa, texto: string, memoria: MemoriaProducto): Promise<{ entrada: EntradaCaso; supuestos: string[]; origen: OrigenDelCaso } | null> {
  const pedido = cuerpoDelPedido(texto)
  const escrito = pedido.caso ?? (pedido.ultimo ? null : casoEscritoAntes(await hiloDe(memoria), texto))
  if (escrito) return { ...entradaDelTexto(escrito), origen: pedido.caso ? 'escrito' : 'anterior' }
  const ultimo = (await canal.vista()).casos[0]
  return ultimo ? { entrada: ultimo.entrada, supuestos: [], origen: 'ultimo' } : null
}

export function manejadoresDeLaMesa(canal: CanalMesa, alCorrer: (caso: CasoVista) => void = () => undefined): Manejadores {
  const { prueba, explica, ensenado } = INTENCIONES_DE_LA_CONVERSACION
  return {
    [prueba]: async ({ texto, memoria }) => {
      if (pideBorrar(texto)) return { texto: NO_BORRO }
      const que = await casoACorrer(canal, texto, memoria)
      if (!que) return { texto: SIN_CASOS }
      const caso = await canal.ingresa(que.entrada)
      alCorrer(caso)
      return { texto: respuestaDeCorrida(caso, que.origen, que.supuestos), ir: PANTALLA_DE_LA_MESA }
    },
    [explica]: async ({ texto }) => ({ texto: explicaPaso((await canal.vista()).casos[0], pasoPedido(texto)) }),
    [ensenado]: async () => {
      const [vista, candidatos] = await Promise.all([canal.vista(), canal.candidatos().catch(() => null)])
      return { texto: loQueMeEnsenaste(vista.casos, candidatos) }
    },
  }
}
