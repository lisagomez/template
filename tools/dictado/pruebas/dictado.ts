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

test('terminar espera al audio en vuelo: un detector lento no pierde la ultima frase', async () => {
  const lento = detectorDeGuion();
  const procesaRapido = lento.procesa.bind(lento);
  lento.procesa = (entrada) => new Promise((r) => setTimeout(() => r(procesaRapido(entrada)), 30));
  const transcriptor = transcriptorFalso((audio) => `oi ${audio.length}`);
  const pegador = pegadorQueApunta();
  const dictado = creaDictado({ detector: lento, transcriptor, frecuenciaHz: HZ, pegador });
  dictado.empieza();
  void dictado.alimenta(new Float32Array(300)); // sin await: como llega del microfono
  void dictado.alimenta(new Float32Array(200));
  await dictado.termina(); // llega antes de que el detector haya procesado nada
  assert.deepEqual(pegador.pegado, ['oi 2900']); // 300 + 2400 de hueco (150 ms) + 200: los dos trozos entraron
  await dictado.alimenta(new Float32Array(999)); // tras terminar se descarta
  assert.equal(transcriptor.llamadas.length, 1);
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

test('«dale enter» en medio: se pega lo de antes, Enter, y lo de despues queda como mensaje nuevo; solo «dale enter» tambien pulsa; solo muletillas no pega nada', async () => {
  const detector = detectorDeGuion();
  let respuesta = 'Mm. Podemos continuar con el PRP. Dale enter. No veo que estés ejecutando nada.';
  const transcriptor = transcriptorFalso(() => respuesta);
  const pegador = pegadorQueApunta();
  const almacen = almacenEnMemoria();
  const eventos: EventoDictado[] = [];
  const dictado = creaDictado({ detector, transcriptor, frecuenciaHz: HZ, modo: 'alternar', pegador, almacen, motorId: 'falso', posproceso: creaPosproceso(), alEvento: (e) => eventos.push(e) });
  dictado.empieza();
  await dictado.alimenta(new Float32Array(16_000));
  await dictado.termina();
  assert.deepEqual(pegador.pegado, ['Podemos continuar con el PRP', 'No veo que estés ejecutando nada.']);
  assert.deepEqual(pegador.acciones, ['enter']);
  const texto = eventos.find((e): e is Extract<EventoDictado, { tipo: 'texto' }> => e.tipo === 'texto');
  assert.deepEqual(texto?.siguientes, [{ texto: 'No veo que estés ejecutando nada.', acciones: [] }]);
  assert.equal((await almacen.recientes(1))[0]?.texto, 'Podemos continuar con el PRP\nNo veo que estés ejecutando nada.');
  assert.equal((await almacen.recientes(1))[0]?.textoCrudo, respuesta);

  respuesta = 'Dale enter.';
  dictado.empieza();
  await dictado.alimenta(new Float32Array(16_000));
  await dictado.termina();
  assert.equal(pegador.pegado.length, 2, 'sin texto no se pega nada');
  assert.deepEqual(pegador.acciones, ['enter', 'enter'], 'pero el Enter si se pulsa');
  assert.equal((await almacen.recientes(10)).length, 1, 'un turno que es solo la accion no se guarda');

  respuesta = 'Eh, mm.';
  dictado.empieza();
  await dictado.alimenta(new Float32Array(16_000));
  await dictado.termina();
  assert.equal(pegador.pegado.length, 2);
  assert.deepEqual(pegador.acciones, ['enter', 'enter']);
  assert.ok(eventos.some((e) => e.tipo === 'soloMuletillas'));
  assert.equal((await almacen.recientes(10)).length, 1, 'solo muletillas no se guarda');
  assert.equal(dictado.estado, 'inactivo');

  respuesta = 'uno dale enter dos dale enter tres';
  dictado.empieza();
  await dictado.alimenta(new Float32Array(16_000));
  await dictado.termina();
  assert.deepEqual(pegador.pegado.slice(2), ['uno', 'Dos', 'Tres'], 'dos envios en un turno (cada mensaje nuevo empieza en mayuscula), y el tercero queda empezado');
  assert.deepEqual(pegador.acciones, ['enter', 'enter', 'enter', 'enter']);
  assert.equal((await almacen.recientes(1))[0]?.texto, 'uno\nDos\nTres');
});
