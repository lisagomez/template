/**
 * El JSON que escribe la corrida del corpus tiene que ENCAJAR en los tipos del extractor, no
 * parecerse a ellos. Aqui se valida contra la forma real: los validadores de `dist/` para campos y
 * paginas, y un validador de `PropuestaDeModelo` escrito contra el tipo importado, de modo que si
 * el tipo cambia, esto deja de compilar o de pasar.
 *
 * Y se valida tambien lo que la corrida dejo en `corpus/salida-*`, si existe: ese directorio esta
 * fuera de git, asi que la prueba lo dice cuando no lo encuentra en vez de pasar en silencio.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { validaCampo, validaPaginas } from '../dist/motores/comun.js'
import type { CampoExtraido, PaginaExtraida } from '../dist/tipos.js'
import type { PropuestaDeModelo, EntidadPropuesta, RelacionPropuesta, ColumnaPropuesta } from '../dist/modelo.js'
import type { LecturaDeDocumento } from '../dist/lote-corpus.js'
import type { InferenciaDeCorpus } from '../dist/corpus.js'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

// --- Validadores contra la forma de los tipos ----------------------------------------------------

function comoColumna(v: unknown): ColumnaPropuesta {
  assert.ok(esObjeto(v), 'columna: no es objeto')
  assert.equal(typeof v.nombre, 'string')
  assert.equal(typeof v.tipo, 'string')
  assert.equal(typeof v.nulable, 'boolean')
  if (v.referencia !== undefined) {
    assert.ok(esObjeto(v.referencia) && typeof v.referencia.tabla === 'string' && typeof v.referencia.columna === 'string')
  }
  return v as unknown as ColumnaPropuesta
}

function comoEntidad(v: unknown): EntidadPropuesta {
  assert.ok(esObjeto(v) && typeof v.tabla === 'string' && Array.isArray(v.columnas), 'entidad: forma')
  v.columnas.forEach(comoColumna)
  return v as unknown as EntidadPropuesta
}

function comoRelacion(v: unknown): RelacionPropuesta {
  assert.ok(esObjeto(v), 'relacion: no es objeto')
  for (const k of ['desde', 'columna', 'hacia', 'hastaColumna']) assert.equal(typeof v[k], 'string', `relacion.${k}`)
  assert.ok(v.cardinalidad === '1' || v.cardinalidad === '*', 'cardinalidad es 1 o *')
  assert.equal(typeof v.haciaPreexistente, 'boolean')
  return v as unknown as RelacionPropuesta
}

function comoPropuesta(v: unknown): PropuestaDeModelo {
  assert.ok(esObjeto(v), 'propuesta: no es objeto')
  const { entidades, relaciones, catalogosDerivados, avisos, sql } = v
  assert.ok(Array.isArray(entidades) && Array.isArray(relaciones) && Array.isArray(catalogosDerivados) && Array.isArray(avisos))
  if (typeof sql !== 'string') throw new Error('propuesta: `sql` tiene que ser texto')
  const propuesta: PropuestaDeModelo = {
    entidades: entidades.map(comoEntidad),
    relaciones: relaciones.map(comoRelacion),
    catalogosDerivados: catalogosDerivados.map((c: unknown) => { assert.equal(typeof c, 'string'); return c as string }),
    sql,
    avisos: avisos.map((a: unknown) => { assert.equal(typeof a, 'string'); return a as string }),
  }
  return propuesta
}

/** Un campo valido segun EL validador del adaptador, no segun una copia. */
function comoCampo(v: unknown): CampoExtraido {
  const campo = validaCampo(v)
  assert.ok(campo !== null, `campo invalido: ${JSON.stringify(esObjeto(v) ? Object.keys(v) : v)}`)
  // validaCampo pone procedencia 'ocr'; el JSON trae la suya y tiene que ser una de las cuatro.
  assert.ok(esObjeto(v) && ['ocr', 'codigo', 'humano', 'xml'].includes(String(v.procedencia)), 'procedencia')
  return { ...campo, procedencia: (v as { procedencia: CampoExtraido['procedencia'] }).procedencia }
}

