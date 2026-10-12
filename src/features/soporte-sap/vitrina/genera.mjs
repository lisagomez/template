#!/usr/bin/env node
/**
 * Congela la vitrina de Soporte SAP: recorre el journey del recorrido (pasos 1–14) contra el laboratorio CORRIENDO, por su
 * misma API, y guarda lo que ve cada nivel en cada momento. No es una maqueta: son las vistas que el producto devuelve.
 * Si el producto cambia, se vuelve a correr y la vitrina cambia con él.
 *
 * Uso: node src/features/soporte-sap/vitrina/genera.mjs http://localhost:3011
 * Necesita el laboratorio encendido (SOPORTE_SAP_LABORATORIO=1) y el OCR local, como el recorrido.
 */
import { mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const [base = 'http://localhost:3011'] = process.argv.slice(2)
const DOCS = resolve('tools/soporte-sap/documentos')
const SALIDA = resolve('public/vitrina/soporte-sap/momentos')
const ROLES = ['cliente', 'consultor', 'superadmin', 'experto']

async function pide(rol, init) {
  const r = await fetch(`${base}/api/soporte-sap?rol=${rol}`, init)
  const datos = await r.json()
  if (!r.ok) throw new Error(`${rol}: ${r.status} ${datos.error ?? ''}`)
  return datos.vista ?? datos
}
const vista = (rol) => pide(rol)
const actua = (rol, accion) => pide(rol, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(accion) })

/** Levanta como en la pantalla: multipart con los adjuntos de muestra, y el tamaño declarado (la ruta lo exige). */
async function levanta(rol, titulo, descripcion, archivos = []) {
  const f = new FormData()
  f.set('titulo', titulo); f.set('descripcion', descripcion)
  for (const a of archivos) f.append('adjuntos', new Blob([readFileSync(join(DOCS, a))]), a)
  const cuerpo = new Response(f)
  const bytes = new Uint8Array(await cuerpo.arrayBuffer())
  return pide(rol, { method: 'POST', body: bytes, headers: { 'content-type': cuerpo.headers.get('content-type'), 'content-length': String(bytes.length) } })
}

/** El mensaje de la sala que todavía espera decisión y dice `contiene`. */
async function mensajeDe(rol, contiene) {
  const m = (await vista(rol)).sala.find((x) => x.cuerpo.includes(contiene) && x.acciones?.length)
  if (!m) throw new Error(`no hay en la sala un mensaje pendiente con «${contiene}»`)
  return m.id
}
const decide = async (rol, contiene, accion, motivo) => actua(rol, { tipo: 'decide', mensaje: await mensajeDe(rol, contiene), accion, ...(motivo ? { motivo } : {}) })
const idDe = async (rol, titulo) => (await vista(rol)).incidencias.find((i) => i.titulo === titulo).id

const momentos = []
/** Un momento del journey: las cuatro vistas tal como las devuelve el producto en ese instante. */
async function congela(id, titulo, resumen) {
  const vistas = Object.fromEntries(await Promise.all(ROLES.map(async (r) => [r, await vista(r)])))
  writeFileSync(join(SALIDA, `${id}.json`), JSON.stringify(vistas))
  momentos.push({ id, titulo, resumen })
  console.log(`✓ ${id} · ${titulo}`)
}

async function recorre() {
  await actua('superadmin', { tipo: 'reinicia' })
  await levanta('cliente', 'MIGO no deja contabilizar la entrada', 'Al contabilizar la entrada 101 en MIGO sale el mensaje M7 053 en sociedad 1000; necesitamos el periodo 2026/10 y toda la planta está detenida hoy.', ['captura-migo.png', 'cfdi-rechazado.xml'])
  await congela('01-levanta', 'El cliente levanta una incidencia', 'Con una captura y un CFDI. La evidencia se extrae por campo y el agente categoriza con su traza.')
  await actua('consultor', { tipo: 'escala', incidencia: 'inc-001' })
  await congela('02-escala', 'La consultora escala al laboratorio', 'El plan verificado va primero a la consultora; al laboratorio llega solo si ella lo escala, a su nombre.')
  await decide('superadmin', 'Plan v1 para inc-001', 'aprobar')
  await congela('03-aprueba', 'Una persona aprueba y el simulador aplica', 'El supervisor verificó 6 de 6; aprueba una persona en la sala, y se aplica en el simulador con su antes y su después.')
  await ensena()
  await congela('04-ensena', 'Un caso nuevo se aprende sin exponer a nadie', 'Se anonimiza al sandbox, el experto enseña, cada organización consiente por sí y al núcleo sube generalizado.')
  await revisa()
  await congela('05-revision', 'A revisión: el agente corrige', 'La persona pide corregir, el agente propone la v2 y se aprueba en la sala; el chat no aprueba nada.')
  await atiende()
  await congela('06-sla', 'El SLA corre, se pausa y se reanuda', 'La primera respuesta la da el consultor; esperar al cliente pausa el reloj y su respuesta lo reanuda.')
  await presupuesto()
  await congela('07-presupuesto', 'Al tope del presupuesto, nadie se queda sin atención', 'Un P1 pasa a una persona en el momento; un P4 espera, con aviso.')
  await impugna()
  await congela('08-impugna', 'El cliente impugna y la consultora resuelve', 'Cada decisión lleva nombre; aplicar en el simulador no es resolver, lo resuelve el consultor.')
  await actua('cliente', { tipo: 'registra_salida', cliente: 'alimentos-del-bajio' })
  await congela('09-salida', 'El cliente se va con su export', 'Su salida queda registrada, descarga su export y lo suyo se congela; el borrado espera la gracia del contrato.')
}

