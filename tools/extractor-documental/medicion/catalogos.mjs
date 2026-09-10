#!/usr/bin/env node
/**
 * Vigila el CONJUNTO DE CODIGOS de los catalogos del SAT.
 *
 * Hermano de `deriva.mjs`, y complementario: aquel compara la ESTRUCTURA —que elementos y
 * atributos existen— y este compara QUE CODIGOS son validos dentro de ellos.
 *
 * POR QUE SOLO LOS CODIGOS Y NO SU SIGNIFICADO. Porque el significado no esta publicado en ningun
 * sitio que una maquina pueda cotejar. Medido el 2026-09-10 sobre `catCFDI.xsd`: 5,8 MB, veintiun
 * catalogos, 162.233 codigos enumerados y CERO bloques de documentacion legible. El fichero dice
 * que codigos son validos; que quiere decir cada uno vive en el anexo, que es un documento para
 * leer, no para diffear.
 *
 * De ahi la unica conclusion honesta: un cambio de significado no se detecta desde aqui. Lo que si
 * se detecta es que el conjunto se movio, y eso ya es una senal — un codigo nuevo en uso de
 * comprobante significa que algo cambio, aunque no diga que.
 *
 * POR QUE NO SE EMBARCAN. Con ese tamano, meterlos en el paquete seria arrastrar casi seis megas
 * de datos que envejecen solos. El lector emite codigos y nunca etiquetas justamente para que el
 * significado viva en UN sitio: las tablas del proyecto, o su grafo. Esto no cambia esa decision;
 * la sostiene, avisando cuando el conjunto se mueve.
 *
 * COMO FUNCIONA. Se declara lo ultimo visto en `catalogos-vistos.json` y se compara contra la
 * fuente, que es el mismo patron de `ESPEJO_DE_LA_MIGRACION`. Sellar es un acto deliberado.
 *
 * LA REFERENCIA VA FECHADA POR QUIEN PUBLICA, no por el dia en que a alguien se le ocurrio mirar.
 * El servidor del SAT declara `last-modified` y un `etag`, y los dos se guardan. Eso da dos cosas:
 *
 *   - Una FECHA que afirma la fuente, que es la unica que sirve para decir "esto valia entonces".
 *   - Una comprobacion BARATA: si el `etag` no ha cambiado, no hace falta bajar 5,8 MB.
 *
 * Y una consecuencia que conviene ver: **la serie historica no hay que construirla**. Cada sellado
 * deja la referencia anterior en el historial de git, fechada por la fuente. `git log` sobre este
 * fichero ES el repositorio de versiones, sin una sola pieza nueva.
 *
 * Lo que NO es: un repositorio de SIGNIFICADOS. Esto guarda que codigos existian y cuando. Que
 * queria decir cada uno vive en el grafo del proyecto, y su spec (004) lleva anotada la forma.
 *
 *   node medicion/catalogos.mjs           # compara y reporta
 *   node medicion/catalogos.mjs --sella   # acepta lo que hay ahora como la nueva referencia
 *
 * Sale a la red, asi que vale lo mismo que para `deriva.mjs`: fuera del paquete, fuera del camino
 * de lectura y FUERA de `npm run validate`.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { analizaXml } from '../dist/xml/arbol.js'

const XSD = 'http://www.w3.org/2001/XMLSchema'
const FUENTE = 'http://www.sat.gob.mx/sitio_internet/cfd/catalogos/catCFDI.xsd'
const aqui = dirname(fileURLToPath(import.meta.url))
const REFERENCIA = join(aqui, 'catalogos-vistos.json')

const b = (s) => `\x1b[1m${s}\x1b[0m`
const g = (s) => `\x1b[2m${s}\x1b[0m`
const verde = (s) => `\x1b[32m${s}\x1b[0m`
const rojo = (s) => `\x1b[31m${s}\x1b[0m`
const ambar = (s) => `\x1b[33m${s}\x1b[0m`

/**
 * Los catalogos cuyos codigos SIGNIFICAN algo: de estos se guarda la lista entera y se dice que
 * codigo entro o salio, por su nombre.
 *
 * Es una lista DECLARADA, no un umbral por tamano, y la diferencia importa. La medicion los separa
 * limpiamente —los doce de aqui tienen 25 codigos o menos, y el siguiente ya es geografia con 66—
 * pero un umbral numerico ascenderia en silencio un catalogo de referencia el dia que encogiera.
 * Esto es una decision, y se lee como tal.
 *
 * Del resto se guarda solo la cuenta: un codigo postal nuevo o una clave de producto nueva son
 * rutina, no un hecho del que nadie tenga que enterarse.
 */