function comoLectura(v: unknown): LecturaDeDocumento {
  assert.ok(esObjeto(v), 'lectura: no es objeto')
  for (const k of ['documentoId', 'nombre', 'tipoDocumento', 'motivo']) assert.equal(typeof v[k], 'string', k)
  assert.ok(['capa-cero', 'xml', 'motor', 'ninguna'].includes(String(v.ruta)), 'ruta')
  assert.equal(typeof v.milisegundos, 'number')
  assert.ok(Array.isArray(v.campos))
  const campos = v.campos.map(comoCampo)
  const paginas: PaginaExtraida[] = validaPaginas({ paginas: v.paginas })
  return { ...(v as unknown as LecturaDeDocumento), campos, paginas }
}

function comoInferencia(v: unknown): InferenciaDeCorpus {
  assert.ok(esObjeto(v) && Array.isArray(v.entidades) && Array.isArray(v.dudas) && Array.isArray(v.documentos))
  const propuesta = comoPropuesta(v.propuesta)
  for (const d of v.dudas) assert.ok(esObjeto(d) && typeof d.sobre === 'string' && typeof d.motivo === 'string' && Array.isArray(d.documentos))
  for (const d of v.documentos) assert.ok(esObjeto(d) && typeof d.documentoId === 'string' && typeof d.campos === 'number')
  return { ...(v as unknown as InferenciaDeCorpus), propuesta }
}

// --- Una muestra sintetica que TIENE que pasar, y una rota que TIENE que fallar -----------------

const LECTURA_BUENA = {
  documentoId: 'factura-sintetica-1', nombre: 'factura-sintetica-1.png', tipoDocumento: 'factura', ruta: 'motor',
  motivo: 'imagen image/png al motor', milisegundos: 74000,
  campos: [{ clave: 'rfc_emisor', valor: 'AAA010101AAA', confianza: 0, procedencia: 'ocr', formato: 'identificador' }],
  paginas: [{ indice: 0, markdown: 'FACTURA\nRFC emisor: AAA010101AAA', campos: [] }],
}

test('una lectura con la forma de los tipos pasa; la misma con la confianza en texto, no', () => {
  const lectura = comoLectura(JSON.parse(JSON.stringify(LECTURA_BUENA)))
  assert.equal(lectura.campos[0].formato, 'identificador')
  const rota = JSON.parse(JSON.stringify(LECTURA_BUENA)) as { campos: { confianza: unknown }[] }
  rota.campos[0].confianza = 'alta'
  assert.throws(() => comoLectura(rota), /campo invalido/)
})

test('una propuesta con la forma del tipo pasa; sin `sql` como texto, no', () => {
  const buena = { entidades: [{ tabla: 'emisor', columnas: [{ nombre: 'rfc_emisor', tipo: 'text', nulable: false }] }], relaciones: [{ desde: 'factura', columna: 'emisor_id', hacia: 'emisor', hastaColumna: 'id', cardinalidad: '*', haciaPreexistente: false }], catalogosDerivados: ['emisor'], sql: '-- PROPUESTA', avisos: [] }
  assert.equal(comoPropuesta(JSON.parse(JSON.stringify(buena))).entidades.length, 1)
  assert.throws(() => comoPropuesta({ ...buena, sql: ['no', 'es', 'texto'] }))
  assert.throws(() => comoPropuesta({ ...buena, relaciones: [{ ...buena.relaciones[0], cardinalidad: 'muchos' }] }), /cardinalidad/)
})

// --- Y lo que dejo la corrida real, si esta -----------------------------------------------------

test('lo que escribio la corrida del corpus encaja en los tipos (o no hay corrida, y se dice)', () => {
  const corpus = join(raiz, 'corpus')
  const salidas = existsSync(corpus) ? readdirSync(corpus).filter((n) => n.startsWith('salida-')) : []
  if (salidas.length === 0) {
    console.log('  (sin corpus/salida-*: la corrida no se ha ejecutado en esta maquina; se validan solo las muestras)')
    return
  }
  let lecturas = 0
  for (const salida of salidas) {
    const dir = join(corpus, salida)
    for (const nombre of readdirSync(dir)) {
      const crudo: unknown = JSON.parse(readFileSync(join(dir, nombre), 'utf8'))
      if (nombre === 'propuesta.json') comoInferencia(crudo)
      else if (nombre === 'resumen.json') continue
      else { comoLectura(crudo); lecturas++ }
    }
  }
  console.log(`  validados ${lecturas} documento(s) en ${salidas.length} corrida(s)`)
  assert.ok(lecturas > 0)
})
