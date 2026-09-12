#!/usr/bin/env node
/**
 * Compara lo que el lector sabe mapear contra el esquema PUBLICADO del SAT.
 *
 * POR QUE EXISTE. El lector es una traduccion a mano de un esquema oficial, y una traduccion a mano
 * diverge sola. Es el mismo problema que `pruebas/banco-espejo.ts` resuelve para la migracion de la
 * base, con una diferencia que decide todo el diseno: aquella fuente es un fichero SQL del
 * repositorio, y esta vive FUERA del perimetro, en la red.
 *
 * POR QUE ESTA AQUI Y NO EN EL PAQUETE. Este script SALE A LA RED, a proposito. Por eso:
 *
 *   - no vive en `src/`, sino en `medicion/`, que no se empaqueta;
 *   - no corre en el camino de lectura de ningun documento, jamas;
 *   - NO se encadena en `npm run validate`. Meter la red en el gate lo vuelve intermitente, y un
 *     gate que falla por que alguien no tenia wifi es un gate que la gente aprende a ignorar.
 *
 * Se ejecuta cuando una persona decide, como `mide.mjs`. La diferencia con aquel: alli el resultado
 * es un numero que alguien tiene que interpretar, y por eso no devuelve error. Aqui el resultado es
 * un hecho estructural —el esquema declara algo que el lector no conoce, o al reves— asi que si
 * devuelve 1, para que se pueda enganchar a una revision periodica si te interesa.
 *
 * LO QUE NO CAZA, y conviene saberlo antes de fiarse: un cambio de SIGNIFICADO sin cambio de
 * estructura. Si el SAT redefine que quiere decir un campo que ya existia y no toca la version,
 * esto pasa en verde y el dato es otro. Eso es lectura humana de la norma, o no es nada.
 *
 * USO
 *
 *   node medicion/deriva.mjs <ruta-o-url-del-xsd>...
 *   node medicion/deriva.mjs --documento <cfdi.xml>    # saca las URL del propio documento
 *
 * Lo segundo es lo mas fiable: un CFDI declara en `xsi:schemaLocation` DONDE vive su esquema, asi
 * que se sigue lo que dice el documento en vez de una URL escrita aqui que puede pudrirse.
 */
import { readFileSync } from 'node:fs'
import { analizaXml } from '../dist/xml/arbol.js'
import { INVENTARIO as DEL_TRONCO, OMITIDOS } from '../dist/xml/cfdi/inventario.js'
import { INVENTARIO_TIMBRE } from '../dist/xml/cfdi/timbre-11.js'
import { INVENTARIO_PAGOS } from '../dist/xml/cfdi/pagos-20.js'
import { INVENTARIO_COMERCIO_EXTERIOR } from '../dist/xml/cfdi/comercio-exterior-20.js'
import { INVENTARIO_CARTA_PORTE } from '../dist/xml/cfdi/carta-porte-31.js'
import { INVENTARIO_NOMINA } from '../dist/xml/cfdi/nomina-12.js'
import { INVENTARIO_IMPUESTOS_LOCALES, INVENTARIO_LEYENDAS_FISCALES, INVENTARIO_DONATARIAS } from '../dist/xml/cfdi/menores.js'
import {
  CFDI_40, TIMBRE_11, PAGOS_20, COMERCIO_EXTERIOR_20, CARTA_PORTE_31, NOMINA_12,
  IMPUESTOS_LOCALES_10, LEYENDAS_FISCALES_10, DONATARIAS_11, nombreDelEsquema,
} from '../dist/xml/cfdi/espacios.js'

/**
 * Un inventario POR ESPACIO DE NOMBRES, nunca unidos por nombre de elemento.
 *
 * Aprendido el 2026-09-12: la version anterior los unia con spread, y `Emisor`, `Receptor` y
 * `Domicilio` existen en el tronco, en comercio exterior y en nomina con atributos distintos. El
 * ultimo de la lista tapaba a los demas, asi que el cotejo de comercio exterior salia con "deriva"
 * que no existia y el del tronco habria salido igual. Un XSD declara su `targetNamespace`, y es lo
 * unico que decide contra que inventario se compara.
 */
const INVENTARIOS = new Map([
  [CFDI_40, DEL_TRONCO], [TIMBRE_11, INVENTARIO_TIMBRE], [PAGOS_20, INVENTARIO_PAGOS],
  [COMERCIO_EXTERIOR_20, INVENTARIO_COMERCIO_EXTERIOR], [CARTA_PORTE_31, INVENTARIO_CARTA_PORTE], [NOMINA_12, INVENTARIO_NOMINA],
  [IMPUESTOS_LOCALES_10, INVENTARIO_IMPUESTOS_LOCALES], [LEYENDAS_FISCALES_10, INVENTARIO_LEYENDAS_FISCALES], [DONATARIAS_11, INVENTARIO_DONATARIAS],
])

