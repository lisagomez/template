/**
 * Diarizacion en STREAMING: pone hablante a cada turno en cuanto se cierra, y se corrige a
 * si misma cuando la evidencia posterior la contradice.
 *
 * No es el algoritmo por lotes con un bucle alrededor. Por lotes se ven todos los turnos a
 * la vez y las etiquetas salen estables de una; aqui hay que decidir con lo que se lleva
 * oido, y lo que se dijo hace diez segundos puede resultar equivocado. Eso cambia la
 * promesa que se le hace a quien consume, y por eso esta promesa se dice ENTERA:
 *
 *   1. `turno`      — la etiqueta, ya. Con su `confianza` y marcada `provisional`.
 *   2. `correccion` — lo que dije antes estaba mal; estos turnos cambian de hablante.
 *   3. `firme`      — estos turnos salieron de la ventana: no los voy a tocar nunca mas.
 *
 * El tercero es el que falta en casi todas las implementaciones, y es el que una interfaz
 * necesita: sin el, o pintas todo en gris para siempre, o mientes diciendo que es definitivo.
 *
 * Y una correccion puede llegar TARDE: si dos hablantes se funden cuando los turnos del
 * absorbido ya salieron de la ventana, esos turnos se quedan con la etiqueta vieja y no hay
 * vuelta atras. No se disimula — se cuentan en `fuera`.
 *
 * Con un `registro` de voces conocidas hay un cuarto caso, que se dice con los mismos tres
 * eventos: un anonimo puede RESULTAR ser alguien con nombre cuando su centroide madura. Sale
 * como `correccion` con motivo `identificacion` — para la interfaz es lo mismo de siempre,
 * unos turnos ya pintados que cambian de etiqueta.
 *
 * Lo que NO hace: solape. Esto es el camino VAD (un turno, un vector, un hablante), con la
 * misma limitacion que `creaDiarizador`. Representar solape en vivo pide segmentacion por
 * marco sobre una ventana movil, que es otra herramienta y otra factura de computo.
 */

import { distanciaCoseno } from './agrupacion.js';
import type { RegistroHablantes } from './registro.js';
import type { DetectorVoz } from '../vad/detector.js';
import type { EventoVoz, ModeloHablante, Muestras, Turno } from '../types.js';

export interface OpcionesDiarizadorStreaming {
  modelo: ModeloHablante;
  /**
   * Distancia coseno por debajo de la cual un turno es de un hablante ya conocido. Mismo
   * mando que en el lote y con la misma advertencia: se calibra con `calibraUmbral` sobre
   * audio propio, no se hereda de un tutorial.
   */
  umbral?: number;
  /** Numero exacto de hablantes, si se conoce. Nunca se abre uno mas. */
  hablantes?: number;
  /** Techo cuando no se conoce la cifra. Evita que una sala ruidosa invente veinte personas. */
  hablantesMaximo?: number;
  /** Turnos mas cortos que esto salen SIN hablante: no hay senal para identificar a nadie. */
  msMinimo?: number;
  /**
   * Cuanto tiempo hacia atras se puede corregir. Es el mando que decide la promesa: con 0
   * nunca se rectifica (cada etiqueta nace firme), y cuanto mas alto, mas puede reescribirse
   * lo que el usuario ya leyo. Reescribir una hora de acta no es una mejora, es un susto.
   */
  msVentanaCorreccion?: number;
  /**
   * Cuanto tiene que mejorar la distancia para mover un turno de hablante. Es histeresis, la
   * misma idea que los dos umbrales del VAD: sin margen, dos centroides parecidos se roban
   * turnos en cada empuje y la interfaz parpadea.
   */
  margenCorreccion?: number;
  /**
   * Distancia por debajo de la cual dos hablantes eran el mismo desde el principio. Pasa
   * cuando un turno ruidoso abre a alguien que no existia; al acumular evidencia, los dos
   * centroides se juntan y hay que deshacer el error.
   */
  umbralFusion?: number;
  /**
   * Voces conocidas de otras sesiones. Con registro, quien se reconoce nace con su nombre en
   * vez de con un numero, y un anonimo puede pasar a tenerlo mas tarde (ver `identificacion`).
   *
   * Cuando el registro reconoce una voz, su respuesta manda sobre la continuidad de la
   * sesion. El porque esta en `asigna`, donde se decide.
   */
  registro?: RegistroHablantes;
}

