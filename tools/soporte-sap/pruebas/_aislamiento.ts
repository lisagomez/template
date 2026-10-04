/**
 * Las comprobaciones de aislamiento de tres niveles, con el rol REAL (`authenticated` con su
 * `sub`, o el agente con su tarea) sobre la propuesta de esquema en PGlite. La prueba exige que
 * todas pasen; `evidencia/aislamiento.ts` imprime la tabla.
 */
import type { PGlite } from '@electric-sql/pglite'
import { como, comoAgente, falla, ORG, USR, INC } from './_base.ts'

export type Fila = readonly [que: string, esperado: string, ok: boolean, visto: string]

const ids = (filas: Array<{ id?: string }>) => filas.map((f) => f.id).sort()
const n = (filas: unknown[]) => String(filas.length)

async function lecturas(db: PGlite): Promise<Fila[]> {
  const inc = (u: string) => como<{ id: string }>(db, u, 'select id from ss_incidencia')
  const ca = ids(await inc(USR.ca)), cb = ids(await inc(USR.cb)), ua1 = ids(await inc(USR.ua1)), sup = await inc(USR.sup)
  const ub1VeA1 = await como(db, USR.ub1, `select id from ss_incidencia where id = '${INC.a1}'`)
  return [
    ['la consultora A lista incidencias', 'solo las de sus clientes A1 y A2', ca.join() === [INC.a1, INC.a2].sort().join(), `${ca.length} filas`],
    ['la consultora B lista incidencias', 'solo la de B1, nada de A', cb.join() === INC.b1, `${cb.length} filas`],
    ['el cliente A1 lista incidencias', 'solo la suya, nada de A2 (otro N3)', ua1.join() === INC.a1, `${ua1.length} filas`],
    ['el cliente B1 pide la incidencia de A1 por su id', '0 filas', ub1VeA1.length === 0, n(ub1VeA1)],
    ['el laboratorio lista incidencias', 'las 3: aprueba sobre la operación', sup.length === 3, n(sup)],
  ]
}

async function sandbox(db: PGlite): Promise<Fila[]> {
  const caso = (u: string) => como<{ origen_consultora_id: string }>(db, u, 'select origen_consultora_id from ss_caso_sandbox')
  const ua1 = await caso(USR.ua1), ca = await caso(USR.ca), sup = await caso(USR.sup)
  const obj = (u: string) => como(db, u, `select name from storage.objects where bucket_id = 'ss-sandbox'`)
  const objUa1 = await obj(USR.ua1), objCa = await obj(USR.ca)
  return [
    ['el cliente A1 lista el sandbox', '0 filas', ua1.length === 0, n(ua1)],
    ['la consultora A lista el sandbox', 'solo lo que nació de sus incidencias', ca.length === 1 && ca[0]?.origen_consultora_id === ORG.CA, n(ca)],
    ['el laboratorio lista el sandbox', 'todo lo anonimizado (2)', sup.length === 2, n(sup)],
    ['el cliente A1 lista el bucket del sandbox', '0 objetos', objUa1.length === 0, n(objUa1)],
    ['la consultora A lista el bucket del sandbox', 'solo el suyo (1)', objCa.length === 1, n(objCa)],
  ]
}

async function originales(db: PGlite): Promise<Fila[]> {
  const lista = (u: string) => como<{ name: string }>(db, u, `select name from storage.objects where bucket_id = 'ss-originales'`)
  const ua1 = await lista(USR.ua1), cb = await lista(USR.cb), supAntes = await lista(USR.sup)
  const ua1BajaA2 = await como(db, USR.ua1, `select name from storage.objects where bucket_id = 'ss-originales' and name like '${ORG.CA}/${ORG.A2}/%'`)
  const expOtorga = await falla(() => como(db, USR.exp, `insert into ss_acceso_motivado (usuario_id, cliente_id, motivo, otorgado_por, vence_en)
    values ('${USR.exp}', '${ORG.A1}', 'revisar la captura del caso MIGO', '${USR.exp}', now() + interval '1 hour')`))
  await como(db, USR.sup, `insert into ss_acceso_motivado (usuario_id, cliente_id, motivo, otorgado_por, vence_en)
    values ('${USR.sup}', '${ORG.A1}', 'aprobar la solución de la incidencia MIGO', '${USR.sup}', now() + interval '1 hour')`)
  const supDespues = await lista(USR.sup)
  const subeCruzado = await falla(() => como(db, USR.ua1, `insert into storage.objects (bucket_id, name) values ('ss-originales', '${ORG.CA}/${ORG.A2}/${INC.a2}/${'9'.repeat(64)}')`))
  return [
    ['el cliente A1 lista el bucket de originales', 'solo su documento (1)', ua1.length === 1 && ua1[0]!.name.includes(ORG.A1), n(ua1)],
    ['el cliente A1 busca el original de A2', '0 objetos', ua1BajaA2.length === 0, n(ua1BajaA2)],
    ['la consultora B lista el bucket de originales', 'solo el de B1 (1)', cb.length === 1 && cb[0]!.name.includes(ORG.B1), n(cb)],
    ['el laboratorio lista originales sin acceso motivado', '0 objetos (D14)', supAntes.length === 0, n(supAntes)],
    ['un experto se otorga acceso a originales', 'rechazado: solo el superadministrador', expOtorga !== null, expOtorga ? 'rechazado' : 'aceptado'],
    ['el superadministrador con acceso motivado a A1', 'solo el original de A1 (1)', supDespues.length === 1 && supDespues[0]!.name.includes(ORG.A1), n(supDespues)],
    ['el cliente A1 sube a la carpeta de A2', 'rechazado', subeCruzado !== null, subeCruzado ? 'rechazado' : 'aceptado'],
  ]
}

