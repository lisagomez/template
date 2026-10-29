/**
 * La Puerta A2A de Ágora: por donde entra un agente EXTERNO, y solo él. Toda llamada pasa la misma secuencia antes de
 * tocar nada; lo ajeno y lo inexistente responden IGUAL («no existe»), para que nadie sondee qué hay fuera de su
 * alcance. La cuota es la excepción: 429 con Retry-After, porque solo la ve un agente legítimo dentro de lo suyo.
 *
 *   1. token compacto ES256 con kid           6. idCard vivo (aprobado o en prueba) y vigente — leído SIN caché
 *   2. kid conocido y no revocado             7. card_sha256 del token = la huella FIJADA (si no: deriva)
 *   3. firma válida con la llave fijada       8. alcance: la categoría y la skill pedidas son suyas
 *   4. iss, aud, exp y nbf coherentes         9. topes: mensajes por hora, propuestas por día, gasto del mes
 *   5. jti de un solo uso
 *
 * Lo que entra llega al buzón como DATO (origen «puerta», autor el agente). Lo que pide cambiar algo llega como
 * PROPUESTA en A1: el socio propone y espera. En este goal la Puerta está CERRADA: solo corre en el laboratorio.
 */
import { como } from './base/como.js'
import type { Base } from './base/tipos.js'
import { huellaDeLlave, leeJwt, verificaCompacta } from './llaves.js'
import { propone, EsquemaPayload } from './propuesta.js'
import { supervisa } from './supervisor.js'
import { firmaTarea } from './tarea.js'
import type { JsonWebKey } from 'node:crypto'

export interface PeticionPuerta { org: string; autorizacion: string | null; version: string | null; cuerpo: unknown }
export interface RespuestaPuerta { http: number; cuerpo: Record<string, unknown>; reintentaEn?: number; admitida: boolean; motivo: string }

const NO_EXISTE = -32001
const TOPE = -32029
const VIDA_MAXIMA_S = 600

interface IdCard {
  org: string; agente?: string; slug?: string; nombre?: string; origen?: string; estado?: string; vence?: string | null; card_sha256?: string; llave?: JsonWebKey; llave_sha256?: string
  rol?: string; tope_mensajes_hora?: number; uso_mensajes_hora?: number; tope_propuestas_dia?: number; uso_propuestas_dia?: number; reintenta_mensajes?: number; reintenta_propuestas?: number
  alcance?: Array<{ nodo: string; skills: string[] }>; kid_revocado?: boolean
}

const respuesta = (id: unknown, http: number, admitida: boolean, motivo: string, cuerpo: Record<string, unknown>, reintentaEn?: number): RespuestaPuerta =>
  ({ http, admitida, motivo, reintentaEn, cuerpo: { jsonrpc: '2.0', id: id ?? null, ...cuerpo } })