export type EventoDiarizacion =
  | {
      tipo: 'turno';
      id: string;
      turno: Turno;
      /** 0 = la etiqueta no tiene respaldo · 1 = clavada. Ver `calculaConfianza`. */
      confianza: number;
      /** true mientras el turno siga dentro de la ventana. No significa "dudoso": eso es `confianza`. */
      provisional: boolean;
    }
  | {
      tipo: 'correccion';
      motivo: 'fusion' | 'reasignacion' | 'identificacion';
      cambios: Array<{ id: string; hablante: string }>;
      /** Turnos que llevaban la etiqueta corregida pero ya salieron de la ventana: se quedan mal. */
      fuera: number;
    }
  | { tipo: 'firme'; ids: string[] };

export interface DiarizadorStreaming {
  /** Consume un turno cerrado (con audio) y devuelve lo que haya pasado. No muta la entrada. */
  empuja(turno: Turno): Promise<EventoDiarizacion[]>;
  /** Da por firme todo lo que quedaba en la ventana. Se llama al acabar el flujo. */
  cierra(): Promise<EventoDiarizacion[]>;
  reinicia(): void;
  /** Cuantos hablantes distintos se llevan abiertos. */
  readonly hablantes: number;
}

interface Hablante {
  /** Nombre del registro, si esta voz se reconocio. `null` mientras siga siendo un anonimo. */
  nombre: string | null;
  /** Numero visible cuando NO hay nombre. NO se reutiliza tras una fusion: reciclar un numero
   *  que el usuario ya leyo es peor que dejar un hueco en la numeracion. */
  id: number;
  /** Suma de los vectores atribuidos. El centroide es esto normalizado. */
  suma: Float64Array;
  cuenta: number;
  /** Turnos que ahora mismo llevan esta etiqueta, dentro y fuera de la ventana. */
  etiquetados: number;
  centroide: Float32Array | null;
}

interface Reciente {
  id: string;
  vector: Float32Array;
  hablante: Hablante;
  finMs: number;
}

