/**
 * El runtime de LABORATORIO de Soporte SAP: en memoria, en el servidor, sin SAP real, sin datos
 * reales y sin modelo. Compone las herramientas tal cual: el extractor (bytes, capa 0, CFDI y OCR local
 * si la máquina lo tiene), el categorizador, el grafo, el par ejecutor → supervisor, la sala (la
 * aprobación es una fila humana), el simulador, el anonimizador, la cadena sha256, el reloj de SLA y el
 * chat del HIL. Solo corre con `SOPORTE_SAP_LABORATORIO=1`.
 *
 * Las identidades son de laboratorio (`tipos.ts`): en producción, la sesión es `auth.uid()` y la RLS de
 * la propuesta de esquema decide lo que cada quien ve.
 */
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { clasePorBytes, leeCapaCero, validaRfc, validaCurp, validaNss, digitoVerificadorRfc, digitoVerificadorCurp } from '../../../../tools/extractor-documental/dist/index.js'
import { leeCfdi40, registroDeEsquemas, lectorDeTimbre11 } from '../../../../tools/extractor-documental/dist/xml/index.js'
import { motorPorProceso } from '../../../../tools/extractor-documental/dist/motores/proceso-local.js'
import { evaluaSeguro } from '../../../../tools/grafo-conocimiento/dist/index.js'
import { salaVacia, creaCanal, agregaParticipante, publica, registraAprobacion, aprobado, delimitaDato, type EstadoSala } from '../../../../tools/sala-a2a/dist/index.js'
import {
  ingiereTodos, categoriza, consultaMatriz, conocimientoDeMatriz, MATRIZ_LABORATORIO, CLIENTES, CONSULTORAS, sapDeLaboratorio, alNucleo, preparaPlan, supervisa, mensajeDePlan,
  corrige, ejecuta, reproduce, anonimiza, agrega, respondeHil, relojSla, contratoDeLaboratorio, generaCorpus,
  accionAnteElPresupuesto, veredictoDelMes, ocrDelMes, usoDelMes, mesDe, NoAplica, delimitaDocumento, PREGUNTAS_SNAPSHOT,
  type PuertosIngesta, type ResultadoSla, type ResultadoIngesta, type Clasificacion, type ConsultaMatriz, type EventoIncidencia, type EventoSla, type Plan,
  type VeredictoSupervisor, type SapSimulado, type Anonimizado, type MotorReglas, type Corte, type EntradaMatriz, type PropuestaDeEnsenanza,
  type AccionDeTriage, type PresupuestoDelMes, type FichaDeServidor,
  faltaParaElNucleo, consiente, revoca, type Consentimientos, type Origen,
} from '../../../../tools/soporte-sap/dist/index.js'
import corteJson from '../../../../tools/soporte-sap/semantica/corte.json'
import estimadoJson from '../../../../tools/soporte-sap/medicion/estimado.json'
import type { Sesion, MensajeChatVista, PropuestaVista, Accion } from './tipos'

export const encendido = (): boolean => process.env['SOPORTE_SAP_LABORATORIO'] === '1'
/**
 * Lo que el laboratorio le dice al usuario a propósito: una regla de quién puede qué, o un plan que no aplica. Es lo
 * único cuyo mensaje sale por la ruta; cualquier otro error es interno y se queda en el log (PRP-010 H-25).
 */
export class Rechazo extends Error {}
/** Un plan que no aplica en el simulador también se le dice al usuario: es una regla, no una falla. */
const comoRechazo = (e: unknown): unknown => (e instanceof NoAplica ? new Rechazo(e.message) : e)
export const CORTE = corteJson as unknown as Corte
export const AGENTE = 'soporte-sap-a2a'
const EJECUTOR = 'agente:ejecutor-sap'
const SUPERVISOR = 'agente:supervisor-sap'
const CANAL = 'canal-andina'

export interface PlanLab { plan: Plan; veredicto: VeredictoSupervisor; mensaje: string | null; decision: { accion: string; por: string; motivo: string | null } | null; aplicado: { antes: string; despues: string; errorAntes: boolean; errorDespues: boolean } | null }
export interface IncidenciaLab {
  id: string; cliente: string; consultora: string; sistema: 'ECC' | 'S4HANA'; titulo: string; texto: string
  adjuntos: ResultadoIngesta[]; clasificacion: Clasificacion; consulta: ConsultaMatriz; entrada: EntradaMatriz | null
  cadena: EventoIncidencia[]; sla: EventoSla[]; planes: PlanLab[]; sandbox: Anonimizado | null; estado: string
  impugnaciones: ImpugnacionLab[]
  /** Quién de la consultora lo escaló al laboratorio (DP-3); sin esto, el laboratorio no lo ve. */
  escalada: { readonly por: string; readonly fecha: string } | null
  /** Lo que el consultor le respondió al cliente: el cliente lo lee (DP-4). */
  respuestas: Array<{ readonly texto: string; readonly por: string; readonly fecha: string }>
}
/** Lo que el cliente impugna (como `ss_impugnacion`): el campo, su motivo y quién lo resolvió, con sus fechas. */
export type CampoImpugnable = 'prioridad' | 'categoria' | 'complejidad' | 'pausa' | 'resolucion'
export interface ImpugnacionLab {
  readonly id: string; readonly campo: CampoImpugnable; readonly motivo: string; readonly por: string; readonly creada: string
  estado: 'abierta' | 'aceptada' | 'rechazada'; resueltaPor: string | null; resuelta: string | null
}
/** El tope de una consultora en un mes (`consultora:AAAA-MM-01`), como una fila de `ss_presupuesto`. */
export interface TopeDelMes { topeTokens: number | null; topePaginasOcr: number | null }
interface Estado { n: number; presupuestos: Record<string, TopeDelMes>; incidencias: IncidenciaLab[]; sala: EstadoSala; sap: Record<string, SapSimulado>; chat: Record<string, MensajeChatVista[]>; propuestas: PropuestaVista[]; ensenanzas: Record<string, PropuestaDeEnsenanza>
  /** D1 (PRP-011): el consentimiento de cada organización, y de dónde nació cada enseñanza (aparte, no en la propuesta). */
  consentimientos: Consentimientos; origenes: Record<string, Origen> }