async function escrituras(db: PGlite): Promise<Fila[]> {
  const ub1Crea = await falla(() => como(db, USR.ub1, `insert into ss_incidencia (consultora_id, cliente_id, titulo) values ('${ORG.CA}', '${ORG.A1}', 'a nombre de otro')`))
  const caCreaB = await falla(() => como(db, USR.ca, `insert into ss_incidencia (consultora_id, cliente_id, titulo) values ('${ORG.CB}', '${ORG.B1}', 'en otra consultora')`))
  const ua1Crea = await falla(() => como(db, USR.ua1, `insert into ss_incidencia (consultora_id, cliente_id, titulo) values ('${ORG.CA}', '${ORG.A1}', 'la mía')`))
  const ca = await como(db, USR.ca, `select id from ss_contrato_sla where consultora_id = '${ORG.CB}'`)
  const ua1N3 = await como(db, USR.ua1, `select id from ss_contrato_sla where nivel = 'N2-N3'`)
  const ua1N1 = await como(db, USR.ua1, `select id from ss_contrato_sla where nivel = 'N1-N2'`)
  return [
    ['el cliente B1 crea una incidencia a nombre de A1', 'rechazado', ub1Crea !== null, ub1Crea ? 'rechazado' : 'aceptado'],
    ['la consultora A crea una incidencia en la consultora B', 'rechazado', caCreaB !== null, caCreaB ? 'rechazado' : 'aceptado'],
    ['el cliente A1 crea su propia incidencia', 'se crea', ua1Crea === null, ua1Crea ?? 'creada'],
    ['la consultora A lee el contrato de la consultora B', '0 filas', ca.length === 0, n(ca)],
    ['el cliente A1 lee su contrato N2–N3', '1 fila', ua1N3.length === 1, n(ua1N3)],
    ['el cliente A1 lee el contrato N1–N2 de su consultora', '0 filas', ua1N1.length === 0, n(ua1N1)],
  ]
}

async function agente(db: PGlite): Promise<Fila[]> {
  const conTarea = await comoAgente<{ consultora_id: string }>(db, ORG.CA, 'select consultora_id from ss_incidencia')
  const deA = (await db.query(`select id from ss_incidencia where consultora_id = '${ORG.CA}'`)).rows.length
  const sinTarea = await comoAgente(db, null, 'select id from ss_incidencia')
  const cruza = await falla(() => comoAgente(db, ORG.CA, `insert into ss_evento (incidencia_id, consultora_id, cliente_id, seq, tipo, actor, fecha, anterior, hash)
    values ('${INC.b1}', '${ORG.CB}', '${ORG.B1}', 2, 'X', 'agente', now(), 'h', 'h')`))
  const cambia = await falla(() => comoAgente(db, ORG.CA, `update ss_evento set tipo = 'X' where incidencia_id = '${INC.a1}'`))
  const aprueba = await falla(() => comoAgente(db, ORG.CA, `insert into ss_propuesta (tipo, origen, alcance, consultora_id, contenido, estado, propuesta_por)
    values ('regla', 'sandbox', 'a_medida', '${ORG.CA}', '{}', 'aprobada', 'agente')`))
  return [
    ['el agente con una tarea de A lista incidencias', `todas las de A (${deA}) y ninguna de B`,
      conTarea.length === deA && conTarea.every((f) => f.consultora_id === ORG.CA), n(conTarea)],
    ['el agente sin tarea lista incidencias', '0 filas', sinTarea.length === 0, n(sinTarea)],
    ['el agente de una tarea de A escribe un evento de B', 'rechazado', cruza !== null, cruza ? 'rechazado' : 'aceptado'],
    ['el agente cambia un evento', 'rechazado (solo agregar)', cambia !== null, cambia ? 'rechazado' : 'aceptado'],
    ['el agente da por aprobada su propia propuesta', 'rechazado', aprueba !== null, aprueba ? 'rechazado' : 'aceptado'],
  ]
}

async function chat(db: PGlite): Promise<Fila[]> {
  const exp = await como<{ contenido: string }>(db, USR.exp, 'select contenido from ss_chat_mensaje')
  const caEscribe = await falla(() => como(db, USR.ca, `insert into ss_chat_mensaje (usuario_id, autor, contenido) values ('${USR.ca}', 'humano', 'hola')`))
  const expSuplanta = await falla(() => como(db, USR.exp, `insert into ss_chat_mensaje (usuario_id, autor, contenido) values ('${USR.exp}', 'agente', 'aprobado')`))
  return [
    ['el experto lee los chats', 'solo el suyo (1)', exp.length === 1 && exp[0]!.contenido.includes('MIGO'), n(exp)],
    ['un consultor escribe en el chat del HIL', 'rechazado: es del laboratorio', caEscribe !== null, caEscribe ? 'rechazado' : 'aceptado'],
    ['el experto escribe como si fuera el agente', 'rechazado', expSuplanta !== null, expSuplanta ? 'rechazado' : 'aceptado'],
  ]
}

/** Todas las comprobaciones, en orden. */
export async function revisaAislamiento(db: PGlite): Promise<Fila[]> {
  return [...await lecturas(db), ...await sandbox(db), ...await originales(db), ...await escrituras(db), ...await agente(db), ...await chat(db)]
}