export function creaDiarizadorStreaming(opciones: OpcionesDiarizadorStreaming): DiarizadorStreaming {
  const { modelo, registro } = opciones;
  const umbral = opciones.umbral ?? 0.55;
  const msMinimo = opciones.msMinimo ?? 400;
  const msVentana = opciones.msVentanaCorreccion ?? 30_000;
  const margen = opciones.margenCorreccion ?? 0.1;
  const umbralFusion = opciones.umbralFusion ?? umbral * 0.75;
  const techo = opciones.hablantes ?? opciones.hablantesMaximo ?? 10;

  if (techo < 1) throw new Error('hacen falta al menos 1 hablante posible');
  if (msVentana < 0) throw new Error('msVentanaCorreccion no puede ser negativo');
  if (umbralFusion > umbral) {
    throw new Error('umbralFusion no puede superar a umbral: fundiria lo que acaba de separar');
  }

  let vivos: Hablante[] = [];
  let recientes: Reciente[] = [];
  let siguienteHablante = 1;
  let siguienteTurno = 1;
  let ahoraMs = 0;

  const etiqueta = (h: Hablante) => h.nombre ?? `Hablante ${h.id}`;

  function centroide(h: Hablante): Float32Array {
    if (h.centroide) return h.centroide;
    let norma = 0;
    for (let i = 0; i < h.suma.length; i++) norma += h.suma[i]! * h.suma[i]!;
    norma = Math.sqrt(norma) || 1;
    const v = new Float32Array(h.suma.length);
    for (let i = 0; i < h.suma.length; i++) v[i] = h.suma[i]! / norma;
    h.centroide = v;
    return v;
  }

  /** Suma o resta un vector del modelo de un hablante. Restar es lo que permite reasignar. */
  function acumula(h: Hablante, vector: Float32Array, signo: 1 | -1): void {
    for (let i = 0; i < vector.length; i++) h.suma[i] = h.suma[i]! + signo * vector[i]!;
    h.cuenta += signo;
    h.centroide = null;
  }

  function abre(dimension: number, nombre: string | null = null): Hablante {
    const h: Hablante = {
      nombre,
      // Quien nace con nombre no gasta numero anonimo. El hueco en la numeracion solo
      // significa algo cuando alguien llego a leerlo, y a Ana nadie la leyo como "Hablante 1".
      id: nombre === null ? siguienteHablante++ : 0,
      suma: new Float64Array(dimension),
      cuenta: 0,
      etiquetados: 0,
      centroide: null,
    };
    vivos.push(h);
    return h;
  }

  const porDistancia = (vector: Float32Array) =>
    vivos.map((h) => ({ h, d: distanciaCoseno(vector, centroide(h)) })).sort((a, b) => a.d - b.d);

  /**
   * A quien pertenece este vector, y cuanto respalda esa respuesta.
   *
   * La confianza es la PEOR de dos cosas: lo comodo que cabe dentro del umbral y lo que le
   * saca al segundo candidato. Una etiqueta comodisima con un rival pegado sigue siendo una
   * etiqueta que puede cambiar, y decir 0.9 de eso seria mentir.
   */
  function asigna(vector: Float32Array): { hablante: Hablante; confianza: number } {
    // El registro va PRIMERO cuando tiene respuesta, y es una decision con motivo.
    //
    // `identifica` solo contesta cuando la voz cabe holgada y ademas le saca margen a la
    // segunda candidata; cuando contesta, lo hace sobre un centroide que etiqueto un humano.
    // La continuidad de la sesion es un liston mas bajo —basta caer dentro del umbral del
    // hablante mas cercano, sin margen que valga— y por eso, con dos voces registradas que se
    // parecen, decidir por continuidad las fundiria en el primer turno: la segunda persona no
    // llegaria a abrirse nunca, y registrar a dos que suenan parecido es exactamente el caso
    // para el que existe registrar.
    //
    // Lo que este orden NO arregla, y hay que saberlo: alguien que NO esta registrado pero
    // cuya voz cae dentro del umbral de alguien que si lo esta se va a ir bajo su nombre. El
    // mando contra eso son `umbral` y `margen` del registro, y se calibran con `calibraUmbral`
    // sobre voces propias; heredarlos de un ejemplo es pedir que pase.
    if (registro) {
      const conocida = registro.identifica(vector);
      if (conocida) {
        const confianza = Math.min(1, Math.max(0, 1 - conocida.distancia / registro.umbral));
        // Un nombre identifica a UNA persona. Abrir un segundo "Ana" seria afirmar que Ana
        // estaba en dos sitios a la vez; si la atribucion resulta mala, `reasigna` tiene la
        // ventana entera para moverla, que es el mecanismo que ya existe para eso.
        const yaVivo = vivos.find((h) => h.nombre === conocida.nombre);
        if (yaVivo) return { hablante: yaVivo, confianza };
        if (vivos.length < techo) return { hablante: abre(vector.length, conocida.nombre), confianza };
      }
    }

    const orden = porDistancia(vector);
    const d1 = orden[0]?.d ?? Infinity;
    const d2 = orden[1]?.d ?? Infinity;

    if (orden[0] && d1 <= umbral) {
      const cabida = 1 - d1 / umbral;
      const margenSegundo = d2 === Infinity ? 1 : Math.min(1, (d2 - d1) / umbral);
      return { hablante: orden[0].h, confianza: Math.min(cabida, margenSegundo) };
    }
    if (vivos.length < techo) {
      // Nadie se le parece: es alguien nuevo. La confianza mide cuanto se aleja del mas
      // cercano, no lo que sabemos de el — que es nada, todavia.
      const confianza = d1 === Infinity ? 1 : Math.min(1, (d1 - umbral) / umbral);
      return { hablante: abre(vector.length), confianza };
    }
    // Techo alcanzado y no se parece a nadie. Se fuerza el mas cercano y se dice que la
    // asignacion no tiene respaldo: callarlo seria inventar que sabemos quien hablo.
    return { hablante: orden[0]!.h, confianza: 0 };
  }

  /**
   * El par vivo mas cercano, ya ordenado: `a` es quien sobrevive a la fusion.
   *
   * Dos voces con nombres DISTINTOS del registro no forman par, por muy juntos que acaben sus
   * centroides. El registro es evidencia que puso un humano sobre audio que sabia de quien
   * era; el centroide es evidencia que infirio la maquina con el audio de hoy. Cuando se
   * contradicen, fundir dejaria que la inferida borre a la etiquetada, y el acta se quedaria
   * con una persona donde habia dos sin que nadie lo pidiera. El precio de no fundir es
   * visible y barato: dos filas parecidas que alguien puede juntar mirandolas.
   */
  function parMasCercano(): { a: Hablante; b: Hablante; d: number } | null {
    let mejor: { a: Hablante; b: Hablante; d: number } | null = null;
    for (let i = 0; i < vivos.length; i++) {
      for (let j = i + 1; j < vivos.length; j++) {
        const x = vivos[i]!;
        const y = vivos[j]!;
        if (x.nombre !== null && y.nombre !== null && x.nombre !== y.nombre) continue;
        const d = distanciaCoseno(centroide(x), centroide(y));
        if (mejor !== null && d >= mejor.d) continue;
        // Sobrevive el que tiene nombre; entre dos anonimos, el que hablo primero.
        const a = x.nombre !== null ? x : y.nombre !== null ? y : x.id < y.id ? x : y;
        mejor = { a, b: a === x ? y : x, d };
      }
    }
    return mejor;
  }

  /** Funde los hablantes que resultaron ser el mismo. Sobrevive el que hablo primero. */
  function fusiona(): EventoDiarizacion[] {
    const eventos: EventoDiarizacion[] = [];
    for (let vuelta = vivos.length; vuelta > 0; vuelta--) {
      const par = parMasCercano();
      if (!par || par.d > umbralFusion) break;
      const { a, b } = par;
      for (let i = 0; i < b.suma.length; i++) a.suma[i] = a.suma[i]! + b.suma[i]!;
      a.cuenta += b.cuenta;
      a.etiquetados += b.etiquetados;
      a.centroide = null;
      vivos = vivos.filter((h) => h !== b);

      const cambios: Array<{ id: string; hablante: string }> = [];
      for (const r of recientes) {
        if (r.hablante !== b) continue;
        r.hablante = a;
        cambios.push({ id: r.id, hablante: etiqueta(a) });
      }
      eventos.push({
        tipo: 'correccion',
        motivo: 'fusion',
        cambios,
        fuera: Math.max(0, b.etiquetados - cambios.length),
      });
    }
    return eventos;
  }

  /** Revisa los turnos que aun se pueden corregir contra los centroides ya mejorados. */
  function reasigna(): EventoDiarizacion[] {
    const cambios: Array<{ id: string; hablante: string }> = [];
    for (const r of recientes) {
      const mejor = porDistancia(r.vector)[0];
      if (!mejor || mejor.h === r.hablante) continue;
      if (distanciaCoseno(r.vector, centroide(r.hablante)) - mejor.d <= margen) continue;
      acumula(r.hablante, r.vector, -1);
      r.hablante.etiquetados--;
      acumula(mejor.h, r.vector, 1);
      mejor.h.etiquetados++;
      r.hablante = mejor.h;
      cambios.push({ id: r.id, hablante: etiqueta(mejor.h) });
    }
    // Un hablante que se quedo sin un solo vector ya no modela nada: su centroide seria
    // ceros y ademas ocuparia una plaza del techo. Su numero NO se recicla.
    vivos = vivos.filter((h) => h.cuenta > 0 || h.etiquetados > 0);
    return cambios.length === 0 ? [] : [{ tipo: 'correccion', motivo: 'reasignacion', cambios, fuera: 0 }];
  }

  /**
   * Repasa a los anonimos contra el registro. Es la mitad que hace util el registro en vivo:
   * al abrirse, un hablante tiene UN vector y puede no parecerse a nadie; tres turnos despues
   * su centroide ya esta hecho, y entonces si.
   *
   * Sale como `correccion` y no como un evento nuevo a proposito. Para la interfaz esto es
   * exactamente lo mismo que una fusion —unos turnos ya pintados cambian de etiqueta— y
   * anadir un cuarto evento a la promesa obligaria a cada consumidor a tratar un caso mas
   * para pintar lo mismo. Lo que cambia es el `motivo`, que es donde se mira el porque.
   */
  function identificaConocidos(): EventoDiarizacion[] {
    if (!registro) return [];
    const eventos: EventoDiarizacion[] = [];
    for (const h of vivos) {
      if (h.nombre !== null || h.cuenta <= 0) continue;
      const conocida = registro.identifica(centroide(h));
      if (!conocida) continue;
      // Ese nombre ya tiene dueno vivo: dos "Ana" simultaneas son peor que un anonimo.
      if (vivos.some((otro) => otro.nombre === conocida.nombre)) continue;

      h.nombre = conocida.nombre;
      const cambios: Array<{ id: string; hablante: string }> = [];
      for (const r of recientes) if (r.hablante === h) cambios.push({ id: r.id, hablante: etiqueta(h) });
      eventos.push({
        tipo: 'correccion',
        motivo: 'identificacion',
        cambios,
        // Los turnos que ya salieron de la ventana se quedan con el numero para siempre. No
        // era una etiqueta falsa —solo anonima— pero el acta queda partida entre "Hablante 3"
        // y "Ana" siendo la misma persona, y eso se cuenta en vez de disimularlo.
        fuera: Math.max(0, h.etiquetados - cambios.length),
      });
    }
    return eventos;
  }

  /** Saca de la ventana lo que ya no se puede corregir y lo declara firme. */
  function poda(): EventoDiarizacion[] {
    const limite = ahoraMs - msVentana;
    const salen = recientes.filter((r) => r.finMs < limite);
    if (salen.length === 0) return [];
    recientes = recientes.filter((r) => r.finMs >= limite);
    return [{ tipo: 'firme', ids: salen.map((r) => r.id) }];
  }

  return {
    get hablantes() {
      return vivos.length;
    },

    async empuja(turno: Turno): Promise<EventoDiarizacion[]> {
      if (!turno.audio) {
        throw new Error('el turno no lleva audio: crea el detector con conservaAudio para poder diarizar');
      }
      const id = `t${siguienteTurno++}`;
      ahoraMs = Math.max(ahoraMs, turno.finMs);

      // Un turno corto no se embebe: su vector es ruido y, peor que salir sin etiqueta,
      // envenenaria el centroide del hablante al que se sumara.
      if (turno.finMs - turno.inicioMs < msMinimo) {
        return [{ tipo: 'turno', id, turno: { ...turno }, confianza: 0, provisional: false }, ...poda()];
      }

      const vector = await modelo.vector(turno.audio);
      const { hablante, confianza } = asigna(vector);
      acumula(hablante, vector, 1);
      hablante.etiquetados++;
      if (msVentana > 0) recientes.push({ id, vector, hablante, finMs: turno.finMs });

      // La ventana se poda ANTES de corregir, con el reloj ya actualizado. Al reves, un
      // turno que acaba de salir de la ventana se llevaria una correccion de regalo y la
      // promesa de `firme` —"esto ya no lo toco"— seria mentira justo en el ultimo tramo.
      return [
        { tipo: 'turno', id, turno: { ...turno, hablante: etiqueta(hablante) }, confianza, provisional: msVentana > 0 },
        ...poda(),
        ...fusiona(),
        ...reasigna(),
        // Al final: fundir y reasignar son justo lo que mueve los centroides, y preguntarle
        // al registro antes seria preguntarle sobre una evidencia que estaba a punto de cambiar.
        ...identificaConocidos(),
      ];
    },

    async cierra(): Promise<EventoDiarizacion[]> {
      const ids = recientes.map((r) => r.id);
      recientes = [];
      return ids.length === 0 ? [] : [{ tipo: 'firme', ids }];
    },

    /**
     * Olvida la SESION, no las voces: el registro es de quien llama y sobrevive entero. Es
     * justo lo que se quiere entre dos reuniones — la numeracion anonima vuelve a empezar y
     * Ana sigue siendo Ana.
     */
    reinicia() {
      vivos = [];
      recientes = [];
      siguienteHablante = 1;
      siguienteTurno = 1;
      ahoraMs = 0;
    },
  };
}

