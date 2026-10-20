/**
 * La mesa del experto: el experto ingresa SU caso y lo ve correr de punta a punta por el runtime de laboratorio, el mismo
 * de `/soporte-sap`. Para que el caso llegue a la sala, la mesa hace lo que harían el cliente (N3) y la consultora (N2),
 * EN SU NOMBRE y marcado así en la cadena: el cliente lo levanta y la consultora lo escala. Lo demás lo decide el
 * experto: aprueba, rechaza o manda a revisión en la sala; le enseña al agente cuando no sabe; y dice qué le pareció cada
 * paso. Lo que dice se guarda en el almacén, fuera del contenedor, y solo después de pasar el filtro.
 */
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { agregaParticipante } from '../../../../../tools/sala-a2a/dist/index.js'
import { CLIENTES } from '../../../../../tools/soporte-sap/dist/index.js'
import { estado, levanta, actua, ensenaEnElCaso, relojDe, Rechazo, type IncidenciaLab } from '../../services/runtime'
import type { Sesion } from '../../services/tipos'
import { MUESTRAS } from '../../vitrina/en-vivo/muestras'
import type { IdentidadMesa } from './acceso'
import type { Almacen } from './almacen'
import { datoPersonalEn } from './filtro'
import { lineaDeTiempo } from './linea'
import { ENTRADA, type CasoMesa, type CasoVista, type EntradaCaso, type MesaVista, type PlanMesa, type Quien, type Veredicto } from './modelo'

export { Rechazo }
/** El cliente sintético de cada sistema, de Consultora Andina: el plan corre contra el SAP simulado de ese cliente. */
const CLIENTE_DE: Readonly<Record<EntradaCaso['sistema'], string>> = { ECC: 'aceros-del-norte', S4HANA: 'alimentos-del-bajio' }
const CONSULTORA = 'andina'
const PREFIJO = 'mesa/casos'
const claveDe = (caso: string) => `${PREFIJO}/${caso}.json`
const ID_CASO = /^c-[a-z0-9]{6,12}-[a-f0-9]{6}$/
const DOCUMENTOS = () => join(/*turbopackIgnore: true*/ process.cwd(), 'tools', 'soporte-sap', 'documentos')
/** Una muestra es un archivo del catálogo, por su nombre exacto: nada que venga de fuera se lee del disco. */
const esMuestraDeLaMesa = (x: string): boolean => MUESTRAS.some((m) => m.archivo === x)

/**
 * Cada estado del runtime tiene su arranque: una incidencia vive solo en el arranque en que nació (al dormirse el
 * contenedor, `inc-001` puede ser otro caso). En `globalThis`, como el estado, para que la ruta y la página lo compartan.
 */
const g = globalThis as { __mesaArranques?: WeakMap<object, string> }
export function arranque(): string {
  const e = estado(), mapa = (g.__mesaArranques ??= new WeakMap())
  let a = mapa.get(e)
  if (!a) { a = randomUUID().slice(0, 8); mapa.set(e, a) }
  return a
}

const sesionExperto = (id: IdentidadMesa): Sesion => ({ rol: 'experto', usuario: id.usuario, nombre: id.correo, organizacion: 'laboratorio', nivel: 'N1' })
const enNombreDelN3 = (id: IdentidadMesa, cliente: string): Sesion => ({ rol: 'cliente', usuario: `${id.usuario}·en-nombre-del-N3`, nombre: 'El experto, en nombre del cliente sintético', organizacion: cliente, nivel: 'N3' })
const enNombreDelN2 = (id: IdentidadMesa): Sesion => ({ rol: 'consultor', usuario: `${id.usuario}·en-nombre-del-N2`, nombre: 'El experto, en nombre de la consultora sintética', organizacion: CONSULTORA, nivel: 'N2' })

function quienEs(usuario: string): (actor: string) => { quien: Quien; dice: string } {
  return (actor) => {
    if (actor === usuario) return { quien: 'tu', dice: 'Tú (experto)' }
    if (actor === `${usuario}·en-nombre-del-N3`) return { quien: 'n3', dice: 'Tú, en nombre del cliente (N3 sintético)' }
    if (actor === `${usuario}·en-nombre-del-N2`) return { quien: 'n2', dice: 'Tú, en nombre de la consultora (N2 sintético)' }
    if (actor === 'agente:supervisor-sap') return { quien: 'supervisor', dice: 'Agente supervisor' }
    if (actor.startsWith('agente:')) return { quien: 'agente', dice: actor === 'agente:ejecutor-sap' ? 'Agente ejecutor' : 'Agente de Soporte SAP' }
    return { quien: 'sistema', dice: actor }
  }
}