function nuevo(): Estado {
  let sala = creaCanal(salaVacia(), { id: CANAL, tenant: 'andina', slug: 'consultora-andina', nombre: 'Consultora Andina', departamento: null })
  for (const u of ['usr-superadmin', 'usr-experto', 'usr-consultor-andina']) sala = agregaParticipante(sala, 'andina', u)
  // El laboratorio arranca con un tope para el mes en curso. Sin fila del mes, nada llama al modelo (fail-closed).
  const presupuestos = Object.fromEntries(CONSULTORAS.map((c) => [`${c.id}:${mesDe(ahora())}`, { ...TOPE_DE_LABORATORIO }]))
  return { n: 0, presupuestos, incidencias: [], sala, sap: Object.fromEntries(CLIENTES.map((c) => [c.id, sapDeLaboratorio(c.id, c.sistema)])), chat: {}, propuestas: [], ensenanzas: {}, consentimientos: {}, origenes: {} }
}

const g = globalThis as { __soporteSapLab?: Estado }
export const estado = (): Estado => (g.__soporteSapLab ??= nuevo())

const conocimiento = conocimientoDeMatriz(MATRIZ_LABORATORIO, '2026-10-04')
export const motor: MotorReglas = (p) => evaluaSeguro(conocimiento, p, { hoy: '2026-10-04' }) as ReturnType<MotorReglas>
const VALIDADORES = { rfc: (x: string) => validaRfc(x), curp: validaCurp, nss: validaNss }
const conTimbre = registroDeEsquemas([lectorDeTimbre11])
// Topes de la ingesta (C3, O4): adjuntos por incidencia; las páginas de OCR salen del presupuesto del mes.
/** Lo que puede pesar un adjunto: la ruta lo usa para acotar la subida antes de leerla. */
export const BYTES_MAXIMOS_POR_ADJUNTO = 5_000_000
const CONFIG = { bytesMaximos: BYTES_MAXIMOS_POR_ADJUNTO, adjuntosMaximos: 10, motor: 'local' as const, decisionC4: null }
const TOPE_DE_LABORATORIO: TopeDelMes = { topeTokens: 500_000, topePaginasOcr: 500 }
/**
 * Lo que gasta preparar un plan. Sin modelo no hay medición (D7): en el laboratorio es el SUPUESTO de
 * `medicion/estimado.json`, y el evento lo dice (`tokensSon: 'estimados'`).
 */
const TOKENS_POR_PLAN = estimadoJson.insumos.tokensPorIncidencia.valor

/** El OCR LOCAL (Tesseract por zonas) si la máquina lo tiene; si no, la imagen se guarda sin extracción y se dice. */
function ocrLocal(): PuertosIngesta['ocr'] {
  const cmd = process.env['TESSERACT_CMD']
  if (!cmd) return null
  const entorno: Record<string, string> = { EXTRACTOR_IDIOMA: 'spa' }
  for (const k of ['LD_LIBRARY_PATH', 'TESSDATA_PREFIX', 'TESSERACT_CMD']) if (process.env[k]) entorno[k] = process.env[k]!
  const version = execFileSync(cmd, ['--version'], { encoding: 'utf8', env: { ...process.env, ...entorno } }).split('\n')[0]!.replace(/^tesseract\s+/, '').trim()
  const m = motorPorProceso({ comando: 'python3', argumentos: [join(/*turbopackIgnore: true*/ process.cwd(), 'tools', 'extractor-documental', 'motores-locales', 'tesseract.py')], modelo: `tesseract-${version}-spa-zonal-1`, entorno, milisegundosDeEspera: 120_000 })
  return { modelo: m.modelo, extrae: (b) => m.extrae(b) }
}

const PUERTOS: PuertosIngesta = {
  clasePorBytes, leeCapaCero: (pdf) => leeCapaCero(pdf),
  leeCfdi: (xml) => { const l = leeCfdi40(xml, conTimbre); return { esCfdi: l.esCfdi, motivo: l.motivo, campos: l.campos.map((c) => ({ clave: c.clave, valor: c.valor })) } },
  ocr: null,
}
let puertos: PuertosIngesta | null = null
const puertosIngesta = (): PuertosIngesta => (puertos ??= { ...PUERTOS, ocr: ocrLocal() })

