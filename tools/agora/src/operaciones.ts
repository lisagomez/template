/**
 * Lo que hacen las personas en Ágora, cada cosa con SU sesión (`como`): la base decide si su rol alcanza. Nada de
 * aquí aprueba por nadie, ni aplica sin la fila de aprobación, ni toca el dinero sin la matriz.
 */
import { como } from './base/como.js'
import type { Base, Sesion } from './base/tipos.js'
import { aplica, decide, propone, type Payload } from './propuesta.js'
import { supervisa, type Veredicto } from './supervisor.js'
import { firmaTarea } from './tarea.js'
import { diasEntre, siguienteHabil, sumaDias } from './fechas.js'

export interface Entorno { base: Base; secreto: string }

const persona = (e: Entorno, id: string) => <T>(fn: (s: Sesion) => Promise<T>) => como(e.base, { tipo: 'persona', id }, fn)

export async function publica(e: Entorno, personaId: string, d: { categoria: string; cuerpo: string; hilo?: string | null; item?: string | null }) {
  return persona(e, personaId)(async (s) => {
    const [c] = await s.consulta<{ id: string; org_id: string }>('select id, org_id from agora.canal where categoria_id = $1', [d.categoria])
    if (!c) throw new Error('no existe')
    const [m] = await s.consulta<{ id: string }>(`insert into agora.mensaje (org_id, canal_id, hilo_id, autor_tipo, autor_persona, cuerpo, item_id) values ($1, $2, $3, 'humano', $4, $5, $6) returning id`,
      [c.org_id, c.id, d.hilo ?? null, personaId, d.cuerpo, d.item ?? null])
    return m!.id
  })
}

/** Decide sobre la huella que la persona VIO; si con eso quedan todas las firmas, aplica (la base relee todo). */
export async function decideYAplica(e: Entorno, personaId: string, d: { propuesta: string; sha256: string; decision: 'aprobar' | 'rechazar' | 'a_revision'; motivo?: string }) {
  const org = await persona(e, personaId)(async (s) => (await s.consulta<{ org_id: string }>('select org_id from agora.propuesta where id = $1', [d.propuesta]))[0]?.org_id)
  if (!org) throw new Error('no existe')
  const firma = await persona(e, personaId)((s) => decide(s, { org, propuesta: d.propuesta, sha256: d.sha256, persona: personaId, decision: d.decision, motivo: d.motivo }))
  const [p] = await persona(e, personaId)((s) => s.consulta<{ estado: string }>('select estado from agora.propuesta where id = $1', [d.propuesta]))
  const aplicada = p?.estado === 'aprobada' ? await persona(e, personaId)((s) => aplica(s, d.propuesta)) : null
  return { rol: firma.rol_usado, estado: aplicada ? 'aplicada' : p?.estado, aplicada }
}

/** Una persona propone (lo que su rol no hace directo, o un monto): el supervisor lo revisa antes de llegar al hilo. */
export async function proponeComoPersona(e: Entorno, personaId: string, d: { payload: Payload; resumen: string }): Promise<{ veredicto: Veredicto; id?: string; sha256?: string }> {
  return persona(e, personaId)(async (s) => {
    const veredicto = await supervisa(s, d.payload, { autor: { tipo: 'persona' } })
    if (!veredicto.ok) return { veredicto }
    const [o] = await s.consulta<{ org_id: string }>('select org_id from agora.nodo where id = $1', [d.payload.categoria])
    const p = await propone(s, { org: o!.org_id, autorPersona: personaId, resumen: d.resumen, payload: d.payload })
    const [c] = await s.consulta<{ id: string }>('select id from agora.canal where categoria_id = $1', [d.payload.categoria])
    await s.consulta(`insert into agora.mensaje (org_id, canal_id, autor_tipo, autor_persona, cuerpo, propuesta_id) values ($1, $2, 'humano', $3, $4, $5)`,
      [o!.org_id, c!.id, personaId, `Propuesta: ${d.resumen}`, p.id])
    return { veredicto, ...p }
  })
}