export interface OpcionesDiarizadorEnVivo extends OpcionesDiarizadorStreaming {
  /** Creado con `conservaAudio: true`; sin audio no hay a quien identificar. */
  detector: DetectorVoz;
}

export interface DiarizadorEnVivo {
  /**
   * Devuelve las dos corrientes por separado en vez de mezclarlas: `voz` sirve para reaccionar
   * YA (parar al bot en `inicioHabla`) y `diarizacion` llega mas tarde, cuando el turno cierra.
   * Confundirlas es prometer un hablante en tiempo real que nadie puede dar.
   */
  procesa(entrada: Muestras): Promise<{ voz: EventoVoz[]; diarizacion: EventoDiarizacion[] }>;
  cierra(): Promise<{ voz: EventoVoz[]; diarizacion: EventoDiarizacion[] }>;
  reinicia(): void;
  readonly hablantes: number;
}

/** Cablea un detector de voz con el diarizador en streaming. Es el uso normal de los dos. */
export function creaDiarizadorEnVivo(opciones: OpcionesDiarizadorEnVivo): DiarizadorEnVivo {
  const { detector, ...resto } = opciones;
  const diarizador = creaDiarizadorStreaming(resto);

  async function reparte(voz: EventoVoz[]) {
    const diarizacion: EventoDiarizacion[] = [];
    for (const evento of voz) {
      if (evento.tipo === 'finHabla') diarizacion.push(...(await diarizador.empuja(evento.turno)));
    }
    return { voz, diarizacion };
  }

  return {
    get hablantes() {
      return diarizador.hablantes;
    },
    async procesa(entrada) {
      return reparte(await detector.procesa(entrada));
    },
    async cierra() {
      const { voz, diarizacion } = await reparte(await detector.cierra());
      return { voz, diarizacion: [...diarizacion, ...(await diarizador.cierra())] };
    },
    reinicia() {
      detector.reinicia();
      diarizador.reinicia();
    },
  };
}