const ahora = () => new Date().toISOString()
function anota(i: IncidenciaLab, tipo: EventoIncidencia['tipo'], actor: string, datos: EventoIncidencia['datos']): void {
  i.cadena = agrega(i.id, i.cadena, { fecha: ahora(), tipo, actor, datos })
}

/** El presupuesto del mes de una consultora: su tope (la fila del mes) y lo gastado según su cadena (`usoDelMes`). */
export function presupuestoDe(consultora: string): PresupuestoDelMes {
  const e = estado()
  const mes = mesDe(ahora())
  const eventos = e.incidencias.filter((i) => i.consultora === consultora).flatMap((i) => i.cadena).filter((x) => mesDe(x.fecha) === mes)
  const tope = e.presupuestos[`${consultora}:${mes}`]
  return { consultora, mes, topeTokens: tope?.topeTokens ?? null, topePaginasOcr: tope?.topePaginasOcr ?? null, ...usoDelMes(eventos.map((x) => ({ tipo: x.tipo, datos: x.datos as Record<string, unknown> }))) }
}

/**
 * El presupuesto ante un paso que gasta modelo (PRP-010 H-18). Con presupuesto, el paso corre y el aviso del 80 %
 * queda en la cadena. Al tope (o sin tope del mes), P1 y P2 pasan a una persona AHORA y P3 y P4 esperan, con aviso:
 * el presupuesto nunca deja sin atención a un P1 o un P2 (AISIA §4).
 */
function conPresupuesto(i: IncidenciaLab, paso: (decision: AccionDeTriage) => void): void {
  const decision = accionAnteElPresupuesto(veredictoDelMes(presupuestoDe(i.consultora), TOKENS_POR_PLAN), i.clasificacion.prioridad)
  if (decision.accion === 'llama_modelo') {
    if (decision.aviso) anota(i, 'AVISO_PRESUPUESTO', `agente:${AGENTE}`, { aviso: decision.aviso })
    paso(decision)
  } else if (decision.accion === 'a_humano') {
    anota(i, 'A_HUMANO_POR_PRESUPUESTO', `agente:${AGENTE}`, { aviso: decision.aviso })
    i.estado = 'en_atencion'
  } else {
    anota(i, 'EN_ESPERA_POR_PRESUPUESTO', `agente:${AGENTE}`, { aviso: decision.aviso })
    i.estado = 'espera_presupuesto'
  }
}

