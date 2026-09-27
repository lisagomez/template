#!/usr/bin/env node
/**
 * Pregunta en lenguaje natural desde la terminal, sin modelo (estructuradorSinModelo).
 *
 *   node ejemplos/pregunta.mjs "¿Puedo devolver unos zapatos?"                      # el ejemplo no legal
 *   node ejemplos/pregunta.mjs --dominios mx-drones-de-reparto,mx-agentes-de-seguros \
 *     "¿Puedo repartir paquetes con drones?"                                        # la fuente única
 *   ... --regimen PM_TITULO_II   (el régimen importa en lo fiscal)
 */
import { readFileSync } from 'node:fs'
import { seleccionaDominios, validaConocimiento } from '../dist/index.js'
import { estructuradorSinModelo, responde } from '../dist/lenguaje/index.js'

const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : undefined)
const texto = process.argv.at(-1)
const dominios = arg('--dominios')
const crudo = dominios
  ? JSON.parse(readFileSync(new URL('../../conocimiento/dist/conocimiento.json', import.meta.url), 'utf8'))
  : JSON.parse(readFileSync(new URL('./politica-devoluciones.json', import.meta.url), 'utf8'))
const v = validaConocimiento(crudo)
if (!v.conocimiento) throw new Error('el conocimiento no valida')
const c = dominios ? seleccionaDominios(v.conocimiento, dominios.split(',')) : v.conocimiento
const r = await responde(texto, { conocimiento: c, jurisdiccion: 'MX', regimen: arg('--regimen') ?? 'GENERAL', estructurador: estructuradorSinModelo(c, 'MX') })
console.log(r.texto)
