/**
 * JSON Canonicalization Scheme (RFC 8785), el de la casa (`tools/etiquetas-gs1/src/jcs.ts`, mismo texto):
 * la misma estructura produce SIEMPRE los mismos bytes, sin importar el orden en que se escribieron los
 * campos. Primitivos como `JSON.stringify` de ECMAScript (§3.2.2), propiedades ordenadas por unidades de
 * codigo UTF-16 (§3.2.3), sin espacios; NaN, Infinity y lo que no es JSON se rechazan.
 */
export function canonico(valor: unknown): string {
  if (valor === null) return 'null';
  switch (typeof valor) {
    case 'boolean':
      return valor ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(valor)) throw new Error('JCS: numero no finito');
      return JSON.stringify(valor);
    case 'string':
      return JSON.stringify(valor);
    case 'object': {
      if (Array.isArray(valor)) return `[${valor.map(canonico).join(',')}]`;
      const o = valor as Record<string, unknown>;
      const claves = Object.keys(o).filter((k) => o[k] !== undefined).sort();
      return `{${claves.map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(',')}}`;
    }
    default:
      throw new Error(`JCS: tipo no JSON (${typeof valor})`);
  }
}
