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
  ingiere, categoriza, consultaMatriz, conocimientoDeMatriz, MATRIZ_LABORATORIO, CLIENTES, sapDeLaboratorio, preparaPlan, supervisa, mensajeDePlan,
  corrige, ejecuta, reproduce, anonimiza, agrega, respondeHil, relojSla, contratoDeLaboratorio, generaCorpus,
  type PuertosIngesta, type ResultadoSla, type ResultadoIngesta, type Clasificacion, type ConsultaMatriz, type EventoIncidencia, type EventoSla, type Plan,
  type VeredictoSupervisor, type SapSimulado, type Anonimizado, type MotorReglas, type Corte, type EntradaMatriz,
} from '../../../../tools/soporte-sap/dist/index.js'
import corteJson from '../../../../tools/soporte-sap/semantica/corte.json'
import type { Sesion, MensajeChatVista, PropuestaVista, Accion } from './tipos'

export const encendido = (): boolean => process.env['SOPORTE_SAP_LABORATORIO'] === '1'
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
}
interface Estado { n: number; incidencias: IncidenciaLab[]; sala: EstadoSala; sap: Record<string, SapSimulado>; chat: Record<string, MensajeChatVista[]>; propuestas: PropuestaVista[] }

function nuevo(): Estado {
  let sala = creaCanal(salaVacia(), { id: CANAL, tenant: 'andina', slug: 'consultora-andina', nombre: 'Consultora Andina', departamento: null })
  for (const u of ['usr-superadmin', 'usr-experto', 'usr-consultor-andina']) sala = agregaParticipante(sala, 'andina', u)
  return { n: 0, incidencias: [], sala, sap: Object.fromEntries(CLIENTES.map((c) => [c.id, sapDeLaboratorio(c.id, c.sistema)])), chat: {}, propuestas: [] }
}

const g = globalThis as { __soporteSapLab?: Estado }
export const estado = (): Estado => (g.__soporteSapLab ??= nuevo())

const conocimiento = conocimientoDeMatriz(MATRIZ_LABORATORIO, '2026-10-04')
export const motor: MotorReglas = (p) => evaluaSeguro(conocimiento, p, { hoy: '2026-10-04' }) as ReturnType<MotorReglas>
const VALIDADORES = { rfc: (x: string) => validaRfc(x), curp: validaCurp, nss: validaNss }
const conTimbre = registroDeEsquemas([lectorDeTimbre11])
const CONFIG = { bytesMaximos: 5_000_000, motor: 'local' as const, decisionC4: null }

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

/** El N3 levanta una incidencia con sus adjuntos. Todo lo demás lo hace el agente, y queda en la cadena. */
export async function levanta(s: Sesion, d: { titulo: string; descripcion: string; archivos: Array<{ nombre: string; bytes: Uint8Array }> }): Promise<string> {
  if (s.rol !== 'cliente') throw new Error('solo el cliente (N3) levanta incidencias aquí')
  const e = estado()
  const cl = CLIENTES.find((c) => c.id === s.organizacion)!
  const id = `inc-${String(++e.n).padStart(3, '0')}`
  const adjuntos: ResultadoIngesta[] = []
  for (const a of d.archivos) adjuntos.push(await ingiere(puertosIngesta(), CONFIG, a))
  const evidencia = adjuntos.flatMap((a) => (a.aceptado ? a.campos.map((c) => `${c.campo}: ${c.valor}`) : []))
  const texto = `${d.titulo}. ${d.descripcion}\n${evidencia.join('\n')}`
  const clasificacion = categoriza(texto)
  const consulta = consultaMatriz(motor, MATRIZ_LABORATORIO, texto, cl.sistema)
  const i: IncidenciaLab = {
    id, cliente: cl.id, consultora: cl.consultora, sistema: cl.sistema, titulo: d.titulo.slice(0, 120), texto, adjuntos, clasificacion, consulta,
    entrada: consulta.tipo === 'sin_solucion' ? null : consulta.entrada, cadena: [], sla: [{ tipo: 'RECIBIDA', fecha: ahora() }], planes: [], sandbox: null, estado: 'nueva',
  }
  anota(i, 'RECIBIDA', s.usuario, { cliente: cl.id, titulo: i.titulo })
  for (const a of adjuntos) anota(i, 'ADJUNTO_LEIDO', `agente:${AGENTE}`, a.aceptado ? { nombre: a.nombre, via: a.via, campos: a.campos.length, sha256: a.sha256 } : { nombre: a.nombre, rechazado: a.motivo })
  anota(i, 'CATEGORIZADA', `agente:${AGENTE}`, { prioridad: clasificacion.prioridad, modulo: clasificacion.modulo, transaccion: clasificacion.transaccion, mensaje: clasificacion.mensaje, etiquetas: [...clasificacion.etiquetas] })
  anota(i, 'VEREDICTO_GRAFO', `agente:${AGENTE}`, { tipo: consulta.tipo, regla: consulta.tipo === 'sin_solucion' ? null : consulta.entrada.regla, razon: consulta.razon })
  e.incidencias.unshift(i)
  if (consulta.tipo === 'solucion') proponPlan(i, preparaPlan({ ejecutor: EJECUTOR, incidencia: id, taskId: `tarea-${id}`, entrada: consulta.entrada, texto, sap: e.sap[cl.id]!, version: 1 }), null)
  else if (consulta.tipo === 'grado_insuficiente') anota(i, 'ESCALADA', `agente:${AGENTE}`, { motivo: 'grado insuficiente: lo revisa el experto' })
  else alSandbox(i)
  return id
}

