/**
 * Revision antes de imprimir, ZPL, numeracion y semaforo.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aplicaArreglo, aZpl, capacidadGtin13, CATEGORIAS_EJEMPLO, categoriaPorId, datosModoD, derivaCaja, digitoCorrecto, disenaDesdeDatos,
  disenaEtiqueta, emiteInterno, emitePropio, emiteSscc, escapaTexto, esEmision, estadoSemaforo, etiquetaCalibracion, lineasLegibles,
  PERFIL_EJEMPLO, revisa, revisaPrefijoEmpresa, revisaZpl, simbolosDe, tokenizaZpl, type DatosCaja, type PerfilImpresora, type Simbolo,
} from '../dist/index.js'

const HOY = '2026-09-25'
const lacteos = categoriaPorId(CATEGORIAS_EJEMPLO, 'lacteos')
const caja = (x: Partial<DatosCaja> = {}): DatosCaja => ({ tipo: 'caja', producto: 'Yogurt natural 1 kg', gtin: '09521234000020', caducidad: '2026-10-30', lote: 'L4471', ...x })
const revisaCaja = (d: DatosCaja, perfil: PerfilImpresora = PERFIL_EJEMPLO, simbolos?: Simbolo[]) => {
  const s = simbolos ?? simbolosDe(d)
  const diseno = disenaEtiqueta({ simbolos: s, titulo: d.producto, lineas: lineasLegibles(s, 2026), unidad: 'caja' }, perfil)
  return revisa({ simbolos: s, diseno, perfil, categoria: lacteos, hoy: HOY })
}
const punto = (r: ReturnType<typeof revisa>, id: string) => r.puntos.find((p) => p.id === id)!

test('revision: una caja correcta pasa los siete puntos (con el grosor reducido de pistola como aviso)', () => {
  const r = revisaCaja(caja())
  assert.deepEqual(['codigo', 'digitos', 'vida', 'lote', 'longitud', 'cabe'].map((id) => punto(r, id).estado), ['ok', 'ok', 'ok', 'ok', 'ok', 'ok'])
  assert.equal(punto(r, 'grosor').estado, 'aviso')
  assert.match(punto(r, 'grosor').titulo, /0\.375 mm \(3 puntos a 203 dpi\)/)
  assert.equal(r.bloquea, false)
})

test('revision: GTIN con digito malo bloquea y el boton «corregir» lo arregla', () => {
  const r = revisaCaja(caja({ gtin: '09521234000021' }))
  const d = punto(r, 'digitos')
  assert.equal(d.estado, 'error')
  assert.deepEqual(d.arreglo, { tipo: 'corrige-digito', ai: '01', valor: '09521234000020' })
  assert.ok(r.bloquea)
  const r2 = revisaCaja(caja(), PERFIL_EJEMPLO, aplicaArreglo(simbolosDe(caja({ gtin: '09521234000021' })), d.arreglo!))
  assert.equal(punto(r2, 'digitos').estado, 'ok')
})

test('revision: el semaforo en sus cuatro estados (lacteos: alerta ≤10, retiro ≤3)', () => {
  const estados = ['2026-11-30', '2026-10-02', '2026-09-27', '2026-09-20'].map((c) => punto(revisaCaja(caja({ caducidad: c })), 'vida').semaforo)
  assert.deepEqual(estados, ['vigente', 'alerta', 'retiro', 'vencido'])
  assert.equal(estadoSemaforo(0, lacteos), 'retiro')
  assert.equal(estadoSemaforo(-1, lacteos), 'vencido')
})

test('revision: lote con ( ) es valido en GS1 pero la Zebra en modo D lo alteraria: se bloquea', () => {
  const r = revisaCaja(caja({ lote: 'A(1)' }))
  assert.equal(punto(r, 'lote').estado, 'error')
  assert.deepEqual(punto(r, 'lote').arreglo, { tipo: 'quita-caracteres', ai: '10', valor: 'A1' })
  assert.throws(() => datosModoD(simbolosDe(caja({ lote: 'A(1)' }))[0]!), /modo D/)
})

test('revision: un codigo que no cabe en 2 pulgadas a 0.5 mm, y el de 48', () => {
  const angosta: PerfilImpresora = { ...PERFIL_EJEMPLO, anchoMm: 50.8, altoMm: 25.4 }
  const d = caja()
  const s = simbolosDe(d)
  const diseno = disenaEtiqueta({ simbolos: s, titulo: d.producto, lineas: [], unidad: 'caja', grosor: 4 }, angosta)
  const r = revisa({ simbolos: s, diseno, perfil: angosta, categoria: lacteos, hoy: HOY })
  assert.equal(punto(r, 'cabe').estado, 'error')
  const largo = revisaCaja(caja(), PERFIL_EJEMPLO, [[...simbolosDe(caja())[0]!.slice(0, 2), { ai: '21', valor: 'SERIE123456789' }, { ai: '10', valor: 'LOTE-LARGO-0001' }]])
  assert.equal(punto(largo, 'longitud').estado, 'error')
})

test('revision: escaner automatico exige 0.495 mm; en 4 pulgadas a 203 dpi la caja solo cabe a 0.375', () => {
  const auto: PerfilImpresora = { ...PERFIL_EJEMPLO, perfilLectura: 'automatico', altoMm: 76.2 }
  const r = revisaCaja(caja(), auto)
  assert.equal(punto(r, 'grosor').estado, 'error')
  assert.match(punto(r, 'grosor').explicacion, /0\.495/)
})

test('zpl: modo D con >8 tras (37), ^FH con escape de ^ ~ \\, y el agente acepta lo que se genera', () => {
  const tarima = simbolosDe({ tipo: 'tarima', producto: 'Yogurt', sscc: '095212340005678903', gtinContenido: '09521234000020', cantidad: 50, caducidad: '2026-10-30', lote: 'L4471' })
  assert.equal(datosModoD(tarima[0]!), '(02)09521234000020(37)50>8(17)261030(10)L4471')
  assert.equal(escapaTexto('50% ^ok~ c:\\x'), '50% \\5Eok\\7E c:\\5Cx')
  const zpl = aZpl(disenaDesdeDatos(caja({ producto: 'Queso ^fresco~' }), PERFIL_EJEMPLO, 2026), PERFIL_EJEMPLO, { copias: 3 })
  assert.match(zpl, /\^BCN,\d+,Y,N,N,D\^FD\(01\)09521234000020\(17\)261030\(10\)L4471\^FS/)
  assert.match(zpl, /\^PQ3,0,1,Y/)
  assert.deepEqual(revisaZpl(zpl), { ok: true, etiquetas: 1 })
  assert.deepEqual(revisaZpl(etiquetaCalibracion(PERFIL_EJEMPLO)), { ok: true, etiquetas: 1 })
})

test('zpl: el agente rechaza guardar configuracion, reiniciar, red, cambiar prefijos y todo ~', () => {
  for (const malo of ['^XA^JUS^XZ', '^XA~JR^XZ', '^XA^NSs,10.0.0.9^XZ', '^XA^CC%%XA%JUS%XZ^XZ', '^XA^KP1234^XZ', '^XA^FO1,1^FDx^FS', 'hola', '^XA^PQ5000^XZ', '^XA^CI13^XZ']) {
    assert.equal(revisaZpl(malo).ok, false, malo)
  }
  assert.deepEqual(tokenizaZpl('^XA^A0N,30,30^FDa^FS').map((c) => c.codigo), ['XA', 'A0', 'FD', 'FS'])
})

test('calibracion: recuadro al borde, reglas y los desplazamientos vigentes impresos', () => {
  const z = etiquetaCalibracion({ ...PERFIL_EJEMPLO, origenX: 12, corrimientoSup: -8 })
  assert.match(z, /\^FO0,0\^GB812,406,4\^FS/)
  assert.match(z, /\^LH12,0/)
  assert.match(z, /\^LT-8/)
  assert.match(z, /LH 12,0 {2}LS 0 {2}LT -8/)
})

test('numeracion: marca propia con el prefijo de la casa, sin reusar, con capacidad; interno 04; SSCC; caja derivada', () => {
  const usados = new Set<string>(['09521234000013'])
  const r = emitePropio('9521234', 1, usados)
  assert.ok(esEmision(r))
  assert.equal(r.numero, '09521234000020')
  assert.ok(digitoCorrecto(r.numero))
  assert.equal(capacidadGtin13('9521234'), 99_999)
  const i = emiteInterno('04', 1, new Set())
  assert.ok(esEmision(i) && i.numero.startsWith('004') && digitoCorrecto(i.numero))
  const s = emiteSscc('9521234', 0, 1, new Set())
  assert.ok(esEmision(s) && s.numero.length === 18 && s.numero.startsWith('09521234') && digitoCorrecto(s.numero))
  const c = derivaCaja('09521234000020', new Set())
  assert.equal(c, '19521234000027')
  assert.ok(digitoCorrecto(c!))
  assert.equal(revisaPrefijoEmpresa('0412345').ok, false)
  const demo = revisaPrefijoEmpresa('9521234')
  assert.ok(demo.ok && demo.avisos[0]!.includes('952'))
  const lleno = emitePropio('9521234567', 100, new Set())
  assert.ok(!esEmision(lleno) && /agotó/.test(lleno.error))
})