export async function puerta(base: Base, secreto: string, p: PeticionPuerta, ahora = Date.now()): Promise<RespuestaPuerta> {
  const rpc = (p.cuerpo ?? {}) as { id?: unknown; method?: unknown; params?: Record<string, unknown> }
  const metodo = typeof rpc.method === 'string' ? rpc.method : '¿?'
  let org: string | null = null
  let agente: string | null = null
  let kid: string | null = null
  let jti: string | null = null
  const anota = async (resultado: 'admitida' | 'rechazada', motivo: string, http: number, retry?: number) => {
    if (!org) return
    await como(base, { tipo: 'puerta' }, (s) => s.consulta('select agora.puerta_anota($1, $2, $3, $4, $5, $6, $7, $8, $9)', [org, agente, kid, jti, metodo, resultado, motivo, http, retry ?? null]))
  }
  const noExiste = async (motivo: string) => {
    await anota('rechazada', motivo, 404)
    return respuesta(rpc.id, 404, false, motivo, { error: { code: NO_EXISTE, message: 'no existe' } })
  }

  if (p.version !== '1.0') return respuesta(rpc.id, 400, false, 'versión', { error: { code: -32600, message: 'A2A-Version 1.0 requerida' } })
  if (typeof rpc !== 'object' || rpc === null || (rpc as { jsonrpc?: unknown }).jsonrpc !== '2.0') return respuesta(null, 400, false, 'json-rpc', { error: { code: -32600, message: 'petición JSON-RPC inválida' } })
  const token = p.autorizacion?.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/)?.[1] ?? null
  // 1. token compacto ES256 con kid
  const leido = token ? leeJwt(token) : null
  if (!leido || leido.cabecera.alg !== 'ES256' || typeof leido.cabecera.kid !== 'string') {
    return respuesta(rpc.id, 404, false, 'token mal formado', { error: { code: NO_EXISTE, message: 'no existe' } })
  }
  kid = leido.cabecera.kid
  // 2 y 6: el idCard, SIN caché, en cada llamada.
  const [fila] = await como(base, { tipo: 'puerta' }, (s) => s.consulta<{ c: IdCard | null }>('select agora.puerta_lee($1, $2) c', [p.org, kid]))
  const card = fila?.c
  if (!card) return respuesta(rpc.id, 404, false, 'organización desconocida', { error: { code: NO_EXISTE, message: 'no existe' } })
  org = card.org
  if (card.kid_revocado) return noExiste('llave revocada')
  if (!card.agente || !card.llave) return noExiste('kid desconocido')
  agente = card.agente
  // 3. la firma, con la llave FIJADA (y la llave es la de su huella fijada)
  if (!card.llave_sha256 || huellaDeLlave(card.llave) !== card.llave_sha256) return noExiste('llave fijada alterada')
  if (!verificaCompacta(token!, card.llave)) return noExiste('firma inválida')
  // 4. claims
  const c = leido.claims
  const seg = Math.floor(ahora / 1000)
  if (c.iss !== card.slug || c.aud !== `agora:${p.org}`) return noExiste('emisor o audiencia')
  if (typeof c.exp !== 'number' || typeof c.iat !== 'number' || c.exp <= seg || (typeof c.nbf === 'number' && c.nbf > seg + 30) || c.exp - c.iat > VIDA_MAXIMA_S) return noExiste('token vencido o demasiado largo')
  // 5. jti de un solo uso
  jti = typeof c.jti === 'string' ? c.jti : null
  if (!jti || jti.length < 8) return noExiste('sin jti')
  const [tomado] = await como(base, { tipo: 'puerta' }, (s) => s.consulta<{ ok: boolean }>('select agora.puerta_toma_jti($1, $2, $3) ok', [agente, jti, new Date(c.exp as number * 1000).toISOString()]))
  if (!tomado?.ok) return noExiste('jti repetido')
  // 6. vivo y vigente
  if (!['aprobado', 'prueba'].includes(card.estado ?? '') || card.origen !== 'externo') return noExiste(`idCard ${card.estado}`)
  if (card.vence && card.vence < new Date(ahora).toISOString().slice(0, 10)) return noExiste('idCard vencido')
  // 7. la tarjeta es la aprobada
  if (c.card_sha256 !== card.card_sha256) return noExiste('deriva de la tarjeta')
  // 8. alcance: categoría y skill
  const params = (rpc.params ?? {}) as { message?: { messageId?: unknown; contextId?: unknown; parts?: unknown; metadata?: Record<string, unknown> }; id?: unknown }
  if (!['SendMessage', 'GetTask', 'ListTasks'].includes(metodo)) return noExiste('método')
  if (metodo === 'GetTask' || metodo === 'ListTasks') {
    await anota('admitida', metodo, 200)
    const tareas = await como(base, { tipo: 'agente', token: firmaTarea(secreto, { org, agente }) }, (s) => s.consulta<{ id: string; context_id: string; estado: string }>(
      `select t.id, t.context_id, t.estado from agora.a2a_tarea t where t.agente_id = $1 ${metodo === 'GetTask' ? 'and t.id::text = $2' : 'and $2::text is null'} order by t.creada_en desc limit 100`,
      [agente, metodo === 'GetTask' ? String(params.id ?? '') : null]))
    if (metodo === 'GetTask' && !tareas.length) return noExiste('tarea ajena o inexistente')
    const t = tareas.map((x) => ({ kind: 'task', id: x.id, contextId: x.context_id, status: { state: x.estado } }))
    return respuesta(rpc.id, 200, true, metodo, { result: metodo === 'GetTask' ? t[0] : { tasks: t } })
  }
  const m = params.message
  const meta = m?.metadata ?? {}
  const categoria = typeof meta.categoria === 'string' ? meta.categoria : null
  const skill = typeof meta.skill === 'string' ? meta.skill : null
  const alcance = (card.alcance ?? []).find((x) => x.nodo === categoria)
  if (!categoria || !skill || !alcance || !alcance.skills.includes(skill)) return noExiste('fuera de alcance')
  if (typeof m?.messageId !== 'string' || !Array.isArray(m.parts)) return respuesta(rpc.id, 400, false, 'mensaje inválido', { error: { code: -32602, message: 'mensaje inválido' } })
  // 9. topes (al 100 %: 429 con el momento de reintentar)
  const partes = m.parts as Array<{ kind?: string; text?: string; data?: Record<string, unknown> }>
  const pide = partes.find((x) => x.kind === 'data' && x.data && typeof x.data === 'object' && 'propuesta' in x.data)?.data?.propuesta as { resumen?: unknown; payload?: unknown } | undefined
  const sobre = async (motivo: string, retry: number) => {
    await anota('rechazada', motivo, 429, retry)
    return respuesta(rpc.id, 429, false, motivo, { error: { code: TOPE, message: `tope: ${motivo}`, data: { retryAfter: retry } } }, retry)
  }
  if ((card.uso_mensajes_hora ?? 0) >= (card.tope_mensajes_hora ?? 0)) return sobre('mensajes por hora', card.reintenta_mensajes ?? 3600)
  if (pide && (card.uso_propuestas_dia ?? 0) >= (card.tope_propuestas_dia ?? 0)) return sobre('propuestas por día', card.reintenta_propuestas ?? 86400)
  const [g] = await como(base, { tipo: 'puerta' }, (s) => s.consulta<{ g: { uso: string; tope: string; reintenta: number; org: string; tope_org: string } }>('select agora.puerta_gasto($1) g', [agente]))
  if (g && (Number(g.g.uso) >= Number(g.g.tope) || Number(g.g.org) >= Number(g.g.tope_org))) return sobre('gasto de modelo del mes', g.g.reintenta)
  // Admitida: la llamada cuenta para su tope; el mensaje entra al buzón como dato; lo que cambia algo, como propuesta A1.
  await anota('admitida', 'SendMessage', 200)
  const tokenAgente = firmaTarea(secreto, { org, agente })
  const texto = partes.filter((x) => x.kind === 'text' && typeof x.text === 'string').map((x) => x.text).join('\n').slice(0, 4000) || '(sin texto)'
  const contexto = typeof m.contextId === 'string' ? m.contextId : `categoria:${categoria}`
  const r = await como(base, { tipo: 'agente', token: tokenAgente }, async (s) => {
    const [canal] = await s.consulta<{ id: string }>('select id from agora.canal where categoria_id = $1', [categoria])
    const [t] = await s.consulta<{ id: string }>(`select id from agora.a2a_tarea where agente_id = $1 and message_id = $2`, [agente, m.messageId])
    if (t) return { tarea: t.id, propuesta: null as string | null, motivo: 'reintento: misma tarea' }
    let propuestaId: string | null = null
    let motivo = 'mensaje en el hilo'
    if (pide) {
      const payload = EsquemaPayload.safeParse(pide.payload)
      if (!payload.success || payload.data.categoria !== categoria) motivo = 'propuesta inválida: queda solo el mensaje'
      else {
        const v = await supervisa(s, payload.data, { autor: { tipo: 'agente', origen: 'externo', autonomia: 'A1' }, nivel: 'A1' })
        if (!v.ok) motivo = `el supervisor la frenó: ${v.motivo}`
        else {
          const pr = await propone(s, { org: org!, autorAgente: agente!, resumen: String(pide.resumen ?? 'propuesta del socio').slice(0, 400), payload: payload.data, nivel: 'A1', taskId: m.messageId as string })
          propuestaId = pr.id
          motivo = 'propuesta en el hilo'
        }
      }
    }
    await s.consulta(`insert into agora.mensaje (org_id, canal_id, autor_tipo, autor_agente, cuerpo, origen, propuesta_id) values ($1, $2, 'agente', $3, $4, 'puerta', $5)`, [org, canal!.id, agente, texto, propuestaId])
    return { tarea: null as string | null, propuesta: propuestaId, motivo }
  })
  const idTarea = r.tarea ?? (await como(base, { tipo: 'puerta' }, (s) => s.consulta<{ t: string }>('select agora.puerta_registra_tarea($1, $2, $3, $4) t',
    [agente, contexto, m.messageId, r.propuesta ? 'input-required' : 'submitted'])))[0]!.t
  return respuesta(rpc.id, 200, true, r.motivo, { result: { kind: 'task', id: idTarea, contextId: contexto, status: { state: r.propuesta ? 'input-required' : 'submitted', message: { role: 'agent', parts: [{ kind: 'text', text: r.propuesta ? 'Tu propuesta llegó al hilo: la decide una persona de Ágora.' : 'Mensaje recibido en el hilo.' }] } } } })
}
