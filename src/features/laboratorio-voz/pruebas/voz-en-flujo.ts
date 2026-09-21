/**
 * Pruebas puras de la voz en flujo: el decodificador PCM con trozos impares y la maquina de
 * estados de la interrupcion con un reloj falso (los ms de los eventos).
 * `node --test src/features/laboratorio-voz/pruebas/*.ts`
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { creaDecodificadorPcm16, flotanteAInt16 } from '../services/pcm.ts';
import { creaInterrupcion, type Accion } from '../services/interrupcion.ts';

const pcmDe = (valores: number[]): Uint8Array => {
  const b = new Uint8Array(valores.length * 2);
  const v = new DataView(b.buffer);
  valores.forEach((x, i) => v.setInt16(i * 2, x, true));
  return b;
};

test('pcm: un trozo con resto impar no pierde ninguna muestra ni la lee a medias', () => {
  const entero = pcmDe([1000, -2000, 3000, -32768, 32767]);
  const d = creaDecodificadorPcm16();
  const a = d.decodifica(entero.subarray(0, 3)); // 1 muestra y un byte suelto
  assert.equal(a.length, 1);
  assert.equal(d.bytesPendientes, 1);
  const b = d.decodifica(entero.subarray(3, 7)); // completa la 2 y da la 3, mas un byte suelto
  assert.equal(b.length, 2);
  assert.equal(d.bytesPendientes, 1);
  const c = d.decodifica(entero.subarray(7));
  assert.equal(c.length, 2);
  assert.equal(d.bytesPendientes, 0);
  const junto = [...a, ...b, ...c];
  const directo = [...creaDecodificadorPcm16().decodifica(entero)];
  assert.deepEqual(junto, directo);
  assert.ok(Math.abs((junto[0] ?? 0) - 1000 / 32768) < 1e-6);
  assert.equal(junto[3], -1);
});

test('pcm: ida y vuelta flotante → Int16 → flotante conserva el signo y los extremos', () => {
  const f = new Float32Array([0, 0.5, -0.5, 1, -1, 1.5, -1.5]);
  const i = flotanteAInt16(f);
  assert.deepEqual([...i], [0, 16384, -16384, 32767, -32768, 32767, -32768]);
  const vuelta = creaDecodificadorPcm16().decodifica(new Uint8Array(i.buffer));
  assert.ok(Math.abs((vuelta[1] ?? 0) - 0.5) < 1e-3);
});

const marcos = (m: ReturnType<typeof creaInterrupcion>, desdeMs: number, n: number, valor: number, habla: boolean): Accion[] => {
  const salida: Accion[] = [];
  for (let k = 0; k < n; k++) salida.push(...m.procesa({ tipo: 'probabilidad', valor, ms: desdeMs + k * 32 }, habla));
  return salida;
};

test('interrupcion: durante la calibracion no pasa nada, aunque el detector abra', () => {
  const m = creaInterrupcion();
  assert.equal(m.estado, 'calibrando');
  assert.deepEqual(m.procesa({ tipo: 'inicioHabla', ms: 0 }, true), []);
  assert.deepEqual(marcos(m, 0, 8, 0.9, true), []); // 256 ms de «voz» durante la calibracion
  assert.equal(m.estado, 'calibrando');
  const a = m.procesa({ tipo: 'probabilidad', valor: 0.9, ms: 320 }, true);
  assert.deepEqual(a, [{ tipo: 'calibrado', ms: 320 }]);
  assert.equal(m.estado, 'en-espera');
});

test('interrupcion: un inicio que sigue con voz 150 ms interrumpe a la maquina, y el turno llega al cerrar', () => {
  const m = creaInterrupcion();
  marcos(m, 0, 11, 0.0, true); // calibra (352 ms)
  assert.deepEqual(m.procesa({ tipo: 'inicioHabla', ms: 400 }, true), []);
  assert.equal(m.estado, 'armado');
  const a = marcos(m, 400, 4, 0.9, true); // 128 ms: aun no
  assert.deepEqual(a, []);
  const b = marcos(m, 528, 1, 0.9, true); // 160 ms: confirma
  assert.equal(b.length, 1);
  assert.equal(b[0]?.tipo, 'interrumpir');
  if (b[0]?.tipo === 'interrumpir') assert.equal(b[0].msDesdeInicioHabla, 128);
  assert.equal(m.estado, 'persona-habla');
  const c = m.procesa({ tipo: 'finHabla', turno: { inicioMs: 400, finMs: 1900 } }, false);
  assert.deepEqual(c, [{ tipo: 'turno', turno: { inicioMs: 400, finMs: 1900 }, interrumpio: true }]);
  assert.equal(m.estado, 'en-espera');
});

test('interrupcion: un golpe corto arma y se desarma solo, sin interrumpir', () => {
  const m = creaInterrupcion();
  marcos(m, 0, 11, 0.0, true);
  m.procesa({ tipo: 'inicioHabla', ms: 400 }, true);
  assert.deepEqual(marcos(m, 400, 2, 0.9, true), []); // 64 ms de voz
  assert.deepEqual(marcos(m, 464, 10, 0.0, true), []); // 320 ms de silencio: desarma
  assert.equal(m.estado, 'en-espera');
});

test('interrupcion: con la maquina callada no interrumpe, pero entrega el turno (manos libres)', () => {
  const m = creaInterrupcion();
  marcos(m, 0, 11, 0.0, false);
  m.procesa({ tipo: 'inicioHabla', ms: 400 }, false);
  const a = marcos(m, 400, 6, 0.9, false);
  assert.deepEqual(a, []);
  assert.equal(m.estado, 'persona-habla');
  const audio = new Float32Array(16);
  const b = m.procesa({ tipo: 'finHabla', turno: { inicioMs: 400, finMs: 2000, audio } }, false);
  assert.equal(b.length, 1);
  assert.equal(b[0]?.tipo, 'turno');
  if (b[0]?.tipo === 'turno') {
    assert.equal(b[0].interrumpio, false);
    assert.equal(b[0].turno.audio, audio);
  }
});

test('interrupcion: un fin de habla sin confirmar pero mas largo que la confirmacion se entrega igual', () => {
  const m = creaInterrupcion();
  marcos(m, 0, 11, 0.0, false);
  m.procesa({ tipo: 'inicioHabla', ms: 400 }, false);
  const a = m.procesa({ tipo: 'finHabla', turno: { inicioMs: 400, finMs: 700 } }, false);
  assert.equal(a[0]?.tipo, 'turno');
  const corto = m.procesa({ tipo: 'inicioHabla', ms: 900 }, false);
  assert.deepEqual(corto, []);
  assert.deepEqual(m.procesa({ tipo: 'finHabla', turno: { inicioMs: 900, finMs: 1000 } }, false), []);
});

test('interrupcion: reinicia vuelve a calibrar', () => {
  const m = creaInterrupcion({ msCalibracion: 100 });
  marcos(m, 0, 5, 0, true); // 0, 32, 64, 96, 128 ms: el ultimo cruza los 100
  assert.equal(m.estado, 'en-espera');
  m.reinicia();
  assert.equal(m.estado, 'calibrando');
});
