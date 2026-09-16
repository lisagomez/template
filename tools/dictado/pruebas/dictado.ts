/**
 * La maquina de estados con un detector de guion, un transcriptor falso y un pegador que
 * apunta. Sin modelos, sin microfono: aqui se prueba la contabilidad, que es donde vive el
 * riesgo (que turno va a que llamada, que se pega, cuando se mide la latencia).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  almacenEnMemoria,
  creaDictado,
  creaPosproceso,
  juntaTurnos,
  type DetectorVoz,
  type EventoDictado,
  type EventoVoz,
  type Muestras,
  type Pegador,
  type Transcriptor,
} from '../dist/index.js';

const HZ = 16_000;

/** Detector de guion: cada llamada a `procesa` con N muestras cierra un turno con ese audio. */
function detectorDeGuion(): DetectorVoz & { reinicios: number } {
  let ms = 0;
  const d = {
    reinicios: 0,
    hablando: false,
    async procesa(entrada: Muestras): Promise<EventoVoz[]> {
      if (entrada.length === 0) return [];
      const inicio = ms;
      ms += (entrada.length / HZ) * 1000;
      return [
        { tipo: 'inicioHabla', ms: inicio },
        { tipo: 'finHabla', turno: { inicioMs: inicio, finMs: ms, audio: entrada } },
      ];
    },
    async cierra(): Promise<EventoVoz[]> {
      return [];
    },
    reinicia() {
      d.reinicios += 1;
      ms = 0;
    },
  };
  return d;
}

function transcriptorFalso(textoPor: (audio: Muestras) => string): Transcriptor & { llamadas: Muestras[] } {
  const llamadas: Muestras[] = [];
  return {
    llamadas,
    async transcribe(audio) {
      llamadas.push(audio);
      return { texto: textoPor(audio) };
    },
  };
}

function pegadorQueApunta(): Pegador & { pegado: string[]; acciones: string[] } {
  const pegado: string[] = [];
  const acciones: string[] = [];
  return {
    pegado,
    acciones,
    async pega(texto) {
      pegado.push(texto);
    },
    async ejecuta(as) {
      acciones.push(...as);
    },
  };
}

test('juntaTurnos concatena solo los turnos con audio y mete el hueco entre ellos', () => {
  const a = new Float32Array([1, 1]);
  const b = new Float32Array([2, 2, 2]);
  const junto = juntaTurnos([{ inicioMs: 0, finMs: 1, audio: a }, { inicioMs: 2, finMs: 3 }, { inicioMs: 4, finMs: 5, audio: b }], 1000, 2);
  assert.deepEqual(Array.from(junto), [1, 1, 0, 0, 2, 2, 2]);
  assert.equal(juntaTurnos([], HZ, 150).length, 0);
});

test('alternar: los turnos entre empieza y termina van JUNTOS al motor, se pegan y quedan en el historial', async () => {
  const detector = detectorDeGuion();
  const transcriptor = transcriptorFalso((audio) => `texto de ${audio.length} muestras y dale enter`);
  const pegador = pegadorQueApunta();
  const almacen = almacenEnMemoria();
  const eventos: EventoDictado[] = [];
  let reloj = 0;
  const dictado = creaDictado({
    detector, transcriptor, frecuenciaHz: HZ, modo: 'alternar', pegador, almacen, motorId: 'falso',
    posproceso: creaPosproceso(), msSilencioEntreTurnos: 100, ahora: () => (reloj += 5), alEvento: (e) => eventos.push(e),
  });
  assert.equal(dictado.estado, 'inactivo');
  await dictado.alimenta(new Float32Array(16_000)); // fuera de `escuchando` se descarta
  dictado.empieza();
  assert.equal(detector.reinicios, 1);
  assert.equal(dictado.estado, 'escuchando');
  await dictado.alimenta(new Float32Array(16_000));
  await dictado.alimenta(new Float32Array(8_000));
  assert.equal(transcriptor.llamadas.length, 0, 'en alternar no se transcribe hasta terminar');
  await dictado.termina();
  assert.equal(transcriptor.llamadas.length, 1);
  assert.equal(transcriptor.llamadas[0]?.length, 16_000 + 1_600 + 8_000);
  assert.deepEqual(pegador.pegado, ['texto de 25600 muestras']);
  assert.deepEqual(pegador.acciones, ['enter']);
  assert.equal(dictado.estado, 'inactivo');
  const texto = eventos.find((e): e is Extract<EventoDictado, { tipo: 'texto' }> => e.tipo === 'texto');
  assert.ok(texto);
  assert.equal(texto.textoCrudo, 'texto de 25600 muestras y dale enter');
  assert.ok(texto.latenciaMs > 0);
  assert.equal(Math.round(texto.duracionMs), 1600);
  assert.deepEqual(eventos.filter((e) => e.tipo === 'estado').map((e) => (e.tipo === 'estado' ? e.estado : '')), ['escuchando', 'transcribiendo', 'pegando', 'inactivo']);
  const guardado = await almacen.recientes(1);
  assert.equal(guardado[0]?.texto, 'texto de 25600 muestras');
  assert.equal(guardado[0]?.textoCrudo, 'texto de 25600 muestras y dale enter');
  assert.equal(guardado[0]?.motor, 'falso');
});

