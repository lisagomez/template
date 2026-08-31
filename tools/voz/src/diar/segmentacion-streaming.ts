/**
 * Segmentacion PyanNet en STREAMING: entrega turnos cerrados que PUEDEN pisarse, segun va
 * entrando el audio.
 *
 * Es la pieza que le faltaba al camino en vivo. `creaDiarizadorStreaming` ya resuelve la
 * identidad global —quien es cada quien, corrigiendose hacia atras— y lo hace sin saber de
 * donde salen los turnos. El solape nunca fue un problema de identidad: es un problema de
 * FUENTE. El VAD entrega un turno cada vez porque no puede hacer otra cosa; PyanNet ve
 * actividad por marco y por hablante, y de ahi salen turnos simultaneos.
 *
 * Asi que aqui no se reimplementa nada de aquello: se produce la corriente de turnos que
 * aquello ya sabe consumir.
 *
 * ## Las dos capas de identidad, que no son la misma
 *
 * Las etiquetas de PyanNet son LOCALES a la ventana: el hablante 0 de una ventana no tiene
 * por que ser el 0 de la siguiente. Coserlas pide identidad, y es tentador pensar que es la
 * misma que la global. No lo es, y mezclarlas da un sistema peor:
 *
 *   pista    — continuidad local, vive segundos. "Esta voz de la ventana 7 es la misma que
 *              venia sonando en la 6". Se cierra en cuanto calla, y su numero no significa
 *              nada fuera de aqui.
 *   hablante — identidad de la sesion entera, vive lo que dure la reunion. La pone
 *              `creaDiarizadorStreaming` sobre los turnos ya cerrados, con su ventana de
 *              correccion, sus fusiones y su `firme`.
 *
 * Una pista no es un hablante: la misma persona que habla, calla treinta segundos y vuelve
 * genera DOS pistas, y es la capa de arriba la que las vuelve a juntar bajo una etiqueta.
 * Intentar que la pista dure toda la sesion es rehacer la capa de arriba, peor y por
 * duplicado.
 *
 * ## La latencia es otra, y hay que decirlo
 *
 * El VAD cierra un turno cuando oye el silencio: ~300 ms. Aqui hace falta que el modelo haya
 * visto la ventana entera, y las ventanas avanzan a saltos. Con los 10 s de pyannote 3.0 y
 * medio solape, el salto es de 5 s: **un turno no puede cerrarse antes de eso**. No es un
 * defecto que se pueda ajustar, es lo que cuesta ver el solape. Quien necesite reaccion
 * inmediata —parar al bot cuando alguien interrumpe— sigue necesitando un VAD en paralelo:
 * son dos preguntas distintas y solo una de las dos es barata.
 */

import { distanciaCoseno } from './agrupacion.js';
import { creaDiarizadorStreaming, type EventoDiarizacion, type OpcionesDiarizadorStreaming } from './streaming.js';
import type { ModeloHablante, ModeloSegmentacion, Muestras, Turno } from '../types.js';

export interface OpcionesSegmentadorStreaming {
  segmentacion: ModeloSegmentacion;
  hablante: ModeloHablante;
  /** Fraccion de solape entre ventanas consecutivas. Mas solape = mas computo y menos salto. */
  solape?: number;
  /** Actividad por encima de la cual un hablante local esta hablando. */
  umbralActividad?: number;
  /** Un hablante local con menos de esto en la ventana se ignora: no hay con que embeber. */
  msMinimoLocal?: number;
  /** Silencio que cierra una pista. Huecos mas cortos no la parten: alguien respira. */
  msHuecoMaximo?: number;
  /** Turnos mas cortos que esto no se emiten. */
  msMinimoTurno?: number;
  /**
   * Distancia coseno por debajo de la cual un hablante local CONTINUA una pista abierta.
   * Es deliberadamente mas laxo que el umbral de la capa global: aqui solo se decide
   * continuidad a segundos vista, y equivocarse cuesta un turno partido —que la capa de
   * arriba vuelve a unir— en vez de una identidad mal puesta en el acta.
   */
  umbralPista?: number;
}

