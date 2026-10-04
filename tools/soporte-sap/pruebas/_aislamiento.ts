/**
 * Las comprobaciones de aislamiento de tres niveles, con el rol REAL (`authenticated` con su
 * `sub`, o un rol de servicio que entra con su token de tarea firmado) sobre la propuesta de
 * esquema en PGlite. La prueba exige que todas pasen; `evidencia/aislamiento.ts` imprime la tabla.
 * Las marcadas «revisión» nacen de la revisión independiente del C3 (2026-10-04).
 */
import type { PGlite } from '@electric-sql/pglite'
import { emiteTokenDeTarea } from '../dist/index.js'
import { como, comoAgente, comoServicio, tokenDe, falla, seudonimo, ORG, USR, INC, SHA } from './_base.ts'

export type Fila = readonly [que: string, esperado: string, ok: boolean, visto: string]

const n = (filas: unknown[]) => String(filas.length)
const r = (e: string | null) => (e ? 'rechazado' : 'aceptado')

async function lecturas(db: PGlite): Promise<Fila[]> {
  const inc = (u: string) => como<{ id: string }>(db, u, 'select id from ss_incidencia order by id')
  const ca = await inc(USR.ca), cb = await inc(USR.cb), ua1 = await inc(USR.ua1), sup = await inc(USR.sup)
  const ub1VeA1 = await como(db, USR.ub1, `select id from ss_incidencia where id = '${INC.a1}'`)
  const supCampo = await como(db, USR.sup, `select valor from ss_campo_extraido`)
  const supHoras = await como(db, USR.sup, `select id from ss_horas`)
  return [
    ['la consultora A lista incidencias', 'solo las de sus clientes A1 y A2', ca.map((x) => x.id).join() === [INC.a1, INC.a2].join(), `${ca.length} filas`],
    ['la consultora B lista incidencias', 'solo la de B1, nada de A', cb.length === 1 && cb[0]!.id === INC.b1, `${cb.length} filas`],
    ['el cliente A1 lista incidencias', 'solo la suya, nada de A2 (otro N3)', ua1.length === 1 && ua1[0]!.id === INC.a1, `${ua1.length} filas`],
    ['el cliente B1 pide la incidencia de A1 por su id', '0 filas', ub1VeA1.length === 0, n(ub1VeA1)],
    ['el laboratorio lista incidencias (revisión)', 'solo la que A le escaló (1), no toda la operación', sup.length === 1 && sup[0]!.id === INC.a1, n(sup)],
    ['el laboratorio lee los campos extraídos', 'solo los de lo escalado (1)', supCampo.length === 1, n(supCampo)],
    ['el laboratorio lee las horas de los consultores', '0 filas: son de la consultora', supHoras.length === 0, n(supHoras)],
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
  const lista = (u: string, bucket = 'ss-originales') => como<{ name: string }>(db, u, `select name from storage.objects where bucket_id = '${bucket}'`)
  const ua1 = await lista(USR.ua1), cb = await lista(USR.cb), sup = await lista(USR.sup)
  const ua1BajaA2 = await como(db, USR.ua1, `select name from storage.objects where bucket_id = 'ss-originales' and name like '${ORG.CA}/${ORG.A2}/%'`)
  const supExportes = await lista(USR.sup, 'ss-exportes')
  const caExportes = await lista(USR.ca, 'ss-exportes')
  const ua1SubeA2 = await falla(() => como(db, USR.ua1, `insert into storage.objects (bucket_id, name) values ('ss-originales', '${ORG.CA}/${ORG.A2}/${INC.a2}/${'9'.repeat(64)}')`))
  const caSubeB1 = await falla(() => como(db, USR.ca, `insert into storage.objects (bucket_id, name) values ('ss-originales', '${ORG.CA}/${ORG.B1}/${INC.b1}/${'8'.repeat(64)}')`))
  return [
    ['el cliente A1 lista el bucket de originales', 'solo su documento (1)', ua1.length === 1 && ua1[0]!.name.includes(ORG.A1), n(ua1)],
    ['el cliente A1 busca el original de A2', '0 objetos', ua1BajaA2.length === 0, n(ua1BajaA2)],
    ['la consultora B lista el bucket de originales', 'solo el de B1 (1)', cb.length === 1 && cb[0]!.name.includes(ORG.B1), n(cb)],
    ['el laboratorio lista originales sin acceso motivado', '0 objetos (D14)', sup.length === 0, n(sup)],
    ['el superadministrador lista los exportes (revisión)', '0 objetos: son de la consultora que se va', supExportes.length === 0, n(supExportes)],
    ['la consultora A lista sus exportes', 'el suyo (1)', caExportes.length === 1, n(caExportes)],
    ['el cliente A1 sube a la carpeta de A2', 'rechazado', ua1SubeA2 !== null, r(ua1SubeA2)],
    ['la consultora A sube a {A}/{B1}/… (revisión)', 'rechazado: B1 no es cliente de A', caSubeB1 !== null, r(caSubeB1)],
  ]
}

const acceso = (usuario: string, cliente: string, otorga: string, horas = 1) => `insert into ss_acceso_motivado (usuario_id, cliente_id, motivo, otorgado_por, vence_en)
  values ('${usuario}', '${cliente}', 'aprobar la solución de la incidencia MIGO', '${otorga}', now() + interval '${horas} hours')`

async function accesoMotivado(db: PGlite): Promise<Fila[]> {
  const expSelf = await falla(() => como(db, USR.exp, acceso(USR.exp, ORG.A1, USR.exp)))
  const supSelf = await falla(() => como(db, USR.sup, acceso(USR.sup, ORG.A1, USR.sup)))
  const caB1 = await falla(() => como(db, USR.ca, acceso(USR.sup, ORG.B1, USR.ca)))
  const caLargo = await falla(() => como(db, USR.ca, acceso(USR.sup, ORG.A1, USR.ca, 100)))
  const caA1aCliente = await falla(() => como(db, USR.ca, acceso(USR.ua2, ORG.A1, USR.ca)))
  const caOtorga = await falla(() => como(db, USR.ca, acceso(USR.sup, ORG.A1, USR.ca)))
  const sup = await como<{ name: string }>(db, USR.sup, `select name from storage.objects where bucket_id = 'ss-originales'`)
  return [
    ['un experto se otorga acceso a originales', 'rechazado', expSelf !== null, r(expSelf)],
    ['el superadministrador se otorga acceso a sí mismo (revisión)', 'rechazado: lo otorga la consultora', supSelf !== null, r(supSelf)],
    ['la consultora A otorga acceso a un cliente de B', 'rechazado', caB1 !== null, r(caB1)],
    ['la consultora A otorga acceso por 100 h (revisión)', 'rechazado: tope de 72 h', caLargo !== null, r(caLargo)],
    ['la consultora A otorga acceso a alguien fuera del laboratorio', 'rechazado', caA1aCliente !== null, r(caA1aCliente)],
    ['la consultora A otorga acceso al superadministrador para A1', 'se otorga', caOtorga === null, caOtorga ?? 'otorgado'],
    ['el superadministrador con ese acceso lista originales', 'solo el de A1 (1)', sup.length === 1 && sup[0]!.name.includes(ORG.A1), n(sup)],
  ]
}

async function escrituras(db: PGlite): Promise<Fila[]> {
  const ub1Crea = await falla(() => como(db, USR.ub1, `insert into ss_incidencia (consultora_id, cliente_id, titulo) values ('${ORG.CA}', '${ORG.A1}', 'a nombre de otro')`))
  const caCreaB = await falla(() => como(db, USR.ca, `insert into ss_incidencia (consultora_id, cliente_id, titulo) values ('${ORG.CB}', '${ORG.B1}', 'en otra consultora')`))
  const ua1Crea = await falla(() => como(db, USR.ua1, `insert into ss_incidencia (consultora_id, cliente_id, titulo) values ('${ORG.CA}', '${ORG.A1}', 'la mía')`))
  const yo = await seudonimo(db, USR.ca)
  const horasB1 = await falla(() => como(db, USR.ca, `insert into ss_horas (consultora_id, cliente_id, consultor, minutos, fecha) values ('${ORG.CA}', '${ORG.B1}', '${yo}', 60, current_date)`))
  const horasAjenas = await falla(() => como(db, USR.ca, `insert into ss_horas (consultora_id, cliente_id, incidencia_id, consultor, minutos, fecha) values ('${ORG.CA}', '${ORG.A1}', '${INC.a1}', 'usr-000000000099', 60, current_date)`))
  const horasA1 = await falla(() => como(db, USR.ca, `insert into ss_horas (consultora_id, cliente_id, incidencia_id, consultor, minutos, fecha) values ('${ORG.CA}', '${ORG.A1}', '${INC.a1}', '${yo}', 60, current_date)`))
  const impugnaAjena = await falla(() => como(db, USR.ua2, `insert into ss_impugnacion (incidencia_id, consultora_id, cliente_id, campo, motivo, creada_por) values ('${INC.a1}', '${ORG.CA}', '${ORG.A1}', 'prioridad', 'la nómina no salió: es P1', '${USR.ua2}')`))
  const impugnaPropia = await falla(() => como(db, USR.ua1, `insert into ss_impugnacion (incidencia_id, consultora_id, cliente_id, campo, motivo, creada_por) values ('${INC.a1}', '${ORG.CA}', '${ORG.A1}', 'prioridad', 'la nómina no salió: es P1', '${USR.ua1}')`))
  return [
    ['el cliente B1 crea una incidencia a nombre de A1', 'rechazado', ub1Crea !== null, r(ub1Crea)],
    ['la consultora A crea una incidencia en la consultora B', 'rechazado', caCreaB !== null, r(caCreaB)],
    ['el cliente A1 crea su propia incidencia', 'se crea', ua1Crea === null, ua1Crea ?? 'creada'],
    ['la consultora A carga horas a B1 (revisión)', 'rechazado: B1 no es su cliente', horasB1 !== null, r(horasB1)],
    ['la consultora A carga horas a nombre de otro consultor', 'rechazado', horasAjenas !== null, r(horasAjenas)],
    ['la consultora A carga sus horas a A1', 'se cargan', horasA1 === null, horasA1 ?? 'cargadas'],
    ['el cliente A2 impugna la prioridad de una incidencia de A1', 'rechazado', impugnaAjena !== null, r(impugnaAjena)],
    ['el cliente A1 impugna la prioridad de la suya', 'se registra', impugnaPropia === null, impugnaPropia ?? 'registrada'],
  ]
}

async function contratos(db: PGlite): Promise<Fila[]> {
  const ca = await como(db, USR.ca, `select id from ss_contrato_sla where consultora_id = '${ORG.CB}'`)
  const ua1N3 = await como(db, USR.ua1, `select id from ss_contrato_sla where nivel = 'N2-N3'`)
  const ua1N1 = await como(db, USR.ua1, `select id from ss_contrato_sla where nivel = 'N1-N2'`)
  return [
    ['la consultora A lee el contrato de la consultora B', '0 filas', ca.length === 0, n(ca)],
    ['el cliente A1 lee su contrato N2–N3', '1 fila', ua1N3.length === 1, n(ua1N3)],
    ['el cliente A1 lee el contrato N1–N2 de su consultora', '0 filas', ua1N1.length === 0, n(ua1N1)],
  ]
}

async function agente(db: PGlite): Promise<Fila[]> {
  const conTarea = await comoAgente<{ consultora_id: string }>(db, ORG.CA, 'select consultora_id from ss_incidencia')
  const deA = (await db.query(`select id from ss_incidencia where consultora_id = '${ORG.CA}'`)).rows.length
  const pideB = await comoAgente(db, ORG.CA, `select id from ss_incidencia where consultora_id = '${ORG.CB}'`)
  const falsificado = emiteTokenDeTarea('otro-secreto-que-no-es-el-del-orquestador-xx', { consultora: ORG.CB, tarea: 't', rol: 'soporte_sap_agente', exp: Date.now() + 60_000 })
  const conFalso = await falla(() => comoServicio(db, falsificado, 'select id from ss_incidencia'))
  const cruza = await falla(() => comoAgente(db, ORG.CA, `insert into ss_evento (incidencia_id, consultora_id, cliente_id, seq, tipo, actor, fecha, anterior, hash)
    values ('${INC.b1}', '${ORG.CB}', '${ORG.B1}', 2, 'X', 'agente:soporte-sap-a2a', now(), 'h', 'h')`))
  const cambia = await falla(() => comoAgente(db, ORG.CA, `update ss_evento set tipo = 'X' where incidencia_id = '${INC.a1}'`))
  return [
    ['el agente con una tarea de A lista incidencias', `todas las de A (${deA}) y ninguna de B`, conTarea.length === deA && conTarea.every((f) => f.consultora_id === ORG.CA), n(conTarea)],
    ['el agente con una tarea de A pide las de B (revisión)', '0 filas: el alcance sale del token firmado', pideB.length === 0, n(pideB)],
    ['el agente presenta un token de B que no firmó el orquestador (revisión)', 'rechazado en la pasarela', conFalso !== null, r(conFalso)],
    ['el agente de una tarea de A escribe un evento de B', 'rechazado', cruza !== null, r(cruza)],
    ['el agente cambia un evento', 'rechazado (solo agregar)', cambia !== null, r(cambia)],
  ]
}

async function decisiones(db: PGlite): Promise<Fila[]> {
  const mapeo = await falla(() => comoAgente(db, ORG.CA, `insert into ss_mapeo (consultora_id, herramienta, version, contenido, estado, aprobado_por) values ('${ORG.CA}', 'mesauno', 2, '{}', 'aprobado', '${USR.sup}')`))
  const propuesta = await falla(() => comoAgente(db, ORG.CA, `insert into ss_propuesta (tipo, origen, alcance, consultora_id, contenido, estado, propuesta_por, decidida_por) values ('regla', 'sandbox', 'a_medida', '${ORG.CA}', '{}', 'aprobada', 'agente', '${USR.sup}')`))
  const campo = await falla(() => comoServicio(db, tokenDe(ORG.CA, 'soporte_sap_ingesta'), `insert into ss_campo_extraido (adjunto_id, incidencia_id, consultora_id, cliente_id, campo, valor, evidencia, estado, revisado_por)
    values ('70000000-0000-4000-8000-0000000000a1', '${INC.a1}', '${ORG.CA}', '${ORG.A1}', 'mensaje', 'M7 053', 'captura', 'confirmado', '${USR.ca}')`))
  const ingestaB = await comoServicio(db, tokenDe(ORG.CA, 'soporte_sap_ingesta'), `select name from storage.objects where bucket_id = 'ss-originales' and name like '${ORG.CB}/%'`)
  const expNucleo = await falla(() => como(db, USR.exp, `update ss_propuesta set estado = 'aprobada', decidida_por = '${USR.exp}' where alcance = 'nucleo' returning id`).then((f) => { if (!f.length) throw new Error('0 filas') }))
  const supPorOtro = await falla(() => como(db, USR.sup, `update ss_propuesta set estado = 'aprobada', decidida_por = '${USR.exp}' where alcance = 'nucleo' returning id`).then((f) => { if (!f.length) throw new Error('0 filas') }))
  const supPropia = await falla(() => como(db, USR.sup, `update ss_propuesta set estado = 'aprobada', decidida_por = '${USR.sup}' where alcance = 'nucleo' returning id`).then((f) => { if (!f.length) throw new Error('0 filas') }))
  const caPorOtro = await falla(() => como(db, USR.ca, `update ss_campo_extraido set estado = 'confirmado', revisado_por = '${USR.ua1}' where incidencia_id = '${INC.a1}'`))
  return [
    ['el agente inserta un mapeo ya aprobado (revisión)', 'rechazado: solo propone', mapeo !== null, r(mapeo)],
    ['el agente inserta una propuesta ya aprobada', 'rechazado', propuesta !== null, r(propuesta)],
    ['la ingesta deja un campo ya confirmado (revisión)', 'rechazado: queda por revisar', campo !== null, r(campo)],
    ['la ingesta con tarea de A lista originales de B', '0 objetos', ingestaB.length === 0, n(ingestaB)],
    ['un experto decide una propuesta al núcleo (revisión, D2)', 'rechazado: es del superadministrador', expNucleo !== null, r(expNucleo)],
    ['el superadministrador decide a nombre de otro (revisión)', 'rechazado', supPorOtro !== null, r(supPorOtro)],
    ['el superadministrador decide a su nombre', 'se decide', supPropia === null, supPropia ?? 'decidida'],
    ['la consultora A confirma un campo a nombre de otro (revisión)', 'rechazado', caPorOtro !== null, r(caPorOtro)],
  ]
}

async function cadenaYChat(db: PGlite): Promise<Fila[]> {
  const evento = (actor: string, fecha: string) => `insert into ss_evento (incidencia_id, consultora_id, cliente_id, seq, tipo, actor, fecha, anterior, hash)
    values ('${INC.a1}', '${ORG.CA}', '${ORG.A1}', 9, 'NOTA', '${actor}', ${fecha}, 'h', 'h')`
  const yo = await seudonimo(db, USR.ca)
  const actorAjeno = await falla(() => como(db, USR.ca, evento('usr-000000000099', 'now()')))
  const fechaVieja = await falla(() => como(db, USR.ca, evento(yo, `now() - interval '2 days'`)))
  const exp = await como<{ contenido: string }>(db, USR.exp, 'select contenido from ss_chat_mensaje')
  const caEscribe = await falla(() => como(db, USR.ca, `insert into ss_chat_mensaje (usuario_id, autor, contenido) values ('${USR.ca}', 'humano', 'hola')`))
  const expSuplanta = await falla(() => como(db, USR.exp, `insert into ss_chat_mensaje (usuario_id, autor, contenido) values ('${USR.exp}', 'agente', 'aprobado')`))
  return [
    ['una persona escribe un evento con el actor de otro (revisión)', 'rechazado', actorAjeno !== null, r(actorAjeno)],
    ['una persona escribe un evento con fecha de hace dos días (revisión)', 'rechazado: la fecha es la de la base', fechaVieja !== null, r(fechaVieja)],
    ['el experto lee los chats', 'solo el suyo (1)', exp.length === 1 && exp[0]!.contenido.includes('MIGO'), n(exp)],
    ['un consultor escribe en el chat del HIL', 'rechazado: es del laboratorio', caEscribe !== null, r(caEscribe)],
    ['el experto escribe como si fuera el agente', 'rechazado', expSuplanta !== null, r(expSuplanta)],
  ]
}

/** Todas las comprobaciones, en orden. */
export async function revisaAislamiento(db: PGlite): Promise<Fila[]> {
  const filas: Fila[] = []
  for (const grupo of [lecturas, sandbox, originales, accesoMotivado, escrituras, contratos, agente, decisiones, cadenaYChat]) filas.push(...await grupo(db))
  return filas
}

export { SHA }
