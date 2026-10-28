/**
 * El coordinador: un grafo de pasos con punto de control en la base (el patrón `interrupt()` de LangGraph, sin su
 * dependencia). Habla por el buzón y PROPONE; nunca aprueba. Solo él llama al modelo, y antes pasa por la guardia
 * de gasto: sin cupo (del agente que se cobra o de la organización) no se llama, y sigue solo con reglas.
 *
 *   ingesta → enrutador (guardia de gasto) → coordinador (modelo) → supervisor → política (A1/A2) → aprobación
 *   (interrupt: queda esperando) … reanuda → la base dice si hay aprobación → aplicar → fin
 *
 * Al reanudar NO se cree en el dato de reanudación: el nodo relee en la base la propuesta y sus firmas. Un «aprobado:
 * true» falsificado no aplica nada. Lo previo al interrupt es idempotente (claves por hilo y paso).
 */
import { como } from './base/como.js'
import type { Base, Sesion } from './base/tipos.js'
import { comoDato, type Modelo } from './modelo.js'
import { aplica, propone, REVERSIBLES_A2 } from './propuesta.js'
import { supervisa } from './supervisor.js'
import { firmaTarea } from './tarea.js'

export interface OpcionesCoordinador { base: Base; secreto: string; modelo: Modelo }
export type ResultadoGrafo =
  | { estado: 'ignorado'; motivo: string }
  | { estado: 'sin-modelo'; motivo: string; thread: string }
  | { estado: 'respondido'; thread: string; texto: string }
  | { estado: 'frenado'; thread: string; motivo: string }
  | { estado: 'esperando'; thread: string; propuesta: string; sha256: string }
  | { estado: 'aplicado'; thread: string; propuesta: string }
  | { estado: 'rechazado'; thread: string; motivo: string }

interface Leido { id: string; org_id: string; canal_id: string; categoria_id: string; categoria: string; hilo_id: string | null; autor_tipo: string; autor_persona: string | null; autor_agente: string | null; origen: string; cuerpo: string }

const sesion = (o: OpcionesCoordinador, org: string, coord: string) => <T>(fn: (s: Sesion) => Promise<T>) =>
  como(o.base, { tipo: 'agente', token: firmaTarea(o.secreto, { org, agente: coord }) }, fn)

async function coordinadorDe(base: Base, org: string): Promise<string | null> {
  return (await base.consulta<{ id: string }>(`select id from agora.agente where org_id = $1 and rol = 'coordinador' and origen = 'interno' and estado = 'aprobado' limit 1`, [org]))[0]?.id ?? null
}

async function punto(s: Sesion, d: { org: string; thread: string; paso: number; nodo: string; estado: Record<string, unknown>; propuesta?: string | null; agente: string }) {
  await s.consulta(`insert into agora.grafo_punto (org_id, thread_id, paso, nodo, estado, propuesta_id, agente_id) values ($1, $2, $3, $4, $5, $6, $7) on conflict (thread_id, paso) do nothing`,
    [d.org, d.thread, d.paso, d.nodo, JSON.stringify(d.estado), d.propuesta ?? null, d.agente])
}

async function responde(s: Sesion, m: Leido, coord: string, cuerpo: string, propuesta: string | null = null, clave: string | null = null) {
  await s.consulta(`insert into agora.mensaje (org_id, canal_id, hilo_id, autor_tipo, autor_agente, cuerpo, propuesta_id, clave) values ($1, $2, $3, 'agente', $4, $5, $6, $7) on conflict do nothing`,
    [m.org_id, m.canal_id, m.hilo_id ?? m.id, coord, cuerpo, propuesta, clave])
}

