/**
 * Prueba de no pérdida de un README reestructurado — núcleo puro.
 *
 * Método: multiconjunto de líneas normalizadas + subsecuencia común más larga (LCS).
 *   - conservada: la línea sigue, en el mismo orden relativo (está en la LCS);
 *   - movida: el mismo texto sigue, en otro sitio (fuera de la LCS, pero presente);
 *   - reescrita con motivo: ya no está tal cual y hay un motivo declarado para ESA línea;
 *   - borrada sin justificar: ya no está y nadie dijo por qué. Es el rojo.
 * Además, cifras: todo número del original tiene que seguir en el nuevo (multiconjunto). Las
 * cifras medidas se conservan tal cual; perder una es perder una medición.
 *
 * Normalizar es mínimo a propósito: espacios plegados y el nivel de encabezado fuera (subir un
 * `###` a `##` es mover estructura, no reescribir). Cualquier otro cambio de texto cuenta.
 */

/** La forma comparable de una línea: sin marcas de encabezado y con los espacios plegados. */
export const normalizaLinea = (l) => l.replace(/^#{1,6}\s+/, '').replace(/\s+/g, ' ').trim();

const lineas = (texto) => texto.split('\n')
  .map((l, i) => ({ n: i + 1, t: normalizaLinea(l) }))
  .filter((x) => x.t !== '');

/** Índices de A y de B que forman una subsecuencia común más larga. */
function lcs(a, b) {
  const m = b.length + 1;
  const t = new Uint32Array((a.length + 1) * m);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      t[i * m + j] = a[i] === b[j] ? t[(i + 1) * m + j + 1] + 1 : Math.max(t[(i + 1) * m + j], t[i * m + j + 1]);
    }
  }
  const enA = new Set();
  const enB = new Set();
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { enA.add(i); enB.add(j); i += 1; j += 1; }
    else if (t[(i + 1) * m + j] >= t[i * m + j + 1]) i += 1;
    else j += 1;
  }
  return { enA, enB };
}

const suma = (mapa, k, d) => mapa.set(k, (mapa.get(k) ?? 0) + d);

/** Multiconjunto de las cifras de un texto (enteros y decimales con coma o punto). */
export function cifras(texto) {
  const mapa = new Map();
  for (const m of texto.matchAll(/\d+(?:[.,]\d+)*/g)) suma(mapa, m[0], 1);
  return mapa;
}

/** Cifras del original que el nuevo tiene MENOS veces (con cuántas faltan). */
function cifrasPerdidas(antes, despues) {
  const a = cifras(antes);
  const d = cifras(despues);
  return [...a].filter(([k, n]) => (d.get(k) ?? 0) < n).map(([k, n]) => ({ cifra: k, faltan: n - (d.get(k) ?? 0) }));
}

/**
 * Compara el README de antes con el de después. `motivos` es [{ antes, motivo }]: el texto de
 * una línea original (se compara normalizado) y por qué ya no está tal cual.
 */
export function comparaNoPerdida(antes, despues, motivos = []) {
  const A = lineas(antes);
  const B = lineas(despues);
  const { enA, enB } = lcs(A.map((x) => x.t), B.map((x) => x.t));
  const restoB = new Map();
  B.forEach((x, j) => { if (!enB.has(j)) suma(restoB, x.t, 1); });
  const porMotivo = new Map(motivos.map((m) => [normalizaLinea(m.antes), m.motivo]));
  const r = { conservadas: [], movidas: [], reescritas: [], sinJustificar: [] };
  A.forEach((x, i) => {
    if (enA.has(i)) r.conservadas.push(x);
    else if ((restoB.get(x.t) ?? 0) > 0) { suma(restoB, x.t, -1); r.movidas.push(x); }
    else if (porMotivo.has(x.t)) r.reescritas.push({ ...x, motivo: porMotivo.get(x.t) });
    else r.sinJustificar.push(x);
  });
  const usados = new Set(r.reescritas.map((x) => x.t));
  const motivosSobrantes = [...porMotivo.keys()].filter((t) => !usados.has(t));
  const nuevas = B.filter((x, j) => !enB.has(j)).length - r.movidas.length;
  return {
    ...r,
    antes: A.length,
    despues: B.length,
    nuevas,
    motivosSobrantes,
    cifrasPerdidas: cifrasPerdidas(antes, despues),
  };
}
