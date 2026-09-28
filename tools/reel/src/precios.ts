/** Cotejo de precios (propuesta §2, paso 4): lo que el dueño DICE contra su catálogo. Si no coincide, bloquea. */
import type { Observacion, Palabra, ProductoDeCatalogo } from './tipos.js';
import { limpiaToken, normaliza, preciosDichos } from './texto.js';

const formato = (n: number): string => `$${n.toFixed(2)}`;

/** Dos palabras son la misma si son iguales o una es el comienzo de la otra desde 4 letras («muer» ~ «muerto»). */
const mismaPalabra = (a: string, b: string): boolean => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));

/** El producto nombrado más cerca ANTES del precio (en las 12 palabras previas). El transcriptor a veces trunca: se tolera. */
function productoCercano(n: readonly string[], hasta: number, catalogo: readonly ProductoDeCatalogo[]): ProductoDeCatalogo | null {
  const desde = Math.max(0, hasta - 12);
  let mejor: { p: ProductoDeCatalogo; pos: number } | null = null;
  for (const p of catalogo) {
    const nombre = normaliza(p.nombre).split(' ');
    for (let i = hasta - nombre.length + 1; i >= desde; i--) {
      if (nombre.every((w, k) => mismaPalabra(n[i + k] ?? '', w))) { if (!mejor || i > mejor.pos) mejor = { p, pos: i }; break; }
    }
  }
  return mejor?.p ?? null;
}

export function cotejaPrecios(palabras: readonly Palabra[], catalogo: readonly ProductoDeCatalogo[]): Observacion[] {
  const textos = palabras.map((p) => p.texto);
  const n = textos.map(limpiaToken);
  return preciosDichos(textos).map((d): Observacion => {
    const t = palabras[d.indice]?.inicio;
    const p = productoCercano(n, d.indice, catalogo);
    if (!p) return { regla: 'precio-sin-producto', nivel: 'aviso', mensaje: `Dices ${formato(d.valor)} sin nombrar un producto del catálogo: revisa que sea correcto`, ...(t !== undefined ? { t } : {}) };
    if (Math.abs(p.precio - d.valor) > 0.005) return { regla: 'precio-no-coincide', nivel: 'bloquea', mensaje: `Dices ${formato(d.valor)} por «${p.nombre}», pero tu catálogo dice ${formato(p.precio)}: corrige el catálogo o vuelve a grabar esa frase`, ...(t !== undefined ? { t } : {}) };
    return { regla: 'precio-coincide', nivel: 'aviso', mensaje: `«${p.nombre}» a ${formato(d.valor)}: coincide con el catálogo`, ...(t !== undefined ? { t } : {}) };
  });
}