/** El N3 levanta una incidencia con sus adjuntos. Todo lo demás lo hace el agente, y queda en la cadena. */
export async function levanta(s: Sesion, d: { titulo: string; descripcion: string; archivos: Array<{ nombre: string; bytes: Uint8Array }> }): Promise<string> {
  if (s.rol !== 'cliente') throw new Rechazo('solo el cliente (N3) levanta incidencias aquí')
  const e = estado()
  const cl = CLIENTES.find((c) => c.id === s.organizacion)!
  const id = `inc-${String(++e.n).padStart(3, '0')}`
  const ocr = ocrDelMes(presupuestoDe(cl.consultora))
  // Una incidencia nueva no trae adjuntos: los de una subida posterior contarían los que ya tiene (PRP-010 H-23).
  const adjuntos: ResultadoIngesta[] = (await ingiereTodos(puertosIngesta(), { ...CONFIG, paginasOcrMaximas: ocr.maximas }, d.archivos, { adjuntos: 0, paginasOcr: ocr.usadas })).resultados
  // Lo que se leyó de un documento es DATO de la incidencia, delimitado; la urgencia y el impacto los declara el
  // cliente, no sus documentos (PRP-010 H-24). Los parámetros del plan sí pueden salir de un documento: lo ve una
  // persona en la sala antes de aprobar (brecha O1/O2, declarada en el C3).
  const declarado = `${d.titulo}. ${d.descripcion}`
  const documentos = adjuntos.flatMap((a) => (a.aceptado && a.campos.length ? [delimitaDocumento(a.nombre, a.campos.map((c) => `${c.campo}: ${c.valor}`).join('\n'))] : [])).join('\n')
  const texto = documentos ? `${declarado}\n${documentos}` : declarado
  const clasificacion = categoriza(declarado, documentos)
  const consulta = consultaMatriz(motor, MATRIZ_LABORATORIO, texto, cl.sistema)
  const i: IncidenciaLab = {
    id, cliente: cl.id, consultora: cl.consultora, sistema: cl.sistema, titulo: d.titulo.slice(0, 120), texto, adjuntos, clasificacion, consulta,
    entrada: consulta.tipo === 'sin_solucion' ? null : consulta.entrada, cadena: [], sla: [{ tipo: 'RECIBIDA', fecha: ahora() }], planes: [], sandbox: null, estado: 'nueva', impugnaciones: [],
    escalada: null, respuestas: [],
  }
  anota(i, 'RECIBIDA', s.usuario, { cliente: cl.id, titulo: i.titulo })
  for (const a of adjuntos) anota(i, 'ADJUNTO_LEIDO', `agente:${AGENTE}`, a.aceptado ? { nombre: a.nombre, via: a.via, campos: a.campos.length, sha256: a.sha256, paginasOcr: a.paginasOcr } : { nombre: a.nombre, rechazado: a.motivo })
  anota(i, 'CATEGORIZADA', `agente:${AGENTE}`, { prioridad: clasificacion.prioridad, modulo: clasificacion.modulo, transaccion: clasificacion.transaccion, mensaje: clasificacion.mensaje, etiquetas: [...clasificacion.etiquetas] })
  anota(i, 'VEREDICTO_GRAFO', `agente:${AGENTE}`, { tipo: consulta.tipo, regla: consulta.tipo === 'sin_solucion' ? null : consulta.entrada.regla, razon: consulta.razon })
  e.incidencias.unshift(i)
  // Un P1 o un P2 con evidencia sin leer, entera o en parte, no espera: lo revisa una persona ahora, y se dice. Sin leer
  // por CUALQUIER causa: el tope de OCR del mes, la máquina sin motor o páginas que no cupieron (PRP-010, fase 5: solo
  // miraba el aviso del tope, así que sin motor, o con una lectura parcial, la evidencia de una P1 quedaba sin nadie).
  const sinLeer = adjuntos.filter((a) => a.aceptado && (a.via === 'sin_extraccion' || (a.aviso ?? '').includes('sin extracción'))).map((a) => a.nombre)
  if (sinLeer.length && (clasificacion.prioridad === 'P1' || clasificacion.prioridad === 'P2')) {
    anota(i, 'A_HUMANO_POR_PRESUPUESTO', `agente:${AGENTE}`, { aviso: `evidencia sin leer (${sinLeer.join(', ')}): la revisa una persona ahora` })
  }
  if (consulta.tipo === 'solucion') conPresupuesto(i, (presupuesto) => proponPlan(i, preparaPlan({ ejecutor: EJECUTOR, incidencia: id, taskId: `tarea-${id}`, entrada: consulta.entrada, texto, sap: e.sap[cl.id]!, presupuesto, version: 1 }), null))
  // Con grado insuficiente el agente NO escala: el laboratorio ve solo lo que la consultora le escala (DP-3).
  else if (consulta.tipo === 'grado_insuficiente') i.estado = 'en_atencion'
  else alSandbox(i)
  return id
}

/** El supervisor revisa; si pasa, el plan va a la sala (como hilo si es una versión corregida). */
function proponPlan(i: IncidenciaLab, plan: Plan, hilo: string | null): void {
  const e = estado()
  anota(i, 'PLAN_PREPARADO', EJECUTOR, { version: plan.version, sha256: `sha256:${plan.sha256}`, error: plan.error, tokens: TOKENS_POR_PLAN, tokensSon: 'estimados' })
  const veredicto = supervisa({ supervisor: SUPERVISOR, plan, entrada: i.entrada!, sap: e.sap[i.cliente]! })
  anota(i, 'VEREDICTO_SUPERVISOR', SUPERVISOR, { resultado: veredicto.resultado, verdes: veredicto.comprobaciones.filter((c) => c.ok).length, total: veredicto.comprobaciones.length })
  const lab: PlanLab = { plan, veredicto, mensaje: null, decision: null, aplicado: null }
  i.planes.push(lab)
  // El plan verificado va primero a la consultora: a la sala del laboratorio llega solo si ella lo escala (DP-3,
  // tercera revisión R3-03). Antes llegaba siempre, y el laboratorio leía todo plan con sus parámetros.
  if (veredicto.resultado === 'a_la_sala') {
    if (i.escalada) aLaSala(i, lab, hilo)
    else i.estado = 'en_atencion'
  }
}

function aLaSala(i: IncidenciaLab, lab: PlanLab, hilo: string | null): void {
  const e = estado()
  const m = mensajeDePlan(lab.plan, lab.veredicto)
  lab.mensaje = `m-${i.id}-v${lab.plan.version}`
  e.sala = publica(e.sala, { id: lab.mensaje, canal: CANAL, hilo, autor: { tipo: 'agente', id: AGENTE }, cuerpo: m.cuerpo, bloques: m.bloques, creado: ahora() })
  anota(i, 'ENVIADA_A_SALA', `agente:${AGENTE}`, { mensaje: lab.mensaje, sha256: `sha256:${lab.plan.sha256}` })
  // Mandar el plan a la sala NO es responder al cliente: la primera respuesta la da una persona (DP-4, PRP-010 H-17).
  i.estado = 'en_revision'
}