/**
 * Lo que el experto escribió, como lo levantaría un cliente: el síntoma y el contexto SAP en frases que el agente lee.
 * La redacción está medida contra el anonimizador: «Módulo Fiori» o un «Probé» tras dos puntos se leían como un nombre.
 * Sociedad y periodo van sin dos puntos, que es como los lee la matriz.
 */
function textoDe(e: EntradaCaso): { titulo: string; descripcion: string } {
  const titulo = e.transaccion ? [e.transaccion, e.mensaje].filter(Boolean).join(' · ').slice(0, 120) : `Caso de ${e.modulo}`
  const contexto = [e.transaccion && `Transacción ${e.transaccion}.`, e.mensaje && `Mensaje ${e.mensaje}.`, e.sociedad && `Sociedad ${e.sociedad}.`, e.periodo && `Periodo ${e.periodo}.`, `Módulo: ${e.modulo}. Sistema: ${e.sistema === 'S4HANA' ? 'S/4HANA' : 'ECC'}.`]
  const sintoma = /[.!?]$/.test(e.sintoma.trim()) ? e.sintoma.trim() : `${e.sintoma.trim()}.`
  const descripcion = [sintoma, ...contexto.filter(Boolean), e.intento && `Ya intenté lo siguiente. ${e.intento}`].filter(Boolean).join(' ')
  return { titulo, descripcion }
}

/** El delimitador de la sala marca el texto humano como DATO; en la pantalla se lee sin él. */
const sinDelimitador = (t: string): string => t.replace(/<<<[A-Z_]+\s?|\s?[A-Z_]+>>>/g, '').trim()

const incidenciaVivaDe = (c: CasoMesa): IncidenciaLab | null =>
  c.arranque === arranque() ? (estado().incidencias.find((x) => x.id === c.incidencia) ?? null) : null

