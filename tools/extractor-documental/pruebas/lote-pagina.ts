import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leePagina, emparejaPorClave, fusionaCampos, aplicaValidadores } from '../dist/lote-pagina.js'
import { leeCorpus } from '../dist/lote-corpus.js'
import { diagnosticaRfc, diagnosticaCurp } from '../dist/identificadores-mx.js'
import { declaraClases } from '../dist/clasifica-pagina.js'
import type { MotorOcr, LectorDeCodigos } from '../dist/puertos.js'
import type { CampoExtraido, PaginaExtraida } from '../dist/tipos.js'

const RFC_BUENO = 'SAT970701NN3'
const RFC_PATRON = 'XEXX010101000' // su digito cuadra (medido): sirve como segundo RFC valido
const CSF = `https://siat.sat.gob.mx/app/qr/faces/pages/mobile/validadorqr.jsf?D1=10&D2=1&D3=1_${RFC_BUENO}`
const IMAGEN = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1])
const OTRA = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 2])

const campo = (clave: string, valor: string, extra: Partial<CampoExtraido> = {}): CampoExtraido => ({ clave, valor, confianza: 0.7, procedencia: 'ocr', ...extra })
const pagina = (markdown: string, campos: CampoExtraido[] = [], confianza?: number): PaginaExtraida => ({ indice: 0, markdown, campos, ...(confianza === undefined ? {} : { confianza }) })

function motorFalso(respuesta: PaginaExtraida[] | ((imagen: Uint8Array) => PaginaExtraida[]), llamadas: Uint8Array[] = []): MotorOcr {
  return {
    modelo: 'falso-1', limites: { bytesMaximos: 1e9, paginasMaximas: 100, paginasPorAnotacion: 8 },
    async extrae(documento) { llamadas.push(documento); return typeof respuesta === 'function' ? respuesta(documento) : respuesta },
  }
}
const lectorFalso = (cargas: readonly string[]): LectorDeCodigos => ({ formatos: ['QRCode'], async lee() { return cargas } })
// El OCR "ve" el RFC dentro de su propio texto: asi pasa el cotejo contra la transcripcion.
const OCR_CON_RFC = (rfc: string, otros = '') => [pagina(`CONSTANCIA\nRFC: ${rfc} ${otros}`, [campo('rfc', rfc, { formato: 'identificador' })], 0.8)]

// --- Codigos antes que OCR ---------------------------------------------------------------------

test('QR y OCR coinciden: acuerdo, y el campo entra UNA vez con procedencia codigo', async () => {
  const l = await leePagina(IMAGEN, 0, { motor: motorFalso(OCR_CON_RFC(RFC_BUENO)), lectorDeCodigos: lectorFalso([CSF]) })
  assert.deepEqual(l.codigos, [{ tipo: 'csf', caracteres: CSF.length }])
  assert.equal(l.cotejoDeCodigos?.acuerdos.length, 1)
  assert.equal(l.cotejoDeCodigos?.discrepancias.length, 0)
  const rfcs = l.campos.filter((c) => c.clave === 'rfc')
  assert.equal(rfcs.length, 1)
  assert.equal(rfcs[0].procedencia, 'codigo')
  assert.equal(rfcs[0].confianza, 1)
})

test('QR y OCR discrepan: la clave sale de campos y queda en la discrepancia, para una persona', async () => {
  const l = await leePagina(IMAGEN, 0, { motor: motorFalso(OCR_CON_RFC(RFC_PATRON)), lectorDeCodigos: lectorFalso([CSF]) })
  assert.equal(l.cotejoDeCodigos?.discrepancias.length, 1)
  assert.equal(l.campos.filter((c) => c.clave === 'rfc').length, 0, 'ninguna de las dos lecturas entra sola')
})

