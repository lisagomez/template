import { test } from 'node:test'
import assert from 'node:assert/strict'
import { versionInicial, corrige, vigente, historialLegible } from '../dist/versiones.js'
import {
  normalizaIdentificador, extraeIdentificadoresIndexables, normalizaCriterios, estanVacios,
} from '../dist/busqueda.js'
import { resuelveIdentificador } from '../dist/reconciliacion.js'
import { rutaDeOriginal, organizacionDeRuta, extensionPermitida, venceRetencion } from '../dist/originales.js'
import { suprime, esSuprimido } from '../dist/supresion.js'
import type { CampoExtraido } from '../dist/tipos.js'

const AHORA = new Date('2026-09-07T10:00:00.000Z')
const LUEGO = new Date('2026-09-09T10:00:00.000Z')
const SHA = 'a'.repeat(64)

// --- versiones ---

test('una correccion NO pisa: anade version y conserva la anterior', () => {
  const h1 = [versionInicial('total', '1160.00', 'ocr', AHORA)]
  const h2 = corrige(h1, '1165.00', 'lisa', 'el OCR leyo mal el ultimo digito', 'revisor', LUEGO)
  assert.equal(h2.length, 2)
  assert.equal(vigente(h2).valor, '1165.00')
  assert.equal(h2[0].valor, '1160.00', 'la version anterior sigue ahi')
  assert.equal(h1.length, 1, 'no muta el historial de entrada')
})

test('una correccion sin motivo se rechaza', () => {
  const h = [versionInicial('total', '1160.00', 'ocr', AHORA)]
  assert.throws(() => corrige(h, '1165.00', 'lisa', '   ', 'revisor'), /QUE cambio y no POR QUE/)
})

test('un operario no corrige', () => {
  const h = [versionInicial('total', '1160.00', 'ocr', AHORA)]
  assert.throws(() => corrige(h, '1165.00', 'pepe', 'motivo', 'operario'), /no puede "corregir"/)
})

test('vigente sale del numero de version, no de la posicion en el array', () => {
  const desordenado = [
    { clave: 'a', valor: 'v2', quien: 'x', cuando: LUEGO.toISOString(), motivo: 'm', version: 2 },
    { clave: 'a', valor: 'v1', quien: 'x', cuando: AHORA.toISOString(), motivo: null, version: 1 },
  ]
  assert.equal(vigente(desordenado).valor, 'v2')
  assert.equal(historialLegible(desordenado)[0].version, 2)
})

// --- busqueda ---

/**
 * LA prueba del reuso. Si el indice y la reconciliacion normalizaran distinto, la busqueda no
 * encontraria lo que la reconciliacion si resolvio — y no daria error, simplemente no aparece nada.
 */
test('el indice normaliza EXACTAMENTE igual que resuelveIdentificador', () => {
  const filas = [{ id: 'x', etiqueta: 'AAA010101AAA' }]
  for (const escrito of [' aaa010101aaa ', 'AAA 010101 AAA', 'aaa010101aaa']) {
    assert.equal(resuelveIdentificador(escrito, filas).estado, 'resuelto', escrito)
    assert.equal(normalizaIdentificador(escrito), 'AAA010101AAA', escrito)
  }
})

test('se indexan identificadores, no texto libre', () => {
  const campos: CampoExtraido[] = [
    { clave: 'rfc_emisor', valor: ' aaa010101aaa ', confianza: 1, procedencia: 'codigo' },
    { clave: 'gtin', valor: '07612345678900', confianza: 1, procedencia: 'codigo' },
    { clave: 'domicilio', valor: 'Calle Falsa 123', confianza: 0.9, procedencia: 'ocr' },
    { clave: 'observaciones', valor: 'algo', confianza: 0.9, procedencia: 'ocr', formato: 'identificador' },
  ]
  const idx = extraeIdentificadoresIndexables(campos)
  const claves = idx.map((e) => e.clave)
  assert.ok(claves.includes('rfc_emisor') && claves.includes('gtin'))
  assert.ok(!claves.includes('domicilio'), 'el texto libre no entra al indice')
  assert.ok(claves.includes('observaciones'), 'marcado como identificador, si entra')
  assert.equal(idx.find((e) => e.clave === 'rfc_emisor')?.valorNormalizado, 'AAA010101AAA')
})