const XSD = 'http://www.w3.org/2001/XMLSchema'
const b = (s) => `\x1b[1m${s}\x1b[0m`
const g = (s) => `\x1b[2m${s}\x1b[0m`
const verde = (s) => `\x1b[32m${s}\x1b[0m`
const rojo = (s) => `\x1b[31m${s}\x1b[0m`
const ambar = (s) => `\x1b[33m${s}\x1b[0m`

const argumentos = process.argv.slice(2)
if (argumentos.length === 0) {
  console.error('Uso: node medicion/deriva.mjs <ruta-o-url-del-xsd>... | --documento <cfdi.xml>')
  process.exit(2)
}

/** Un CFDI dice donde vive su esquema. Se le hace caso, en vez de escribir la URL aqui. */
function urlsDelDocumento(ruta) {
  const doc = analizaXml(readFileSync(ruta, 'utf8'))
  const encontradas = new Set()
  const pila = [doc.raiz]
  while (pila.length > 0) {
    const nodo = pila.pop()
    for (const atributo of nodo.atributos) {
      if (atributo.nombreLocal !== 'schemaLocation') continue
      // El valor son pares "espacio url", separados por espacios.
      const piezas = atributo.valor.trim().split(/\s+/)
      for (let i = 1; i < piezas.length; i += 2) encontradas.add(piezas[i])
    }
    pila.push(...nodo.hijos)
  }
  return [...encontradas]
}