const CAMPOS_DIRECTOS = ['nombre', 'estado', 'prioridad', 'inicio', 'fin', 'progreso', 'etiquetas', 'vinculo', 'responsable_persona', 'responsable_agente', 'archivo'] as const
type CampoDirecto = (typeof CAMPOS_DIRECTOS)[number]

/**
 * Edita un campo directo (lo que el rol permite; la base lo vuelve a comprobar). Si se movió una fecha y un sucesor
 * empieza antes del nuevo fin, el coordinador PROPONE moverlo: mover una fecha propone mover sus sucesores.
 */
export async function editaItem(e: Entorno, personaId: string, d: { item: string; campo: CampoDirecto; valor: unknown }) {
  if (!(CAMPOS_DIRECTOS as readonly string[]).includes(d.campo)) throw new Error(`el campo ${d.campo} no se edita directo`)
  const valor = d.campo === 'etiquetas' ? (Array.isArray(d.valor) ? d.valor.map(String) : []) : d.campo === 'archivo' ? JSON.stringify(d.valor) : d.valor
  // Un responsable a la vez: asignar a una persona quita al agente y al revés.
  const otro = d.campo === 'responsable_persona' ? ', responsable_agente = null' : d.campo === 'responsable_agente' ? ', responsable_persona = null' : ''
  await persona(e, personaId)((s) => s.consulta(`update agora.item set ${d.campo} = $1${otro} where id = $2`, [valor, d.item]))
  if (d.campo !== 'fin') return { sucesores: null }
  return { sucesores: await proponSucesores(e, personaId, d.item) }
}

export async function proponSucesores(e: Entorno, personaId: string, itemId: string) {
  const [it] = await e.base.consulta<{ org_id: string; categoria_id: string; fin: string | null; nombre: string }>('select org_id, categoria_id, fin::text, nombre from agora.item where id = $1', [itemId])
  if (!it?.fin) return null
  const sucesores = await e.base.consulta<{ id: string; categoria_id: string; inicio: string | null; fin: string | null; nombre: string }>(
    `select i.id, i.categoria_id, i.inicio::text, i.fin::text, i.nombre from agora.dependencia d join agora.item i on i.id = d.item_id where d.depende_de = $1 and i.estado <> 'done' and i.inicio is not null and i.inicio <= $2::date`,
    [itemId, it.fin])
  if (!sucesores.length) return null
  const coord = (await e.base.consulta<{ id: string }>(`select id from agora.agente where org_id = $1 and rol = 'coordinador' and origen = 'interno' and estado = 'aprobado' limit 1`, [it.org_id]))[0]
  if (!coord) return null
  const token = firmaTarea(e.secreto, { org: it.org_id, agente: coord.id })
  const creadas: string[] = []
  for (const suc of sucesores) {
    const nuevoInicio = siguienteHabil(sumaDias(it.fin, 1))
    const dur = suc.fin ? Math.max(0, diasEntre(suc.inicio!, suc.fin)) : 0
    const nuevoFin = siguienteHabil(sumaDias(nuevoInicio, dur))
    const payload: Payload = { version: 1, clase: 'reprogramar', categoria: suc.categoria_id, cambios: [
      { item: suc.id, campo: 'inicio', antes: suc.inicio, despues: nuevoInicio }, ...(suc.fin ? [{ item: suc.id, campo: 'fin', antes: suc.fin, despues: nuevoFin }] : []),
    ] }
    const p = await como(e.base, { tipo: 'agente', token }, async (s) => {
      const v = await supervisa(s, payload, { autor: { tipo: 'agente', origen: 'interno', autonomia: 'A2' } })
      if (!v.ok) return null
      const prop = await propone(s, { org: it.org_id, autorAgente: coord.id, solicitadaPor: personaId, payload,
        resumen: `Mover «${suc.nombre}» al ${nuevoInicio}: su predecesor «${it.nombre}» ahora termina el ${it.fin}`, clave: `sucesor:${suc.id}:${it.fin}` })
      const [c] = await s.consulta<{ id: string }>('select id from agora.canal where categoria_id = $1', [suc.categoria_id])
      await s.consulta(`insert into agora.mensaje (org_id, canal_id, autor_tipo, autor_agente, cuerpo, propuesta_id, item_id, clave) values ($1, $2, 'agente', $3, $4, $5, $6, $7) on conflict (clave) do nothing`,
        [it.org_id, c!.id, coord.id, `«${it.nombre}» se movió al ${it.fin}. Propongo mover su sucesor «${suc.nombre}» para que no empiece antes.`, prop.id, suc.id, `sucesor:${suc.id}:${it.fin}`])
      return prop.id
    })
    if (p) creadas.push(p)
  }
  return creadas
}