/** La consultora escala al laboratorio, a su nombre (DP-3): con eso, y solo con eso, el laboratorio lo ve. */
function escala(s: Sesion, id: string): void {
  if (s.rol !== 'consultor') throw new Rechazo('al laboratorio lo escala la consultora, a su nombre')
  const i = estado().incidencias.find((x) => x.id === id && x.consultora === s.organizacion)
  if (!i) throw new Rechazo('esa incidencia no es de tu consultora')
  if (i.escalada) throw new Rechazo('ya está escalada')
  i.escalada = { por: s.usuario, fecha: ahora() }
  anota(i, 'ESCALADA', s.usuario, { motivo: 'la consultora lo escala al laboratorio' })
  const pendiente = i.planes.find((p) => p.veredicto.resultado === 'a_la_sala' && !p.mensaje && !p.decision)
  if (pendiente) aLaSala(i, pendiente, null)
}

/** Sin regla en el grafo: anonimiza; entra al sandbox o queda en cuarentena (nunca entra con dudas). */
function alSandbox(i: IncidenciaLab): void {
  const a = anonimiza(i.texto, VALIDADORES)
  i.sandbox = a
  anota(i, 'ANONIMIZADA', `agente:${AGENTE}`, { reemplazos: Object.values(a.reemplazos).length, veredicto: a.veredicto })
  anota(i, a.veredicto === 'entra' ? 'EN_SANDBOX' : 'EN_CUARENTENA', `agente:${AGENTE}`, { senales: [...a.senales] })
  // Anonimizar tampoco es responder: el caso sigue en atención con su consultora y su reloj corre hasta que una
  // persona le responda al cliente (DP-4, PRP-010 H-17).
  i.estado = 'en_atencion'
}

/** Una persona del laboratorio decide EN LA SALA con su sesión. Solo así se aplica algo al simulador. */
function decide(s: Sesion, mensaje: string, accion: 'aprobar' | 'rechazar' | 'a_revision', motivo: string): void {
  if (s.nivel !== 'N1') throw new Rechazo('decide el HIL del laboratorio, en la sala')
  const e = estado()
  e.sala = registraAprobacion(e.sala, { principal: { tipo: 'humano', id: s.usuario } }, { id: `dec-${mensaje}-${s.usuario}`, mensaje, accion, decidida: ahora() })
  const i = e.incidencias.find((x) => x.planes.some((p) => p.mensaje === mensaje))
  const lab = i?.planes.find((p) => p.mensaje === mensaje)
  if (!i || !lab) return
  lab.decision = { accion, por: s.usuario, motivo: motivo || null }
  if (accion === 'aprobar') aplica(i, lab)
  else if (accion === 'rechazar') { anota(i, 'RECHAZADA', s.usuario, { mensaje }); i.estado = 'en_atencion' }
  else revisa(i, lab, mensaje, motivo, s.usuario)
}

function aplica(i: IncidenciaLab, lab: PlanLab): void {
  const e = estado()
  const a = aprobado(e.sala, lab.plan.taskId, lab.plan.sha256)!
  anota(i, 'APROBADA', a.decididaPor, { sha256: `sha256:${a.sha256}`, taskId: a.taskId })
  const antes = e.sap[i.cliente]!
  const r = ejecuta(antes, lab.plan, { taskId: a.taskId, sha256: a.sha256, decididaPor: a.decididaPor })
  e.sap[i.cliente] = r.final
  const sintoma = i.entrada!.sintoma?.(lab.plan.parametros) ?? null
  lab.aplicado = {
    antes: r.resultados.map((x) => x.antes).join('; '), despues: r.resultados.map((x) => x.despues).join('; '),
    errorAntes: sintoma ? reproduce(antes, sintoma) : false, errorDespues: sintoma ? reproduce(r.final, sintoma) : false,
  }
  anota(i, 'APLICADA_EN_SIMULADOR', `agente:${AGENTE}`, { antes: lab.aplicado.antes, despues: lab.aplicado.despues, errorDespues: lab.aplicado.errorDespues })
  // Aplicar no es resolver: lo da por resuelto una persona de la consultora, y el cliente puede impugnarlo (R3-08).
  i.estado = 'en_atencion'
}

/** El consultor da por resuelta la incidencia: detiene el reloj, a su nombre (DP-4). El cliente puede impugnarlo. */
function resuelve(s: Sesion, id: string): void {
  if (s.rol !== 'consultor') throw new Rechazo('resolver es de una persona de la consultora')
  const i = estado().incidencias.find((x) => x.id === id && x.consultora === s.organizacion)
  if (!i) throw new Rechazo('esa incidencia no es de tu consultora')
  if (i.estado === 'resuelta') throw new Rechazo('ya está resuelta')
  i.sla.push({ tipo: 'RESUELTA', fecha: ahora() })
  anota(i, 'RESUELTA', s.usuario, {})
  i.estado = 'resuelta'
}

function revisa(i: IncidenciaLab, lab: PlanLab, mensaje: string, motivo: string, quien: string): void {
  const e = estado()
  anota(i, 'A_REVISION', quien, { mensaje, motivo: delimitaDato(motivo) })
  conPresupuesto(i, (presupuesto) => {
    const r = corrige({ ejecutor: EJECUTOR, plan: lab.plan, motivo, entrada: i.entrada!, texto: i.texto, sap: e.sap[i.cliente]!, presupuesto })
    if (r.plan) proponPlan(i, r.plan, mensaje)
    else e.sala = publica(e.sala, { id: `nota-${mensaje}-${e.n++}`, canal: CANAL, hilo: mensaje, autor: { tipo: 'agente', id: AGENTE }, cuerpo: r.nota, creado: ahora() })
  })
}