/** Atiende un mensaje del buzón. Devuelve dónde quedó el grafo. */
export async function atiende(o: OpcionesCoordinador, mensajeId: string): Promise<ResultadoGrafo> {
  const [org] = await o.base.consulta<{ org_id: string }>('select org_id from agora.mensaje where id = $1', [mensajeId])
  if (!org) return { estado: 'ignorado', motivo: 'no existe' }
  const coord = await coordinadorDe(o.base, org.org_id)
  if (!coord) return { estado: 'ignorado', motivo: 'no hay coordinador vivo' }
  const como_ = sesion(o, org.org_id, coord)
  // 1. ingesta: lo lee COMO el coordinador (solo lo de su alcance existe para él)
  const [m] = await como_((s) => s.consulta<Leido>(`select m.id, m.org_id, m.canal_id, k.categoria_id, n.nombre categoria, m.hilo_id, m.autor_tipo, m.autor_persona, m.autor_agente, m.origen, m.cuerpo
      from agora.mensaje m join agora.canal k on k.id = m.canal_id join agora.nodo n on n.id = k.categoria_id where m.id = $1`, [mensajeId]))
  if (!m) return { estado: 'ignorado', motivo: 'fuera del alcance del coordinador' }
  if (m.origen.startsWith('espejo')) return { estado: 'ignorado', motivo: 'un espejo replica en lectura: no crea tareas' }
  if (m.autor_tipo === 'sistema' || m.autor_agente === coord) return { estado: 'ignorado', motivo: 'no se contesta a sí mismo ni a los avisos' }
  const thread = `categoria:${m.categoria_id}:hilo:${m.hilo_id ?? m.id}:mensaje:${m.id}`
  const ya = await como_((s) => s.consulta<{ nodo: string; propuesta_id: string | null }>('select nodo, propuesta_id from agora.grafo_punto where thread_id = $1 order by paso desc limit 1', [thread]))
  if (ya[0]?.nodo === 'aprobacion' && ya[0].propuesta_id) {
    const [p] = await como_((s) => s.consulta<{ sha256: string }>('select sha256 from agora.propuesta where id = $1', [ya[0]!.propuesta_id]))
    return { estado: 'esperando', thread, propuesta: ya[0].propuesta_id, sha256: p!.sha256 }
  }
  await como_((s) => punto(s, { org: m.org_id, thread, paso: 1, nodo: 'ingesta', estado: { origen: m.origen, autor: m.autor_tipo }, agente: coord }))
  // 2. enrutador: a quién se cobra (el agente que originó; si fue una persona, el que ejecuta) y la guardia de gasto
  const cobrado = m.autor_tipo === 'agente' && m.autor_agente ? m.autor_agente : coord
  const [g] = await como_((s) => s.consulta<{ r: { ok: boolean; motivo?: string } }>('select agora.puede_llamar_modelo($1) r', [cobrado]))
  await como_((s) => punto(s, { org: m.org_id, thread, paso: 2, nodo: 'enrutador', estado: { cobrado, guardia: g!.r }, agente: coord }))
  if (!g!.r.ok) {
    await como_((s) => responde(s, m, coord, `No llamo al modelo: ${g!.r.motivo}. Sigo solo con reglas; lo que necesite un modelo espera a que se abra el cupo.`, null, `grafo:${thread}:sin-modelo`))
    return { estado: 'sin-modelo', motivo: g!.r.motivo ?? 'sin cupo', thread }
  }
  // 3. coordinador: el modelo (inyectado), con el mensaje DELIMITADO como dato
  const items = await como_((s) => s.consulta<{ id: string; nombre: string; inicio: string | null; fin: string | null; monto: number | null; progreso: number }>(
    `select id, nombre, inicio::text, fin::text, monto_mxn::float8 monto, progreso from agora.item where categoria_id = $1 and estado <> 'done'`, [m.categoria_id]))
  const [hoy] = await o.base.consulta<{ hoy: string }>(`select (now() at time zone 'America/Mexico_City')::date::text hoy`)
  const salida = await o.modelo.genera({ dato: comoDato(m.cuerpo), categoria: { id: m.categoria_id, nombre: m.categoria }, items, hoy: hoy!.hoy })
  await como_(async (s) => {
    await s.consulta(`insert into agora.gasto_modelo (org_id, agente_id, ejecutado_por, solicitado_por, categoria_id, proveedor, modelo, tokens_entrada, tokens_salida, costo_usd) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [m.org_id, cobrado, coord, m.autor_persona, m.categoria_id, o.modelo.proveedor, o.modelo.id, salida.uso?.entrada ?? null, salida.uso?.salida ?? null, salida.uso?.costoUsd ?? null])
    await punto(s, { org: m.org_id, thread, paso: 3, nodo: 'coordinador', estado: { modelo: o.modelo.id, plan: Boolean(salida.plan), uso: salida.uso }, agente: coord })
  })
  if (!salida.plan) {
    await como_((s) => responde(s, m, coord, salida.texto, null, `grafo:${thread}:respuesta`))
    return { estado: 'respondido', thread, texto: salida.texto }
  }
  // 4. supervisor (sin modelo) y 5. política: A2 solo lo reversible sin dinero ni terceros; lo demás, A1
  const reversible = salida.plan.payload.clase === 'editar' && (salida.plan.payload.cambios ?? []).every((c) => (REVERSIBLES_A2 as readonly string[]).includes(c.campo))
  const nivel = reversible ? 'A2' : 'A1'
  const v = await como_((s) => supervisa(s, salida.plan!.payload, { autor: { tipo: 'agente', origen: 'interno', autonomia: 'A2' }, nivel }))
  await como_((s) => punto(s, { org: m.org_id, thread, paso: 4, nodo: 'supervisor', estado: { ok: v.ok, motivo: v.motivo }, agente: coord }))
  if (!v.ok) {
    await como_((s) => responde(s, m, coord, `El supervisor frenó mi propuesta antes del hilo: ${v.motivo}.`, null, `grafo:${thread}:frenado`))
    return { estado: 'frenado', thread, motivo: v.motivo ?? '' }
  }
  // 6. aprobación: la propuesta llega al hilo con su huella y el grafo se DETIENE (interrupt)
  const p = await como_(async (s) => {
    // Cita el mensaje que la originó: la base toma como solicitante a quien lo escribió (segregación de funciones).
    const pr = await propone(s, { org: m.org_id, autorAgente: coord, mensajeOrigen: m.autor_tipo === 'humano' ? m.id : null, resumen: salida.plan!.resumen, payload: salida.plan!.payload, nivel, clave: `grafo:${thread}`, threadId: thread })
    await responde(s, m, coord, salida.texto, pr.id, `grafo:${thread}:propuesta`)
    await punto(s, { org: m.org_id, thread, paso: 5, nodo: 'politica', estado: { nivel }, agente: coord })
    await punto(s, { org: m.org_id, thread, paso: 6, nodo: 'aprobacion', estado: { esperando: pr.id, sha256: pr.sha256 }, propuesta: pr.id, agente: coord })
    return pr
  })
  if (nivel === 'A2') return reanuda(o, m.org_id, thread, { aprobado: true })
  return { estado: 'esperando', thread, propuesta: p.id, sha256: p.sha256 }
}

/**
 * Reanuda un hilo detenido en «aprobación». `dato` es lo que manda quien reanuda (un cliente, un webhook): NO se cree.
 * El nodo relee en la base la propuesta y sus firmas; solo eso decide.
 */
export async function reanuda(o: OpcionesCoordinador, org: string, thread: string, dato: Record<string, unknown> = {}): Promise<ResultadoGrafo> {
  const coord = await coordinadorDe(o.base, org)
  if (!coord) return { estado: 'rechazado', thread, motivo: 'no hay coordinador vivo' }
  const como_ = sesion(o, org, coord)
  const [ultimo] = await como_((s) => s.consulta<{ nodo: string; paso: number; propuesta_id: string | null }>('select nodo, paso, propuesta_id from agora.grafo_punto where thread_id = $1 order by paso desc limit 1', [thread]))
  if (!ultimo) return { estado: 'rechazado', thread, motivo: 'ese hilo no existe para el coordinador' }
  if (ultimo.nodo === 'fin' || ultimo.nodo === 'aplicar') return { estado: 'aplicado', thread, propuesta: ultimo.propuesta_id ?? '' }
  if (ultimo.nodo !== 'aprobacion' || !ultimo.propuesta_id) return { estado: 'rechazado', thread, motivo: `el hilo no espera una aprobación (está en ${ultimo.nodo})` }
  const [p] = await como_((s) => s.consulta<{ estado: string; nivel: string }>('select estado, nivel from agora.propuesta where id = $1', [ultimo.propuesta_id]))
  if (p?.estado === 'aplicada') {
    // Ya la aplicó quien aprobó (la misma función de la base, que relee firmas y huella): el grafo solo lo anota.
    await como_((s) => punto(s, { org, thread, paso: ultimo.paso + 1, nodo: 'aplicar', estado: { aplicada: ultimo.propuesta_id, por: 'quien aprobó' }, propuesta: ultimo.propuesta_id, agente: coord }))
    return { estado: 'aplicado', thread, propuesta: ultimo.propuesta_id }
  }
  const enLaBase = p?.estado === 'aprobada' || (p?.nivel === 'A2' && p.estado === 'pendiente')
  if (!enLaBase) {
    const motivo = p?.estado === 'pendiente' ? (dato.aprobado ? 'resume falsificado: el dato dice «aprobado» y la base no tiene la aprobación' : 'sigue esperando su aprobación')
      : `la propuesta está ${p?.estado ?? 'desaparecida'}`
    if (p && p.estado !== 'pendiente') await como_((s) => punto(s, { org, thread, paso: ultimo.paso + 1, nodo: 'fin', estado: { motivo }, propuesta: ultimo.propuesta_id, agente: coord }))
    return { estado: 'rechazado', thread, motivo }
  }
  // aplicar: la base vuelve a comprobar firmas y huella; lo aplicado es lo aprobado
  await como_((s) => aplica(s, ultimo.propuesta_id!))
  await como_((s) => punto(s, { org, thread, paso: ultimo.paso + 1, nodo: 'aplicar', estado: { aplicada: ultimo.propuesta_id }, propuesta: ultimo.propuesta_id, agente: coord }))
  return { estado: 'aplicado', thread, propuesta: ultimo.propuesta_id }
}