test('sin QR en la pagina no cambia nada; un QR de otro tipo se cuenta pero no aporta campos ni se coteja', async () => {
  const sin = await leePagina(IMAGEN, 0, { motor: motorFalso(OCR_CON_RFC(RFC_BUENO)), lectorDeCodigos: lectorFalso([]) })
  assert.deepEqual(sin.codigos, [])
  assert.equal(sin.cotejoDeCodigos, undefined)
  assert.equal(sin.campos.length, 1)
  const otro = await leePagina(IMAGEN, 0, { motor: motorFalso(OCR_CON_RFC(RFC_BUENO)), lectorDeCodigos: lectorFalso(['https://qr.ine.mx/004697']) })
  assert.deepEqual(otro.codigos, [{ tipo: 'url', caracteres: 24 }])
  assert.deepEqual(otro.camposDeCodigo, [])
  assert.equal(otro.cotejoDeCodigos, undefined)
})

test('un lector que revienta no tumba la pagina: se declara en avisos y el OCR sigue', async () => {
  const roto: LectorDeCodigos = { formatos: [], async lee() { throw new Error('wasm no cargo') } }
  const l = await leePagina(IMAGEN, 0, { motor: motorFalso(OCR_CON_RFC(RFC_BUENO)), lectorDeCodigos: roto })
  assert.match(l.avisos[0], /lector de codigos: wasm no cargo/)
  assert.equal(l.campos.length, 1)
})

test('dos rfc por OCR (empleado y patron) y uno por QR: se empareja el que coincide y el otro queda en soloOcr', async () => {
  const dos = [pagina(`RFC: ${RFC_PATRON}\nRFC: ${RFC_BUENO}`, [campo('rfc', RFC_PATRON), campo('rfc', RFC_BUENO)])]
  const l = await leePagina(IMAGEN, 0, { motor: motorFalso(dos), lectorDeCodigos: lectorFalso([CSF]) })
  assert.equal(l.cotejoDeCodigos?.acuerdos.length, 1)
  assert.equal(l.cotejoDeCodigos?.discrepancias.length, 0)
  assert.deepEqual(emparejaPorClave([campo('rfc', 'A'), campo('rfc', 'B')], [campo('rfc', 'b')]).map((c) => c.valor), ['B'])
})

// --- Respaldo: solo por regla del proyecto -----------------------------------------------------

test('sin derivaAlRespaldo el respaldo NUNCA se llama aunque exista; con la regla, si, y se coteja', async () => {
  const llamadasRespaldo: Uint8Array[] = []
  const respaldo = motorFalso(OCR_CON_RFC(RFC_BUENO), llamadasRespaldo)
  const sinRegla = await leePagina(IMAGEN, 0, { motor: motorFalso(OCR_CON_RFC(RFC_BUENO)), motorDeRespaldo: respaldo })
  assert.equal(llamadasRespaldo.length, 0)
  assert.equal(sinRegla.respaldo, undefined)
  const conRegla = await leePagina(IMAGEN, 0, {
    motor: motorFalso(OCR_CON_RFC(RFC_BUENO)), motorDeRespaldo: respaldo,
    derivaAlRespaldo: (p) => (p.confianza ?? 1) < 0.9,
    ahora: (() => { let t = 0; return () => (t += 50) })(),
  })
  assert.equal(llamadasRespaldo.length, 1)
  assert.equal(conRegla.cotejoDeRespaldo?.acuerdos.length, 1)
  assert.ok(conRegla.milisegundosDeRespaldo > 0)
})

test('un respaldo que solo transcribe da campos por patron y se coteja contra el principal', async () => {
  const transcribe = motorFalso([pagina(`Texto\nRFC: ${RFC_BUENO}`)])
  const l = await leePagina(IMAGEN, 0, {
    motor: motorFalso(OCR_CON_RFC(RFC_BUENO)), motorDeRespaldo: transcribe, derivaAlRespaldo: () => true,
    patrones: [{ clave: 'rfc', expresion: /RFC:\s*([A-Z0-9]{12,13})/, formato: 'identificador' }],
  })
  assert.equal(l.cotejoDeRespaldo?.acuerdos.length, 1)
})

