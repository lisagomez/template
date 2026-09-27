/**
 * JSON Canonicalization Scheme (RFC 8785): la misma estructura produce SIEMPRE los mismos bytes,
 * sin importar el orden en que se escribieron los campos. Es lo que permite hashear un evento
 * "entero" y que el hash no cambie porque otro programa lo serialice distinto.
 *
 * - Primitivos como `JSON.stringify` de ECMAScript (numeros en su forma mas corta, cadenas con los
 *   escapes minimos): exactamente lo que pide §3.2.2.
 * - Propiedades ordenadas por unidades de codigo UTF-16 (§3.2.3): el `sort()` por defecto de JS.
 * - Sin espacios. Se rechazan NaN, Infinity y lo que no es JSON (undefined, funciones).
 */

export type Json = null | boolean | number | string | readonly Json[] | { readonly [k: string]: Json }

export function canonico(valor: unknown): string {
  if (valor === null) return 'null'
  switch (typeof valor) {
    case 'boolean':
      return valor ? 'true' : 'false'
    case 'number':
      if (!Number.isFinite(valor)) throw new Error('JCS: numero no finito')
      return JSON.stringify(valor)
    case 'string':
      return JSON.stringify(valor)
    case 'object': {
      if (Array.isArray(valor)) return `[${valor.map(canonico).join(',')}]`
      const o = valor as Record<string, unknown>
      const claves = Object.keys(o).filter((k) => o[k] !== undefined).sort()
      return `{${claves.map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(',')}}`
    }
    default:
      throw new Error(`JCS: tipo no JSON (${typeof valor})`)
  }
}
