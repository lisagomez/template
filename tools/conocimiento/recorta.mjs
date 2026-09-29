#!/usr/bin/env node
/**
 * El recorte que un proyecto VENDORIZA: solo los dominios que registra, de una versión registrada,
 * con su pin. Lo pidió el PRP de Hermes «el grafo lee el paquete» (Fase 0, decisiones 1 y 2):
 * un consumidor público no puede llevarse el paquete entero, porque cada subida del pin publicaría
 * los dominios que siembren otros proyectos.
 *
 * El recorte lo hace `seleccionaDominios`, el del motor: no hay una segunda implementación que se
 * desvíe. Y se niega si el conocimiento del árbol no es EXACTAMENTE la versión registrada en
 * `versiones.json` (mismas huellas): recorte y pin corresponden siempre a una versión que pasó el
 * gate de siembra.
 *
 * El pin se puede rehacer: con la misma versión y los mismos dominios da las mismas huellas. Es lo
 * que comprueba quien firma una subida del pin, porque el consumidor no ve el paquete.
 *
 * Uso:
 *   npm run recorta -- --dominios mx-drones-de-reparto,mx-agentes-de-seguros --salida <dir>
 * Escribe en <dir> `recorte.json` y `PIN.json`. No hay «todos los dominios» a propósito: el
 * consumidor nombra los suyos, y un dominio que se siembre mañana no le llega sin que lo pida.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { seleccionaDominios, validaConocimiento } from '../grafo-conocimiento/dist/index.js'
import { huellas } from '../grafo-conocimiento/dist/gate-entrada.js'
import { ensambla } from './ensambla.mjs'

const raiz = dirname(fileURLToPath(import.meta.url))
const sha256 = (texto) => `sha256:${createHash('sha256').update(texto).digest('hex')}`

/**
 * Recorte y pin, sin tocar disco. `crudo` es el conocimiento ensamblado; `registro`, el contenido
 * de `versiones.json`. Lanza si la versión no está registrada con esas huellas, si un dominio no
 * existe o si el recorte no pasa el contrato.
 */
export function recorta(crudo, dominios, registro, nombre) {
  const v = validaConocimiento(crudo)
  if (v.conocimiento === null) {
    throw new Error(`${crudo.version} no tiene la forma del contrato: ${v.problemas.slice(0, 3).map((p) => p.clave).join(', ')}`)
  }
  const registrada = registro.versiones.find((x) => x.version === crudo.version)
  if (!registrada) throw new Error(`${crudo.version} no está en versiones.json: primero npm run registra`)
  if (JSON.stringify(registrada.huellas) !== JSON.stringify(huellas(v.conocimiento))) {
    throw new Error(`el conocimiento del árbol no es la ${crudo.version} registrada: cambió sin subir de versión`)
  }
  const pedidos = [...new Set(dominios)].sort()
  if (pedidos.length === 0) throw new Error('sin dominios: el consumidor nombra los que registra')

  const recorte = seleccionaDominios(crudo, pedidos)
  if (validaConocimiento(recorte).conocimiento === null) throw new Error('el recorte no pasa el contrato')
  const texto = `${JSON.stringify(recorte, null, 2)}\n`
  const pin = {
    nombre,
    version: crudo.version,
    // La huella de `dist/conocimiento.json`, que `ensambla` escribe con este mismo JSON.stringify.
    sha256_paquete: sha256(JSON.stringify(crudo)),
    dominios: pedidos,
    sha256_recorte: sha256(texto),
  }
  return { recorte, texto, pin }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (n) => {
    const i = process.argv.indexOf(n)
    return i > 0 ? process.argv[i + 1] : undefined
  }
  const salida = arg('--salida')
  const dominios = (arg('--dominios') ?? '').split(',').filter(Boolean)
  if (!salida || dominios.length === 0) {
    console.error('uso: npm run recorta -- --dominios <dominio,...> --salida <dir>')
    process.exit(1)
  }
  const lee = (ruta) => JSON.parse(readFileSync(join(raiz, ruta), 'utf8'))
  const crudo = ensambla()
  let resultado
  try {
    resultado = recorta(crudo, dominios, lee('versiones.json'), lee('package.json').name)
  } catch (e) {
    console.error(`✗ ${e.message}`)
    process.exit(1)
  }
  const { recorte, texto, pin } = resultado
  mkdirSync(salida, { recursive: true })
  writeFileSync(join(salida, 'recorte.json'), texto)
  writeFileSync(join(salida, 'PIN.json'), `${JSON.stringify(pin, null, 2)}\n`)
  const entero = JSON.stringify(recorte) === JSON.stringify(crudo)
  console.log(`✓ ${pin.nombre}@${pin.version}: ${pin.dominios.length} de ${crudo.dominios.length} dominios, ${recorte.reglas.length} de ${crudo.reglas.length} reglas`)
  console.log(`  recorte ${pin.sha256_recorte}${entero ? ' (hoy idéntico al paquete: se pidieron todos sus dominios)' : ''}`)
  console.log(`  escrito en ${salida}/recorte.json y ${salida}/PIN.json`)
}
