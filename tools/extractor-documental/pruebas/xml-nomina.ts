import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { leeCfdi40, camposParaCotejo } from '../dist/xml/cfdi/comprobante-40.js'
import { registroDeEsquemas } from '../dist/xml/registro.js'
import { lectorDeTimbre11 } from '../dist/xml/cfdi/timbre-11.js'
import { lectorDeNomina12, INVENTARIO_NOMINA, CLAVES_SENSIBLES_NOMINA, PREFIJOS_SENSIBLES_NOMINA } from '../dist/xml/cfdi/nomina-12.js'
import { claveDeAtributo } from '../dist/xml/cfdi/lector-de-arbol.js'
import { NOMINA_12, SIN_LECTOR, nombreDelEsquema } from '../dist/xml/cfdi/espacios.js'
import { validaCurp, validaNss } from '../dist/identificadores-mx.js'

const fixture = (nombre: string): Uint8Array => new Uint8Array(readFileSync(new URL(`./fixtures/${nombre}.xml`, import.meta.url)))
const RECIBO = fixture('cfdi-40-nomina-12')
const conTimbre = registroDeEsquemas([lectorDeTimbre11])
const completo = registroDeEsquemas([lectorDeTimbre11, lectorDeNomina12])
const valor = (campos: readonly { clave: string; valor: string }[], clave: string): string | undefined => campos.find((c) => c.clave === clave)?.valor

test('los acentos del esquema no llegan a las claves: Antigüedad → antiguedad, Año → anio', () => {
  assert.equal(claveDeAtributo('Antigüedad'), 'antiguedad')
  assert.equal(claveDeAtributo('Año'), 'anio')
  assert.equal(claveDeAtributo('NumAñosServicio'), 'num_anios_servicio')
})

test('sin el lector registrado, la nomina se declara con su nombre; ya no queda ningun esquema del SAT sin lector', () => {
  const lectura = leeCfdi40(RECIBO, conTimbre)
  if (!lectura.esCfdi) return assert.fail('deberia ser CFDI')
  assert.equal(lectura.complementos.sinLector.length, 1)
  assert.equal(lectura.complementos.sinLector[0].nombreLocal, 'Nomina')
  assert.equal(nombreDelEsquema(NOMINA_12), 'Nomina 1.2')
  assert.deepEqual(Object.keys(SIN_LECTOR), [])
})

test('con el lector: la raiz, la persona y su relacion laboral, con los identificadores marcados', () => {
  const lectura = leeCfdi40(RECIBO, completo)
  if (!lectura.esCfdi) return assert.fail('deberia ser CFDI')
  assert.deepEqual(lectura.complementos.sinLector, [])
  const campos = camposParaCotejo(lectura)
  assert.equal(valor(campos, 'tipo_nomina'), 'O')
  assert.equal(valor(campos, 'num_dias_pagados'), '15')
  assert.equal(valor(campos, 'total_percepciones'), '12000.00')
  assert.equal(valor(campos, 'emisor_registro_patronal'), 'Y1234567890')
  assert.equal(valor(campos, 'receptor_curp'), 'GOAJ040229HDFNRNA4')
  assert.equal(valor(campos, 'receptor_num_seguridad_social'), '31611276697')
  assert.equal(valor(campos, 'receptor_antiguedad'), 'P114W')
  assert.equal(valor(campos, 'receptor_num_empleado'), 'EMP-0042')
  assert.equal(valor(campos, 'receptor_salario_diario_integrado'), '836.50')
  for (const clave of ['receptor_curp', 'receptor_num_seguridad_social', 'receptor_num_empleado', 'receptor_cuenta_bancaria', 'emisor_registro_patronal']) {
    assert.equal(campos.find((c) => c.clave === clave)?.formato, 'identificador', clave)
  }
  assert.equal(campos.find((c) => c.clave === 'receptor_puesto')?.formato, undefined)
})

