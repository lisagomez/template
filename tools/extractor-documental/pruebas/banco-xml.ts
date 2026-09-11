/**
 * La via del XML recorrida ENTERA sobre el negocio ficticio.
 *
 * Lo que aporta sobre las pruebas unitarias del lector: aquellas cubren cada pieza por separado y
 * esto cubre lo que pasa al encadenarlas — leer, mapear contra catálogos reales de la base, y
 * decidir si alguien tiene que mirarlo. El hallazgo que motivó este archivo salió justo ahí, y no
 * lo veía ninguna de las 608 unitarias que ya existían.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { siembra } from '../banco/semilla.ts'
import { comoCfdi } from '../banco/cfdi.ts'
import { leeComoXml } from '../banco/corrida-xml.ts'
import { corre } from '../banco/corrida.ts'
import { motorDeBanco } from '../banco/motor.ts'
import { leeCfdi40, registroDeEsquemas, lectorDeTimbre11 } from '../dist/xml/index.js'

const UMBRALES = { umbralDeConfianza: 0.85, umbralDeSimilitud: 0.55, margenDeAmbiguedad: 0.08 }

function conBase<T>(usa: (ruta: string) => T): T {
  const carpeta = mkdtempSync(join(tmpdir(), 'banco-xml-'))
  try {
    return usa(join(carpeta, 'banco.db'))
  } finally {
    rmSync(carpeta, { recursive: true, force: true })
  }
}

/**
 * La version asincrona, y va aparte por una razon que costo un fallo: pasarle una funcion `async`
 * a la sincrona devuelve la promesa SIN esperarla, asi que el `finally` borra el directorio
 * mientras la base sigue escribiendo. El sintoma es "attempt to write a readonly database" y no
 * apunta a nada parecido a la causa.
 */
async function conBaseAsync<T>(usa: (ruta: string) => Promise<T>): Promise<T> {
  const carpeta = mkdtempSync(join(tmpdir(), 'banco-xml-'))
  try {
    return await usa(join(carpeta, 'banco.db'))
  } finally {
    rmSync(carpeta, { recursive: true, force: true })
  }
}

test('las facturas del banco se leen como CFDI valido', () => {
  conBase((ruta) => {
    const { base, resumen } = siembra({ ruta, semilla: 'prueba-xml' })
    const registro = registroDeEsquemas([lectorDeTimbre11])
    for (const factura of resumen.documentos) {
      const lectura = leeCfdi40(comoCfdi(factura), registro)
      assert.equal(lectura.esCfdi, true, `${factura.folio}: ${lectura.motivo}`)
      assert.equal(lectura.timbrado, true)
      assert.deepEqual(lectura.noLeido, [], `${factura.folio} deja algo sin traducir`)
    }
    base.cierra()
  })
})

test('el XML resuelve contra el catalogo IGUAL que la via del OCR', async () => {
  // Es la comparación que da valor a todo lo demás. Si las dos vías resolvieran a proveedores
  // distintos, una de ellas estaría mal y ninguna prueba unitaria lo diría: cada una pasaría la
  // suya. El XML lleva la MISMA variante ortográfica que el texto, para que la comparación sea
  // justa y la reconciliación tenga algo que resolver.
  await conBaseAsync(async (ruta) => {
    const { base, resumen } = siembra({ ruta, semilla: 'prueba-xml' })
    const porOcr = await corre(resumen.documentos, { base, motor: motorDeBanco(), ...UMBRALES })
    const porXml = leeComoXml(base, resumen.documentos, UMBRALES)

    assert.equal(porXml.length, porOcr.procesados.length)
    for (const [i, xml] of porXml.entries()) {
      const ocr = porOcr.procesados[i]
      assert.equal(xml.folio, ocr.folio)
      assert.equal(
        xml.proveedorResuelto,
        ocr.proveedor.elegida?.id ?? null,
        `${xml.folio}: las dos vias tienen que resolver al mismo proveedor`,
      )
      assert.equal(
        xml.gtinResuelto,
        ocr.gtin?.elegida?.id ?? null,
        `${xml.folio}: y al mismo producto`,
      )
    }
    base.cierra()
  })
})

test('un CFDI sin cotejar NO se auto-valida; cotejado si', () => {
  // Esta prueba nació al revés. Su primera versión fijaba que las doce se promovían solas, porque
  // era lo que hacía el código: los campos de un XML llegan con confianza 1 y sin región que
  // citar, así que pasaban las dos barreras que había sin tocarlas.
  //
  // Al verlo en la corrida se decidió que la herramienta no auto-valide sin cotejo, y la prueba
  // pasó a fijar lo contrario. Se deja escrito de dónde viene porque el hallazgo es el valor: para
  // el DATO promoverlo estaba bien —es una transcripción, no hay lectura que revisar—, pero para
  // el DOCUMENTO no decía nada, y el sello sigue sin verificar.
  conBase((ruta) => {
    const { base, resumen } = siembra({ ruta, semilla: 'prueba-xml' })
    const lecturas = leeComoXml(base, resumen.documentos, UMBRALES)

    assert.ok(lecturas.length > 0)
    for (const lectura of lecturas) {
      assert.equal(lectura.bajoUmbral, 0, 'un XML analiza o no analiza: no hay 0,87')
      assert.equal(lectura.seAutoValida, false, `${lectura.folio} no se promueve sin cotejo`)
      assert.equal(lectura.seAutoValidaCotejado, true, `${lectura.folio} si se promueve cotejado`)
      assert.equal(lectura.selloVerificado, false, 'y su sello sigue SIN verificar')
    }
    base.cierra()
  })
})

test('el mismo folio da el mismo identificador de timbre: el banco sigue siendo determinista', () => {
  // Un UUID sorteado rompería `node banco/cli.mjs determinismo`, que es una propiedad del banco
  // entero y no de este módulo.
  conBase((ruta) => {
    const { base, resumen } = siembra({ ruta, semilla: 'prueba-xml' })
    const factura = resumen.documentos[0]
    assert.equal(comoCfdi(factura), comoCfdi(factura))
    base.cierra()
  })
})

test('el XML del banco imita los tres rasgos que rompen a un analizador ingenuo', () => {
  // Si el generador produjera un XML "limpio", esta corrida pasaría sin ejercitar lo que de verdad
  // costó acertar. Los tres salen del CFDI real que pasó por la herramienta.
  conBase((ruta) => {
    const { base, resumen } = siembra({ ruta, semilla: 'prueba-xml' })
    const xml = comoCfdi(resumen.documentos[0])

    assert.ok(
      xml.indexOf('xsi:schemaLocation') < xml.indexOf('xmlns:cfdi'),
      'las declaraciones xmlns van al final de los atributos',
    )
    assert.match(xml, /<tfd:TimbreFiscalDigital xmlns:tfd=/, 'el timbre declara su espacio en si mismo')
    assert.match(xml, /Importe="\d+\.\d{6}"/, 'el renglon lleva mas decimales que el total')
    base.cierra()
  })
})
