/**
 * Los candidatos de sapstack y el mapa del laboratorio, EJECUTADOS sobre la ruta de la mesa con identidades de Access
 * firmadas aquí: una validación es una propuesta y nunca una regla, cada identidad ve solo las suyas, el mapa es del
 * laboratorio, los candidatos salen solo del catálogo fijado y lo que escribe el experto pasa el filtro. Cada afirmación
 * de seguridad tiene aquí su prueba, y su sabotaje en la matriz.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { RAIZ, lee } from './_ayuda.ts'
import { DIR, EXPERTO, OTRO, LAB, GET, POST, importa, pide } from './_mesa.mts'

const candidatos = await importa('src/features/soporte-sap/mesa/services/candidatos.ts')
const { almacenEnDisco } = await importa('src/features/soporte-sap/mesa/services/almacen.ts')
const generadores = await importa('src/features/soporte-sap/mesa/fuentes/generadores.mjs')
const CATALOGO = JSON.parse(lee('src/features/soporte-sap/mesa/fuentes/sapstack/candidatos-sapstack.json'))
const FUENTE = JSON.parse(lee('src/features/soporte-sap/mesa/fuentes/sapstack/fuente.json'))
/** El id de un candidato por su clave (los ids son huellas sin cifras: el filtro revisa toda la acción). */
const id = (clave: string): string => CATALOGO.candidatos.find((c: { clave: string }) => c.clave === clave).id

type Validacion = { candidato: string; valoracion: string; estado: string; comentario: string | null; correccion: string | null; por: { correo: string } }
async function valida(token: string, cuerpo: Record<string, unknown>): Promise<{ status: number; validacion?: Validacion; error?: string }> {
  const r = await POST(pide('POST', '', token, { tipo: 'valida_candidato', ...cuerpo }))
  return { status: r.status, ...((await r.json()) as { validacion?: Validacion; error?: string }) }
}
const vista = async (token: string, v: string) => { const r = await GET(pide('GET', `?vista=${v}`, token)); return { status: r.status, cuerpo: r.status === 200 ? await r.json() : await r.text() } }
const enDisco = (): string[] => { try { return readdirSync(join(DIR, 'mesa', 'validaciones')).sort() } catch { return [] } }

test('mesa · el catálogo de candidatos es el generado y la foto de la base no se queda vieja', () => {
  assert.equal(Object.keys(CATALOGO)[0], '_ALTO', 'el banner va primero')
  assert.match(CATALOGO._ALTO, /^ALTO: ARTEFACTO AUTOGENERADO/)
  assert.equal(CATALOGO.fuente.sha, FUENTE.sha)
  assert.equal(generadores.huellaDe(CATALOGO.candidatos), CATALOGO.huella)
  assert.ok(CATALOGO.candidatos.every((c: { fuente: { linea: number; url: string } }) => c.fuente.linea > 0 && c.fuente.url.includes(`/blob/${FUENTE.sha}/`)), 'cada candidato con su línea y su SHA')
  assert.deepEqual(JSON.parse(lee('src/features/soporte-sap/mesa/fuentes/base.json')), generadores.baseDe(RAIZ), 'base.json se regenera con extrae.mjs base tras cada npm run registra')
})

test('mesa · el mapa cuenta lo guardado: sin datos lo dice, y una validación sube su número', async () => {
  const antes = (await vista(LAB, 'mapa')).cuerpo
  assert.equal(antes.metricas.correctos.valor, 0)
  assert.equal(antes.metricas.alExperto.valor, null, 'sin casos de expertos: sin datos')
  assert.equal(antes.metricas.firmados.valor, 0)
  assert.equal(antes.fuentes.sapstack.candidatos, CATALOGO.candidatos.length)
  assert.equal(antes.base.existe, false, 'el dominio sap-soporte todavía no existe')
  assert.equal((await valida(EXPERTO, { candidato: id('VA01'), valoracion: 'correcto' })).status, 200)
  const despues = (await vista(LAB, 'mapa')).cuerpo
  assert.equal(despues.metricas.correctos.valor, 1)
  assert.equal(despues.metricas.pendientes.valor, antes.metricas.pendientes.valor - 1)
  assert.equal(despues.metricas.correctos.serie.at(-1).n, 1, 'la serie de hoy')
})

test('mesa · una validación del experto es una propuesta: no la firma ni la registra, y no escribe fuera de su almacén', async () => {
  const r = await valida(EXPERTO, { candidato: id('MIRO'), valoracion: 'correcto', comentario: 'sí, y en S/4 también se usa la app de Fiori' })
  assert.equal(r.status, 200)
  assert.equal(r.validacion?.estado, 'propuesta')
  const guardada = JSON.parse(readFileSync(join(DIR, 'mesa', 'validaciones', enDisco().find((k) => k.endsWith(`--${id('MIRO')}.json`))!), 'utf8'))
  assert.equal(guardada.estado, 'propuesta')
  assert.deepEqual(readdirSync(join(DIR, 'mesa')).filter((d) => d !== 'casos'), ['validaciones'], 'solo su carpeta del almacén')
  const lab = (await vista(LAB, 'mapa')).cuerpo
  assert.equal(lab.metricas.firmados.valor, 0, 'validar no firma')
  assert.ok(lab.propuestas.some((p: { candidato: { id: string }; validaciones: Validacion[] }) => p.candidato.id === id('MIRO') && p.validaciones.every((v) => v.estado === 'propuesta')))
  const corrige = await valida(EXPERTO, { candidato: id('2269324'), valoracion: 'corrige' })
  assert.match(corrige.error ?? '', /cómo es lo correcto/, 'corregir pide la corrección')
})