/** Continuidad local. Vive mientras la voz suene; su numero no sale de este archivo. */
interface Pista {
  inicioMs: number;
  finMs: number;
  suma: Float64Array;
  cuenta: number;
  centroide: Float32Array | null;
}

export interface SegmentadorStreaming {
  /** Consume audio y devuelve los turnos que hayan CERRADO. Pueden solaparse entre si. */
  procesa(muestras: Muestras): Promise<Turno[]>;
  /** Cierra las pistas abiertas con lo que se haya oido. Se llama al acabar el flujo. */
  cierra(): Promise<Turno[]>;
  reinicia(): void;
  /** Cuantas pistas suenan ahora mismo. Util para depurar, no para etiquetar. */
  readonly pistasAbiertas: number;
}

export function creaSegmentadorStreaming(
  opciones: OpcionesSegmentadorStreaming,
): SegmentadorStreaming {
  const { segmentacion, hablante } = opciones;
  const solape = opciones.solape ?? 0.5;
  const umbralActividad = opciones.umbralActividad ?? 0.5;
  const msMinimoLocal = opciones.msMinimoLocal ?? 500;
  const msHuecoMaximo = opciones.msHuecoMaximo ?? 250;
  const msMinimoTurno = opciones.msMinimoTurno ?? 200;
  const umbralPista = opciones.umbralPista ?? 0.7;

  if (solape < 0 || solape >= 1) throw new Error('solape debe estar en [0, 1)');

  const hz = segmentacion.frecuenciaHz;
  const ventana = segmentacion.muestrasVentana;
  const salto = Math.max(1, Math.round(ventana * (1 - solape)));
  const msDe = (muestras: number) => (muestras / hz) * 1000;

  /** Audio retenido, y la posicion ABSOLUTA de su primera muestra. */
  let buffer = new Float32Array(0);
  let offset = 0;
  /** Comienzo absoluto de la proxima ventana a analizar. */
  let proxima = 0;
  let pistas: Pista[] = [];

  function centroide(p: Pista): Float32Array {
    if (p.centroide) return p.centroide;
    let norma = 0;
    for (let i = 0; i < p.suma.length; i++) norma += p.suma[i]! * p.suma[i]!;
    norma = Math.sqrt(norma) || 1;
    const v = new Float32Array(p.suma.length);
    for (let i = 0; i < p.suma.length; i++) v[i] = p.suma[i]! / norma;
    p.centroide = v;
    return v;
  }

  /** Corta del buffer retenido el tramo absoluto pedido. Fuera de lo retenido, se recorta. */
  function audioEntre(desdeMuestra: number, hastaMuestra: number): Muestras {
    const a = Math.max(0, desdeMuestra - offset);
    const b = Math.max(a, Math.min(buffer.length, hastaMuestra - offset));
    return buffer.slice(a, b);
  }

  function cierraPista(p: Pista): Turno | null {
    if (p.finMs - p.inicioMs < msMinimoTurno) return null;
    return {
      inicioMs: p.inicioMs,
      finMs: p.finMs,
      audio: audioEntre(Math.round((p.inicioMs / 1000) * hz), Math.round((p.finMs / 1000) * hz)),
    };
  }

  /**
   * Suelta el audio que ya no puede pedir nadie: ni una ventana futura ni una pista abierta.
   * Sin esto, una reunion de dos horas se guarda entera en memoria por si acaso.
   */
  function recorta(): void {
    let minimo = proxima;
    for (const p of pistas) minimo = Math.min(minimo, Math.round((p.inicioMs / 1000) * hz));
    const corte = Math.max(0, minimo - offset);
    if (corte <= 0) return;
    buffer = buffer.slice(corte);
    offset += corte;
  }

  async function analizaVentana(inicio: number): Promise<Turno[]> {
    const trozo = audioEntre(inicio, inicio + ventana);
    const actividad = await segmentacion.ventana(trozo);
    const marcos = actividad.length;
    if (marcos === 0) return [];

    const muestrasPorMarco = ventana / marcos;
    const msPorMarco = msDe(muestrasPorMarco);
    const muestrasMinimo = (msMinimoLocal / 1000) * hz;

    // Cuantos hablantes suenan en cada marco: hace falta para quedarse con el audio LIMPIO.
    // Un embedding sacado de habla solapada mezcla dos voces, y aqui ese error no se queda
    // en el vector — parte o funde pistas, que es como se rompe el cosido entre ventanas.
    const simultaneos = actividad.map((marco) =>
      marco.reduce((n, v) => n + (v > umbralActividad ? 1 : 0), 0),
    );

    for (let k = 0; k < segmentacion.hablantesLocales; k++) {
      const exclusivos: number[] = [];
      const todos: number[] = [];
      for (let m = 0; m < marcos; m++) {
        if ((actividad[m]![k] ?? 0) <= umbralActividad) continue;
        todos.push(m);
        if (simultaneos[m] === 1) exclusivos.push(m);
      }
      if (todos.length * muestrasPorMarco < muestrasMinimo) continue;

      const usados = exclusivos.length * muestrasPorMarco >= muestrasMinimo ? exclusivos : todos;
      const paso = Math.floor(muestrasPorMarco);
      const audio = new Float32Array(usados.length * paso);
      usados.forEach((m, i) => {
        const desde = inicio + Math.round(m * muestrasPorMarco);
        audio.set(audioEntre(desde, desde + paso), i * paso);
      });
      const vector = await hablante.vector(audio);

      const inicioMs = msDe(inicio) + todos[0]! * msPorMarco;
      const finMs = msDe(inicio) + (todos[todos.length - 1]! + 1) * msPorMarco;

      // Solo son candidatas las pistas que siguen sonando: sin la puerta temporal, una voz
      // parecida de hace un minuto se lleva el tramo y el turno sale con un hueco enorme.
      const candidatas = pistas.filter((p) => p.finMs >= inicioMs - msHuecoMaximo);
      let mejor: { p: Pista; d: number } | null = null;
      for (const p of candidatas) {
        const d = distanciaCoseno(vector, centroide(p));
        if (!mejor || d < mejor.d) mejor = { p, d };
      }

      if (mejor && mejor.d <= umbralPista) {
        const p = mejor.p;
        p.inicioMs = Math.min(p.inicioMs, inicioMs);
        p.finMs = Math.max(p.finMs, finMs);
        for (let i = 0; i < vector.length; i++) p.suma[i] = p.suma[i]! + vector[i]!;
        p.cuenta++;
        p.centroide = null;
      } else {
        const suma = new Float64Array(vector.length);
        for (let i = 0; i < vector.length; i++) suma[i] = vector[i]!;
        pistas.push({ inicioMs, finMs, suma, cuenta: 1, centroide: null });
      }
    }

    // Frontera de decision: un marco lo cubren todas las ventanas que empiezan en
    // (marco - ventana, marco]. Tras analizar la que empieza en `inicio`, todo lo anterior a
    // `inicio + salto` ya recibio su ultima opinion. Cerrar antes de esa linea seria cerrar
    // con informacion que aun podia cambiar.
    const decididoHastaMs = msDe(inicio + salto);
    const cerradas = pistas.filter((p) => p.finMs < decididoHastaMs - msHuecoMaximo);
    pistas = pistas.filter((p) => p.finMs >= decididoHastaMs - msHuecoMaximo);
    return cerradas.flatMap((p) => {
      const t = cierraPista(p);
      return t ? [t] : [];
    });
  }

  return {
    get pistasAbiertas() {
      return pistas.length;
    },

    async procesa(muestras: Muestras): Promise<Turno[]> {
      const unido = new Float32Array(buffer.length + muestras.length);
      unido.set(buffer, 0);
      unido.set(muestras, buffer.length);
      buffer = unido;

      const salida: Turno[] = [];
      while (offset + buffer.length >= proxima + ventana) {
        salida.push(...(await analizaVentana(proxima)));
        proxima += salto;
        recorta();
      }
      return salida.sort((a, b) => a.inicioMs - b.inicioMs || a.finMs - b.finMs);
    },

    async cierra(): Promise<Turno[]> {
      // La cola no llena una ventana entera. Se analiza igual —con lo que haya— antes de
      // cerrar: renunciar a ella perderia hasta un salto completo de audio, y en una reunion
      // eso es justo la ultima frase, que suele ser la que importa.
      const salida: Turno[] = [];
      if (offset + buffer.length > proxima) salida.push(...(await analizaVentana(proxima)));
      for (const p of pistas) {
        const t = cierraPista(p);
        if (t) salida.push(t);
      }
      pistas = [];
      return salida.sort((a, b) => a.inicioMs - b.inicioMs || a.finMs - b.finMs);
    },

    reinicia() {
      buffer = new Float32Array(0);
      offset = 0;
      proxima = 0;
      pistas = [];
    },
  };
}

