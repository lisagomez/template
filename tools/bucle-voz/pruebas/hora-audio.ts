/**
 * La hora en letra (en la zona pedida, no en la de la máquina) y la aritmética de audio.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aPcm16, codificaWav, dePcm16, fechaEnPalabras, horaEnPalabras, msPrimerSonido, nivelDb, numeroEnPalabras, nivelMaximoReciente, recortaSilencio } from '../dist/index.js';

const enUtc = (h: number, m: number) => new Date(Date.UTC(2026, 9, 16, h, m));

test('la hora de Ciudad de México en letra, con su franja', () => {
  assert.equal(horaEnPalabras(enUtc(23, 20)), 'Son las cinco y veinte de la tarde.');
  assert.equal(horaEnPalabras(enUtc(7, 0)), 'Es la una en punto de la madrugada.');
  assert.equal(horaEnPalabras(enUtc(15, 30)), 'Son las nueve y media de la mañana.');
  assert.equal(horaEnPalabras(enUtc(18, 15)), 'Son las doce y cuarto de la tarde.');
  assert.equal(horaEnPalabras(enUtc(3, 45)), 'Son las nueve y cuarenta y cinco de la noche.');
  assert.equal(horaEnPalabras(enUtc(23, 20), 'Europe/Madrid'), 'Es la una y veinte de la madrugada.');
});

test('la fecha y los números en letra', () => {
  assert.equal(fechaEnPalabras(enUtc(20, 0)), 'Hoy es viernes dieciséis de octubre.');
  assert.equal(numeroEnPalabras(21), 'veintiuno');
  assert.equal(numeroEnPalabras(47), 'cuarenta y siete');
  assert.equal(numeroEnPalabras(130), '130');
});

test('PCM16 ida y vuelta con una sola escala, con tope', () => {
  const x = new Float32Array([0, 0.5, -0.5, 1, -1, 1.5]);
  const pcm = aPcm16(x);
  assert.deepEqual([...pcm], [0, 16384, -16384, 32767, -32768, 32767]);
  const vuelta = dePcm16(new Uint8Array(pcm.buffer));
  assert.equal(vuelta[1], 0.5);
  assert.equal(vuelta[4], -1);
});

test('WAV de 44 bytes de cabecera y el primer sonido tras el silencio inicial', () => {
  const muestras = new Float32Array(16_000);
  for (let i = 4000; i < 16_000; i++) muestras[i] = 0.3 * Math.sin(i / 5);
  const wav = new DataView(codificaWav(muestras, 16_000));
  assert.equal(wav.byteLength, 44 + 32_000);
  assert.equal(wav.getUint32(24, true), 16_000);
  assert.equal(msPrimerSonido(muestras, 16_000), 250);
  assert.equal(msPrimerSonido(new Float32Array(100), 16_000), undefined);
  assert.equal(nivelDb(new Float32Array(10)), -180);
});

test('el silencio de los bordes se recorta (es latencia muda antes del primer sonido)', () => {
  const muestras = new Float32Array(16_000);
  for (let i = 1600; i < 8000; i++) muestras[i] = 0.3 * Math.sin(i / 5);
  const r = recortaSilencio(muestras, 16_000);
  assert.ok(Math.abs((msPrimerSonido(r, 16_000) ?? -1) - 10) <= 10, 'deja ~15 ms delante, no 100');
  assert.ok(r.length < 8000 - 1600 + 16_000 * 0.15, 'y como mucho 120 ms detrás');
  const muda = new Float32Array(500);
  assert.equal(recortaSilencio(muda, 16_000), muda, 'lo que nunca suena se deja igual');
});

test('la referencia de eco es el máximo de lo que sonó hace poco, no el instante (el eco llega tarde)', () => {
  const muestras = new Float32Array(16_000);
  for (let i = 0; i < 4_000; i++) muestras[i] = 0.5 * Math.sin(i / 5); // una sílaba fuerte en los primeros 250 ms
  const enLaPausa = 6_000; // 375 ms: ya no suena nada en este instante…
  assert.equal(nivelDb(muestras, enLaPausa - 240, enLaPausa + 240), -180);
  assert.ok(nivelMaximoReciente(muestras, 16_000, enLaPausa) > -10, '…pero lo que sonó hace 125 ms sigue llegando al micrófono');
  assert.equal(nivelMaximoReciente(muestras, 16_000, 12_000), -180, 'pasados 300 ms ya no cuenta');
});
