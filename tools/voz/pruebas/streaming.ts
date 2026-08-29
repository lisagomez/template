/**
 * Pruebas de la diarizacion en streaming: etiqueta ya, corrige despues, y dice cuando deja
 * de poder corregir.
 *
 * Lo que se ejercita aqui no es "acierta el hablante" —eso lo decide el modelo de embeddings,
 * que aqui es de mentira a proposito— sino la CONTABILIDAD de alrededor: cuando se abre un
 * hablante, cuando se funden dos, a quien se puede corregir todavia y a quien ya no.
 *
 *   node --test tools/voz/pruebas/streaming.ts   (requiere `npm run build` en tools/voz)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  concatena,
  creaDetectorVoz,
  creaDiarizadorEnVivo,
  creaDiarizadorStreaming,
  type EventoDiarizacion,
  type ModeloHablante,
  type ModeloVoz,
  type Turno,
} from '../dist/index.js';

const HZ = 16_000;
const TAM = 512;

/**
 * Modelo de hablante falso: el audio LLEVA ESCRITO quien habla. El primer valor no nulo es
 * el angulo en grados partido por mil, y el vector es ese angulo en el circulo unidad.
 *
 * Asi la distancia coseno entre dos voces es exactamente `1 - cos(diferencia de angulos)`, y
 * cada prueba puede colocar a los hablantes a la distancia que necesita en vez de rezarle a
 * un modelo real. Los angulos empiezan en 1: un 0 seria silencio y no se distinguiria del
 * relleno que el detector pone delante de cada turno.
 */
function modeloAngulo(): ModeloHablante {
  return {
    frecuenciaHz: HZ,
    async vector(muestras) {
      let i = 0;
      while (i < muestras.length && muestras[i] === 0) i++;
      const radianes = (Math.round((muestras[i] ?? 0) * 1000) * Math.PI) / 180;
      const v = new Float32Array(4);
      v[0] = Math.cos(radianes);
      v[1] = Math.sin(radianes);
      return v;
    },
  };
}

const audioDe = (grados: number) => Float32Array.from([0, 0, grados / 1000, 0]);
const turnoDe = (grados: number, inicioMs: number, finMs = inicioMs + 1000): Turno => ({
  inicioMs,
  finMs,
  audio: audioDe(grados),
});

const turnos = (eventos: EventoDiarizacion[]) =>
  eventos.flatMap((e) => (e.tipo === 'turno' ? [e] : []));
const correcciones = (eventos: EventoDiarizacion[]) =>
  eventos.flatMap((e) => (e.tipo === 'correccion' ? [e] : []));
const firmes = (eventos: EventoDiarizacion[]) =>
  eventos.flatMap((e) => (e.tipo === 'firme' ? e.ids : []));

test('dos voces alternas reciben etiquetas estables desde el primer turno', async () => {
  const d = creaDiarizadorStreaming({ modelo: modeloAngulo() });
  const salida: EventoDiarizacion[] = [];
  const guion = [1, 91, 1, 91];
  for (let i = 0; i < guion.length; i++) salida.push(...(await d.empuja(turnoDe(guion[i]!, i * 2000))));

  assert.deepEqual(
    turnos(salida).map((t) => t.turno.hablante),
    ['Hablante 1', 'Hablante 2', 'Hablante 1', 'Hablante 2'],
  );
  assert.equal(d.hablantes, 2);
  assert.equal(correcciones(salida).length, 0, 'una conversacion limpia no necesita correcciones');
});

test('la etiqueta sale con el turno, no despues: un empuje, un evento de turno', async () => {
  const d = creaDiarizadorStreaming({ modelo: modeloAngulo() });
  const eventos = await d.empuja(turnoDe(1, 0));
  const [primero] = turnos(eventos);
  assert.equal(primero?.turno.hablante, 'Hablante 1');
  assert.equal(primero?.provisional, true, 'con ventana de correccion abierta, la etiqueta puede cambiar');
  assert.equal(primero?.id, 't1');
});