/** El supervisor revisa; si pasa, el plan va a la sala (como hilo si es una versión corregida). */
function proponPlan(i: IncidenciaLab, plan: Plan, hilo: string | null): void {
  const e = estado()
  anota(i, 'PLAN_PREPARADO', EJECUTOR, { version: plan.version, sha256: `sha256:${plan.sha256}`, error: plan.error })
  const veredicto = supervisa({ supervisor: SUPERVISOR, plan, entrada: i.entrada!, sap: e.sap[i.cliente]! })
  anota(i, 'VEREDICTO_SUPERVISOR', SUPERVISOR, { resultado: veredicto.resultado, verdes: veredicto.comprobaciones.filter((c) => c.ok).length, total: veredicto.comprobaciones.length })
  const lab: PlanLab = { plan, veredicto, mensaje: null, decision: null, aplicado: null }
  if (veredicto.resultado === 'a_la_sala') {
    const m = mensajeDePlan(plan, veredicto)
    lab.mensaje = `m-${i.id}-v${plan.version}`
    e.sala = publica(e.sala, { id: lab.mensaje, canal: CANAL, hilo, autor: { tipo: 'agente', id: AGENTE }, cuerpo: m.cuerpo, bloques: m.bloques, creado: ahora() })
    anota(i, 'ENVIADA_A_SALA', `agente:${AGENTE}`, { mensaje: lab.mensaje, sha256: `sha256:${plan.sha256}` })
    if (!i.sla.some((x) => x.tipo === 'PRIMERA_RESPUESTA')) i.sla.push({ tipo: 'PRIMERA_RESPUESTA', fecha: ahora() })
    i.estado = 'en_revision'
  }
  i.planes.push(lab)
}

/** Sin regla en el grafo: anonimiza; entra al sandbox o queda en cuarentena (nunca entra con dudas). */
function alSandbox(i: IncidenciaLab): void {
  const a = anonimiza(i.texto, VALIDADORES)
  i.sandbox = a
  anota(i, 'ANONIMIZADA', `agente:${AGENTE}`, { reemplazos: Object.values(a.reemplazos).length, veredicto: a.veredicto })
  anota(i, a.veredicto === 'entra' ? 'EN_SANDBOX' : 'EN_CUARENTENA', `agente:${AGENTE}`, { senales: [...a.senales] })
  i.sla.push({ tipo: 'PRIMERA_RESPUESTA', fecha: ahora() })
  i.estado = 'en_atencion'
}

/** Una persona del laboratorio decide EN LA SALA con su sesión. Solo así se aplica algo al simulador. */
function decide(s: Sesion, mensaje: string, accion: 'aprobar' | 'rechazar' | 'a_revision', motivo: string): void {
  if (s.nivel !== 'N1') throw new Error('decide el HIL del laboratorio, en la sala')
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
  const r = ejecuta(antes, lab.plan.pasos, { taskId: a.taskId, sha256: a.sha256, decididaPor: a.decididaPor })
  e.sap[i.cliente] = r.final
  const sintoma = i.entrada!.sintoma?.(lab.plan.parametros) ?? null
  lab.aplicado = {
    antes: r.resultados.map((x) => x.antes).join('; '), despues: r.resultados.map((x) => x.despues).join('; '),
    errorAntes: sintoma ? reproduce(antes, sintoma) : false, errorDespues: sintoma ? reproduce(r.final, sintoma) : false,
  }
  anota(i, 'APLICADA_EN_SIMULADOR', `agente:${AGENTE}`, { antes: lab.aplicado.antes, despues: lab.aplicado.despues, errorDespues: lab.aplicado.errorDespues })
  anota(i, 'RESUELTA', `agente:${AGENTE}`, { por: 'plan aprobado y aplicado en el simulador' })
  i.sla.push({ tipo: 'RESUELTA', fecha: ahora() })
  i.estado = 'resuelta'
}