/**
 * El camino completo en vivo CON solape: segmentacion por marco delante, identidad global
 * detras.
 *
 * La diferencia con `creaDiarizadorEnVivo` es solo la fuente. Alli el VAD entrega un turno
 * cada vez y dos voces juntas salen como una; aqui salen como dos turnos que se pisan, cada
 * uno con su etiqueta. La contabilidad de identidad —confianza, provisional, correccion,
 * firme— es exactamente la misma, porque es la misma pieza.
 *
 * Lo que NO da, y conviene saberlo antes de prometerlo:
 *
 * - **No hay reaccion inmediata.** No emite `inicioHabla`: la actividad solo se conoce
 *   cuando el modelo ha visto la ventana. Para barge-in, un `creaDetectorVoz` en paralelo.
 * - **La latencia es de un salto**, no de un silencio: con ventana de 10 s y medio solape,
 *   un turno tarda ~5 s en cerrarse. Subir `solape` la baja a cambio de mas computo.
 * - **Dos turnos simultaneos pueden recibir la misma etiqueta** si el modelo de hablante no
 *   los separa. Es un fallo del embedding, no del reparto, y se ve en `confianza`.
 */
export interface OpcionesDiarizadorSolapeEnVivo
  extends OpcionesSegmentadorStreaming,
    Omit<OpcionesDiarizadorStreaming, 'modelo'> {}

