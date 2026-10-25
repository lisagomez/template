/**
 * La mesa del experto por HTTP. GET devuelve SUS casos (o, para el laboratorio, `?vista=laboratorio` y su export); POST
 * ejecuta una acción en JSON. Sin `SOPORTE_SAP_LABORATORIO=1`, sin Access configurado o sin un JWT válido, no existe
 * (404). No acepta archivos: la evidencia son las muestras sintéticas del catálogo.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { contextoDe, NO_EXISTE, type Contexto } from '@/features/soporte-sap/mesa/services/contexto'
import { ingresa, decide, ensena, retroPaso, veredicto, vistaMesa, todosLosCasos, borraCaso, comoVista, Rechazo } from '@/features/soporte-sap/mesa/services/mesa'
import { agrega, exportMarkdown } from '@/features/soporte-sap/mesa/services/laboratorio'
import { datoPersonalEn, revisaCampos } from '@/features/soporte-sap/mesa/services/filtro'
import { ACCION_MESA, ACCION_LABORATORIO } from '@/features/soporte-sap/mesa/services/modelo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CUERPO_MAXIMO = 64_000
const nada = () => new NextResponse('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } })
const SIN_CACHE = { 'cache-control': 'no-store' }

async function contexto(req: NextRequest): Promise<Contexto | Response> {
  const c = await contextoDe(req)
  if (c === NO_EXISTE) return nada()
  if ('sinAlmacen' in c) return NextResponse.json({ error: c.sinAlmacen }, { status: 503 })
  return c
}

export async function GET(req: NextRequest) {
  const c = await contexto(req)
  if (c instanceof Response) return c
  const vista = req.nextUrl.searchParams.get('vista')
  if (vista === null) return NextResponse.json(await vistaMesa(c.almacen, c.id, c.retencionDias), { headers: SIN_CACHE })
  // Lo del laboratorio solo existe para su identidad: para el experto, ni siquiera se dice que hay algo ahí.
  if (vista !== 'laboratorio' || c.id.rol !== 'laboratorio') return nada()
  const casos = await todosLosCasos(c.almacen, c.retencionDias)
  const formato = req.nextUrl.searchParams.get('export')
  const ahora = new Date().toISOString()
  if (formato === 'md') return new NextResponse(exportMarkdown(casos, ahora), { headers: { ...SIN_CACHE, 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': `attachment; filename="mesa-del-experto-${ahora.slice(0, 10)}.md"` } })
  if (formato === 'json') return new NextResponse(JSON.stringify({ exportado: ahora, casos }, null, 2), { headers: { ...SIN_CACHE, 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="mesa-del-experto-${ahora.slice(0, 10)}.json"` } })
  return NextResponse.json({ agregado: agrega(casos), casos, almacen: c.almacen.donde }, { headers: SIN_CACHE })
}

/** El primer motivo legible de un error de validación (lo que la pantalla le dice a la persona, junto a su campo). */
const motivoDe = (e: z.ZodError): string => e.issues[0]?.message && !/^(Invalid|Expected|Required)/.test(e.issues[0].message) ? e.issues[0].message : 'revisa los datos del caso'

async function accion(c: Contexto, cuerpo: unknown, laboratorio: boolean): Promise<unknown> {
  if (laboratorio) {
    if (c.id.rol !== 'laboratorio') return null
    const a = ACCION_LABORATORIO.parse(cuerpo)
    await borraCaso(c.almacen, c.id, a.caso)
    return { ok: true }
  }
  const a = ACCION_MESA.parse(cuerpo)
  if (a.tipo === 'revisa') return { formas: revisaCampos(a.campos) }
  // Primer cerrojo: TODO texto de la acción, antes de que llegue al laboratorio (el segundo, antes de guardarse).
  const dato = datoPersonalEn(a)
  if (dato) throw new Rechazo(dato)
  if (a.tipo === 'ingresa') return { caso: comoVista(await ingresa(c.almacen, c.id, a.entrada, c.version)) }
  if (a.tipo === 'decide') return { caso: comoVista(await decide(c.almacen, c.id, a.caso, a.accion, a.motivo ?? '')) }
  if (a.tipo === 'ensena') return { caso: comoVista(await ensena(c.almacen, c.id, a.caso, a.texto)) }
  if (a.tipo === 'retro_paso') return { caso: comoVista(await retroPaso(c.almacen, c.id, a.caso, a.clave, a.gesto, a.esperaba)) }
  return { caso: comoVista(await veredicto(c.almacen, c.id, a.caso, a.valor, a.solucion, a.nota)) }
}

export async function POST(req: NextRequest) {
  const c = await contexto(req)
  if (c instanceof Response) return c
  if (!(req.headers.get('content-type') ?? '').startsWith('application/json')) return NextResponse.json({ error: 'aquí no se suben archivos: la evidencia son las muestras sintéticas del laboratorio' }, { status: 415 })
  const largo = Number(req.headers.get('content-length') ?? NaN)
  if (largo > CUERPO_MAXIMO) return NextResponse.json({ error: 'la acción es demasiado grande' }, { status: 413 })
  const texto = await req.text()
  if (texto.length > CUERPO_MAXIMO) return NextResponse.json({ error: 'la acción es demasiado grande' }, { status: 413 })
  try {
    const r = await accion(c, JSON.parse(texto), req.nextUrl.searchParams.get('vista') === 'laboratorio')
    return r === null ? nada() : NextResponse.json(r, { headers: SIN_CACHE })
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: motivoDe(e) }, { status: 400 })
    if (e instanceof Rechazo) return NextResponse.json({ error: e.message }, { status: 400 })
    if (e instanceof SyntaxError) return NextResponse.json({ error: 'datos inválidos' }, { status: 400 })
    // Al log va la clase del error, no el texto de la persona: el log también lo guarda un tercero.
    console.error('mesa del experto: error interno', e instanceof Error ? e.name : typeof e)
    return NextResponse.json({ error: 'error interno de la mesa' }, { status: 500 })
  }
}