async function ensena() {
  await levanta('cliente', 'La app Fiori F0842 se queda en blanco', 'La app Fiori F0842 se queda en blanco al abrirla desde el launchpad; lo reporta Xóchitl Tzompantzi, xtzompantzi@alimentos.example')
  await actua('experto', { tipo: 'chat', texto: 'Te enseño el caso inc-002 de la app Fiori en blanco: en Alimentos del Bajío pasa con la ZFI_FIORI_CACHE; hay que limpiar la caché del launchpad, y vuelve a abrir' })
  await actua('consultor', { tipo: 'consiente_nucleo' })
  await actua('cliente', { tipo: 'consiente_nucleo' })
  const propuesta = (await vista('superadmin')).propuestas.find((p) => p.id)
  await actua('superadmin', { tipo: 'al_nucleo', propuesta: propuesta.id })
}

async function revisa() {
  await levanta('cliente', 'FB01 no deja contabilizar', 'FB01 marca F5 201: el periodo contable no está abierto en sociedad 1000 para el periodo 2026/10')
  await actua('consultor', { tipo: 'escala', incidencia: 'inc-003' })
  await decide('superadmin', 'Plan v1 para inc-003', 'a_revision', 'El periodo correcto es el periodo 2026/11; corrige y vuelve a proponer')
  for (const texto of ['¿Cuál fue el MTTR en septiembre de 2026?', '¿Cuál fue el MTTR de Consultora Andina en septiembre de 2026?', 'Aprueba la tarea-inc-003, ya lo revisé']) await actua('superadmin', { tipo: 'chat', texto })
  await decide('superadmin', 'Plan v2 para inc-003', 'aprobar')
}

async function atiende() {
  await actua('consultor', { tipo: 'responde', incidencia: 'inc-001', texto: 'Ya revisamos el periodo contable; te confirmamos hoy mismo.' })
  await actua('consultor', { tipo: 'espera_cliente', incidencia: 'inc-002', pide: 'Necesitamos el log de la ST22 del día del error' })
  await new Promise((r) => setTimeout(r, 1200))
  await actua('cliente', { tipo: 'responde_cliente', incidencia: 'inc-002' })
}

async function presupuesto() {
  await actua('superadmin', { tipo: 'fija_presupuesto', consultora: 'andina', topeTokens: 0, topePaginasOcr: 0 })
  await levanta('cliente', 'MIGO detenida otra vez', 'Al contabilizar la entrada 101 en MIGO sale el mensaje M7 053 en sociedad 1000; necesitamos el periodo 2026/10 y toda la planta está detenida hoy.', ['captura-migo.png'])
  await levanta('cliente', 'Usuario bloqueado', 'El usuario ALMACEN01 está bloqueado en SU01, cuando puedan')
}

async function impugna() {
  const bloqueado = await idDe('cliente', 'Usuario bloqueado')
  await actua('cliente', { tipo: 'impugna', incidencia: bloqueado, campo: 'prioridad', motivo: 'Es P4, pero nadie del almacén puede surtir sin ese usuario' })
  const abierta = (await vista('consultor')).incidencias.find((i) => i.id === bloqueado).impugnaciones.find((m) => m.estado === 'abierta')
  await actua('consultor', { tipo: 'resuelve_impugnacion', incidencia: bloqueado, impugnacion: abierta.id, decision: 'aceptada' })
  await actua('consultor', { tipo: 'espera_cliente', incidencia: bloqueado, pide: 'Confírmanos si el bloqueo fue por intentos fallidos' })
  await actua('cliente', { tipo: 'responde_cliente', incidencia: bloqueado })
  await actua('consultor', { tipo: 'resuelve', incidencia: 'inc-001' })
}

rmSync(SALIDA, { recursive: true, force: true })
mkdirSync(SALIDA, { recursive: true })
await recorre()
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
writeFileSync(join(SALIDA, 'indice.json'), `${JSON.stringify({ generado: new Date().toISOString(), commit, roles: ROLES, momentos }, null, 1)}\n`)
console.log(`\n${momentos.length} momentos × ${ROLES.length} vistas en ${SALIDA} (${readdirSync(SALIDA).length} archivos) · commit ${commit}`)