export interface CostoNuevo {
  categoria: string; item?: string | null; compromiso?: string | null; periodo: string; importe: number; concepto: string
  tipo: 'cfdi' | 'comprobante'; uuid?: string | null; comprobanteSha256?: string | null; rfc?: string | null; proveedor?: string | null
}

/** Finanzas registra un ejercido con su evidencia (sin evidencia, queda pendiente). La base rechaza el duplicado. */
/** Dependencias: la base niega el ciclo y lo que el rol no edita. */
export async function cambiaDependencia(e: Entorno, personaId: string, d: { item: string; dependeDe: string; quita?: boolean }) {
  return persona(e, personaId)(async (s) => {
    if (d.quita) return s.consulta('delete from agora.dependencia where item_id = $1 and depende_de = $2', [d.item, d.dependeDe])
    const [o] = await s.consulta<{ org_id: string }>('select org_id from agora.item where id = $1', [d.item])
    if (!o) throw new Error('no existe')
    return s.consulta('insert into agora.dependencia (org_id, item_id, depende_de) values ($1, $2, $3) on conflict do nothing', [o.org_id, d.item, d.dependeDe])
  })
}

export async function registraCosto(e: Entorno, personaId: string, c: CostoNuevo) {
  return persona(e, personaId)(async (s) => {
    const [o] = await s.consulta<{ org_id: string }>('select org_id from agora.nodo where id = $1', [c.categoria])
    if (!o) throw new Error('no existe')
    const evidencia = c.tipo === 'cfdi' ? c.uuid : c.comprobanteSha256
    const [f] = await s.consulta<{ id: string; estado: string }>(
      `insert into agora.costo (org_id, categoria_id, item_id, compromiso_id, periodo, importe_mxn, concepto, tipo, evidencia_uuid, evidencia_sha256, proveedor_rfc, proveedor, estado)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id, estado`,
      [o.org_id, c.categoria, c.item ?? null, c.compromiso ?? null, c.periodo, c.importe, c.concepto, c.tipo, c.tipo === 'cfdi' ? c.uuid ?? null : null,
        c.tipo === 'comprobante' ? c.comprobanteSha256 ?? null : null, c.rfc ?? null, c.proveedor ?? null, evidencia ? 'ejercido' : 'pendiente'])
    return f!
  })
}

/** El cierre del periodo: lo llama la manejadora del freno de la capa, con la cita textual de quien cierra. */
export async function cierraPeriodo(e: Entorno, personaId: string, d: { org: string; periodo: string; cita: string }) {
  return persona(e, personaId)(async (s) => (await s.consulta<{ r: { ok: boolean; poliza: string | null; folio: string | null; lineas: number; sin_costear: number } }>(
    'select agora.cierra_periodo($1, $2, $3) r', [d.org, d.periodo, d.cita]))[0]!.r)
}