test('un turno demasiado corto sale SIN hablante en vez de con uno inventado', async () => {
  const d = creaDiarizadorStreaming({ modelo: modeloAngulo(), msMinimo: 400 });
  const [evento] = turnos(await d.empuja(turnoDe(1, 0, 200)));
  assert.equal(evento?.turno.hablante, undefined);
  assert.equal(evento?.confianza, 0);
  assert.equal(evento?.provisional, false, 'lo que nunca se va a etiquetar no es provisional');
  assert.equal(d.hablantes, 0, 'un turno de 200 ms no abre un hablante fantasma');
});

test('un turno sin audio falla diciendo exactamente que falta', async () => {
  const d = creaDiarizadorStreaming({ modelo: modeloAngulo() });
  await assert.rejects(() => d.empuja({ inicioMs: 0, finMs: 1000 }), /conservaAudio/);
});

test('un hablante abierto de mas se funde y los turnos ya emitidos se corrigen', async () => {
  // 1° y 31° estan a 0.134 de distancia: por encima del umbral, asi que abren dos hablantes.
  // El turno de 18° cae junto al segundo, su centroide se mueve hasta 0.083 del primero, y
  // ahi se ve que eran la misma persona desde el principio.
  const d = creaDiarizadorStreaming({ modelo: modeloAngulo(), umbral: 0.1, umbralFusion: 0.1 });
  await d.empuja(turnoDe(1, 0));
  await d.empuja(turnoDe(31, 2000));
  assert.equal(d.hablantes, 2, 'antes de la evidencia parecian dos');

  const eventos = await d.empuja(turnoDe(18, 4000));
  const [correccion] = correcciones(eventos);
  assert.equal(correccion?.motivo, 'fusion');
  assert.deepEqual(
    correccion?.cambios.map((c) => `${c.id}→${c.hablante}`),
    ['t2→Hablante 1', 't3→Hablante 1'],
  );
  assert.equal(correccion?.fuera, 0, 'todo cabia en la ventana: no se quedo nada mal etiquetado');
  assert.equal(d.hablantes, 1);
});

test('una fusion tardia dice cuantos turnos ya NO puede corregir', async () => {
  // Misma geometria, pero la evidencia llega cuando los dos primeros turnos ya salieron de
  // la ventana. La fusion se aplica igual —el modelo mejora— y lo que no puede arreglar se
  // cuenta en vez de disimularse.
  const d = creaDiarizadorStreaming({
    modelo: modeloAngulo(),
    umbral: 0.1,
    umbralFusion: 0.1,
    msVentanaCorreccion: 2000,
  });
  await d.empuja(turnoDe(1, 0));
  await d.empuja(turnoDe(31, 1500, 2500));
  const eventos = await d.empuja(turnoDe(18, 9000, 10_000));

  assert.deepEqual(firmes(eventos), ['t1', 't2'], 'salieron de la ventana antes de corregir');
  const [correccion] = correcciones(eventos);
  assert.deepEqual(correccion?.cambios.map((c) => c.id), ['t3']);
  assert.equal(correccion?.fuera, 1, 't2 se quedo con la etiqueta vieja y hay que decirlo');
});

test('un turno que sale de la ventana se declara firme, y cierra() vacia lo que queda', async () => {
  const d = creaDiarizadorStreaming({ modelo: modeloAngulo(), msVentanaCorreccion: 3000 });
  await d.empuja(turnoDe(1, 0));
  assert.deepEqual(firmes(await d.empuja(turnoDe(1, 5000, 6000))), ['t1']);
  assert.deepEqual(firmes(await d.cierra()), ['t2']);
  assert.deepEqual(firmes(await d.cierra()), [], 'cerrar dos veces no reinventa turnos');
});

test('con ventana 0 no hay correcciones: cada etiqueta nace firme', async () => {
  const d = creaDiarizadorStreaming({
    modelo: modeloAngulo(),
    umbral: 0.1,
    umbralFusion: 0.1,
    msVentanaCorreccion: 0,
  });
  const salida: EventoDiarizacion[] = [];
  for (const [i, grados] of [1, 31, 18].entries()) salida.push(...(await d.empuja(turnoDe(grados, i * 2000))));

  assert.equal(turnos(salida).every((t) => t.provisional === false), true);
  assert.equal(correcciones(salida).every((c) => c.cambios.length === 0), true, 'no hay a quien corregir');
  assert.equal(d.hablantes, 1, 'el MODELO si se funde: lo que se pierde es poder rectificar lo dicho');
});

