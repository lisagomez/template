/**
 * La corrida completa, sobre una base EN FICHERO para poder cerrarla y reabrirla.
 *
 * El reinicio es la parte que no se puede simular con una base en memoria, y es justo la que
 * importa: "se guardo" y "sobrevive a que el proceso se muera" no son lo mismo, y la diferencia
 * solo aparece cuando el proceso se muere de verdad.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { siembra } from '../banco/semilla.ts'
import { abreBase } from '../banco/base.ts'
import { motorDeBanco } from '../banco/motor.ts'
import { proponeAlta } from '../dist/index.js'
import { corre, corrigeCampo, valorVigente } from '../banco/corrida.ts'
import { repositorioDeRegistros } from '../banco/adaptadores.ts'
import { ORGANIZACION } from '../banco/negocio.ts'

/**
 * Los umbrales de ESTA prueba, y de ninguna otra cosa.
 *
 * Se eligen para que el escenario recorra las dos ramas —campos que pasan y campos que caen en
 * revision—, que es lo que la prueba necesita observar. **No son una recomendacion, no salen de
 * ninguna medicion y no valen fuera de aqui**: los umbrales de producto se miden sobre corpus real
 * (TAR-17, TAR-25) y siguen sin fijarse.
 */
const UMBRALES = { umbralDeConfianza: 0.85, umbralDeSimilitud: 0.55, margenDeAmbiguedad: 0.08 }

/**
 * Base en un directorio temporal, borrado al terminar.
 *
 * `async` y con `await` a proposito, y no es un detalle de estilo: la primera version era sincrona
 * y devolvia la promesa sin esperarla, asi que el `finally` **borraba el directorio mientras la
 * prueba seguia corriendo**. SQLite se quedaba sin fichero a mitad del recorrido y lo reportaba
 * como `attempt to write a readonly database`, que manda a buscar permisos donde el problema era
 * una promesa sin esperar.
 */
