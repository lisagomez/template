#!/usr/bin/env node
/**
 * ss-cadena — verifica la cadena sha256 de eventos de una incidencia. Solo lectura.
 *
 * Uso:  ss-cadena --eventos eventos.json --incidencia <id>
 *   eventos.json es un arreglo de eventos tal como los guarda el producto.
 * Exit: 0 cadena íntegra · 1 cadena rota (dice dónde y por qué) · 2 uso.
 */
import { readFileSync } from 'node:fs'
import { verificaCadena, leeArgumentos, ayuda } from '../dist/index.js'

export const DESCRIPCION = { nombre: 'ss-cadena', que: 'verifica la cadena sha256 de eventos de una incidencia', uso: 'ss-cadena --eventos archivo.json --incidencia id', readOnly: true, dryRunPorDefecto: false }

const a = leeArgumentos(process.argv.slice(2), ['eventos', 'incidencia'])
if (a.banderas.has('help')) { console.log(ayuda(DESCRIPCION)); process.exit(0) }
if (!a.valores.eventos || !a.valores.incidencia) { console.error(ayuda(DESCRIPCION)); process.exit(2) }
const v = verificaCadena(a.valores.incidencia, JSON.parse(readFileSync(a.valores.eventos, 'utf8')))
console.log(v.ok ? `✓ íntegra: ${v.n} eventos, cabeza ${v.cabeza}` : `✗ rota en el evento ${v.rotura.seq}: ${v.rotura.motivo} (${v.rotura.detalle})`)
process.exit(v.ok ? 0 : 1)
