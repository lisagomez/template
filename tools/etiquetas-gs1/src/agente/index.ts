/**
 * @tu-scope/etiquetas-gs1/agente — agente local de impresion (Node).
 *
 * El servidor de la app usa `emiteTicket` (con el mismo secreto) para autorizar cada trabajo;
 * el agente usa todo lo demas. `emiteTicket` vive aqui y no en el nucleo porque usa node:crypto.
 */
export { emiteTicket, verificaTicket, huellaDe, secretoValido, VIDA_MAXIMA_TICKET_S, type DatosTicket, type PedidoTicket } from './ticket.js'
export { esquemaConfigAgente, esquemaImpresora, leeConfig, avisosConfig, type ConfigAgente, type ImpresoraAgente } from './config.js'
export { creaCola, transporteTcp, type Cola, type Trabajo, type EstadoTrabajo, type Transporte } from './cola.js'
export { creaServidorAgente, type Agente, type OpcionesServidor } from './servidor.js'
export { enviaTcp, consultaEstadoHost, parseaEstadoHost, problemaDeEstado, type EstadoHost } from './tcp.js'

import { creaCola } from './cola.js'
import type { ConfigAgente } from './config.js'
import { creaServidorAgente, type Agente } from './servidor.js'
import { secretoValido } from './ticket.js'

/** Arma cola + servidor con la configuracion dada. El secreto llega de fuera (entorno). */
export async function creaAgente(config: ConfigAgente, secreto: string | undefined, registra: (m: string) => void = () => {}): Promise<Agente & { detiene(): Promise<void> }> {
  if (!secretoValido(secreto)) throw new Error('falta ETIQUETAS_AGENTE_SECRETO (minimo 32 caracteres): sin credencial no se aceptan trabajos')
  const cola = await creaCola(config, undefined, registra)
  const agente = creaServidorAgente({ config, secreto, cola, registra })
  cola.arranca()
  return { ...agente, async detiene() { await agente.cierra(); await cola.detiene() } }
}
