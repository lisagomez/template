/**
 * @tu-scope/etiquetas-gs1/navegador — los dos caminos para que el ZPL llegue a la Zebra desde
 * el navegador, solo con `fetch` (sin dependencias):
 *
 * 1. **Zebra Browser Print**: la app de Zebra instalada en el equipo expone un servicio local
 *    (http://127.0.0.1:9100, https://127.0.0.1:9101). Se habla su protocolo HTTP (el mismo
 *    que usa su SDK): /available, /default, /write. El cuerpo va como text/plain para no
 *    disparar el preflight de CORS, igual que el SDK.
 * 2. **Agente local de la casa**: POST /v1/trabajos con la credencial por trabajo que firmo el
 *    servidor. Ver `../agente/`.
 */

export interface DispositivoZebra {
  readonly name: string
  readonly uid: string
  readonly connection: string
  readonly deviceType: string
  readonly version?: number
  readonly provider?: string
  readonly manufacturer?: string
}

export const BROWSER_PRINT_HTTP = 'http://127.0.0.1:9100'
export const BROWSER_PRINT_HTTPS = 'https://127.0.0.1:9101'

export function baseBrowserPrint(protocoloPagina: string): string {
  return protocoloPagina === 'https:' ? BROWSER_PRINT_HTTPS : BROWSER_PRINT_HTTP
}

const conTiempo = (ms: number): AbortSignal => AbortSignal.timeout(ms)

export async function impresorasBrowserPrint(base: string): Promise<DispositivoZebra[]> {
  const r = await fetch(`${base}/available`, { signal: conTiempo(4000) })
  if (!r.ok) throw new Error(`Browser Print respondió ${r.status}`)
  const j = (await r.json()) as { printer?: DispositivoZebra[] }
  return (j.printer ?? []).filter((d) => d.deviceType === 'printer')
}

export async function predeterminadaBrowserPrint(base: string): Promise<DispositivoZebra | undefined> {
  const r = await fetch(`${base}/default?type=printer`, { signal: conTiempo(4000) })
  if (!r.ok) return undefined
  const texto = await r.text()
  return texto ? (JSON.parse(texto) as DispositivoZebra) : undefined
}

export async function enviaBrowserPrint(base: string, dispositivo: DispositivoZebra, zpl: string): Promise<void> {
  const r = await fetch(`${base}/write`, { method: 'POST', headers: { 'content-type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ device: dispositivo, data: zpl }), signal: conTiempo(15000) })
  if (!r.ok) throw new Error(`Browser Print no pudo imprimir (${r.status}): ${await r.text()}`)
}

// --- Agente local -------------------------------------------------------------------------

export interface RespuestaAgente {
  readonly id: string
  readonly estado: string
  readonly intentos?: number
  readonly ultimoError?: string
}

export async function saludAgente(base: string): Promise<{ ok: boolean; sitio: string; impresoras: { id: string; nombre: string }[]; pendientes: number; fallidos: number }> {
  const r = await fetch(`${base}/v1/salud`, { signal: conTiempo(3000) })
  if (!r.ok) throw new Error(`el agente respondió ${r.status}`)
  return (await r.json()) as { ok: boolean; sitio: string; impresoras: { id: string; nombre: string }[]; pendientes: number; fallidos: number }
}

export async function enviaAlAgente(base: string, ticket: string, trabajo: { impresora: string; zpl: string; copias: number }): Promise<RespuestaAgente> {
  const r = await fetch(`${base}/v1/trabajos`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Ticket ${ticket}` }, body: JSON.stringify(trabajo), signal: conTiempo(8000) })
  const j = (await r.json()) as RespuestaAgente & { error?: string }
  if (!r.ok) throw new Error(j.error ?? `el agente respondió ${r.status}`)
  return j
}

export async function estadoEnAgente(base: string, ticket: string, id: string): Promise<RespuestaAgente> {
  const r = await fetch(`${base}/v1/trabajos/${id}`, { headers: { authorization: `Ticket ${ticket}` }, signal: conTiempo(4000) })
  const j = (await r.json()) as RespuestaAgente & { error?: string }
  if (!r.ok) throw new Error(j.error ?? `el agente respondió ${r.status}`)
  return j
}