async function conBaseEnFichero<T>(trabajo: (ruta: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'banco-extractor-'))
  try {
    return await trabajo(join(dir, 'banco.db'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('punta a punta: entra, se extrae, se mapea, se revisa, se corrige y SOBREVIVE al reinicio', async () => {
  await conBaseEnFichero(async (ruta) => {
    // --- Proceso 1: ingesta y revision ---------------------------------------------------------
    const primera = siembra({ ruta, semilla: 'punta-a-punta' })
    const resultado = await corre(primera.resumen.documentos, {
      base: primera.base,
      motor: motorDeBanco(),
      ...UMBRALES,
    })

    // 1. Salieron campos de cada documento.
    assert.equal(resultado.procesados.length, primera.resumen.documentos.length)
    for (const doc of resultado.procesados) {
      assert.ok(doc.campos.length >= 5, `el documento ${doc.folio} extrajo ${doc.campos.length} campos`)
      assert.ok(doc.campos.some((c) => c.clave === 'folio'))
      assert.equal(doc.identidad.length, 64, 'la identidad es el sha256 del contenido')
    }

    // 2. Al menos un campo cayo en la cola de revision. Sin esto, el flujo humano no se recorre.
    assert.ok(resultado.camposEnRevision > 0, 'ningun campo cayo en revision: el escenario no prueba nada')

    // 3. El mapeo del proveedor resolvio contra el catalogo por similitud.
    const resueltos = resultado.procesados.filter((d) => d.proveedor.estado === 'resuelto')
    assert.ok(resueltos.length > 0, 'ningun proveedor resolvio')
    assert.ok(resueltos[0].proveedor.elegida?.id.startsWith('prv-'))

    // 4. Los GTIN ausentes NO resolvieron, y no ofrecieron "el mas parecido".
    for (const doc of resultado.procesados.filter((d) => d.gtinAusente)) {
      assert.equal(doc.gtin?.estado, 'sin_resolver', `${doc.folio}: un GTIN ausente no puede resolver`)
      assert.equal(doc.gtin?.elegida, null)
      assert.equal(doc.gtin?.candidatos.length, 0)
    }

    // 5. Se corrige a mano un campo de los que cayeron en revision.
    const conRevision = resultado.procesados.find((d) => d.enRevision.length > 0)
    assert.ok(conRevision, 'hace falta al menos un documento con campos en revision')
    const indice = resultado.procesados.indexOf(conRevision)
    const documentoId = `doc-${String(indice + 1).padStart(3, '0')}`
    const clave = conRevision.enRevision[0].clave
    corrigeCampo(primera.base, documentoId, clave, conRevision.enRevision[0].valor, 'captura inicial')
    const segunda = corrigeCampo(primera.base, documentoId, clave, 'VALOR CORREGIDO A MANO', 'lo leyo mal el motor')
    assert.equal(segunda.version, 2, 'corregir es insertar una version nueva, no reescribir')
    assert.equal(valorVigente(primera.base, documentoId, clave), 'VALOR CORREGIDO A MANO')

    const loteId = resultado.lote.id
    const titulo = resultado.lote.titulo

    // --- El proceso muere ----------------------------------------------------------------------
    primera.base.cierra()

    // --- Proceso 2: se reabre la MISMA base y se recupera todo ---------------------------------
    const segundaBase = abreBase({ ruta })
    try {
      const repo = repositorioDeRegistros({ base: segundaBase, organizacionId: ORGANIZACION.id })
      const lote = (await repo.leeLote(loteId)) as { titulo: string; estado: string } | null
      assert.ok(lote, 'el lote tiene que sobrevivir al reinicio')
      assert.equal(lote.titulo, titulo)

      // La correccion tambien sobrevive, y sigue siendo la version 2.
      assert.equal(valorVigente(segundaBase, documentoId, clave), 'VALOR CORREGIDO A MANO')
      const versiones = segundaBase.db
        .prepare('select count(*) as n from versiones_de_campo where documento_id = ? and clave = ?')
        .get(documentoId, clave) as { n: number }
      assert.equal(versiones.n, 2, 'las dos versiones siguen ahi: el historial es append-only')

      // Y los documentos del lote siguen colgando de el.
      const documentos = segundaBase.db
        .prepare('select count(*) as n from documentos where lote_id = ?')
        .get(loteId) as { n: number }
      assert.equal(documentos.n, primera.resumen.documentos.length)
    } finally {
      segundaBase.cierra()
    }
  })
})

test('punta a punta: el lote se recupera buscando por un identificador extraido', async () => {
  await conBaseEnFichero(async (ruta) => {
    const { base, resumen } = siembra({ ruta, semilla: 'busqueda' })
    try {
      const resultado = await corre(resumen.documentos, { base, motor: motorDeBanco(), ...UMBRALES })
      const repo = repositorioDeRegistros({ base, organizacionId: ORGANIZACION.id })
      // El titulo es para el humano; esto es por lo que se busca de verdad: "la factura A-1000".
      const folio = resultado.procesados[0].folio
      const encontrados = await repo.busca({ identificador: folio })
      assert.equal(encontrados.length, 1)
      assert.equal((encontrados[0] as { id: string }).id, resultado.lote.id)
      // Tecleado con espacios y en minusculas: `normalizaCriterios` lo resuelve igual.
      assert.equal((await repo.busca({ identificador: ` ${folio.toLowerCase()} ` })).length, 1)
      // Un identificador que no existe no devuelve "el mas parecido": devuelve nada.
      assert.equal((await repo.busca({ identificador: 'A-9999' })).length, 0)
    } finally {
      base.cierra()
    }
  })
})

test('punta a punta: reprocesar el mismo lote no duplica documentos', async () => {
  await conBaseEnFichero(async (ruta) => {
    const { base, resumen } = siembra({ ruta, semilla: 'idempotencia' })
    try {
      const motor = motorDeBanco()
      await corre(resumen.documentos, { base, motor, ...UMBRALES })
      await corre(resumen.documentos, { base, motor, ...UMBRALES })
      const fila = base.db.prepare('select count(*) as n from documentos').get() as { n: number }
      // La identidad es el hash del contenido, asi que reprocesar es idempotente. Con un contador
      // autoincremental, el primer reintento de un lote a medio fallar habria duplicado todo.
      assert.equal(fila.n, resumen.documentos.length)
    } finally {
      base.cierra()
    }
  })
})

test('punta a punta: un proyecto VIRGEN recorre EL MISMO camino sin catalogos', async () => {
  await conBaseEnFichero(async (ruta) => {
    const { base, resumen } = siembra({ ruta, semilla: 'virgen', sinNegocio: true })
    try {
      // §2.8 en una prueba: no hay `if (tieneCatalogos)`. El mismo codigo, la misma llamada, y lo
      // unico distinto es la ENTRADA — un catalogo de cero filas.
      const resultado = await corre(resumen.documentos, { base, motor: motorDeBanco(), ...UMBRALES })
      assert.equal(resultado.procesados.length, resumen.documentos.length, 'se procesan igual')

      for (const doc of resultado.procesados) {
        // Nada resuelve, porque no hay ninguna fila a la que engancharse. Y `elegida` es null:
        // ofrecer "el mejor" de un catalogo vacio no significa nada.
        assert.equal(doc.proveedor.estado, 'sin_resolver')
        assert.equal(doc.proveedor.elegida, null)
        assert.equal(doc.gtin?.estado, 'sin_resolver')
      }

      // Y lo que en un proyecto poblado seria "engancha esto a proveedores.id", aqui es "propone una
      // entidad nueva PORQUE no habia ninguna". Mismo recorrido, distinta salida.
      const primero = resultado.procesados[0]
      const escrito = primero.campos.find((c) => c.clave === 'proveedor')?.valor ?? ''
      const alta = proponeAlta('proveedores', escrito, primero.proveedor)
      assert.equal(alta.catalogo, 'proveedores')
      assert.equal(alta.valor, escrito)
      assert.deepEqual(alta.candidatos, [], 'sin catalogo no hay parecidos que enseñar')

      // Los documentos se persistieron igual: la herramienta funciona en un proyecto sin catalogos.
      const fila = base.db.prepare('select count(*) as n from documentos').get() as { n: number }
      assert.equal(fila.n, resumen.documentos.length)
    } finally {
      base.cierra()
    }
  })
})
