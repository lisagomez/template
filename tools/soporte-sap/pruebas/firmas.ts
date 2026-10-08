/**
 * La matriz de la AISIA y del C3 (`firmas/matriz.ts`) no se desincroniza de lo que firma el laboratorio:
 * cada daño de la AISIA y cada control del C3 tiene su fila, cada prueba citada existe y cada sabotaje
 * sigue encontrando su texto. Correr los sabotajes es `evidencia/firmas.ts` (minutos); esto es barato.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FILAS, HALLAZGOS } from '../firmas/matriz.ts'
import { RAIZ, lee } from './_ayuda.ts'

/** La AISIA vive como borrador en docs/goals hasta que el laboratorio la firma y la mueve a gobernanza. */
const AISIA = ['.claude/gobernanza/AISIA-soporte-sap.md', 'docs/goals/soporte-sap-AISIA.md'].find((p) => existsSync(join(RAIZ, p)))!
const C3 = '.claude/PRPs/PRP-008-soporte-sap.md'

const seccion = (texto: string, desde: RegExp, hasta: RegExp): string => {
  const i = texto.search(desde)
  const resto = texto.slice(i)
  const j = resto.slice(1).search(hasta)
  return j < 0 ? resto : resto.slice(0, j + 1)
}
export const danosDeLaAisia = (): string[] =>
  [...seccion(lee(AISIA), /^## 2\. /m, /^## 3\. /m).matchAll(/^\| \*\*(.+?)\*\* \|/gm)].map((m) => m[1]!)
export const controlesDelC3 = (): string[] =>
  [...seccion(lee(C3), /^\*\*Controles y brechas\*\*/m, /^### /m).matchAll(/^- \*\*(.+?)\.?\*\*/gm)].map((m) => m[1]!.replace(/\.$/, ''))

test('cada daño de la AISIA tiene su fila en la matriz, y cada fila de la AISIA nombra un daño que existe', () => {
  const danos = danosDeLaAisia()
  assert.ok(danos.length >= 10, `${AISIA}: ${danos.length} daños`)
  const refs = new Set(FILAS.filter((f) => f.doc === 'AISIA').map((f) => f.ref))
  assert.deepEqual(danos.filter((d) => !refs.has(d)), [], 'daños sin fila')
  assert.deepEqual([...refs].filter((r) => !danos.includes(r)), [], 'filas que nombran un daño que la AISIA no tiene')
})

test('cada control del C3 tiene su fila en la matriz, y cada fila del C3 nombra un control que existe', () => {
  const controles = controlesDelC3()
  assert.ok(controles.length >= 8, `${C3}: ${controles.length} controles`)
  const refs = new Set(FILAS.filter((f) => f.doc === 'C3').map((f) => f.ref))
  assert.deepEqual(controles.filter((c) => !refs.has(c)), [], 'controles sin fila')
  assert.deepEqual([...refs].filter((r) => !controles.includes(r)), [], 'filas que nombran un control que el C3 no tiene')
})

test('cada fila «probado» tiene su prueba y su sabotaje; las demás dicen por qué no', () => {
  const ids = FILAS.map((f) => f.id)
  assert.equal(new Set(ids).size, ids.length, 'ids repetidos')
  for (const f of FILAS) {
    if (f.estado === 'probado') assert.ok(f.comprobacion && f.sabotaje, `${f.id}: probado sin prueba o sin sabotaje`)
    else assert.ok((f.nota ?? '').length > 10, `${f.id}: ${f.estado} sin decir por qué`)
  }
  for (const h of HALLAZGOS) for (const id of h.filas) assert.ok(ids.includes(id), `hallazgo «${h.afirmacion}»: no existe la fila ${id}`)
})

test('cada prueba citada existe con ese nombre exacto', () => {
  for (const f of FILAS) {
    const c = f.comprobacion
    if (!c || c.tipo !== 'prueba') continue
    const fuente = readFileSync(join(RAIZ, c.carpeta, c.archivo), 'utf8')
    assert.ok(fuente.includes(`test('${c.nombre}'`), `${f.id}: no hay test('${c.nombre}') en ${c.carpeta}/${c.archivo}`)
  }
})

test('cada sabotaje sigue encontrando su texto exactamente una vez', () => {
  for (const f of FILAS) {
    if (!f.sabotaje || !('ediciones' in f.sabotaje)) continue
    for (const e of f.sabotaje.ediciones) {
      const ruta = join(RAIZ, e.archivo)
      assert.ok(existsSync(ruta), `${f.id}: no existe ${e.archivo}`)
      const veces = readFileSync(ruta, 'utf8').split(e.buscar).length - 1
      assert.equal(veces, 1, `${f.id}: «${e.buscar.slice(0, 60)}» aparece ${veces} veces en ${e.archivo}`)
    }
  }
})
