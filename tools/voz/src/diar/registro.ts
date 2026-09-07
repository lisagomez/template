/**
 * Identidad PERSISTENTE: voces con nombre propio, que sobreviven a la sesion.
 *
 * Hasta aqui la herramienta era anonima por diseno. "Hablante 1" significa "quien hablo
 * primero", y manana, en la reunion siguiente, volvera a ser "Hablante 1" aunque sea otra
 * persona. Para un acta basta; para cualquier cosa que quiera ACUMULAR —cuanto habla cada
 * uno a lo largo del trimestre, quien pregunto ya esto el mes pasado, o simplemente poner
 * "Ana" donde pone "Hablante 2"— no basta, y no por falta de precision: es que la etiqueta
 * anonima no se refiere a nadie fuera de su propia sesion.
 *
 * Cruzar esa linea no pide un modelo nuevo. Son los MISMOS vectores del `ModeloHablante`
 * que ya se usan para diarizar, guardados junto a un nombre que un humano puso una vez. El
 * registro es esa memoria, y es TypeScript puro como el resto del nucleo: se exporta a JSON
 * plano, lo guarda donde quiera quien llama —un fichero, una fila, `localStorage`— y se
 * vuelve a cargar manana.
 *
 * ## Las tres cosas que NO hace, y son deliberadas
 *
 * 1. **No aprende solo.** Nada de aqui se alimenta de su propia salida. Reforzar una voz con
 *    los turnos que uno mismo etiqueto es realimentacion positiva: el turno de Luis que se
 *    identifico mal como Ana arrastraria el centroide de Ana hacia Luis, y el siguiente
 *    error seria mas probable que el anterior. La deriva no avisa — solo se nota cuando el
 *    acta ya lleva semanas mintiendo. Anadir evidencia es una llamada explicita a
 *    `registra`, con vectores que quien llama eligio.
 *
 * 2. **No decide cuando duda.** Si dos voces registradas quedan casi a la misma distancia,
 *    devuelve `null` en vez de la mas cercana por poco. Un turno que sale como "Hablante 3"
 *    se arregla mirandolo; un turno que sale como "Ana" cuando era Luis no se arregla, porque
 *    nadie va a ir a comprobarlo. Es el mismo principio que la `confianza` del streaming:
 *    decir "no lo se" es una respuesta, y decir un nombre a cara o cruz no lo es.
 *
 * 3. **No adivina de que modelo salio un vector.** Un registro creado con un modelo de
 *    embeddings e importado con otro no da error por si solo: da nombres mal puestos, en
 *    silencio, que es exactamente el fallo contra el que avisa el README. Por eso se le puede
 *    poner etiqueta al modelo, y entonces importar con otra falla. Sin etiqueta no hay
 *    proteccion posible: los vectores no se acuerdan de donde vienen.
 */

import { distanciaCoseno } from './agrupacion.js';

/**
 * Nombres que el registro NO acepta, porque ya significan otra cosa: son los que pone la
 * numeracion anonima. Registrar a alguien como "Hablante 2" haria que el usuario leyera la
 * misma etiqueta para una voz conocida y para la segunda persona que hablo hoy.
 */
const FORMA_ANONIMA = /^hablante\s+\d+$/i;

export interface OpcionesRegistro {
  /**
   * Distancia coseno por debajo de la cual un vector ES esa voz registrada.
   *
   * NO es el umbral de agrupamiento y no se hereda de el: son preguntas distintas. Aquel
   * responde "¿estos dos turnos son la misma persona?" —mismo microfono, misma sala, mismos
   * cinco minutos—; este responde "¿esta voz es la de quien registre, quiza otro dia y con
   * otro cacharro?", que es mas dificil. El defecto es mas ESTRICTO a proposito, porque los
   * dos errores no cuestan lo mismo: no reconocer a Ana deja un "Hablante 3" que se corrige
   * mirandolo, y llamar Ana a Luis se queda en el acta. Calibralo con `calibraUmbral` sobre
   * voces tuyas: aqui tambien, el numero heredado de un tutorial es supersticion.
   */
  umbral?: number;
  /**
   * Cuanto tiene que ganarle la mejor candidata a la segunda para que se decida. Con dos
   * hermanos registrados, sus centroides estan cerca y el ganador cambia con el ruido de
   * cada turno; sin margen, el acta los alterna sola.
   */
  margen?: number;
  /**
   * Etiqueta libre del modelo de embeddings con el que se hicieron estos vectores, p. ej.
   * `'pyannote/embedding@sha256:...'`. Viaja en la exportacion y se compara al importar.
   */
  modelo?: string;
}