const CON_SIGNIFICADO = new Set([
  'c_MetodoPago',
  'c_Impuesto',
  'c_TipoFactor',
  'c_Exportacion',
  'c_TipoDeComprobante',
  'c_Periodicidad',
  'c_ObjetoImp',
  'c_TipoRelacion',
  'c_Meses',
  'c_FormaPago',
  'c_RegimenFiscal',
  'c_UsoCFDI',
])

function catalogosDe(texto) {
  const doc = analizaXml(texto)
  const salida = new Map()
  const anda = (nodo, dentro) => {
    let actual = dentro
    if (nodo.espacio === XSD && nodo.nombreLocal === 'simpleType') {
      const nombre = nodo.atributos.find((a) => a.nombreLocal === 'name')?.valor
      if (nombre !== undefined) {
        actual = nombre
        if (!salida.has(nombre)) salida.set(nombre, [])
      }
    }
    if (nodo.espacio === XSD && nodo.nombreLocal === 'enumeration' && actual !== null) {
      const valor = nodo.atributos.find((a) => a.nombreLocal === 'value')?.valor
      if (valor !== undefined) salida.get(actual)?.push(valor)
    }
    for (const hijo of nodo.hijos) anda(hijo, actual)
  }
  anda(doc.raiz, null)
  return salida
}

const sella = process.argv.includes('--sella')

console.log(b('\nCodigos de catalogo del SAT'))
console.log(g('  Sale a la red a proposito. No forma parte de `npm run validate`.'))
console.log(g(`  Fuente: ${FUENTE}\n`))

const previo = existsSync(REFERENCIA) ? JSON.parse(readFileSync(REFERENCIA, 'utf8')) : null
const fuentePrevia = previo?.fuente ?? null

/**
 * Se pregunta antes de bajar. Si el `etag` es el mismo, la fuente no se ha movido y descargar 5,8
 * MB no aporta nada — y una comprobacion cara es una comprobacion que se deja de correr.
 */
if (!sella && fuentePrevia?.etag != null) {
  try {
    const cabeza = await fetch(FUENTE, { method: 'HEAD' })
    const etagAhora = cabeza.headers.get('etag')
    if (cabeza.ok && etagAhora !== null && etagAhora === fuentePrevia.etag) {
      console.log(`  ${verde('sin cambios')} la fuente no se ha movido desde la referencia.`)
      console.log(g(`  Publicada: ${fuentePrevia.lastModified ?? '(sin fecha)'}`))
      console.log(g('  No se descargo nada: el identificador de version es el mismo.\n'))
      process.exit(0)
    }
  } catch {
    // Si el servidor no responde a HEAD se sigue por la via larga. Nunca es motivo de fallo.
  }
}

const respuesta = await fetch(FUENTE)
if (!respuesta.ok) {
  console.error(rojo(`  No se pudo leer el catalogo: HTTP ${respuesta.status}`))
  process.exit(2)
}
const publicada = respuesta.headers.get('last-modified')
const etag = respuesta.headers.get('etag')
const texto = await respuesta.text()
const ahora = catalogosDe(texto)
console.log(
  `  ${verde('leido')} ${(texto.length / 1024 / 1024).toFixed(1)} MB · ${ahora.size} catalogo(s) · ` +
    `${[...ahora.values()].reduce((n, c) => n + c.length, 0)} codigo(s)`,
)
console.log(g(`  Publicada: ${publicada ?? '(la fuente no declara fecha)'}`))
if (fuentePrevia?.lastModified != null && fuentePrevia.lastModified !== publicada) {
  console.log(g(`  La referencia era de: ${fuentePrevia.lastModified}`))
}
console.log('')

/**
 * Lo que se guarda: quien publico y cuando, mas la lista entera solo para los catalogos que
 * significan algo. Del resto, la cuenta.
 *
 * `fuente` va primero a proposito: es lo que convierte esta foto en un punto de una serie.
 */
const instantanea = {
  fuente: {
    url: FUENTE,
    lastModified: publicada,
    etag,
    selladoEn: new Date().toISOString().slice(0, 10),
  },
}
for (const [nombre, codigos] of [...ahora].sort()) {
  instantanea[nombre] = CON_SIGNIFICADO.has(nombre)
    ? { codigos: [...codigos].sort() }
    : { cuenta: codigos.length }
}