export interface DiarizadorSolapeEnVivo {
  /** Consume audio y devuelve los eventos de identidad de los turnos que hayan cerrado. */
  procesa(entrada: Muestras): Promise<EventoDiarizacion[]>;
  cierra(): Promise<EventoDiarizacion[]>;
  reinicia(): void;
  /** Hablantes distintos abiertos en la sesion. NO son las pistas del segmentador. */
  readonly hablantes: number;
}

export function creaDiarizadorSolapeEnVivo(
  opciones: OpcionesDiarizadorSolapeEnVivo,
): DiarizadorSolapeEnVivo {
  const segmentador = creaSegmentadorStreaming(opciones);
  const diarizador = creaDiarizadorStreaming({ ...opciones, modelo: opciones.hablante });

  /** Los turnos entran en orden de cierre; el diarizador adelanta su reloj con cada uno. */
  async function reparte(turnos: Turno[]): Promise<EventoDiarizacion[]> {
    const eventos: EventoDiarizacion[] = [];
    for (const turno of turnos) eventos.push(...(await diarizador.empuja(turno)));
    return eventos;
  }

  return {
    get hablantes() {
      return diarizador.hablantes;
    },
    async procesa(entrada) {
      return reparte(await segmentador.procesa(entrada));
    },
    async cierra() {
      return [...(await reparte(await segmentador.cierra())), ...(await diarizador.cierra())];
    },
    reinicia() {
      segmentador.reinicia();
      diarizador.reinicia();
    },
  };
}