/** Una voz conocida: su nombre, su centroide y cuanta evidencia lo sostiene. */
export interface VozConocida {
  readonly nombre: string;
  readonly centroide: Float32Array;
  readonly muestras: number;
}

/** Forma serializable del registro. JSON plano a proposito: lo guarda quien llama, donde quiera. */
export interface RegistroSerializado {
  version: 1;
  /** La etiqueta del modelo, si se declaro. Sin ella no hay como detectar un cambio de modelo. */
  modelo?: string;
  dimension: number;
  voces: Array<{ nombre: string; centroide: number[]; muestras: number }>;
}

export interface RegistroHablantes {
  /**
   * Anade evidencia de una voz. Llamarlo dos veces con el mismo nombre ACUMULA: el centroide
   * se recalcula con todo lo que se lleva dado, no se sustituye por lo ultimo.
   *
   * Los vectores los elige quien llama, y esa es la parte importante: deben salir de audio
   * que se sabe de esa persona, no de lo que la herramienta creyo entender. Ver el punto 1
   * de la cabecera.
   */
  registra(nombre: string, vectores: readonly Float32Array[]): void;
  /**
   * A quien pertenece este vector, o `null` si no hay respuesta defendible: nadie lo bastante
   * cerca, o dos igual de cerca. `null` no es un fallo, es la respuesta honesta.
   */
  identifica(vector: Float32Array): { nombre: string; distancia: number } | null;
  /** Borra una voz. Devuelve si existia. */
  olvida(nombre: string): boolean;
  /** Las voces conocidas, en orden de registro. */
  readonly voces: readonly VozConocida[];
  /** Dimension de los vectores, fijada por el primer registro. `null` si esta vacio. */
  readonly dimension: number | null;
  /**
   * El umbral con el que decide. Se expone porque quien consulta el registro necesita
   * convertir una distancia en confianza, y sin la escala un 0.3 no dice nada: puede ser
   * comodo o estar al borde, segun donde este el corte.
   */
  readonly umbral: number;
  exporta(): RegistroSerializado;
}

interface Entrada {
  nombre: string;
  /** Suma de los vectores registrados. El centroide es esto normalizado. */
  suma: Float64Array;
  muestras: number;
  centroide: Float32Array | null;
}

function normaliza(suma: Float64Array): Float32Array {
  let norma = 0;
  for (let i = 0; i < suma.length; i++) norma += suma[i]! * suma[i]!;
  norma = Math.sqrt(norma) || 1;
  const v = new Float32Array(suma.length);
  for (let i = 0; i < suma.length; i++) v[i] = suma[i]! / norma;
  return v;
}

/** El registro de verdad. Lo comparten el constructor vacio y el que importa. */
function construye(
  entradas: Map<string, Entrada>,
  dimensionInicial: number | null,
  opciones: OpcionesRegistro,
): RegistroHablantes {
  const umbral = opciones.umbral ?? 0.45;
  const margen = opciones.margen ?? 0.1;
  const modelo = opciones.modelo;

  if (umbral <= 0) throw new Error('el umbral del registro tiene que ser positivo');
  if (margen < 0) throw new Error('el margen del registro no puede ser negativo');

  let dimension = dimensionInicial;
  const centroide = (e: Entrada): Float32Array => (e.centroide ??= normaliza(e.suma));

  return {
    umbral,

    get dimension() {
      return dimension;
    },

    get voces(): readonly VozConocida[] {
      return [...entradas.values()].map((e) => ({
        nombre: e.nombre,
        centroide: centroide(e),
        muestras: e.muestras,
      }));
    },

    registra(nombre: string, vectores: readonly Float32Array[]): void {
      const limpio = nombre.trim();
      if (!limpio) throw new Error('una voz registrada necesita un nombre');
      if (FORMA_ANONIMA.test(limpio)) {
        throw new Error(
          `"${limpio}" tiene la forma de una etiqueta anonima: chocaria con la numeracion que ` +
            'pone la diarizacion y el usuario leeria el mismo nombre para dos personas',
        );
      }
      if (vectores.length === 0) throw new Error(`no se puede registrar "${limpio}" sin vectores`);

      for (const vector of vectores) {
        dimension ??= vector.length;
        if (vector.length !== dimension) {
          throw new Error(
            `vector de dimension ${vector.length} en un registro de ${dimension}: son de modelos ` +
              'distintos y mezclarlos da nombres mal puestos, no un error',
          );
        }
      }

      const entrada: Entrada = entradas.get(limpio) ?? {
        nombre: limpio,
        suma: new Float64Array(dimension!),
        muestras: 0,
        centroide: null,
      };
      for (const vector of vectores) {
        for (let i = 0; i < vector.length; i++) entrada.suma[i] = entrada.suma[i]! + vector[i]!;
      }
      entrada.muestras += vectores.length;
      entrada.centroide = null;
      entradas.set(limpio, entrada);
    },

    identifica(vector: Float32Array): { nombre: string; distancia: number } | null {
      if (entradas.size === 0) return null;
      if (dimension !== null && vector.length !== dimension) {
        throw new Error(
          `vector de dimension ${vector.length} contra un registro de ${dimension}: el modelo de ` +
            'embeddings no es el mismo con el que se registraron estas voces',
        );
      }

      const orden = [...entradas.values()]
        .map((e) => ({ nombre: e.nombre, distancia: distanciaCoseno(vector, centroide(e)) }))
        .sort((a, b) => a.distancia - b.distancia);

      const mejor = orden[0]!;
      if (mejor.distancia > umbral) return null;
      // Dos voces registradas a la misma distancia no se resuelven a cara o cruz: quien las
      // registro sabe que existen las dos, y prefiere un anonimo a un nombre inventado.
      const segunda = orden[1];
      if (segunda && segunda.distancia - mejor.distancia < margen) return null;
      return mejor;
    },

    olvida(nombre: string): boolean {
      return entradas.delete(nombre.trim());
    },

    exporta(): RegistroSerializado {
      return {
        version: 1,
        ...(modelo === undefined ? {} : { modelo }),
        dimension: dimension ?? 0,
        voces: [...entradas.values()].map((e) => ({
          nombre: e.nombre,
          centroide: [...centroide(e)],
          muestras: e.muestras,
        })),
      };
    },
  };
}