test('el indice no duplica la misma clave y valor', () => {
  const campo: CampoExtraido = { clave: 'gtin', valor: '076', confianza: 1, procedencia: 'codigo' }
  assert.equal(extraeIdentificadoresIndexables([campo, { ...campo }]).length, 1)
})

test('los criterios se normalizan antes de consultar', () => {
  assert.equal(normalizaCriterios({ identificador: 'aaa 010101 aaa' }).identificador, 'AAA010101AAA')
  assert.ok(estanVacios({}))
  assert.equal(estanVacios({ titulo: 'x' }), false)
})

// --- originales ---

/**
 * Si el primer segmento deja de ser la organizacion, la politica del bucket deja de proteger nada
 * y nadie se entera: la RLS se escribe sobre (storage.foldername(name))[1].
 */
test('la ruta lleva la organizacion como PRIMER segmento', () => {
  const ruta = rutaDeOriginal('org-1', SHA, 'pdf')
  assert.equal(ruta, `org-1/${SHA}.pdf`)
  assert.equal(organizacionDeRuta(ruta), 'org-1')
})

test('el mismo fichero deduplica dentro de una organizacion y NO entre dos', () => {
  assert.equal(rutaDeOriginal('org-1', SHA, 'pdf'), rutaDeOriginal('org-1', SHA, '.PDF'))
  assert.notEqual(rutaDeOriginal('org-1', SHA, 'pdf'), rutaDeOriginal('org-2', SHA, 'pdf'))
})

test('la ruta rechaza lo que romperia la politica', () => {
  assert.throws(() => rutaDeOriginal('org/1', SHA, 'pdf'), /primer segmento/)
  assert.throws(() => rutaDeOriginal('', SHA, 'pdf'), /Sin organizacion/)
  assert.throws(() => rutaDeOriginal('org-1', 'nohex', 'pdf'), /hexadecimal/)
  assert.throws(() => rutaDeOriginal('org-1', SHA, 'exe'), /no admitida/)
  assert.ok(extensionPermitida('.JPG'))
})

test('la retencion se calcula pero vencer no borra nada solo', () => {
  assert.equal(venceRetencion(AHORA.toISOString(), 30, LUEGO), false)
  assert.ok(venceRetencion(AHORA.toISOString(), 1, LUEGO))
  assert.throws(() => venceRetencion(AHORA.toISOString(), 0), RangeError)
})

// --- supresion ---

test('suprimir borra contenido y deja lapida', () => {
  const orden = suprime(
    { id: 'r1', organizacionId: 'org-1', rutasDeOriginales: [`org-1/${SHA}.pdf`], clavesDeIndice: ['gtin'] },
    'el titular', 'lisa', 'peticion de supresion', 'revisor', AHORA,
  )
  assert.equal(orden.lapida.registroId, 'r1')
  assert.equal(orden.lapida.quienPidio, 'el titular')
  assert.deepEqual(orden.objetosABorrar, [`org-1/${SHA}.pdf`])
  assert.deepEqual(orden.entradasDeIndiceARetirar, ['gtin'])
})

/** Sin lapida, una auditoria no distingue "nunca existio" de "se borro". */
test('la lapida distingue borrado de inexistente', () => {
  const orden = suprime(
    { id: 'r1', organizacionId: 'org-1', rutasDeOriginales: [], clavesDeIndice: [] },
    'titular', 'lisa', 'motivo', 'revisor', AHORA,
  )
  assert.ok(esSuprimido([orden.lapida], 'r1'))
  assert.equal(esSuprimido([orden.lapida], 'r2'), false)
})

test('suprimir exige rol, motivo y quien lo pidio', () => {
  const reg = { id: 'r1', organizacionId: 'org-1', rutasDeOriginales: [], clavesDeIndice: [] }
  assert.throws(() => suprime(reg, 'titular', 'pepe', 'motivo', 'operario'), /no puede "suprimir"/)
  assert.throws(() => suprime(reg, 'titular', 'lisa', '  ', 'revisor'), /sin motivo/)
  assert.throws(() => suprime(reg, '  ', 'lisa', 'motivo', 'revisor'), /quien pidio/)
})