test('mesa · cada identidad ve solo sus validaciones de candidatos', async () => {
  assert.equal((await valida(EXPERTO, { candidato: id('MIRO'), valoracion: 'correcto' })).status, 200)
  assert.equal((await valida(OTRO, { candidato: id('F110'), valoracion: 'mal', comentario: 'F110 también es de TR' })).status, 200)
  const mias = (await vista(EXPERTO, 'candidatos')).cuerpo.mias as Record<string, Validacion>
  assert.ok(mias[id('MIRO')], 've las suyas')
  assert.equal(mias[id('F110')], undefined, 'no ve la del otro experto')
  assert.ok(Object.values(mias).every((v) => v.por.correo === 'experto@prueba.local'))
  const delLab = (await vista(LAB, 'candidatos')).cuerpo.mias as Record<string, Validacion>
  assert.deepEqual(Object.keys(delLab), [], 'en la mesa, ni el laboratorio ve las ajenas: las lee en su mapa')
})

test('mesa · el mapa solo existe para el laboratorio: el experto recibe 404', async () => {
  assert.equal((await valida(OTRO, { candidato: id('F110'), valoracion: 'mal', comentario: 'F110 también es de TR' })).status, 200)
  const delExperto = await vista(EXPERTO, 'mapa')
  assert.equal(delExperto.status, 404)
  assert.equal(delExperto.cuerpo, 'Not Found')
  const delLab = await vista(LAB, 'mapa')
  assert.equal(delLab.status, 200)
  assert.ok(delLab.cuerpo.propuestas.some((p: { validaciones: Validacion[] }) => p.validaciones.some((v) => v.por.correo === 'otro@prueba.local')), 'el laboratorio ve las de todos')
  assert.equal((await GET(pide('GET', '?vista=mapa', null))).status, 404, 'sin identidad tampoco')
  const md = await (await GET(pide('GET', '?vista=laboratorio&export=md', LAB))).text()
  assert.match(md, /## Candidatos validados[\s\S]*F110/, 'el export del laboratorio las lleva, como propuestas')
})

test('mesa · los candidatos salen solo del catálogo fijado: uno editado o de otro SHA no se carga, y un id de fuera se rechaza', async () => {
  assert.equal(candidatos.catalogoValido(CATALOGO, FUENTE).motivo, null)
  const editado = { ...CATALOGO, candidatos: CATALOGO.candidatos.map((c: { id: string; hipotesis: string }, i: number) => (i === 0 ? { ...c, hipotesis: `${c.hipotesis} (editado a mano)` } : c)) }
  assert.match(candidatos.catalogoValido(editado, FUENTE).motivo ?? '', /huella/)
  assert.equal(candidatos.catalogoValido(editado, FUENTE).candidatos.length, 0)
  assert.match(candidatos.catalogoValido(CATALOGO, { ...FUENTE, sha: 'f'.repeat(40) }).motivo ?? '', /pin/)
  const r = await valida(EXPERTO, { candidato: 'tcode-no-existe', valoracion: 'correcto' })
  assert.equal(r.status, 400)
  assert.match(r.error ?? '', /catálogo fijado/)
})

test('mesa · lo que escribe el experto al validar pasa el filtro: con forma de dato personal no llega al almacén', async () => {
  const antes = enDisco()
  const r = await valida(EXPERTO, { candidato: id('MM03'), valoracion: 'corrige', correccion: 'pregúntale a juan.perez@cliente.com.mx, él lo sabe', comentario: 'ok' })
  assert.equal(r.status, 400)
  assert.deepEqual(enDisco(), antes, 'nada nuevo en el disco')
  const r2 = await valida(EXPERTO, { candidato: id('MM03'), valoracion: 'no_se', comentario: 'llámame al 55 1234 5678' })
  assert.equal(r2.status, 400)
  assert.deepEqual(enDisco(), antes)
})

test('mesa · las validaciones vencen como los casos: con retención, la vieja se borra al listar', async () => {
  mkdirSync(join(DIR, 'mesa', 'validaciones'), { recursive: true })
  const vieja = { version: 1, candidato: id('SE16N'), valoracion: 'no_se', comentario: null, correccion: null, estado: 'propuesta', por: { usuario: 'n1-0000000000', correo: 'viejo@prueba.local', prueba: false }, creado: '2026-01-01T00:00:00.000Z', actualizado: '2026-01-01T00:00:00.000Z' }
  writeFileSync(join(DIR, 'mesa', 'validaciones', `n1-0000000000--${id('SE16N')}.json`), JSON.stringify(vieja))
  const quedan = await candidatos.todasLasValidaciones(almacenEnDisco(DIR), 180)
  assert.ok(!quedan.some((v: Validacion) => v.candidato === id('SE16N')))
  assert.ok(!enDisco().includes(`n1-0000000000--${id('SE16N')}.json`), 'borrada del disco')
  assert.ok(quedan.some((v: Validacion) => v.candidato === id('MIRO')), 'la reciente se queda')
})