async function traeEsquema(donde) {
  if (!/^https?:\/\//i.test(donde)) return { donde, texto: readFileSync(donde, 'utf8') }
  const respuesta = await fetch(donde)
  if (!respuesta.ok) throw new Error(`${donde} respondio ${respuesta.status}`)
  return { donde, texto: await respuesta.text() }
}

/**
 * Saca del XSD un mapa elemento -> atributos declarados.
 *
 * Se analiza con NUESTRO propio lector, que ademas es la mejor prueba de fuego que tiene: un XSD
 * del SAT es XML real, escrito por otro, y nada de lo que lleva se parece a un CFDI.
 *
 * Regla del recorrido: un `xs:attribute` pertenece al `xs:element` con nombre mas cercano por
 * encima. Es la forma que tiene un XSD con tipos anidados en linea, que es como estan escritos
 * estos. No pretende ser un analizador de XSD completo: pretende ser suficiente para comparar
 * nombres, y lo que produce lo lee una persona.
 */
function elementosDelEsquema(texto) {
  const doc = analizaXml(texto)
  const espacio = doc.raiz.atributos.find((a) => a.nombreLocal === 'targetNamespace')?.valor ?? ''
  const mapa = new Map()
  const importados = new Set()

  const recorre = (nodo, dentroDe) => {
    let actual = dentroDe
    if (nodo.espacio === XSD && nodo.nombreLocal === 'element') {
      const nombre = nodo.atributos.find((a) => a.nombreLocal === 'name')?.valor
      if (nombre !== undefined) {
        actual = nombre
        if (!mapa.has(nombre)) mapa.set(nombre, new Set())
      }
    }
    if (nodo.espacio === XSD && nodo.nombreLocal === 'attribute' && actual !== null) {
      const nombre = nodo.atributos.find((a) => a.nombreLocal === 'name')?.valor
      if (nombre !== undefined) mapa.get(actual)?.add(nombre)
    }
    if (nodo.espacio === XSD && nodo.nombreLocal === 'import') {
      const de = nodo.atributos.find((a) => a.nombreLocal === 'schemaLocation')?.valor
      if (de !== undefined) importados.add(de)
    }
    for (const hijo of nodo.hijos) recorre(hijo, actual)
  }

  recorre(doc.raiz, null)
  return { espacio, mapa, importados }
}

const rutas = argumentos[0] === '--documento' ? urlsDelDocumento(argumentos[1]) : argumentos
if (rutas.length === 0) {
  console.error('Ese documento no declara ningun schemaLocation.')
  process.exit(2)
}

console.log(b('\nDeriva del lector contra el esquema publicado'))
console.log(g(`  Sale a la red a proposito. No forma parte de \`npm run validate\`.\n`))

/** espacio -> (elemento -> atributos), tal como lo declaran los XSD leidos. */
const delEsquema = new Map()
const sinSeguir = new Set()
for (const ruta of rutas) {
  try {
    const { texto } = await traeEsquema(ruta)
    const { espacio, mapa, importados } = elementosDelEsquema(texto)
    if (!delEsquema.has(espacio)) delEsquema.set(espacio, new Map())
    const elementos = delEsquema.get(espacio)
    for (const [elemento, atributos] of mapa) {
      if (!elementos.has(elemento)) elementos.set(elemento, new Set())
      for (const a of atributos) elementos.get(elemento).add(a)
    }
    for (const i of importados) if (!rutas.includes(i)) sinSeguir.add(i)
    const nombre = nombreDelEsquema(espacio) ?? (INVENTARIOS.has(espacio) ? espacio : 'SIN LECTOR AQUI')
    console.log(`  ${verde('leido')} ${ruta}  ${g(`(${nombre}: ${mapa.size} elemento(s))`)}`)
  } catch (error) {
    console.log(`  ${rojo('FALLO')} ${ruta}: ${error.message}`)
    process.exitCode = 2
  }
}

let derivas = 0
console.log(b('\nEN EL ESQUEMA Y NO EN EL LECTOR'))
console.log(g('  Lo que el SAT declara y aqui no se mapea. Anadirlo, o declararlo omitido a proposito.'))
let huecos = 0
for (const [espacio, elementos] of delEsquema) {
  const inventario = INVENTARIOS.get(espacio)
  if (inventario === undefined) continue // Un esquema sin lector: se ve en el resumen.
  for (const [elemento, atributos] of elementos) {
    const conocidos = inventario[elemento]
    if (conocidos === undefined) continue // Elemento entero que no tratamos: se ve en el resumen.
    const omitidos = new Set(espacio === CFDI_40 ? OMITIDOS[elemento] ?? [] : [])
    const faltan = [...atributos].filter((a) => !conocidos.includes(a) && !omitidos.has(a))
    if (faltan.length === 0) continue
    console.log(`  ${ambar(`${nombreDelEsquema(espacio)} · ${elemento}`)}: ${faltan.join(', ')}`)
    huecos += faltan.length
  }
}
if (huecos === 0) console.log(`  ${verde('ninguno')}`)
derivas += huecos

console.log(b('\nEN EL LECTOR Y NO EN EL ESQUEMA'))
console.log(g('  Peor senal: mapeamos algo que el esquema no declara. O se invento, o lo quitaron.'))
let inventados = 0
for (const [espacio, inventario] of INVENTARIOS) {
  const elementos = delEsquema.get(espacio)
  if (elementos === undefined) continue // Ese esquema no se leyo.
  for (const [elemento, atributos] of Object.entries(inventario)) {
    const enEsquema = elementos.get(elemento)
    if (enEsquema === undefined) continue // Ese elemento no estaba en el XSD leido.
    const sobran = atributos.filter((a) => !enEsquema.has(a))
    if (sobran.length === 0) continue
    console.log(`  ${rojo(`${nombreDelEsquema(espacio)} · ${elemento}`)}: ${sobran.join(', ')}`)
    inventados += sobran.length
  }
}
if (inventados === 0) console.log(`  ${verde('ninguno')}`)
derivas += inventados

if (delEsquema.has(CFDI_40)) {
  const omitidos = Object.entries(OMITIDOS).flatMap(([e, as]) => as.map((a) => `${e}/@${a}`))
  if (omitidos.length > 0) {
    console.log(b('\nOMITIDOS A PROPOSITO'))
    console.log(g('  Presentes en el esquema y NO leidos por decision. No son deriva.'))
    console.log(`  ${omitidos.join(', ')}`)
  }
}

const sinLector = [...delEsquema.keys()].filter((e) => !INVENTARIOS.has(e))
if (sinLector.length > 0) {
  console.log(b('\nESQUEMAS LEIDOS SIN LECTOR EN EL PAQUETE'))
  console.log(g('  No hay nada con que compararlos. Registrar un lector es decision del proyecto.'))
  console.log(`  ${sinLector.join(', ')}`)
}

const noComparados = [...INVENTARIOS.keys()].filter((e) => !delEsquema.has(e)).map((e) => nombreDelEsquema(e) ?? e)
if (noComparados.length > 0) {
  console.log(b('\nSIN COMPARAR'))
  console.log(g('  Lectores del paquete cuyo esquema no se leyo. Pasalo como argumento para cubrirlo.'))
  console.log(`  ${noComparados.join(', ')}`)
}

if (sinSeguir.size > 0) {
  console.log(b('\nIMPORTS NO SEGUIDOS'))
  console.log(
    g(
      '  Los de catalogos quedan FUERA a proposito: el lector emite codigos y nunca etiquetas,\n' +
        '  asi que esas listas las resuelve el proyecto contra sus tablas. Cualquier otro, pasalo\n' +
        '  como argumento para cubrirlo.',
    ),
  )
  for (const i of sinSeguir) console.log(`  ${i}`)
}

console.log(
  derivas === 0
    ? verde('\nSin deriva estructural en lo comparado.')
    : rojo(`\n${derivas} diferencia(s). Ninguna es automatica de arreglar: las lee una persona.`),
)
console.log(
  g(
    '\nRecordatorio: esto compara NOMBRES. Un cambio de significado sin cambio de estructura pasa\n' +
      'por aqui en verde, y solo lo caza alguien leyendo la norma.\n',
  ),
)
if (derivas > 0) process.exitCode = 1