function revisa(i: IncidenciaLab, lab: PlanLab, mensaje: string, motivo: string, quien: string): void {
  const e = estado()
  anota(i, 'A_REVISION', quien, { mensaje, motivo: delimitaDato(motivo) })
  const r = corrige({ ejecutor: EJECUTOR, plan: lab.plan, motivo, entrada: i.entrada!, texto: i.texto, sap: e.sap[i.cliente]! })
  if (r.plan) proponPlan(i, r.plan, mensaje)
  else e.sala = publica(e.sala, { id: `nota-${mensaje}-${e.n++}`, canal: CANAL, hilo: mensaje, autor: { tipo: 'agente', id: AGENTE }, cuerpo: r.nota, creado: ahora() })
}

/** El chat del HIL: contesta con fuente, propone o promueve a la sala. Nunca aprueba. */
function conversa(s: Sesion, texto: string): void {
  if (s.rol !== 'superadmin' && s.rol !== 'experto') throw new Error('el chat del HIL es del superadministrador y del experto')
  const e = estado()
  const planes = e.sala.mensajes.filter((m) => m.bloques.length && !e.sala.aprobaciones.some((a) => a.mensaje === m.id))
    // La promoción va a la RAÍZ del hilo: una versión corregida ya es respuesta, y los hilos son de un nivel.
    .map((m) => ({ taskId: m.bloques[0]!.taskId, mensaje: m.hilo ?? m.id, canal: m.canal, resumen: m.cuerpo.split('\n')[0]! }))
  const r = respondeHil({ corte: CORTE, entidades: { andina: { tipo: 'consultora', nombre: 'Consultora Andina' }, boreal: { tipo: 'consultora', nombre: 'Consultora Boreal' } },
    motor, matriz: MATRIZ_LABORATORIO, planes, delimitaDato, agente: AGENTE, ahora: ahora(), nuevoId: () => `chat-${e.n++}` }, { usuario: s.usuario, rol: s.rol }, texto)
  const hilo = (e.chat[s.usuario] ??= [])
  hilo.push({ autor: 'humano', texto, tipo: null, fuentes: [] })
  hilo.push({ autor: 'agente', texto: r.texto, tipo: r.tipo, fuentes: 'fuentes' in r ? r.fuentes.map((f) => f.cita) : [] })
  if (r.tipo === 'promovida') e.sala = publica(e.sala, r.publicacion)
  if (r.tipo === 'propuesta') {
    e.propuestas.unshift({ tipo: 'regla', titulo: 'Caso nuevo para la matriz y regla para el grafo (propuesta de siembra)', detalle: r.propuesta.contenido, estado: r.propuesta.estado, por: r.propuesta.propuestaPor })
    if (r.cli) e.propuestas.unshift({ tipo: 'cli', titulo: r.cli.nombre, detalle: `${r.cli.operacion} · dry-run por defecto · readOnly: ${String(r.cli.readOnly)} · ${r.cli.nota}`, estado: r.cli.estado, por: r.propuesta.propuestaPor })
  }
}

/** El consultor pide un dato al cliente (pausa el reloj) o registra su respuesta (lo reanuda). */
function relojDelCliente(s: Sesion, id: string, tipo: 'ESPERA_CLIENTE' | 'RESPUESTA_CLIENTE'): void {
  if (s.rol !== 'consultor') throw new Error('el reloj lo mueve el consultor de la consultora')
  const i = estado().incidencias.find((x) => x.id === id && x.consultora === s.organizacion)
  if (!i) throw new Error('esa incidencia no es de tu consultora')
  i.sla.push({ tipo, fecha: ahora() })
  anota(i, tipo, s.usuario, {})
  i.estado = tipo === 'ESPERA_CLIENTE' ? 'espera_cliente' : 'en_atencion'
}

export function actua(s: Sesion, a: Accion): void {
  if (a.tipo === 'reinicia') { g.__soporteSapLab = nuevo(); return }
  if (a.tipo === 'decide') return decide(s, a.mensaje, a.accion, a.motivo ?? '')
  if (a.tipo === 'chat') return conversa(s, a.texto)
  return relojDelCliente(s, a.incidencia, a.tipo === 'espera_cliente' ? 'ESPERA_CLIENTE' : 'RESPUESTA_CLIENTE')
}

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