test('percepciones, deducciones, otros pagos e incapacidades numerados, con sus hijos y el resumen', () => {
  const lectura = leeCfdi40(RECIBO, completo)
  if (!lectura.esCfdi) return assert.fail('deberia ser CFDI')
  const campos = camposParaCotejo(lectura)
  assert.equal(valor(campos, 'percepciones_percepcions_total'), '2')
  assert.equal(valor(campos, 'percepciones_percepcion_1_concepto'), 'Sueldo')
  assert.equal(valor(campos, 'percepciones_percepcion_2_horas_extra_1_importe_pagado'), '1000.00')
  assert.equal(valor(campos, 'percepciones_percepcion_1_horas_extras_total'), '0')
  assert.equal(valor(campos, 'deducciones_total_impuestos_retenidos'), '1500.00')
  assert.equal(valor(campos, 'deducciones_deduccion_2_importe'), '300.00')
  assert.equal(valor(campos, 'otros_pagos_otro_pago_1_subsidio_subsidio_causado'), '0.00')
  assert.equal(valor(campos, 'incapacidades_incapacidad_1_tipo_incapacidad'), '02')
  assert.equal(valor(campos, 'resumen_del_recibo'), '2 percepcion(es), 2 deduccion(es), 1 otro(s) pago(s), 1 incapacidad(es)')
})

test('los identificadores del fixture pasan los validadores del nucleo: el sintetico esta bien hecho', () => {
  const lectura = leeCfdi40(RECIBO, completo)
  if (!lectura.esCfdi) return assert.fail('deberia ser CFDI')
  const campos = camposParaCotejo(lectura)
  assert.equal(validaCurp(valor(campos, 'receptor_curp') ?? ''), true)
  assert.equal(validaNss(valor(campos, 'receptor_num_seguridad_social') ?? ''), true)
})

test('las claves sensibles estan nombradas y existen de verdad en la lectura (C4: la decision no depende de acordarse)', () => {
  const lectura = leeCfdi40(RECIBO, completo)
  if (!lectura.esCfdi) return assert.fail('deberia ser CFDI')
  const claves = new Set(camposParaCotejo(lectura).map((c) => c.clave))
  for (const sensible of CLAVES_SENSIBLES_NOMINA) assert.ok(claves.has(sensible), `${sensible} tendria que salir del fixture`)
  const deSalud = [...claves].filter((k) => PREFIJOS_SENSIBLES_NOMINA.some((p) => k.startsWith(p)))
  assert.ok(deSalud.length >= 2, 'la incapacidad es dato de salud y tiene que quedar bajo su prefijo')
})

test('un atributo que el esquema no anticipa se declara; la version va pineada', () => {
  const texto = new TextDecoder().decode(RECIBO)
  const raro = leeCfdi40(new TextEncoder().encode(texto.replace('Puesto="TECNICO SINTETICO"', 'Puesto="TECNICO SINTETICO" Turno="Noche"')), completo)
  if (!raro.esCfdi) return assert.fail('deberia ser CFDI')
  assert.deepEqual(raro.complementos.leidos.find((c) => c.nombre === 'Complemento de nomina 1.2')?.noLeido, ['Receptor/@Turno'])
  const vieja = leeCfdi40(new TextEncoder().encode(texto.replace('Nomina Version="1.2"', 'Nomina Version="1.1"')), completo)
  if (!vieja.esCfdi) return assert.fail('deberia ser CFDI')
  assert.equal(vieja.complementos.sinLector[0]?.version, '1.1')
})

test('el inventario cubre los 17 elementos del XSD', () => {
  const elementos = ['Nomina', 'Emisor', 'EntidadSNCF', 'Receptor', 'SubContratacion', 'Percepciones', 'Percepcion', 'AccionesOTitulos', 'HorasExtra',
    'JubilacionPensionRetiro', 'SeparacionIndemnizacion', 'Deducciones', 'Deduccion', 'OtrosPagos', 'OtroPago', 'SubsidioAlEmpleo', 'CompensacionSaldosAFavor', 'Incapacidades', 'Incapacidad']
  for (const e of elementos) assert.ok(Array.isArray(INVENTARIO_NOMINA[e]), e)
  assert.equal(INVENTARIO_NOMINA['Receptor'].length, 18)
})
