/**
 * Lo que un proyecto recibe de la fuente única: solo los dominios que registra (RF-15).
 *
 * Un dominio trae sus categorías, las reglas que dictan sobre ellas y las reglas GENERALES de su
 * ámbito (impactos con `categoria: null`), porque el motor suma esos requisitos a todo concepto
 * de ese ámbito. De una regla solo se conservan los impactos generales y los de categorías
 * registradas: un impacto sobre una categoría que el proyecto no tiene sería inerte, y además
 * una referencia rota.
 *
 * El resultado es un `Conocimiento` completo y válido por sí mismo: se puede pasar por
 * `validaConocimiento` y por el motor sin saber que es un recorte.
 */
import type { Conocimiento } from './contrato.js'

export function seleccionaDominios(conocimiento: Conocimiento, claves: readonly string[]): Conocimiento {
  const disponibles = new Set(conocimiento.dominios.map((d) => d.clave))
  const desconocidos = claves.filter((k) => !disponibles.has(k))
  if (desconocidos.length > 0) {
    throw new Error(`dominios desconocidos: ${desconocidos.join(', ')} (hay: ${[...disponibles].join(', ')})`)
  }
  const pedidos = new Set(claves)
  const dominios = conocimiento.dominios.filter((d) => pedidos.has(d.clave))
  const ambitos = new Set(dominios.map((d) => `${d.jurisdiccion}/${d.dimension}`))
  const enAmbito = new Set(dominios.flatMap((d) => d.categorias.map((k) => `${d.jurisdiccion}/${d.dimension}/${k}`)))

  const reglas = conocimiento.reglas
    .filter((r) => ambitos.has(`${r.jurisdiccion}/${r.dimension}`))
    .map((r) => ({
      ...r,
      impactos: r.impactos.filter(
        (i) => i.categoria === null || enAmbito.has(`${r.jurisdiccion}/${r.dimension}/${i.categoria}`),
      ),
    }))
    .filter((r) => r.impactos.length > 0)

  const categoriasUsadas = new Set(dominios.flatMap((d) => d.categorias))
  const jurisdicciones = new Set(dominios.map((d) => d.jurisdiccion))
  const dimensiones = new Set(dominios.map((d) => d.dimension))
  const vivas = new Set(reglas.map((r) => r.clave))
  return {
    ...conocimiento,
    jurisdicciones: conocimiento.jurisdicciones.filter((j) => jurisdicciones.has(j.codigo)),
    dimensiones: conocimiento.dimensiones.filter((d) => dimensiones.has(d.codigo)),
    dominios,
    categorias: conocimiento.categorias.filter((c) => categoriasUsadas.has(c.clave)),
    // Un `reemplaza` hacia una regla que el recorte dejó fuera sería una referencia rota.
    reglas: reglas.map((r) => (r.reemplaza && !vivas.has(r.reemplaza) ? { ...r, reemplaza: undefined } : r)),
  }
}
