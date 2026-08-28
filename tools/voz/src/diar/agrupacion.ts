/**
 * Agrupamiento aglomerativo sobre vectores de hablante. TypeScript puro.
 *
 * La diarizacion por lotes se reduce a esto: cada turno se convierte en un vector, y los
 * vectores parecidos son la misma persona. Se usa enlace PROMEDIO y distancia coseno
 * porque es lo que aguanta mejor turnos de duracion muy desigual — con enlace simple, un
 * unico turno ruidoso encadena dos hablantes distintos en un solo grupo, y ese fallo es
 * silencioso: sale un acta donde dos personas hablan con la misma voz.
 */

export interface OpcionesAgrupar {
  /**
   * Distancia coseno por encima de la cual dos grupos NO se funden. Es el mando principal:
   * bajarlo parte hablantes en dos, subirlo los funde. El valor por defecto es un punto de
   * partida razonable, NO una constante universal: depende del modelo de embeddings y hay
   * que calibrarlo con audio real (ver `calibraUmbral`).
   */
  umbral?: number;
  /**
   * Numero exacto de hablantes, si se conoce. Cuando se da, manda sobre `umbral`: se funde
   * hasta llegar a esa cifra. Saber "son dos" es la informacion mas barata y mas util que
   * puede aportar quien llama.
   */
  hablantes?: number;
}

/** Distancia coseno entre dos vectores. 0 = identicos, 1 = ortogonales, 2 = opuestos. */
export function distanciaCoseno(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new Error('vectores de distinta dimension');
  let punto = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    punto += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 1 : 1 - punto / denom;
}

/**
 * Agrupa vectores y devuelve, para cada uno, el indice de su grupo.
 *
 * O(n^3) en el peor caso. Para diarizacion es de sobra: los turnos de una reunion de una
 * hora se cuentan por cientos, no por millones. Si algun dia llegan miles, el remedio es
 * agrupar por ventanas, no optimizar esto.
 */
export function agrupa(vectores: readonly Float32Array[], opciones: OpcionesAgrupar = {}): number[] {
  const umbral = opciones.umbral ?? 0.55;
  const objetivo = opciones.hablantes;
  const n = vectores.length;
  if (n === 0) return [];
  if (n === 1) return [0];

  // Cada elemento arranca en su propio grupo.
  let grupos: number[][] = vectores.map((_, i) => [i]);

  const distanciaEntre = (a: readonly number[], b: readonly number[]): number => {
    let suma = 0;
    for (const i of a) for (const j of b) suma += distanciaCoseno(vectores[i]!, vectores[j]!);
    return suma / (a.length * b.length);
  };

  for (;;) {
    if (objetivo !== undefined && grupos.length <= Math.max(1, objetivo)) break;
    if (grupos.length === 1) break;

    let mejorA = -1;
    let mejorB = -1;
    let mejorD = Infinity;
    for (let i = 0; i < grupos.length; i++) {
      for (let j = i + 1; j < grupos.length; j++) {
        const d = distanciaEntre(grupos[i]!, grupos[j]!);
        if (d < mejorD) {
          mejorD = d;
          mejorA = i;
          mejorB = j;
        }
      }
    }
    // Sin numero de hablantes fijado, el umbral es quien decide cuando parar.
    if (objetivo === undefined && mejorD > umbral) break;
    if (mejorA < 0 || mejorB < 0) break;

    const fundido = [...grupos[mejorA]!, ...grupos[mejorB]!];
    grupos = grupos.filter((_, k) => k !== mejorA && k !== mejorB);
    grupos.push(fundido);
  }

  // Se numeran por orden de primera aparicion: asi "Hablante 1" es siempre quien hablo
  // primero, y dos corridas sobre el mismo audio dan las mismas etiquetas.
  const orden = grupos
    .map((g) => ({ g, primero: Math.min(...g) }))
    .sort((x, y) => x.primero - y.primero);
  const etiquetas = new Array<number>(n).fill(0);
  orden.forEach(({ g }, indice) => {
    for (const i of g) etiquetas[i] = indice;
  });
  return etiquetas;
}

/**
 * Busca el umbral que reproduce un etiquetado conocido.
 *
 * Esto es lo que convierte "elige un umbral" en algo medible: se le da audio ya etiquetado
 * a mano y devuelve el umbral que mas acierta, con su tasa. Sin esto, el umbral es
 * superstici­on heredada de un tutorial.
 */
export function calibraUmbral(
  vectores: readonly Float32Array[],
  etiquetasReales: readonly (string | number)[],
  candidatos: readonly number[] = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8],
): { umbral: number; acierto: number } {
  let mejor = { umbral: candidatos[0] ?? 0.55, acierto: -1 };
  for (const umbral of candidatos) {
    const obtenidas = agrupa(vectores, { umbral });
    // Se compara por PARES: dos turnos del mismo hablante deben caer juntos, y dos de
    // hablantes distintos, separados. Comparar etiquetas una a una no vale, porque los
    // nombres de grupo son arbitrarios.
    let aciertos = 0;
    let total = 0;
    for (let i = 0; i < vectores.length; i++) {
      for (let j = i + 1; j < vectores.length; j++) {
        const mismoReal = etiquetasReales[i] === etiquetasReales[j];
        const mismoObtenido = obtenidas[i] === obtenidas[j];
        if (mismoReal === mismoObtenido) aciertos++;
        total++;
      }
    }
    const acierto = total === 0 ? 0 : aciertos / total;
    if (acierto > mejor.acierto) mejor = { umbral, acierto };
  }
  return mejor;
}