/** El chat del HIL: contesta con fuente, propone o promueve a la sala. Nunca aprueba. */
function conversa(s: Sesion, texto: string): void {
  if (s.rol !== 'superadmin' && s.rol !== 'experto') throw new Rechazo('el chat del HIL es del superadministrador y del experto')
  const e = estado()
  const planes = e.sala.mensajes.filter((m) => m.bloques.length && !e.sala.aprobaciones.some((a) => a.mensaje === m.id))
    // La promoción va a la RAÍZ del hilo: una versión corregida ya es respuesta, y los hilos son de un nivel.
    .map((m) => ({ taskId: m.bloques[0]!.taskId, mensaje: m.hilo ?? m.id, canal: m.canal, resumen: m.cuerpo.split('\n')[0]! }))
  const casos = e.incidencias.filter((i) => i.sandbox).map((i) => ({ incidencia: i.id, consultora: i.consultora }))
  const r = respondeHil({ corte: CORTE, entidades: { andina: { tipo: 'consultora', nombre: 'Consultora Andina' }, boreal: { tipo: 'consultora', nombre: 'Consultora Boreal' } },
    motor, matriz: MATRIZ_LABORATORIO, planes, casos, validadores: VALIDADORES, delimitaDato, agente: AGENTE, ahora: ahora(), nuevoId: () => `chat-${e.n++}` }, { usuario: s.usuario, rol: s.rol }, texto)
  const hilo = (e.chat[s.usuario] ??= [])
  hilo.push({ autor: 'humano', texto, tipo: null, fuentes: [] })
  hilo.push({ autor: 'agente', texto: r.texto, tipo: r.tipo, fuentes: 'fuentes' in r ? r.fuentes.map((f) => f.cita) : [] })
  if (r.tipo === 'promovida') e.sala = publica(e.sala, r.publicacion)
  if (r.tipo === 'propuesta') {
    // Su propio contador: el de `e.n` numera las incidencias, y el recorrido cuenta con esa numeración.
    const id = `prop-${Object.keys(e.ensenanzas).length + 1}`
    e.ensenanzas[id] = r.propuesta
    const inc = e.incidencias.find((i) => i.id === r.caso.incidencia)
    if (inc) e.origenes[id] = { consultora: inc.consultora, cliente: inc.cliente }
    e.propuestas.unshift({ id, alcance: alcanceDe(r.propuesta), tipo: 'regla', titulo: 'Caso nuevo para la matriz y regla para el grafo (propuesta de siembra)', detalle: r.propuesta.contenido, estado: r.propuesta.estado, por: r.propuesta.propuestaPor })
    if (r.cli) e.propuestas.unshift({ id: null, alcance: null, tipo: 'cli', titulo: r.cli.nombre, detalle: `${r.cli.operacion} · dry-run por defecto · readOnly: ${String(r.cli.readOnly)} · ${r.cli.nota}`, estado: r.cli.estado, por: r.propuesta.propuestaPor })
  }
}

const alcanceDe = (p: PropuestaDeEnsenanza) => (p.alcance === 'nucleo' ? 'núcleo' : `a medida de ${p.consultora}`)
const NOMBRES_DE_ORGANIZACION = [...CLIENTES.map((c) => c.nombre), ...CONSULTORAS.map((c) => c.nombre)]

/**
 * Subir una enseñanza al NÚCLEO (D2; PRP-010 H-19): lo decide el superadministrador, y sube GENERALIZADA con
 * `alNucleo` (sin objetos propios, estructura ni nombres de organización). Si al generalizar queda una señal, no sube.
 */
function subeAlNucleo(s: Sesion, id: string): void {
  if (s.rol !== 'superadmin') throw new Rechazo('al núcleo solo sube el superadministrador')
  const e = estado()
  const p = e.ensenanzas[id]
  if (!p) throw new Rechazo('esa propuesta no existe')
  // D1 (PRP-011): con el consentimiento vigente de la consultora y del cliente de origen, o no sube.
  const falta = faltaParaElNucleo(e.consentimientos, e.origenes[id] ?? null)
  if (falta) throw new Rechazo(falta)
  let n: PropuestaDeEnsenanza
  try { n = alNucleo(p, VALIDADORES, NOMBRES_DE_ORGANIZACION) } catch (e) { throw new Rechazo(e instanceof Error ? e.message : String(e)) }
  e.ensenanzas[id] = n
  e.propuestas = e.propuestas.map((v) => (v.id === id ? { ...v, alcance: alcanceDe(n), detalle: n.contenido, por: `${v.por} · al núcleo por ${s.usuario}` } : v))
}