/** El caso, al día con lo que la incidencia tiene en el runtime: los pasos, el resultado, los planes, el reloj. */
function alDia(c: CasoMesa, i: IncidenciaLab): void {
  const q = i.consulta
  c.pasos = lineaDeTiempo(i, quienEs(c.por.usuario))
  c.resultado = q.tipo === 'sin_solucion'
    ? { tipo: q.tipo, regla: null, titulo: null, resumen: null, cita: null, url: null, grado: null, razon: q.razon }
    : { tipo: q.tipo, regla: q.entrada.regla, titulo: q.entrada.titulo, resumen: q.entrada.solucion.resumen, cita: q.fuente.cita, url: q.fuente.url, grado: q.entrada.grado, razon: q.razon }
  c.prioridad = i.clasificacion.prioridad
  c.cliente = CLIENTES.find((x) => x.id === i.cliente)?.nombre ?? i.cliente
  c.planes = i.planes.map((p): PlanMesa => ({
    version: p.plan.version, pasos: p.plan.pasos.map((x) => `${x.descripcion}${Object.keys(x.parametros).length ? ` (${Object.entries(x.parametros).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}`),
    supervisor: { resultado: p.veredicto.resultado, verdes: p.veredicto.comprobaciones.filter((x) => x.ok).length, total: p.veredicto.comprobaciones.length, fallan: p.veredicto.comprobaciones.filter((x) => !x.ok).map((x) => `${x.que}: ${x.detalle}`) },
    mensaje: p.mensaje, decision: p.decision ? { accion: p.decision.accion, motivo: p.decision.motivo } : null, aplicado: p.aplicado,
  }))
  c.sandbox = i.sandbox ? { veredicto: i.sandbox.veredicto, senales: [...i.sandbox.senales], texto: i.sandbox.veredicto === 'entra' ? i.sandbox.texto : null } : null
  const r = relojDe(i)
  c.reloj = { estado: r.estado, respuestaMin: r.respuestaMin, metaRespuestaMin: r.metaRespuestaMin, cumpleRespuesta: r.cumpleRespuesta, pausadoMin: r.pausadoMin }
  c.actualizado = new Date().toISOString()
}

/** Todo lo que ESCRIBIÓ el experto en el caso (lo demás lo escribió el laboratorio: fechas, claves, pasos). */
const loQueEscribio = (c: CasoMesa): unknown[] => [c.entrada, ...Object.values(c.retro.pasos).map((r) => r.esperaba), c.retro.veredicto?.solucion, c.retro.veredicto?.nota, ...c.ensenanza.filter((t) => t.autor === 'tu').map((t) => t.texto)]

async function guarda(a: Almacen, c: CasoMesa): Promise<void> {
  // Segundo cerrojo: nada se guarda si algo que escribió el experto tiene forma de dato personal.
  if (datoPersonalEn(loQueEscribio(c))) throw new Rechazo('no se guarda: hay un texto con forma de dato personal')
  await a.escribe(claveDe(c.id), JSON.stringify(c))
}

async function carga(a: Almacen, caso: string): Promise<CasoMesa | null> {
  if (!ID_CASO.test(caso)) return null
  const t = await a.lee(claveDe(caso))
  return t ? (JSON.parse(t) as CasoMesa) : null
}

/** El caso de ESTA identidad: el de otra persona no existe para ella, ni siquiera para el laboratorio en la mesa. */
async function delExperto(a: Almacen, id: IdentidadMesa, caso: string): Promise<CasoMesa> {
  const c = await carga(a, caso)
  if (!c || c.por.usuario !== id.usuario) throw new Rechazo('ese caso no es tuyo')
  return c
}

const filtra = (x: unknown): void => { const d = datoPersonalEn(x); if (d) throw new Rechazo(d) }

export async function ingresa(a: Almacen, id: IdentidadMesa, cruda: unknown, version: string): Promise<CasoMesa> {
  const entrada = ENTRADA.parse(cruda)
  filtra(entrada)
  if (new Set(entrada.muestras).size !== entrada.muestras.length || !entrada.muestras.every(esMuestraDeLaMesa)) throw new Rechazo('la evidencia son las muestras sintéticas del laboratorio: aquí no se suben archivos')
  const cliente = CLIENTE_DE[entrada.sistema]
  const archivos = entrada.muestras.map((m) => ({ nombre: m, bytes: new Uint8Array(readFileSync(join(DOCUMENTOS(), m))) }))
  const incidencia = await levanta(enNombreDelN3(id, cliente), { ...textoDe(entrada), archivos })
  const i = estado().incidencias.find((x) => x.id === incidencia)!
  // Con un plan verificado, la consultora lo escala (en su nombre) para que llegue a la sala del laboratorio (DP-3).
  if (i.planes.some((p) => p.veredicto.resultado === 'a_la_sala' && !p.mensaje)) actua(enNombreDelN2(id), { tipo: 'escala', incidencia })
  const ahora = new Date().toISOString()
  const c: CasoMesa = {
    version: 1, id: `c-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`, creado: ahora, actualizado: ahora,
    por: { usuario: id.usuario, correo: id.correo, prueba: id.prueba }, entrada, incidencia, arranque: arranque(), laboratorio: version,
    cliente, pasos: [], resultado: { tipo: 'sin_solucion', regla: null, titulo: null, resumen: null, cita: null, url: null, grado: null, razon: '' },
    prioridad: '', planes: [], sandbox: null, ensenanza: [], propuestas: [], reloj: null, retro: { pasos: {}, veredicto: null },
  }
  alDia(c, i)
  await guarda(a, c)
  return c
}

/** El caso como lo pinta la pantalla: con si todavía vive en este arranque del laboratorio. */
export const comoVista = (c: CasoMesa): CasoVista => ({ ...c, vivo: incidenciaVivaDe(c) !== null })

const vivaOFalla = (c: CasoMesa): IncidenciaLab => {
  const i = incidenciaVivaDe(c)
  if (!i) throw new Rechazo('este caso ya no vive en el laboratorio (se reinició): su línea, tu retro y tu veredicto se guardaron. Vuelve a correrlo para decidir o enseñar')
  return i
}

/** El experto decide en la sala, con su sesión, sobre el plan que espera en su caso. */
export async function decide(a: Almacen, id: IdentidadMesa, caso: string, accion: 'aprobar' | 'rechazar' | 'a_revision', motivo: string): Promise<CasoMesa> {
  const c = await delExperto(a, id, caso)
  const i = vivaOFalla(c)
  filtra(motivo)
  const plan = [...i.planes].reverse().find((p) => p.mensaje && !p.decision)
  if (!plan) throw new Rechazo('no hay un plan esperando tu decisión en la sala')
  if (accion === 'a_revision' && motivo.trim().length < 3) throw new Rechazo('para mandarlo a revisión, dile al agente qué corregir')
  const e = estado()
  e.sala = agregaParticipante(e.sala, CONSULTORA, id.usuario)
  actua(sesionExperto(id), { tipo: 'decide', mensaje: plan.mensaje!, accion, motivo })
  alDia(c, i)
  await guarda(a, c)
  return c
}

/** El experto le enseña al agente en SU caso del sandbox. En cuarentena no se enseña: ese caso nadie lo aprende (D14). */
export async function ensena(a: Almacen, id: IdentidadMesa, caso: string, texto: string): Promise<CasoMesa> {
  const c = await delExperto(a, id, caso)
  const i = vivaOFalla(c)
  filtra(texto)
  if (!i.sandbox) throw new Rechazo('este caso tiene regla: no está en el sandbox. Si la regla está mal, dilo en tu veredicto')
  if (i.sandbox.veredicto !== 'entra') throw new Rechazo('este caso está en cuarentena (RR. HH. o nómina, o con un dato personal): no entra al sandbox y nadie lo aprende. Tu veredicto sí se guarda')
  const r = ensenaEnElCaso(sesionExperto(id), i.id, texto)
  const ahora = new Date().toISOString()
  c.ensenanza.push({ autor: 'tu', texto, tipo: null, fecha: ahora }, { autor: 'agente', texto: r.respuesta.texto, tipo: r.respuesta.tipo, fecha: ahora })
  if (r.respuesta.tipo === 'propuesta') {
    c.propuestas.push({ tipo: 'regla', titulo: 'Caso nuevo para la matriz y regla para el grafo', detalle: sinDelimitador(r.respuesta.propuesta.contenido), estado: 'propuesta: la firma el laboratorio' })
    if (r.respuesta.cli) c.propuestas.push({ tipo: 'cli', titulo: r.respuesta.cli.nombre, detalle: `${r.respuesta.cli.operacion} · dry-run por defecto · ${r.respuesta.cli.nota}`, estado: 'propuesta: imprimirlo es CDC' })
  }
  alDia(c, i)
  await guarda(a, c)
  return c
}

export async function retroPaso(a: Almacen, id: IdentidadMesa, caso: string, clave: string, gesto: 'bien' | 'mal', esperaba: string | undefined): Promise<CasoMesa> {
  const c = await delExperto(a, id, caso)
  if (!c.pasos.some((p) => p.clave === clave)) throw new Rechazo('ese paso no está en tu caso')
  filtra(esperaba ?? '')
  c.retro.pasos[clave] = { gesto, esperaba: esperaba?.trim() || null, fecha: new Date().toISOString() }
  c.actualizado = new Date().toISOString()
  await guarda(a, c)
  return c
}

export async function veredicto(a: Almacen, id: IdentidadMesa, caso: string, valor: Veredicto, solucion: string | undefined, nota: string | undefined): Promise<CasoMesa> {
  const c = await delExperto(a, id, caso)
  filtra({ solucion, nota })
  if ((valor === 'incorrecto' || valor === 'parcial') && !(solucion ?? '').trim()) throw new Rechazo('si el agente se equivocó, cuéntale cuál es la solución correcta')
  c.retro.veredicto = { valor, solucion: solucion?.trim() || null, nota: nota?.trim() || null, fecha: new Date().toISOString() }
  c.actualizado = new Date().toISOString()
  await guarda(a, c)
  return c
}

/** Todos los casos guardados. Con retención, los que pasan de ella se borran al listar. */
export async function todosLosCasos(a: Almacen, retencionDias: number | null): Promise<CasoMesa[]> {
  const claves = await a.lista(PREFIJO)
  const casos = (await Promise.all(claves.map(async (k) => { const t = await a.lee(k); return t ? (JSON.parse(t) as CasoMesa) : null }))).filter((c): c is CasoMesa => c !== null)
  if (retencionDias === null) return casos
  const limite = Date.now() - retencionDias * 86_400_000
  for (const c of casos.filter((x) => Date.parse(x.actualizado) < limite)) await a.borra(claveDe(c.id))
  return casos.filter((x) => Date.parse(x.actualizado) >= limite)
}

/** Lo que ve una identidad en la mesa: SUS casos, de los más nuevos a los más viejos; los vivos, al día. */
export async function vistaMesa(a: Almacen, id: IdentidadMesa, retencionDias: number | null): Promise<MesaVista> {
  const propios = (await todosLosCasos(a, retencionDias)).filter((c) => c.por.usuario === id.usuario).sort((x, y) => (x.creado < y.creado ? 1 : -1))
  const casos: CasoVista[] = propios.map((c) => {
    const i = incidenciaVivaDe(c)
    if (i) alDia(c, i)
    return { ...c, vivo: i !== null }
  })
  return { identidad: { correo: id.correo, rol: id.rol, prueba: id.prueba }, casos, muestras: MUESTRAS.map((m) => ({ ...m })), almacen: a.donde, arranque: arranque() }
}

export async function borraCaso(a: Almacen, id: IdentidadMesa, caso: string): Promise<void> {
  if (id.rol !== 'laboratorio') throw new Rechazo('borrar es del laboratorio')
  if (!(await carga(a, caso))) throw new Rechazo('ese caso no existe')
  await a.borra(claveDe(caso))
}
