/**
 * Pruebas de permutación con SEMILLA: la aleatoriedad es parte de Γ (la semilla viaja en la spec),
 * así que el mismo Γ da el mismo p, byte a byte. El p sale como fracción de enteros:
 * p = (1 + #{|estadístico permutado| ≥ |observado|}) / (1 + iteraciones), bilateral.
 *
 * Pareada (por cliente): diferencia de cada cliente entre periodos, inversión de signo al azar.
 * La unidad es el CLIENTE, no la transacción: diez facturas del mismo cliente no son diez
 * observaciones independientes, y contarlas así es justo el ruido presentado con seguridad.
 * Dos muestras (por transacción): para el ticket de una caja de público en general.
 */

/** mulberry32: pequeño, conocido y determinista. */
export function generador(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ResultadoDePrueba {
  /** Tamaño efectivo: clientes (pareada) o transacciones del grupo menor (dos muestras). */
  readonly n: number;
  readonly exitos: number;
  readonly iteraciones: number;
  /** Diferencia observada: suma (pareada) o diferencia de sumas escalada (dos muestras), como fracción. */
  readonly efecto: { readonly num: number; readonly den: number };
}

export function pruebaPareada(diferencias: readonly number[], iteraciones: number, semilla: number): ResultadoDePrueba {
  const azar = generador(semilla);
  const observado = Math.abs(diferencias.reduce((s, d) => s + d, 0));
  let exitos = 0;
  for (let i = 0; i < iteraciones; i++) {
    let s = 0;
    for (const d of diferencias) s += azar() < 0.5 ? -d : d;
    if (Math.abs(s) >= observado) exitos++;
  }
  return { n: diferencias.length, exitos, iteraciones, efecto: { num: diferencias.reduce((s, d) => s + d, 0), den: Math.max(diferencias.length, 1) } };
}

/** Diferencia de medias por permutación de etiquetas; el estadístico se compara en enteros (n_a · n_b · Δmedia). */
export function pruebaDosMuestras(a: readonly number[], b: readonly number[], iteraciones: number, semilla: number): ResultadoDePrueba {
  const azar = generador(semilla);
  const todos = [...a, ...b];
  const total = todos.reduce((s, x) => s + x, 0);
  const estadistico = (sumaB: number) => Math.abs(sumaB * a.length - (total - sumaB) * b.length);
  const observado = estadistico(b.reduce((s, x) => s + x, 0));
  const indices = todos.map((_, i) => i);
  let exitos = 0;
  for (let it = 0; it < iteraciones; it++) {
    for (let i = indices.length - 1; i > indices.length - 1 - b.length; i--) {
      const j = Math.floor(azar() * (i + 1));
      [indices[i], indices[j]] = [indices[j]!, indices[i]!];
    }
    let sumaB = 0;
    for (let i = indices.length - b.length; i < indices.length; i++) sumaB += todos[indices[i]!]!;
    if (estadistico(sumaB) >= observado) exitos++;
  }
  const sumaA = a.reduce((s, x) => s + x, 0);
  const sumaB = total - sumaA;
  return { n: Math.min(a.length, b.length), exitos, iteraciones, efecto: { num: sumaB * a.length - sumaA * b.length, den: Math.max(a.length * b.length, 1) } };
}