/** D1: consiente o revoca una persona de ESA organización, por ella: un consultor por su consultora, el cliente por sí. */
function conocimientoComun(s: Sesion, accion: 'consiente' | 'revoca'): void {
  if (s.rol !== 'consultor' && s.rol !== 'cliente') throw new Rechazo('consiente la consultora o el cliente, cada uno por sí: el laboratorio no')
  const e = estado()
  try { e.consentimientos = accion === 'consiente' ? consiente(e.consentimientos, s.organizacion, s.usuario, ahora()) : revoca(e.consentimientos, s.organizacion, ahora()) }
  catch (x) { throw new Rechazo(x instanceof Error ? x.message : String(x)) }
}

/**
 * El consultor le pide un dato al cliente y el reloj se pausa. Pausar dice QUÉ se pide (como `ss_evento` en la base):
 * una pausa sin pedir nada es la pausa unilateral (AISIA §2), y el cliente la ve y la puede impugnar.
 */
function pideAlCliente(s: Sesion, id: string, pide: string): void {
  if (s.rol !== 'consultor') throw new Rechazo('la pausa la pide el consultor de la consultora')
  const i = estado().incidencias.find((x) => x.id === id && x.consultora === s.organizacion)
  if (!i) throw new Rechazo('esa incidencia no es de tu consultora')
  if (pide.trim().length < 10) throw new Rechazo('pausar el reloj lleva lo que se le pide al cliente')
  if (i.estado === 'espera_cliente') throw new Rechazo('el reloj ya espera al cliente')
  i.sla.push({ tipo: 'ESPERA_CLIENTE', fecha: ahora() })
  anota(i, 'ESPERA_CLIENTE', s.usuario, { pide: pide.trim() })
  i.estado = 'espera_cliente'
}

/**
 * La respuesta del cliente reanuda el reloj. La registra el cliente de la incidencia o su consultor: si solo pudiera
 * la consultora, el reloj quedaría en pausa mientras ella quisiera (la pausa unilateral, PRP-010 fase 4).
 */
function respuestaDelCliente(s: Sesion, id: string): void {
  const i = estado().incidencias.find((x) => x.id === id
    && ((s.rol === 'consultor' && x.consultora === s.organizacion) || (s.rol === 'cliente' && x.cliente === s.organizacion)))
  if (!i) throw new Rechazo('la respuesta la registra el cliente de la incidencia o su consultora')
  if (i.estado !== 'espera_cliente') throw new Rechazo('no hay nada pedido al cliente')
  i.sla.push({ tipo: 'RESPUESTA_CLIENTE', fecha: ahora() })
  anota(i, 'RESPUESTA_CLIENTE', s.usuario, {})
  i.estado = 'en_atencion'
}

/**
 * El consultor le responde al cliente. La PRIMERA respuesta de una persona es la que para el reloj de respuesta
 * (DP-4, PRP-010 H-17): ni mandar a la sala ni anonimizar cuentan, y una P1 ya no se «cumple» sola.
 */
function respondeAlCliente(s: Sesion, id: string, texto: string): void {
  if (s.rol !== 'consultor') throw new Rechazo('al cliente le responde el consultor de su consultora')
  const i = estado().incidencias.find((x) => x.id === id && x.consultora === s.organizacion)
  if (!i) throw new Rechazo('esa incidencia no es de tu consultora')
  // El mensaje se guarda y el cliente lo lee: una «respuesta» que el cliente no ve no es responderle (R3-07).
  i.respuestas.push({ texto, por: s.usuario, fecha: ahora() })
  if (i.sla.some((x) => x.tipo === 'PRIMERA_RESPUESTA')) return
  i.sla.push({ tipo: 'PRIMERA_RESPUESTA', fecha: ahora() })
  anota(i, 'PRIMERA_RESPUESTA', s.usuario, { mensaje: texto })
}

/**
 * El cliente impugna la prioridad, la categoría, la complejidad o una pausa del reloj de SU incidencia, con un motivo
 * de 10 caracteres o más (PRP-010 H-10; las mismas reglas que `ss_impugnacion`).
 */
function impugna(s: Sesion, id: string, campo: CampoImpugnable, motivo: string): void {
  if (s.rol !== 'cliente') throw new Rechazo('impugna el cliente de la incidencia')
  const i = estado().incidencias.find((x) => x.id === id && x.cliente === s.organizacion)
  if (!i) throw new Rechazo('esa incidencia no es tuya')
  if (motivo.trim().length < 10) throw new Rechazo('el motivo de una impugnación lleva al menos 10 caracteres')
  const m: ImpugnacionLab = { id: `imp-${i.id}-${i.impugnaciones.length + 1}`, campo, motivo: motivo.trim(), por: s.usuario, creada: ahora(), estado: 'abierta', resueltaPor: null, resuelta: null }
  i.impugnaciones.push(m)
  // La queja queda también en la cadena: quién, cuándo y qué impugnó (R3-09).
  anota(i, 'IMPUGNADA', s.usuario, { impugnacion: m.id, campo })
}

