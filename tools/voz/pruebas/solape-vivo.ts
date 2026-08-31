/**
 * Pruebas del camino PyanNet EN VIVO: turnos que se pisan, entregados segun entra el audio.
 *
 * Lo que se ejercita, igual que en `streaming.ts`, no es "acierta el hablante" —el modelo de
 * embeddings es de mentira a proposito— sino la contabilidad: cuando se cose una pista entre
 * ventanas, cuando se cierra, cuanto hay que esperar antes de poder cerrarla, y que dos voces
 * simultaneas salgan como DOS turnos y no como uno promediado.
 *
 *   node --test tools/voz/pruebas/solape-vivo.ts   (requiere `npm run build` en tools/voz)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  creaDiarizadorSolapeEnVivo,
  creaSegmentadorStreaming,
  tramosSolapados,
  type EventoDiarizacion,
  type ModeloHablante,
  type ModeloSegmentacion,
  type Turno,
} from '../dist/index.js';

const HZ = 16_000;
const MARCOS_VENTANA = 10;
const MARCOS_SALTO = 5; // solape 0.5
const MUESTRAS_MARCO = 1_600; // 100 ms
const MS_MARCO = 1_000;

/** Mismo truco que en `streaming.ts`: el audio lleva escrito quien habla, como angulo. */
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

/**
 * Guion global: por marco, que angulos suenan. `[]` es silencio.
 *
 * En un marco solapado el audio real seria una MEZCLA, y un embedding sacado de ahi no es de
 * nadie. El modelo falso no sabe mezclar, asi que el guion pone un solo angulo en esos
 * marcos y las pruebas se aseguran de que cada hablante tenga marcos EXCLUSIVOS en toda
 * ventana donde aparece — que es exactamente la condicion que el codigo real busca al
 * preferir `exclusivos` sobre `todos`.
 */
type Guion = number[][];

function audioDe(guion: Guion): Float32Array {
  const audio = new Float32Array(guion.length * MUESTRAS_MARCO);
  guion.forEach((angulos, m) => {
    if (angulos.length === 0) return;
    // El ULTIMO en entrar manda en el marco solapado: asi el turno del que llega despues
    // empieza con su propio audio y no con el del que ya estaba.
    const valor = angulos[angulos.length - 1]! / 1000;
    audio.fill(valor, m * MUESTRAS_MARCO, (m + 1) * MUESTRAS_MARCO);
  });
  return audio;
}

/**
 * Modelo de segmentacion falso, guiado por el guion global. Devuelve actividad por marco y
 * por hablante LOCAL, y **permuta los indices locales en cada ventana**: es la propiedad que
 * distingue un cosido por embeddings de uno que se fia del indice. Si el codigo se fiara del
 * indice, saldrian el doble de hablantes.
 */
function segmentadorFalso(guion: Guion, hablantesLocales = 3): ModeloSegmentacion {
  let llamada = 0;
  return {
    frecuenciaHz: HZ,
    muestrasVentana: MARCOS_VENTANA * MUESTRAS_MARCO,
    hablantesLocales,
    async ventana() {
      const base = llamada * MARCOS_SALTO;
      llamada++;
      const marcos = guion.slice(base, base + MARCOS_VENTANA);
      const presentes = [...new Set(marcos.flat())].sort((a, b) => a - b);
      // La permutacion: en las ventanas impares, el orden local se invierte.
      const orden = llamada % 2 === 0 ? [...presentes].reverse() : presentes;
      const salida: Float32Array[] = [];
      for (let m = 0; m < MARCOS_VENTANA; m++) {
        const fila = new Float32Array(hablantesLocales);
        for (const angulo of marcos[m] ?? []) {
          const k = orden.indexOf(angulo);
          if (k >= 0 && k < hablantesLocales) fila[k] = 1;
        }
        salida.push(fila);
      }
      return salida;
    },
  };
}

const A = 10;
const B = 100; // 90 grados de A: dos personas distintas distan de verdad
const silencio = (n: number): Guion => Array.from({ length: n }, () => []);
const solos = (angulo: number, n: number): Guion => Array.from({ length: n }, () => [angulo]);

/**
 * A habla 0-500 ms, B entra en 300 pisandole hasta 500 y sigue hasta 1500. Silencio, y A
 * vuelve en 2000-2500. El tramo 300-500 es la razon de ser de todo este camino.
 */
