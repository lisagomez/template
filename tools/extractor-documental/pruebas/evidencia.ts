import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evidenciaDe, conEvidencia, resumenDeEvidencia } from '../dist/evidencia.js'
import type { CampoExtraido } from '../dist/tipos.js'
import type { Cotejo } from '../dist/corroboracion.js'

const campo = (clave: string, valor: string, extra: Partial<CampoExtraido> = {}): CampoExtraido => ({ clave, valor, confianza: 0.6, procedencia: 'ocr', ...extra })
const cotejo = (acuerdos: { clave: string; valor: string }[]): Cotejo => ({ acuerdos, discrepancias: [], soloOcr: [], soloCodigo: [] })

test('un QR leido en la via del motor es evidencia `codigo`; el mismo texto exacto de capa 0 es `exacto`', () => {
  const deQr = campo('rfc', 'SAT970701NN3', { procedencia: 'codigo', confianza: 1 })
  assert.equal(evidenciaDe(deQr, { ruta: 'motor' }), 'codigo')
  assert.equal(evidenciaDe(deQr, { ruta: 'capa-cero' }), 'exacto')
  assert.equal(evidenciaDe(campo('total', '1', { procedencia: 'xml' }), { ruta: 'xml' }), 'exacto')
  assert.equal(evidenciaDe(campo('total', '1', { procedencia: 'humano' }), { ruta: 'motor' }), 'exacto')
})

test('OCR que coincide con un acuerdo del cotejo es `corroboracion`; con validador y sin acuerdo, `checksum`; sin nada, `motor`', () => {
  const ocr = campo('rfc', 'sat970701nn3')
  const acuerdo = cotejo([{ clave: 'rfc', valor: 'SAT970701NN3' }])
  assert.equal(evidenciaDe(ocr, { ruta: 'motor', cotejos: [undefined, acuerdo] }), 'corroboracion', 'compara sin espacios ni mayusculas')
  assert.equal(evidenciaDe(ocr, { ruta: 'motor', conValidador: new Set(['rfc']) }), 'checksum')
  assert.equal(evidenciaDe(ocr, { ruta: 'motor' }), 'motor')
  assert.equal(evidenciaDe(campo('rfc', 'OTRO'), { ruta: 'motor', cotejos: [acuerdo] }), 'motor', 'un acuerdo de OTRO valor no corrobora este')
})

test('revisionHumana sale de la evidencia: solo `motor` por defecto, y el proyecto solo puede AMPLIAR', () => {
  const campos = [campo('a', '1'), campo('b', '2', { procedencia: 'codigo' })]
  const porDefecto = conEvidencia(campos, { ruta: 'motor', conValidador: new Set(['a']) })
  assert.deepEqual(porDefecto.map((c) => [c.evidencia, c.revisionHumana]), [['checksum', false], ['codigo', false]])
  const ampliado = conEvidencia(campos, { ruta: 'motor', conValidador: new Set(['a']), revisaTambien: new Set(['checksum']) })
  assert.deepEqual(ampliado.map((c) => c.revisionHumana), [true, false])
  const soloMotor = conEvidencia([campo('a', '1')], { ruta: 'motor', revisaTambien: new Set(['codigo']) })
  assert.equal(soloMotor[0].revisionHumana, true, '`motor` nunca deja de revisarse')
})

test('el resumen cuenta por evidencia y conserva el campo original intacto', () => {
  const salida = conEvidencia([campo('a', '1'), campo('b', '2', { procedencia: 'xml' })], { ruta: 'xml' })
  assert.deepEqual(resumenDeEvidencia(salida), { codigo: 0, exacto: 1, corroboracion: 0, checksum: 0, motor: 1 })
  assert.equal(salida[0].confianza, 0.6)
  assert.equal(salida[0].procedencia, 'ocr')
})