export async function decidePoliza(e: Entorno, personaId: string, d: { poliza: string; sha256: string; decision: 'acepta' | 'devuelve'; motivo?: string }) {
  return persona(e, personaId)(async (s) => {
    const [p] = await s.consulta<{ org_id: string }>('select org_id from agora.poliza where id = $1', [d.poliza])
    if (!p) throw new Error('no existe')
    await s.consulta(`insert into agora.poliza_decision (org_id, poliza_id, decision, motivo, sha256, decidida_por) values ($1, $2, $3, $4, $5, $6)`,
      [p.org_id, d.poliza, d.decision, d.motivo ?? null, d.sha256, personaId])
    return (await s.consulta<{ estado: string }>('select estado from agora.poliza where id = $1', [d.poliza]))[0]!
  })
}

export const suspende = (e: Entorno, personaId: string, agente: string, motivo: string) =>
  persona(e, personaId)(async (s) => (await s.consulta<{ r: unknown }>('select agora.suspende_agente($1, $2) r', [agente, motivo]))[0]!.r)
export const reactiva = (e: Entorno, personaId: string, agente: string, motivo: string) =>
  persona(e, personaId)(async (s) => (await s.consulta<{ r: unknown }>('select agora.reactiva_agente($1, $2) r', [agente, motivo]))[0]!.r)
export const revoca = (e: Entorno, personaId: string, agente: string, motivo: string, cita: string) =>
  persona(e, personaId)(async (s) => (await s.consulta<{ r: { ok: boolean; propuestas: number; tareas: number; items: number; recordatorios: number } }>(
    'select agora.revoca_agente($1, $2, $3) r', [agente, motivo, cita]))[0]!.r)
export const bajaTope = (e: Entorno, personaId: string, agente: string, tope: 'gasto' | 'mensajes' | 'propuestas', valor: number) =>
  persona(e, personaId)(async (s) => (await s.consulta<{ r: unknown }>('select agora.baja_tope($1, $2, $3) r', [agente, tope, valor]))[0]!.r)
export const firmaAlta = (e: Entorno, personaId: string, agente: string) =>
  persona(e, personaId)(async (s) => (await s.consulta<{ r: { ok: boolean; estado: string } }>('select agora.firma_alta($1) r', [agente]))[0]!.r)
export const activa = (e: Entorno, personaId: string, agente: string) =>
  persona(e, personaId)(async (s) => (await s.consulta<{ r: unknown }>('select agora.activa_agente($1) r', [agente]))[0]!.r)
export const liberaCompromiso = (e: Entorno, personaId: string, compromiso: string, motivo: string) =>
  persona(e, personaId)(async (s) => (await s.consulta<{ r: unknown }>('select agora.libera_compromiso($1, $2) r', [compromiso, motivo]))[0]!.r)
export const deshaz = (e: Entorno, personaId: string, historial: number) =>
  persona(e, personaId)(async (s) => (await s.consulta<{ r: unknown }>('select agora.deshaz($1) r', [historial]))[0]!.r)
/** La conversación atestigua lo que dijo la persona (la base guarda la huella y la hora, no el texto): sin ese testigo,
 *  cerrar, revocar, quitar la segregación o avisar a un tercero no pasan aunque la cita sea larga. */
export const atestigua = (e: Entorno, personaId: string, textos: readonly string[]) =>
  persona(e, personaId)(async (s) => Number((await s.consulta<{ n: number }>('select agora.atestigua($1::text[]) n', [textos]))[0]!.n))
/** Avisar a un tercero: no toca una tabla irreversible, pero lo es; gasta su testigo igual que cerrar o revocar. */
export const usaTestigo = (e: Entorno, personaId: string, cita: string, accion: 'avisa_tercero') =>
  persona(e, personaId)(async (s) => (await s.consulta<{ ok: boolean }>('select agora.usa_testigo($1, $2) ok', [cita, accion]))[0]!.ok)
export const cambiaSegregacion = (e: Entorno, personaId: string, org: string, activa: boolean, cita: string) =>
  persona(e, personaId)(async (s) => (await s.consulta<{ r: unknown }>('select agora.cambia_segregacion($1, $2, $3) r', [org, activa, cita]))[0]!.r)
