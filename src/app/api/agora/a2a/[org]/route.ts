/**
 * La Puerta A2A de Ágora por HTTP (JSON-RPC 2.0, A2A 1.0). CERRADA: solo responde con AGORA_LABORATORIO=1 y a una
 * petición hecha en ESTA máquina (Host localhost/127.0.0.1, sin X-Forwarded-For); en cualquier otro caso, «no existe».
 * Abrirla a un socio real exige C3 y C4 firmados y la doble firma humana (fuera de este goal).
 */
import { puerta } from '../../../../../../tools/agora/dist/index.js'
import { laboratorio } from '@/features/agora/services/laboratorio'

const NO_EXISTE = { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'no existe' } }

export async function POST(req: Request, ctx: { params: Promise<{ org: string }> }) {
  const lab = laboratorio()
  const host = req.headers.get('host') ?? ''
  const local = /^(localhost|127\.0\.0\.1)(:\d{2,5})?$/.test(host) && !req.headers.get('x-forwarded-for') && !req.headers.get('forwarded')
  if (!lab.activo || !local) return Response.json(NO_EXISTE, { status: 404 })
  const { org } = await ctx.params
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(org)) return Response.json(NO_EXISTE, { status: 404 })
  const texto = await req.text()
  if (texto.length > 64_000) return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'demasiado grande' } }, { status: 413 })
  let cuerpo: unknown = null
  try { cuerpo = JSON.parse(texto) } catch { return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } }, { status: 400 }) }
  const r = await puerta(lab.entorno.base, lab.entorno.secreto, { org, autorizacion: req.headers.get('authorization'), version: req.headers.get('a2a-version'), cuerpo })
  return Response.json(r.cuerpo, { status: r.http, headers: r.reintentaEn ? { 'Retry-After': String(r.reintentaEn) } : undefined })
}