test('el numero de hablantes fijado manda: no se abre uno mas', async () => {
  const d = creaDiarizadorStreaming({ modelo: modeloAngulo(), hablantes: 1 });
  const primero = turnos(await d.empuja(turnoDe(1, 0)))[0];
  const segundo = turnos(await d.empuja(turnoDe(91, 2000)))[0];

  assert.equal(segundo?.turno.hablante, 'Hablante 1');
  assert.equal(segundo?.confianza, 0, 'forzado por el techo: la etiqueta no tiene respaldo');
  assert.ok(primero!.confianza > 0);
  assert.equal(d.hablantes, 1);
});

test('el techo fuerza al mas cercano y lo confiesa con confianza 0', async () => {
  const d = creaDiarizadorStreaming({ modelo: modeloAngulo(), hablantesMaximo: 2 });
  await d.empuja(turnoDe(1, 0));
  await d.empuja(turnoDe(91, 2000));
  const tercero = turnos(await d.empuja(turnoDe(181, 4000)))[0];

  assert.equal(tercero?.turno.hablante, 'Hablante 2', '181° esta mas cerca de 91° que de 1°');
  assert.equal(tercero?.confianza, 0);
  assert.equal(d.hablantes, 2);
});

test('tras una fusion el numero no se recicla: el siguiente es Hablante 3', async () => {
  const d = creaDiarizadorStreaming({ modelo: modeloAngulo(), umbral: 0.1, umbralFusion: 0.1 });
  for (const [i, grados] of [1, 31, 18].entries()) await d.empuja(turnoDe(grados, i * 2000));
  const nuevo = turnos(await d.empuja(turnoDe(91, 6000)))[0];

  assert.equal(nuevo?.turno.hablante, 'Hablante 3', 'reciclar un nombre ya leido es peor que dejar hueco');
});

test('reinicia() olvida a todo el mundo y vuelve a Hablante 1', async () => {
  const d = creaDiarizadorStreaming({ modelo: modeloAngulo() });
  await d.empuja(turnoDe(1, 0));
  await d.empuja(turnoDe(91, 2000));
  d.reinicia();

  assert.equal(d.hablantes, 0);
  const tras = turnos(await d.empuja(turnoDe(181, 0)))[0];
  assert.equal(tras?.turno.hablante, 'Hablante 1');
  assert.equal(tras?.id, 't1');
});

test('creaDiarizadorEnVivo cablea VAD y diarizador, y separa las dos corrientes', async () => {
  // Guion: silencio, A, silencio, B, silencio, A. El VAD decide los cortes y el diarizador
  // pone nombre; lo que se comprueba es que el cableado no pierde ni inventa turnos.
  const marcos: Float32Array[] = [];
  const probabilidades: number[] = [];
  const silencio = (n: number) => {
    for (let i = 0; i < n; i++) {
      marcos.push(new Float32Array(TAM));
      probabilidades.push(0);
    }
  };
  const habla = (grados: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const marco = new Float32Array(TAM);
      marco[0] = grados / 1000;
      marcos.push(marco);
      probabilidades.push(0.9);
    }
  };
  silencio(4); habla(1, 20); silencio(8); habla(91, 20); silencio(8); habla(1, 20); silencio(8);

  let indice = 0;
  const vad: ModeloVoz = {
    tamMarco: TAM,
    frecuenciaHz: HZ,
    async probabilidad() {
      return probabilidades[Math.min(indice++, probabilidades.length - 1)] ?? 0;
    },
    reinicia() {
      indice = 0;
    },
  };

  const enVivo = creaDiarizadorEnVivo({
    modelo: modeloAngulo(),
    msMinimo: 300,
    detector: creaDetectorVoz({ modelo: vad, conservaAudio: true, msSilencioParaCerrar: 150 }),
  });

  const primera = await enVivo.procesa(concatena(marcos));
  const ultima = await enVivo.cierra();
  const todos = [...primera.diarizacion, ...ultima.diarizacion];

  assert.equal(primera.voz.some((e) => e.tipo === 'inicioHabla'), true, 'la corriente de voz sigue viva');
  assert.deepEqual(
    turnos(todos).map((t) => t.turno.hablante),
    ['Hablante 1', 'Hablante 2', 'Hablante 1'],
  );
  assert.equal(enVivo.hablantes, 2);
});
