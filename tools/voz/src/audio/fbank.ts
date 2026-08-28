/**
 * Banco de filtros mel logaritmico. TypeScript puro.
 *
 * Esta aqui por una razon practica: casi todos los modelos de embedding de hablante
 * (WeSpeaker, 3D-Speaker, ECAPA) NO comen audio crudo, comen fbank. Sin esto, la
 * diarizacion solo funcionaria con el punado de modelos que aceptan forma de onda, y el
 * consumidor tendria que traerse una libreria de audio entera para tapar el hueco.
 */

/** FFT radix-2 in-place sobre partes real e imaginaria. `n` debe ser potencia de dos. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let largo = 2; largo <= n; largo <<= 1) {
    const angulo = (-2 * Math.PI) / largo;
    const wRe = Math.cos(angulo);
    const wIm = Math.sin(angulo);
    for (let i = 0; i < n; i += largo) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < largo / 2; k++) {
        const aRe = re[i + k]!;
        const aIm = im[i + k]!;
        const bRe = re[i + k + largo / 2]! * curRe - im[i + k + largo / 2]! * curIm;
        const bIm = re[i + k + largo / 2]! * curIm + im[i + k + largo / 2]! * curRe;
        re[i + k] = aRe + bRe;
        im[i + k] = aIm + bIm;
        re[i + k + largo / 2] = aRe - bRe;
        im[i + k + largo / 2] = aIm - bIm;
        const siguienteRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = siguienteRe;
      }
    }
  }
}

const aMel = (hz: number) => 2595 * Math.log10(1 + hz / 700);
const aHz = (mel: number) => 700 * (10 ** (mel / 2595) - 1);

export interface OpcionesFbank {
  frecuenciaHz?: number;
  /** Ventana de analisis, en ms. 25 es el estandar de facto en voz. */
  ventanaMs?: number;
  /** Salto entre ventanas, en ms. 10 es el estandar. */
  saltoMs?: number;
  numMel?: number;
  /** Restar la media de cada banda. Lo esperan casi todos los modelos de hablante. */
  normalizaMedia?: boolean;
}

/**
 * Devuelve una matriz [marcos][numMel] con log-energias mel.
 *
 * Los defectos siguen la convencion de Kaldi, que es la que usan los modelos de hablante
 * mas extendidos. Si un modelo espera otra cosa, el resultado no da error: da vectores
 * malos y una diarizacion que se equivoca sin decir por que. Comprueba la ficha del modelo.
 */
export function fbank(muestras: Float32Array, opciones: OpcionesFbank = {}): Float32Array[] {
  const frecuenciaHz = opciones.frecuenciaHz ?? 16_000;
  const numMel = opciones.numMel ?? 80;
  const normalizaMedia = opciones.normalizaMedia ?? true;
  const largoVentana = Math.round(((opciones.ventanaMs ?? 25) / 1000) * frecuenciaHz);
  const salto = Math.round(((opciones.saltoMs ?? 10) / 1000) * frecuenciaHz);

  let nfft = 1;
  while (nfft < largoVentana) nfft <<= 1;
  const bins = nfft / 2 + 1;

  // Ventana de Hann, calculada una vez.
  const ventana = new Float64Array(largoVentana);
  for (let i = 0; i < largoVentana; i++) {
    ventana[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (largoVentana - 1));
  }

  // Filtros mel triangulares.
  const bordes = new Float64Array(numMel + 2);
  const melMin = aMel(20);
  const melMax = aMel(frecuenciaHz / 2);
  for (let i = 0; i < bordes.length; i++) {
    bordes[i] = (aHz(melMin + ((melMax - melMin) * i) / (numMel + 1)) * nfft) / frecuenciaHz;
  }

  const salida: Float32Array[] = [];
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);

  for (let inicio = 0; inicio + largoVentana <= muestras.length; inicio += salto) {
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < largoVentana; i++) re[i] = muestras[inicio + i]! * ventana[i]!;
    fft(re, im);

    const potencia = new Float64Array(bins);
    for (let k = 0; k < bins; k++) potencia[k] = re[k]! * re[k]! + im[k]! * im[k]!;

    const marco = new Float32Array(numMel);
    for (let m = 0; m < numMel; m++) {
      const izq = bordes[m]!;
      const centro = bordes[m + 1]!;
      const der = bordes[m + 2]!;
      let suma = 0;
      for (let k = Math.floor(izq); k <= Math.min(Math.ceil(der), bins - 1); k++) {
        const peso = k < centro ? (k - izq) / (centro - izq || 1) : (der - k) / (der - centro || 1);
        if (peso > 0) suma += potencia[k]! * peso;
      }
      marco[m] = Math.log(suma + 1e-10);
    }
    salida.push(marco);
  }

  if (normalizaMedia && salida.length > 0) {
    for (let m = 0; m < numMel; m++) {
      let suma = 0;
      for (const marco of salida) suma += marco[m]!;
      const media = suma / salida.length;
      for (const marco of salida) marco[m] = marco[m]! - media;
    }
  }
  return salida;
}