test('los patrones se aplican ADEMAS de los campos directos del motor, y un valor repetido queda con la confianza del motor', async () => {
  const conZona = [pagina(`RFC: ${RFC_BUENO}\nCLAVE UNICA: GOAJ040229HDFNRNA6`, [campo('rfc', RFC_BUENO, { confianza: 0.6 })])]
  const l = await leePagina(IMAGEN, 0, {
    motor: motorFalso(conZona),
    patrones: [
      { clave: 'rfc', expresion: /RFC:\s*([A-Z0-9]{12,13})/, formato: 'identificador' },
      { clave: 'curp', expresion: /\b([A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d)\b/, formato: 'identificador' },
    ],
  })
  assert.deepEqual(l.campos.map((c) => [c.clave, c.confianza]), [['rfc', 0.6], ['curp', 0]], 'la CURP de la prosa entra aunque el motor ya diera el RFC por zona; el RFC no se duplica')
})

test('una clase omitida no aporta campos ni se deriva, pero conserva la lectura principal para auditar', async () => {
  const llamadas: Uint8Array[] = []
  const l = await leePagina(IMAGEN, 0, {
    motor: motorFalso([pagina('CARTA DE RECOMENDACION\nRFC: SAT970701NN3', [campo('rfc', RFC_BUENO)])]),
    motorDeRespaldo: motorFalso([], llamadas), derivaAlRespaldo: () => true,
    clases: declaraClases([{ clase: 'carta', titulo: /carta de recomendaci[oó]n/i }]), omiteClases: new Set(['carta']),
  })
  assert.equal(l.omitida, true)
  assert.deepEqual(l.campos, [])
  assert.equal(llamadas.length, 0)
  assert.equal(l.clase?.clase, 'carta')
  assert.match(l.principal.markdown, /CARTA/)
})

// --- Validadores y correccion ------------------------------------------------------------------

test('un RFC de OCR con digito mal sale de campos y va a invalidos con su motivo', async () => {
  const l = await leePagina(IMAGEN, 0, { motor: motorFalso(OCR_CON_RFC('SAT970701NN2')), validadores: { rfc: diagnosticaRfc } })
  assert.deepEqual(l.campos.filter((c) => c.clave === 'rfc'), [])
  assert.equal(l.invalidos.length, 1)
  assert.equal(l.invalidos[0].motivo, 'digito')
  assert.equal(l.invalidos[0].procedencia, 'ocr')
})

test('una O por 0 en el OCR se corrige y se PROPONE en corregidos, pero NO entra a campos: lo confirma una persona o un codigo', async () => {
  const leido = 'SAT97O701NN3'
  const l = await leePagina(IMAGEN, 0, { motor: motorFalso(OCR_CON_RFC(leido)), validadores: { rfc: diagnosticaRfc } })
  assert.equal(l.campos.find((c) => c.clave === 'rfc'), undefined, 'medido: un checksum puede arreglar hacia el identificador de otra persona')
  assert.deepEqual(l.corregidos, [{ clave: 'rfc', original: leido, valor: RFC_BUENO, pagina: 0 }])
  assert.deepEqual(l.invalidos, [], 'no es invalido: es una propuesta')
})

test('con QR en la pagina, un OCR que solo pasa corregido no discute con el QR: el QR entra y la correccion se propone', async () => {
  const l = await leePagina(IMAGEN, 0, { motor: motorFalso(OCR_CON_RFC('SAT97O701NN3')), lectorDeCodigos: lectorFalso([CSF]), validadores: { rfc: diagnosticaRfc } })
  assert.equal(l.cotejoDeCodigos, undefined, 'sin lectura de OCR valida no hay nada que cotejar')
  assert.deepEqual(l.campos.filter((c) => c.clave === 'rfc').map((c) => c.procedencia), ['codigo'])
  assert.equal(l.corregidos.length, 1)
})

test('un identificador que vino de un QR y no pasa NO se corrige: invalido con procedencia codigo', () => {
  const r = aplicaValidadores([{ clave: 'rfc', valor: 'SAT97O701NN3', confianza: 1, procedencia: 'codigo' }], { rfc: diagnosticaRfc }, 3)
  assert.equal(r.corregidos.length, 0)
  assert.deepEqual(r.invalidos, [{ clave: 'rfc', valor: 'SAT97O701NN3', procedencia: 'codigo', pagina: 3, motivo: 'forma' }])
})

test('con dos correcciones posibles no se corrige: invalido con motivo ambiguo', () => {
  // Validador de juguete: pasa si contiene un 0. "OO" admite dos correcciones distintas.
  const r = aplicaValidadores([campo('x', 'OO')], { x: (v) => ({ valido: v.includes('0'), motivo: v.includes('0') ? null : 'digito' }) }, 0)
  assert.equal(r.invalidos[0]?.motivo, 'ambiguo')
  assert.equal(r.validos.length, 0)
})

test('fusionaCampos: mismo valor por dos vias queda una vez, con la mas fiable; valores distintos quedan ambos', () => {
  const f = fusionaCampos([campo('rfc', 'A', { procedencia: 'codigo', confianza: 1 })], [campo('rfc', 'a'), campo('rfc', 'B')])
  assert.deepEqual(f.map((c) => [c.valor, c.procedencia]), [['A', 'codigo'], ['B', 'ocr']])
})

// --- En el lote: reutilizacion de paginas identicas y declaraciones por documento ----------------

test('leeCorpus: la misma imagen en dos documentos se lee UNA vez y se declara reutilizada; los totales suman', async () => {
  const llamadas: Uint8Array[] = []
  const r = await leeCorpus(
    [{ documentoId: 'a', nombre: 'a.png', tipoDocumento: 'x', bytes: IMAGEN }, { documentoId: 'b', nombre: 'b.png', tipoDocumento: 'x', bytes: IMAGEN }, { documentoId: 'c', nombre: 'c.png', tipoDocumento: 'x', bytes: OTRA }],
    { motor: motorFalso(OCR_CON_RFC(RFC_BUENO), llamadas), validadores: { rfc: diagnosticaRfc, curp: diagnosticaCurp } },
  )
  assert.equal(llamadas.length, 2, 'dos imagenes distintas: dos llamadas, no tres')
  assert.deepEqual(r.lecturas.map((l) => l.paginasReutilizadas), [[], [0], []])
  assert.equal(r.paginasReutilizadas, 1)
  assert.equal(r.lecturas[1].campos[0].valor, RFC_BUENO, 'la lectura reutilizada trae los campos')
  for (const l of r.lecturas) {
    assert.deepEqual(l.identificadoresInvalidos, [])
    assert.deepEqual(l.paginasAlRespaldo, [])
    assert.equal(l.clasesDePagina.length, 1)
  }
})

test('leeCorpus: un RFC invalido en un XML se declara invalido con procedencia xml y no se corrige', async () => {
  const { readFileSync } = await import('node:fs')
  const xml = new Uint8Array(readFileSync(new URL('./fixtures/cfdi-40-ingreso.xml', import.meta.url)))
  const r = await leeCorpus([{ documentoId: 'x', nombre: 'f.xml', tipoDocumento: 'cfdi', bytes: xml }], { validadores: { rfc_emisor: diagnosticaRfc } })
  const l = r.lecturas[0]
  assert.equal(l.ruta, 'xml')
  // El fixture lleva el RFC sintetico AAA010101AAA, que no cuadra su digito: se declara, no se corrige.
  assert.equal(l.identificadoresInvalidos.length, 1)
  assert.equal(l.identificadoresInvalidos[0].procedencia, 'xml')
  assert.deepEqual(l.corregidos, [])
  assert.ok(!l.campos.some((c) => c.clave === 'rfc_emisor'))
})