const GUION: Guion = [
  ...solos(A, 3),                    // 0-300   A sola
  ...[[A, B], [A, B]],               // 300-500 las dos
  ...solos(B, 10),                   // 500-1500 B sola
  ...silencio(5),                    // 1500-2000
  ...solos(A, 5),                    // 2000-2500 A vuelve
  ...silencio(5),                    // 2500-3000
];

const opcionesBase = {
  hablante: modeloAngulo(),
  solape: 0.5,
  msMinimoLocal: 200,
  msMinimoTurno: 200,
};

async function turnosDe(guion: Guion, trozoMarcos = MARCOS_VENTANA): Promise<Turno[]> {
  const seg = creaSegmentadorStreaming({ segmentacion: segmentadorFalso(guion), ...opcionesBase });
  const audio = audioDe(guion);
  const turnos: Turno[] = [];
  const paso = trozoMarcos * MUESTRAS_MARCO;
  for (let i = 0; i < audio.length; i += paso) {
    turnos.push(...(await seg.procesa(audio.subarray(i, Math.min(i + paso, audio.length)))));
  }
  turnos.push(...(await seg.cierra()));
  return turnos;
}

const ms = (t: Turno) => [Math.round(t.inicioMs), Math.round(t.finMs)];

test('dos voces a la vez salen como DOS turnos que se pisan, no como uno promediado', async () => {
  const turnos = await turnosDe(GUION);
  assert.equal(turnos.length, 3);
  assert.deepEqual(turnos.map(ms), [[0, 500], [300, 1500], [2000, 2500]]);
  // El tramo que el camino por VAD no puede representar:
  const pisados = turnos.filter((t) => t.inicioMs < 500 && t.finMs > 300);
  assert.equal(pisados.length, 2, 'los dos primeros turnos comparten 300-500 ms');
});

test('el cosido entre ventanas va por embedding, no por indice local', async () => {
  // El modelo falso invierte el orden local en las ventanas impares. Con un cosido por
  // indice, B seria "otro" en cada ventana y saldrian mas turnos de los que hay voces.
  const turnos = await turnosDe(GUION);
  const largos = turnos.filter((t) => t.finMs - t.inicioMs >= 1000);
  assert.equal(largos.length, 1, 'B es UN turno de 1200 ms, no varios trozos de ventana');
  assert.deepEqual(ms(largos[0]!), [300, 1500]);
});

test('un turno no cierra antes de la frontera de decision: la latencia es de un salto', async () => {
  const seg = creaSegmentadorStreaming({ segmentacion: segmentadorFalso(GUION), ...opcionesBase });
  const audio = audioDe(GUION);
  // Justo el audio necesario para UNA ventana: A ya ha terminado (acaba en 500 ms) pero su
  // turno no puede salir todavia, porque la ventana siguiente aun podria extenderla.
  const primera = await seg.procesa(audio.subarray(0, MARCOS_VENTANA * MUESTRAS_MARCO));
  assert.deepEqual(primera, [], 'nada cierra con una sola ventana analizada');
  assert.equal(seg.pistasAbiertas, 2, 'las dos voces estan abiertas');
});

test('cierra() analiza la cola que no llena una ventana y entrega lo que quedaba', async () => {
  const seg = creaSegmentadorStreaming({ segmentacion: segmentadorFalso(GUION), ...opcionesBase });
  const audio = audioDe(GUION);
  const durante = await seg.procesa(audio);
  const final = await seg.cierra();
  assert.ok(final.length > 0, 'la ultima voz no se pierde por no llenar una ventana');
  assert.deepEqual(ms(final[final.length - 1]!), [2000, 2500]);
  assert.equal(durante.length + final.length, 3);
});

test('el turno lleva el audio de su tramo: sin el, la capa de identidad no puede embeber', async () => {
  const turnos = await turnosDe(GUION);
  for (const t of turnos) {
    assert.ok(t.audio, 'todo turno sale con audio');
    const esperado = Math.round(((t.finMs - t.inicioMs) / 1000) * HZ);
    assert.equal(t.audio!.length, esperado);
  }
});

