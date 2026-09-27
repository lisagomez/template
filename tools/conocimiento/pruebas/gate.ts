/**
 * El gate de siembra sobre ESTA fuente única (PRP-005 Fase 4, RF-12 y RF-14). Corre dentro de
 * `npm run validate` (`prueba:tools`), así que nada se siembra sin pasar por aquí:
 *
 * 1. la versión del paquete está registrada en `versiones.json` con las huellas de su contenido
 *    (cambiar el conocimiento sin subir de versión pone rojo);
 * 2. ninguna versión deshace la anterior: nada borrado, nada editado en su sitio sin firma;
 * 3. cada firma corresponde a un cambio de verdad (una firma de más es una firma en blanco);
 * 4. las contenciones de keywords son exactamente las cubiertas más las aceptadas por escrito.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import conocimiento from '../dist/index.js'
import { validaConocimiento } from '../../grafo-conocimiento/dist/index.js'
import { comparaVersiones, contenciones, huellas, type Huellas } from '../../grafo-conocimiento/dist/gate-entrada.js'

const lee = <T>(ruta: string): T => JSON.parse(readFileSync(new URL(ruta, import.meta.url), 'utf8')) as T
const c = validaConocimiento(conocimiento).conocimiento!
const { versiones } = lee<{ versiones: { version: string; firmadas: string[]; huellas: Huellas }[] }>('../versiones.json')
const { aceptadas } = lee<{ aceptadas: { corta: string; categoria_corta: string; larga: string; categoria_larga: string; porque: string }[] }>(
  '../contenciones-aceptadas.json',
)

test('la versión del paquete está registrada, con las huellas de lo que hay (sin cambios sin subir de versión)', () => {
  const registrada = versiones.find((v) => v.version === c.version)
  assert.ok(registrada, `${c.version} sin registrar: npm run registra -- [--firmadas ...]`)
  assert.deepEqual(registrada.huellas, huellas(c), `el conocimiento cambió y sigue diciendo ${c.version}: sube la versión y regístrala`)
  assert.equal(versiones.at(-1)!.version, c.version, 'la versión actual es la última registrada')
})

test('RF-14: ninguna versión deshace la anterior (nada borrado, nada editado en su sitio sin firma)', () => {
  for (let i = 1; i < versiones.length; i++) {
    const [antes, ahora] = [versiones[i - 1]!, versiones[i]!]
    assert.deepEqual(comparaVersiones(antes.huellas, ahora.huellas, ahora.firmadas), [], `${antes.version} → ${ahora.version}`)
  }
})

test('cada firma corresponde a un cambio en su sitio de verdad: sin firmas en blanco', () => {
  for (let i = 1; i < versiones.length; i++) {
    const [antes, ahora] = [versiones[i - 1]!, versiones[i]!]
    const sinFirmas = comparaVersiones(antes.huellas, ahora.huellas).map((r) => r.clave)
    for (const f of ahora.firmadas) assert.ok(sinFirmas.includes(f), `${ahora.version}: «${f}» está firmada y no cambió`)
  }
})

test('control de reversión: volver a la foto de Hermes deshace lo firmado y pone rojo el gate', () => {
  const v020 = versiones.find((v) => v.version === '0.2.0')!.huellas
  const v010 = versiones.find((v) => v.version === '0.1.0')!.huellas
  const atras = comparaVersiones(v020, v010).map((r) => `${r.tipo}:${r.clave}`)
  assert.deepEqual(atras.sort(), ['reemplazo_editado:MX-LFPDPPP2025-20-CONFIDENCIALIDAD', 'regla_borrada:MX-LFPDPPP-21-CONFIDENCIALIDAD', 'regla_editada:MX-LISR-27-VII'])
})

test('RF-12: las contenciones son exactamente las cubiertas por exclusión más las aceptadas por escrito', () => {
  const llave = (x: { corta: string; categoria_corta: string; larga: string; categoria_larga: string }) =>
    `${x.corta} (${x.categoria_corta}) ⊂ ${x.larga} (${x.categoria_larga})`
  const sinCubrir = contenciones(c).filter((x) => !x.cubierta).map(llave).sort()
  assert.deepEqual(sinCubrir, aceptadas.map(llave).sort(), 'una contención nueva se cubre con una exclusión o se acepta con su porqué')
  for (const a of aceptadas) assert.ok(a.porque.length > 40, `${llave(a)}: se acepta con su porqué`)
})