test('manosLibres: cada turno cerrado se transcribe y pega por su cuenta, en orden', async () => {
  const detector = detectorDeGuion();
  const transcriptor = transcriptorFalso((audio) => (audio.length === 100 ? 'primero' : 'segundo'));
  const pegador = pegadorQueApunta();
  const dictado = creaDictado({ detector, transcriptor, frecuenciaHz: HZ, modo: 'manosLibres', pegador });
  dictado.empieza();
  await dictado.alimenta(new Float32Array(100));
  await dictado.alimenta(new Float32Array(200));
  await dictado.termina();
  assert.deepEqual(pegador.pegado, ['primero', 'segundo']);
  assert.equal(transcriptor.llamadas.length, 2);
  assert.equal(dictado.estado, 'inactivo');
});

test('sin voz: terminar sin turnos emite sinVoz y no llama al motor; un motor mudo tambien', async () => {
  const eventos: EventoDictado[] = [];
  const transcriptor = transcriptorFalso(() => '   ');
  const dictado = creaDictado({ detector: detectorDeGuion(), transcriptor, frecuenciaHz: HZ, alEvento: (e) => eventos.push(e) });
  dictado.empieza();
  await dictado.termina();
  assert.equal(transcriptor.llamadas.length, 0);
  assert.equal(eventos.filter((e) => e.tipo === 'sinVoz').length, 1);
  dictado.empieza();
  await dictado.alimenta(new Float32Array(10));
  await dictado.termina();
  assert.equal(transcriptor.llamadas.length, 1);
  assert.equal(eventos.filter((e) => e.tipo === 'sinVoz').length, 2);
  assert.equal(dictado.estado, 'inactivo');
});

test('errores del motor salen como evento y el dictado vuelve a inactivo; el modo no se cambia en caliente', async () => {
  const eventos: EventoDictado[] = [];
  const transcriptor: Transcriptor = { async transcribe() { throw new Error('motor caido'); } };
  const dictado = creaDictado({ detector: detectorDeGuion(), transcriptor, frecuenciaHz: HZ, alEvento: (e) => eventos.push(e) });
  dictado.empieza();
  assert.throws(() => dictado.cambiaModo('manosLibres'), /inactivo/);
  await dictado.alimenta(new Float32Array(10));
  await dictado.termina();
  assert.deepEqual(eventos.filter((e) => e.tipo === 'error'), [{ tipo: 'error', mensaje: 'motor caido' }]);
  assert.equal(dictado.estado, 'inactivo');
  dictado.cambiaModo('manosLibres');
  assert.equal(dictado.modo, 'manosLibres');
});

test('la pista del diccionario se consulta en cada transcripcion', async () => {
  let pista = 'Levy';
  const recibidas: Array<string | undefined> = [];
  const transcriptor: Transcriptor = {
    async transcribe(_a, _hz, opciones) {
      recibidas.push(opciones?.pista);
      return { texto: 'ok' };
    },
  };
  const dictado = creaDictado({ detector: detectorDeGuion(), transcriptor, frecuenciaHz: HZ, idioma: 'es', pista: () => pista });
  dictado.empieza();
  await dictado.alimenta(new Float32Array(10));
  await dictado.termina();
  pista = 'Levy, Hermes';
  dictado.empieza();
  await dictado.alimenta(new Float32Array(10));
  await dictado.termina();
  assert.deepEqual(recibidas, ['Levy', 'Levy, Hermes']);
});
