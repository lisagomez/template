/**
 * La puerta de Vercel a la sección en vivo. Recibe lo que la pantalla le pide (ya detrás de la protección de Vercel),
 * lo firma con un secreto que solo vive en el servidor, y lo pasa al portero de la máquina del laboratorio por el
 * túnel. La firma no llega al navegador; el navegador nunca sabe la URL del túnel.
 *
 * Esto NO enciende el laboratorio: en Vercel no hay `SOPORTE_SAP_LABORATORIO` y `/api/soporte-sap` sigue en 404. Si el
 * túnel o la máquina están apagados, se dice así, con un 503 que la pantalla convierte en su aviso.
 */
import { CABECERA_FIRMA, firma, secretoValido } from './firma.ts'
import { RUTA_DEL_LABORATORIO, CUERPO_MAXIMO, consultaValida } from './contrato.ts'
import { datoRealEn } from './sin-datos-reales.ts'

export interface EntornoEnVivo { readonly EN_VIVO_URL?: string; readonly EN_VIVO_SECRETO?: string }
/** El túnel y el secreto, del entorno del servidor. Solo los leen las rutas de la vitrina, nunca el navegador. */
export const entornoEnVivo = (): EntornoEnVivo => ({ EN_VIVO_URL: process.env['EN_VIVO_URL'], EN_VIVO_SECRETO: process.env['EN_VIVO_SECRETO'] })
/** Lo que espera la pantalla: el portero o el laboratorio tardan, sobre todo el OCR de una captura. */
const ESPERA_MS = 50_000

/** La URL del túnel: un origen https, sin ruta (o http solo en esta máquina, para probar). */
export function origenDelTunel(url: string | undefined): string | null {
  try {
    const u = new URL(url ?? '')
    const local = u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
    if ((u.protocol !== 'https:' && !local) || (u.pathname !== '/' && u.pathname !== '') || u.search || u.username || u.password) return null
    return u.origin
  } catch { return null }
}

const apagado = (por: string): Response => Response.json({ apagado: true, error: `El laboratorio en vivo está apagado: ${por}. La vitrina, el journey, el deck y el manual siguen aquí.` }, { status: 503 })

/** ¿La respuesta es del laboratorio (JSON o un export)? Si no, es la página de error del túnel o del portero. */
function esDelLaboratorio(r: Response): boolean {
  const tipo = r.headers.get('content-type') ?? ''
  return tipo.startsWith('application/json') && r.status !== 502
}

export async function atiendeEnVivo(req: Request, env: EntornoEnVivo, reenvia: typeof fetch = fetch, ahora = Date.now): Promise<Response> {
  const origen = origenDelTunel(env.EN_VIVO_URL)
  if (!origen || !secretoValido(env.EN_VIVO_SECRETO)) return apagado('este despliegue no tiene configurado el túnel')
  if (req.method !== 'GET' && req.method !== 'POST') return Response.json({ error: 'método no admitido' }, { status: 405 })
  const consulta = consultaValida(new URL(req.url).searchParams)
  if (consulta === null) return Response.json({ error: 'consulta no admitida en vivo' }, { status: 400 })
  let cuerpo = new Uint8Array()
  if (req.method === 'POST') {
    if (!(req.headers.get('content-type') ?? '').startsWith('application/json')) return Response.json({ error: 'en vivo solo se mandan acciones: los adjuntos son documentos de muestra' }, { status: 415 })
    cuerpo = new Uint8Array(await req.arrayBuffer())
    if (cuerpo.length > CUERPO_MAXIMO) return Response.json({ error: 'la acción es demasiado grande' }, { status: 413 })
    let accion: unknown
    try { accion = JSON.parse(new TextDecoder().decode(cuerpo)) } catch { return Response.json({ error: 'datos inválidos' }, { status: 400 }) }
    // Un dato real no cruza el túnel: se rechaza aquí, y el portero lo vuelve a mirar.
    const dato = datoRealEn(accion)
    if (dato) return Response.json({ error: dato }, { status: 400 })
  }
  const ruta = `${RUTA_DEL_LABORATORIO}?${consulta}`
  const cabeceras: Record<string, string> = { [CABECERA_FIRMA]: firma(env.EN_VIVO_SECRETO!, { metodo: req.method, ruta, cuerpo }, ahora()) }
  if (req.method === 'POST') cabeceras['content-type'] = 'application/json'
  let r: Response
  try {
    r = await reenvia(`${origen}${ruta}`, { method: req.method, headers: cabeceras, body: req.method === 'POST' ? cuerpo : undefined, signal: AbortSignal.timeout(ESPERA_MS), cache: 'no-store' })
  } catch { return apagado('el túnel no responde') }
  if (r.status === 404 && !(r.headers.get('content-type') ?? '').startsWith('application/json')) return apagado('el portero no reconoce la firma de este despliegue')
  if (!esDelLaboratorio(r)) return apagado('la máquina del laboratorio no lo está sirviendo')
  const salida = new Headers({ 'content-type': r.headers.get('content-type')!, 'cache-control': 'no-store' })
  const disposicion = r.headers.get('content-disposition')
  if (disposicion) salida.set('content-disposition', disposicion)
  return new Response(await r.arrayBuffer(), { status: r.status, headers: salida })
}

/**
 * ¿Está encendido? Siempre responde 200, con la vista del cliente si lo está o con el motivo si no: la pantalla pregunta
 * esto primero, para que un laboratorio apagado se diga sin que el navegador lo cuente como un error.
 */
export async function estadoEnVivo(env: EntornoEnVivo, reenvia: typeof fetch = fetch): Promise<Response> {
  const r = await atiendeEnVivo(new Request('http://vitrina/estado?rol=cliente'), env, reenvia)
  const datos = (await r.json()) as { error?: string }
  return Response.json(r.ok ? { encendido: true, vista: datos } : { encendido: false, motivo: datos.error ?? `respondió ${r.status}` }, { headers: { 'cache-control': 'no-store' } })
}
