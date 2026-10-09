/**
 * El laboratorio de Soporte SAP por HTTP: GET devuelve lo que ve un rol; POST levanta una incidencia
 * (multipart, con adjuntos) o ejecuta una acción (JSON). Apagado sin `SOPORTE_SAP_LABORATORIO=1`.
 * Sin `service_role` ni base: el estado vive en memoria y es sintético.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { encendido, levanta, actua, Rechazo, BYTES_MAXIMOS_POR_ADJUNTO } from '@/features/soporte-sap/services/runtime'
import { vista } from '@/features/soporte-sap/services/vistas'
import { SESIONES, type Rol } from '@/features/soporte-sap/services/tipos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ROL = z.enum(['cliente', 'consultor', 'superadmin', 'experto'])
const ACCION = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('decide'), mensaje: z.string().min(1).max(200), accion: z.enum(['aprobar', 'rechazar', 'a_revision']), motivo: z.string().max(2000).optional() }),
  z.object({ tipo: z.literal('chat'), texto: z.string().min(1).max(2000) }),
  z.object({ tipo: z.literal('espera_cliente'), incidencia: z.string().min(1).max(40) }),
  z.object({ tipo: z.literal('responde_cliente'), incidencia: z.string().min(1).max(40) }),
  z.object({ tipo: z.literal('responde'), incidencia: z.string().min(1).max(40), texto: z.string().trim().min(5).max(2000) }),
  z.object({ tipo: z.literal('al_nucleo'), propuesta: z.string().min(1).max(40) }),
  z.object({ tipo: z.literal('fija_presupuesto'), consultora: z.string().min(1).max(40), topeTokens: z.number().int().min(0).max(1e9).nullable(), topePaginasOcr: z.number().int().min(0).max(1e6).nullable() }),
  z.object({ tipo: z.literal('impugna'), incidencia: z.string().min(1).max(40), campo: z.enum(['prioridad', 'categoria', 'complejidad', 'pausa']), motivo: z.string().trim().min(10).max(2000) }),
  z.object({ tipo: z.literal('resuelve_impugnacion'), incidencia: z.string().min(1).max(40), impugnacion: z.string().min(1).max(60), decision: z.enum(['aceptada', 'rechazada']) }),
  z.object({ tipo: z.literal('reinicia') }),
])
const MAX_ADJUNTOS = 5
/**
 * Lo más que puede pesar una subida: cinco adjuntos del tamaño máximo de la ingesta y el formulario. Se mira ANTES de
 * `formData()`, que lo carga todo en memoria (PRP-010 H-23): una petición sin su tamaño declarado o más grande no entra.
 */
const MAX_CUERPO = MAX_ADJUNTOS * BYTES_MAXIMOS_POR_ADJUNTO + 64_000

const apagado = () => NextResponse.json({ error: 'el laboratorio de Soporte SAP está apagado (SOPORTE_SAP_LABORATORIO=1)' }, { status: 404 })
const sesionDe = (req: NextRequest) => SESIONES[ROL.catch('cliente').parse(req.nextUrl.searchParams.get('rol')) as Rol]

export function GET(req: NextRequest) {
  if (!encendido()) return apagado()
  return NextResponse.json(vista(sesionDe(req)))
}

export async function POST(req: NextRequest) {
  if (!encendido()) return apagado()
  const s = sesionDe(req)
  try {
    if ((req.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
      const largo = Number(req.headers.get('content-length') ?? NaN)
      if (!(largo > 0 && largo <= MAX_CUERPO)) return NextResponse.json({ error: `la subida no declara su tamaño o pasa de ${MAX_CUERPO} bytes`, vista: vista(s) }, { status: 413 })
      const f = await req.formData()
      const datos = z.object({ titulo: z.string().trim().min(3).max(120), descripcion: z.string().trim().min(3).max(4000) }).parse({ titulo: f.get('titulo'), descripcion: f.get('descripcion') })
      const archivos = f.getAll('adjuntos').filter((x): x is File => x instanceof File && x.size > 0).slice(0, MAX_ADJUNTOS)
      const id = await levanta(s, { ...datos, archivos: await Promise.all(archivos.map(async (a) => ({ nombre: a.name, bytes: new Uint8Array(await a.arrayBuffer()) }))) })
      return NextResponse.json({ id, vista: vista(s) })
    }
    actua(s, ACCION.parse(await req.json()))
    return NextResponse.json({ vista: vista(s) })
  } catch (e) {
    // Al usuario solo le llega lo que el laboratorio le dice a propósito; un error interno se queda en el log (PRP-010 H-25).
    const publico = e instanceof z.ZodError ? 'datos inválidos' : e instanceof Rechazo ? e.message : null
    if (publico === null) console.error('soporte-sap: error interno', e)
    return NextResponse.json({ error: publico ?? 'error interno del laboratorio', vista: vista(s) }, { status: publico === null ? 500 : 400 })
  }
}