if (sella) {
  writeFileSync(REFERENCIA, `${JSON.stringify(instantanea, null, 2)}\n`, 'utf8')
  console.log(verde(`  Sellado: ${ahora.size} catalogo(s) aceptados como referencia.`))
  console.log(g(`  Publicada por la fuente: ${publicada ?? '(sin fecha)'}`))
  console.log(g('  Commitea este fichero. Con eso el historial de git pasa a ser la serie:'))
  console.log(g('  cada sellado deja fechada la version anterior, sin una sola pieza nueva.\n'))
  process.exit(0)
}

if (!existsSync(REFERENCIA)) {
  console.error(rojo('  No hay referencia todavia.'))
  console.error(g('  Corre `node medicion/catalogos.mjs --sella` para fijar la primera.\n'))
  process.exit(2)
}

const antes = previo
let movimientos = 0

console.log(b('CATALOGOS CON SIGNIFICADO'))
console.log(g('  De estos se dice QUE codigo entro o salio: una regla del negocio depende de ellos.'))
let conCambio = 0
const catalogos = Object.keys(instantanea).filter((n) => n !== 'fuente')
for (const nombre of catalogos.filter((n) => CON_SIGNIFICADO.has(n))) {
  const viejos = new Set(antes[nombre]?.codigos ?? [])
  const nuevos = new Set(instantanea[nombre].codigos)
  if (antes[nombre] === undefined) {
    console.log(`  ${ambar(nombre)}: catalogo NUEVO, ${nuevos.size} codigo(s)`)
    conCambio++
    continue
  }
  const entraron = [...nuevos].filter((c) => !viejos.has(c))
  const salieron = [...viejos].filter((c) => !nuevos.has(c))
  if (entraron.length === 0 && salieron.length === 0) continue
  const partes = []
  if (entraron.length > 0) partes.push(`entra ${entraron.join(', ')}`)
  if (salieron.length > 0) partes.push(`SALE ${salieron.join(', ')}`)
  console.log(`  ${ambar(nombre)}: ${partes.join(' · ')}`)
  conCambio++
}
if (conCambio === 0) console.log(`  ${verde('sin movimiento')}`)
movimientos += conCambio

console.log(b('\nCATALOGOS DE REFERENCIA'))
console.log(g('  De estos solo la cuenta: un codigo postal o una clave de producto nueva son rutina.'))
let conDelta = 0
for (const nombre of catalogos.filter((n) => !CON_SIGNIFICADO.has(n))) {
  const antesCuenta = antes[nombre]?.cuenta
  const ahoraCuenta = instantanea[nombre].cuenta
  if (antesCuenta === undefined) {
    console.log(`  ${ambar(nombre)}: catalogo NUEVO, ${ahoraCuenta} codigo(s)`)
    conDelta++
    continue
  }
  if (antesCuenta === ahoraCuenta) continue
  const delta = ahoraCuenta - antesCuenta
  console.log(`  ${ambar(nombre)}: ${antesCuenta} -> ${ahoraCuenta} (${delta > 0 ? '+' : ''}${delta})`)
  conDelta++
}
if (conDelta === 0) console.log(`  ${verde('sin movimiento')}`)
movimientos += conDelta

const desaparecidos = Object.keys(antes).filter((n) => n !== 'fuente' && instantanea[n] === undefined)
if (desaparecidos.length > 0) {
  console.log(b('\nCATALOGOS QUE YA NO ESTAN'))
  console.log(g('  La senal mas rara y la que mas conviene mirar: algo se retiro de la norma.'))
  console.log(`  ${rojo(desaparecidos.join(', '))}`)
  movimientos += desaparecidos.length
}

console.log(
  movimientos === 0
    ? verde('\nEl conjunto de codigos no se ha movido desde la ultima referencia.')
    : rojo(`\n${movimientos} catalogo(s) se movieron. Ninguno se arregla solo: los lee una persona.`),
)
console.log(
  g(
    '\nRecordatorio: esto ve que el CONJUNTO cambio, nunca que cambio el SIGNIFICADO de un codigo\n' +
      'que sigue ahi. Eso no esta publicado en forma comparable, y solo lo caza alguien leyendo\n' +
      'la norma. Cuando lo hagas, el sitio donde vive ese significado es tu grafo, no esta\n' +
      'herramienta — que emite codigos y nunca etiquetas justamente por eso.\n',
  ),
)
if (movimientos > 0) process.exitCode = 1
