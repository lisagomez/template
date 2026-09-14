/**
 * `leePagina`, evidencia y esquema-por-clase, ejercitados de verdad por el banco.
 *
 * Antes `corre()` llamaba a `motor.extrae()` directo y se saltaba `leePagina()`: el banco nunca
 * clasificaba pagina, nunca media tiempos por etapa y nunca validaba un identificador. Este
 * archivo prueba que, tras cablear `leePagina`, esas tres cosas SI se ejercitan sobre una corrida
 * real — y que el validador de RFC de verdad descarta, no solo que los RFC sembrados pasan por
 * casualidad.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resumenDeEvidencia } from '../dist/index.js'
import { siembra } from '../banco/semilla.ts'
import { motorDeBanco } from '../banco/motor.ts'
import { corre } from '../banco/corrida.ts'
import type { FacturaSintetica } from '../banco/documentos.ts'

const UMBRALES = { umbralDeConfianza: 0.85, umbralDeSimilitud: 0.55, margenDeAmbiguedad: 0.08 }

test('una corrida real clasifica, mide tiempos y valida el RFC por checksum', async () => {
  const { base, resumen } = siembra({ semilla: 'banco-evidencia' })
  try {
    const resultado = await corre(resumen.documentos, { base, motor: motorDeBanco(), ...UMBRALES })
    assert.ok(resultado.procesados.length > 0)

    for (const doc of resultado.procesados) {
      // La clase se detecta: toda factura sintetica empieza con la linea "FACTURA".
      assert.equal(doc.clase?.clase, 'factura', `${doc.folio}: no se clasifico como factura`)
      assert.equal(doc.estructura.clase, 'factura')
      assert.equal(doc.estructura.sinClase, false)

      // Los 8 RFC del banco tienen digito verificador correcto (banco/negocio.ts): ninguno cae
      // en invalidos ni en faltantes por culpa del validador.
      assert.ok(!doc.invalidos.some((i) => i.clave === 'rfc_emisor'), `${doc.folio}: rfc_emisor invalido`)
      assert.ok(!doc.estructura.faltantes.includes('rfc_emisor'), `${doc.folio}: rfc_emisor en faltantes`)

      // rfc_emisor tiene evidencia 'checksum': es la unica clave con validador cableado aqui.
      const rfc = doc.campos.find((c) => c.clave === 'rfc_emisor')
      assert.ok(rfc, `${doc.folio}: no se extrajo rfc_emisor`)
      assert.equal(rfc.evidencia, 'checksum')
      assert.equal(rfc.revisionHumana, false, 'checksum no va a revision por defecto')

      // Tiempos por etapa: existen; codigos y respaldo son 0 porque el banco no cablea ninguno
      // de los dos (lector de codigos / motor de respaldo quedan fuera de este trabajo).
      assert.equal(doc.tiempos.codigos, 0)
      assert.equal(doc.tiempos.respaldo, 0)
      assert.ok(doc.tiempos.motor >= 0)
    }

    // `resumenDeEvidencia` funciona sobre la salida real de una corrida, no solo en aislamiento.
    const todos = resultado.procesados.flatMap((d) => d.campos)
    const resumenDeCampos = resumenDeEvidencia(todos)
    assert.ok(resumenDeCampos.checksum > 0, 'ningun campo con evidencia checksum: el validador de RFC no se ejercito')
    assert.ok(resumenDeCampos.motor > 0, 'ningun campo con evidencia motor: algo se corroboro que no deberia')
    assert.equal(resumenDeCampos.codigo, 0, 'el banco no cablea lector de codigos: no puede haber evidencia "codigo"')
    assert.equal(resumenDeCampos.corroboracion, 0, 'el banco no tiene segunda fuente: no puede haber "corroboracion"')
  } finally {
    base.cierra()
  }
})

test('un RFC que no pasa el digito verificador cae en invalidos y en faltantes, no en campos', async () => {
  // Prueba negativa deliberada: se arma una factura con el RFC VIEJO de ACME (el que tenia el
  // digito mal antes del fix de banco/negocio.ts), para demostrar que la barrera descarta de
  // verdad — no basta con que los 8 RFC sembrados pasen, eso no prueba que el validador atrapa
  // uno malo si aparece.
  const rota: FacturaSintetica = {
    folio: 'A-9001',
    proveedorEscrito: 'ACME Distribuciones SA de CV',
    proveedorEsperado: 'prv-001',
    rfc: 'ADI050214QX3', // digito verificador incorrecto, a proposito
    gtin: '7501234567890',
    gtinAusente: false,
    total: '1000.00',
    emitidaEn: '2026-09-01',
    texto: [
      'FACTURA',
      'Folio: A-9001',
      'Emisor: ACME Distribuciones SA de CV',
      'RFC: ADI050214QX3',
      'Fecha: 2026-09-01',
      '',
      'Concepto                         GTIN            Importe',
      'Mercancia surtida                7501234567890   1000.00',
      '',
      'Total: 1000.00',
    ].join('\n'),
  }

  const { base } = siembra({ semilla: 'banco-evidencia-negativo' })
  try {
    const resultado = await corre([rota], { base, motor: motorDeBanco(), ...UMBRALES })
    const doc = resultado.procesados[0]
    assert.ok(doc.invalidos.some((i) => i.clave === 'rfc_emisor'), 'el RFC roto tenia que caer en invalidos')
    assert.ok(!doc.campos.some((c) => c.clave === 'rfc_emisor'), 'un invalido no puede seguir en campos')
    assert.ok(doc.estructura.faltantes.includes('rfc_emisor'), 'sin rfc_emisor valido, el esquema lo declara faltante')
  } finally {
    base.cierra()
  }
})