/** La consultora la resuelve A SU NOMBRE: decide el estado, no reescribe la queja, y una resuelta no se reabre. */
function resuelveImpugnacion(s: Sesion, id: string, impugnacion: string, decision: 'aceptada' | 'rechazada'): void {
  if (s.rol !== 'consultor') throw new Rechazo('la impugnación la resuelve el consultor de la consultora')
  const m = estado().incidencias.find((x) => x.id === id && x.consultora === s.organizacion)?.impugnaciones.find((x) => x.id === impugnacion)
  if (!m) throw new Rechazo('esa impugnación no es de tu consultora')
  if (m.estado !== 'abierta') throw new Rechazo('una impugnación resuelta no se reabre ni se cambia')
  m.estado = decision; m.resueltaPor = s.usuario; m.resuelta = ahora()
  const i = estado().incidencias.find((x) => x.id === id)!
  anota(i, 'IMPUGNACION_RESUELTA', s.usuario, { impugnacion: m.id, decision })
}

/** El tope del mes lo fija el superadministrador (como `ss_presupuesto_fija` en la base). */
function fijaPresupuesto(s: Sesion, consultora: string, tope: TopeDelMes): void {
  if (s.rol !== 'superadmin') throw new Rechazo('el presupuesto del mes lo fija el superadministrador')
  if (!CONSULTORAS.some((c) => c.id === consultora)) throw new Rechazo('esa consultora no existe')
  estado().presupuestos[`${consultora}:${mesDe(ahora())}`] = tope
}

export function actua(s: Sesion, a: Accion): void {
  try { despacha(s, a) } catch (e) { throw comoRechazo(e) }
}

function despacha(s: Sesion, a: Accion): void {
  if (a.tipo === 'reinicia') { g.__soporteSapLab = nuevo(); return }
  if (a.tipo === 'decide') return decide(s, a.mensaje, a.accion, a.motivo ?? '')
  if (a.tipo === 'chat') return conversa(s, a.texto)
  if (a.tipo === 'responde') return respondeAlCliente(s, a.incidencia, a.texto)
  if (a.tipo === 'al_nucleo') return subeAlNucleo(s, a.propuesta)
  if (a.tipo === 'fija_presupuesto') return fijaPresupuesto(s, a.consultora, { topeTokens: a.topeTokens, topePaginasOcr: a.topePaginasOcr })
  if (a.tipo === 'impugna') return impugna(s, a.incidencia, a.campo, a.motivo)
  if (a.tipo === 'resuelve_impugnacion') return resuelveImpugnacion(s, a.incidencia, a.impugnacion, a.decision)
  if (a.tipo === 'consiente_nucleo' || a.tipo === 'revoca_nucleo') return conocimientoComun(s, a.tipo === 'consiente_nucleo' ? 'consiente' : 'revoca')
  if (a.tipo === 'escala') return escala(s, a.incidencia)
  if (a.tipo === 'resuelve') return resuelve(s, a.incidencia)
  if (a.tipo === 'espera_cliente') return pideAlCliente(s, a.incidencia, a.pide)
  return respuestaDelCliente(s, a.incidencia)
}

/**
 * La ficha de servidor de cada consultora (PRP-010, fase 3). En el laboratorio no hay un servidor por consultora: Andina
 * va en la infraestructura del laboratorio (gestionado) y Boreal en su máquina (despacho), las dos SIN MEDIR, sin las
 * respuestas del proveedor (D12) y sin restauración probada. Por eso ninguna es apta, y la pantalla lo dice.
 */
export const fichasDeServidor = (): FichaDeServidor[] => CONSULTORAS.map((c) => ({
  consultora: c.id, modo: c.id === 'boreal' ? 'despacho' : 'gestionado', medicion: null, respuestas: PREGUNTAS_SNAPSHOT.map(() => null), restauracion: null,
}))

/** El reloj de una incidencia de la sesión, a este momento (la única definición: `relojSla`). */
export const relojDe = (i: IncidenciaLab): ResultadoSla => relojSla(i.sla, i.clasificacion.prioridad, contratoDeLaboratorio(i.consultora, i.cliente, '2026-04-01'), ahora())

let demo: Array<{ titulo: string; reloj: ResultadoSla }> | undefined
/**
 * Dos relojes del corpus de Alimentos del Bajío: la respuesta incumplida (con su evidencia) y una
 * incidencia crítica con espera del cliente (el reloj se pausa y se reanuda, con minutos reales).
 */
export function relojesDeDemostracion(): Array<{ titulo: string; reloj: ResultadoSla }> {
  if (demo) return demo
  const corpus = generaCorpus({ rfc: digitoVerificadorRfc, curp: digitoVerificadorCurp })
  const k = contratoDeLaboratorio('andina', 'alimentos-del-bajio', '2026-04-01')
  const candidatas = corpus.incidencias.filter((i) => i.cliente === 'alimentos-del-bajio' && !i.conDatosPersonales && (i.prioridad === 'P1' || i.prioridad === 'P2'))
    .map((i) => ({ i, r: relojSla(i.eventos, i.prioridad, k, corpus.corte) }))
  const elegidas = [candidatas.find((x) => x.r.cumpleRespuesta === false), candidatas.find((x) => x.r.pausadoMin > 0 && x.r.estado === 'resuelta')]
  demo = elegidas.filter((x) => x !== undefined).map((x) => ({ titulo: `${x.i.id} · ${x.i.prioridad} · ${x.i.titulo}`, reloj: x.r }))
  return demo
}