test('un hueco corto no parte la pista; uno largo si', async () => {
  const corto: Guion = [...solos(A, 5), ...silencio(2), ...solos(A, 5), ...silencio(8)];
  const [unico, ...resto] = await turnosDe(corto);
  assert.equal(resto.length, 0, 'un hueco de 200 ms no parte el turno');
  assert.deepEqual(ms(unico!), [0, 1200]);

  const largo: Guion = [...solos(A, 5), ...silencio(8), ...solos(A, 5), ...silencio(7)];
  const partidos = await turnosDe(largo);
  assert.equal(partidos.length, 2, 'un hueco de 800 ms si lo parte');
});

test('un tramo mas corto que msMinimoTurno no se emite', async () => {
  const guion: Guion = [...solos(A, 5), ...silencio(5), ...solos(B, 1), ...silencio(9)];
  const turnos = await turnosDe(guion);
  assert.equal(turnos.length, 1, 'el tramo de 100 ms de B se descarta');
  assert.deepEqual(ms(turnos[0]!), [0, 500]);
});

test('el audio llega a trozos pequenos y el resultado es el mismo', async () => {
  const enteros = await turnosDe(GUION, MARCOS_VENTANA);
  const troceados = await turnosDe(GUION, 1);
  assert.deepEqual(troceados.map(ms), enteros.map(ms));
});

test('reinicia() olvida las pistas y el reloj', async () => {
  const seg = creaSegmentadorStreaming({ segmentacion: segmentadorFalso(GUION), ...opcionesBase });
  const audio = audioDe(GUION);
  await seg.procesa(audio.subarray(0, MARCOS_VENTANA * MUESTRAS_MARCO));
  assert.equal(seg.pistasAbiertas, 2);
  seg.reinicia();
  assert.equal(seg.pistasAbiertas, 0);
  assert.deepEqual(await seg.cierra(), []);
});

// ---------------------------------------------------------------- composicion

const eventosTurno = (e: EventoDiarizacion[]) => e.flatMap((x) => (x.tipo === 'turno' ? [x] : []));

test('creaDiarizadorSolapeEnVivo pone identidad global a turnos que se pisan', async () => {
  const vivo = creaDiarizadorSolapeEnVivo({
    segmentacion: segmentadorFalso(GUION),
    ...opcionesBase,
    msMinimo: 300,
  });
  const eventos = [...(await vivo.procesa(audioDe(GUION))), ...(await vivo.cierra())];
  const turnos = eventosTurno(eventos);
  assert.equal(turnos.length, 3);

  const [primero, segundo, tercero] = turnos.map((t) => t.turno);
  assert.notEqual(primero!.hablante, segundo!.hablante, 'los dos que se pisan son distintos');
  assert.equal(primero!.hablante, tercero!.hablante, 'A vuelve y recupera su etiqueta');
  assert.equal(vivo.hablantes, 2, 'dos personas en toda la sesion, no una por pista');
});

test('tramosSolapados responde sobre la salida en vivo donde se pisaron', async () => {
  const vivo = creaDiarizadorSolapeEnVivo({
    segmentacion: segmentadorFalso(GUION),
    ...opcionesBase,
    msMinimo: 300,
  });
  const eventos = [...(await vivo.procesa(audioDe(GUION))), ...(await vivo.cierra())];
  const turnos = eventosTurno(eventos).map((e) => e.turno);
  const solapados = tramosSolapados(turnos);
  assert.equal(solapados.length, 1);
  assert.deepEqual([solapados[0]!.inicioMs, solapados[0]!.finMs], [300, 500]);
  assert.equal(solapados[0]!.hablantes.length, 2);
});

test('la promesa de la capa de identidad sigue entera: provisional y firme', async () => {
  const vivo = creaDiarizadorSolapeEnVivo({
    segmentacion: segmentadorFalso(GUION),
    ...opcionesBase,
    msMinimo: 300,
    msVentanaCorreccion: 30_000,
  });
  const eventos = [...(await vivo.procesa(audioDe(GUION))), ...(await vivo.cierra())];
  assert.ok(eventosTurno(eventos).every((t) => t.provisional), 'nacen provisionales');
  const firmes = eventos.flatMap((e) => (e.tipo === 'firme' ? e.ids : []));
  assert.equal(firmes.length, 3, 'cierra() los declara firmes a todos');
});