/** Un registro vacio. Se llena con `registra` o se carga con `importaRegistro`. */
export function creaRegistroHablantes(opciones: OpcionesRegistro = {}): RegistroHablantes {
  return construye(new Map(), null, opciones);
}

/**
 * Reconstruye un registro exportado. Es la mitad que hace que "persistente" signifique algo:
 * sin esto, cada sesion vuelve a empezar en "Hablante 1".
 *
 * Si el registro guardado declara un modelo y quien importa declara otro, falla aqui. Es
 * preferible a lo que pasaria si no fallara: los vectores de otro modelo viven en otro
 * espacio, las distancias salen plausibles —nunca absurdas— y el resultado es un acta con
 * nombres mal puestos que nadie va a sospechar.
 *
 * Lo que el viaje de ida y vuelta PIERDE, y conviene saberlo: se guarda el centroide, no los
 * vectores que lo formaron. La media se conserva exacta; la dispersion no vuelve. La cuenta
 * de muestras si viaja, y para lo que sirve es para que anadir evidencia despues pese lo que
 * debe — un vector nuevo sobre una voz de diez muestras cuenta un onceavo, no la mitad.
 */
export function importaRegistro(
  datos: RegistroSerializado,
  opciones: OpcionesRegistro = {},
): RegistroHablantes {
  if (datos.version !== 1) throw new Error(`registro de version ${datos.version}: esta version lee la 1`);
  if (datos.modelo !== undefined && opciones.modelo !== undefined && datos.modelo !== opciones.modelo) {
    throw new Error(
      `el registro se hizo con "${datos.modelo}" y se esta importando como "${opciones.modelo}": ` +
        'los vectores de dos modelos no son comparables y las distancias saldrian plausibles pero falsas',
    );
  }

  const entradas = new Map<string, Entrada>();
  for (const voz of datos.voces) {
    if (voz.centroide.length !== datos.dimension) {
      throw new Error(
        `la voz "${voz.nombre}" tiene dimension ${voz.centroide.length} y el registro declara ${datos.dimension}`,
      );
    }
    if (voz.muestras < 1) throw new Error(`la voz "${voz.nombre}" dice tener ${voz.muestras} muestras`);
    // La suma se reconstruye como centroide x muestras: normalizada vuelve a dar el mismo
    // centroide, y ademas conserva el PESO, que es lo que decide cuanto mueve un vector nuevo.
    const suma = new Float64Array(datos.dimension);
    for (let i = 0; i < suma.length; i++) suma[i] = voz.centroide[i]! * voz.muestras;
    entradas.set(voz.nombre, { nombre: voz.nombre, suma, muestras: voz.muestras, centroide: null });
  }

  return construye(entradas, datos.dimension || null, { ...opciones, modelo: opciones.modelo ?? datos.modelo });
}
