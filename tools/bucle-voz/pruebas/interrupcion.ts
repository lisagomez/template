/**
 * Interrupción con el micrófono abierto: la persona la corta, su propia voz (eco) no.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creaInterrupcion, type AccionInterrupcion } from '../dist/index.js';

/** Corre `n` marcos de 32 ms a partir de `desde` y junta las acciones. */
function corre(m: ReturnType<typeof creaInterrupcion>, desde: number, n: number, marco: { prob: number; mic?: number; salida?: number }, habla = true): AccionInterrupcion[] {
  const salida: AccionInterrupcion[] = [];
  for (let i = 0; i < n; i++) salida.push(...m.procesa({ ms: desde + i * 32, prob: marco.prob, nivelMicDb: marco.mic, nivelSalidaDb: marco.salida }, habla));
  return salida;
}

test('la persona hablando encima: atenúa al primer marco y corta a los 120 ms de voz', () => {
  const m = creaInterrupcion();
  const acciones = corre(m, 0, 10, { prob: 0.9, mic: -20, salida: -18 });
  assert.equal(acciones[0]?.tipo, 'atenua');
  const corte = acciones.find((a) => a.tipo === 'interrumpe');
  assert.ok(corte && corte.tipo === 'interrumpe');
  assert.ok(corte.msDesdeInicio >= 96 && corte.msDesdeInicio <= 160, `cortó a los ${corte.msDesdeInicio} ms`);
});

test('un «¡Para!» corto (240 ms, 5 marcos con voz) corta', () => {
  const m = creaInterrupcion();
  const voz = corre(m, 0, 5, { prob: 1, mic: -16, salida: -15 });
  const cola = corre(m, 160, 3, { prob: 0.4, mic: -40, salida: -15 });
  assert.ok([...voz, ...cola].some((a) => a.tipo === 'interrumpe'));
});

test('el «Para.» medido (230 ms; arranque y cola por debajo de la puerta, 4 marcos encima) corta', () => {
  const m = creaInterrupcion({ perdidaInicialDb: 14.8 });
  // Los marcos tal cual los registró la sonda en el HUD (2026-10-16): con 150 ms se quedaba armado en 128 y no cortaba.
  const marcos: [number, number, number][] = [[1, -27.9, -16], [1, -10.7, -16.2], [1, -14.9, -16.3], [1, -17.1, -16.3], [1, -21.2, -16.1], [1, -28.7, -16.3], [1, -37.7, -15.8], [0.41, -45.6, -15.5]];
  const acciones = marcos.flatMap(([prob, mic, salida], i) => m.procesa({ ms: i * 32, prob, nivelMicDb: mic, nivelSalidaDb: salida }, true));
  assert.ok(acciones.some((a) => a.tipo === 'interrumpe'), JSON.stringify(acciones));
});

test('su propia voz por el altavoz (eco 20 dB por debajo) nunca la interrumpe', () => {
  const m = creaInterrupcion();
  // El detector por energía ve «voz» (prob alta) porque el eco tiene energía; la puerta lo separa.
  const acciones = corre(m, 0, 300, { prob: 0.95, mic: -38, salida: -18 });
  assert.deepEqual(acciones, []);
  assert.ok(Math.abs(m.perdidaDb - 20) < 1, `aprendió la pérdida de eco: ${m.perdidaDb.toFixed(1)} dB`);
});

test('el micrófono en el suelo de ruido no enseña nada del eco (la pérdida no se infla)', () => {
  const m = creaInterrupcion();
  corre(m, 0, 300, { prob: 0.02, mic: -60, salida: -17 });
  assert.equal(m.perdidaDb, 15);
  const fuerte = creaInterrupcion();
  corre(fuerte, 0, 80, { prob: 0.9, mic: -30, salida: -17 }); // eco más fuerte que lo supuesto (13 dB): se aprende
  assert.ok(fuerte.perdidaDb < 14 && fuerte.perdidaDb >= 12, `${fuerte.perdidaDb}`);
});

test('un detector que sostiene la probabilidad en los valles del eco (Silero) no infla la pérdida', () => {
  const m = creaInterrupcion();
  // Sílabas de eco a −21 dB de lo que suena y valles a −35 con p alta igual, como los registró la sonda en el HUD
  // (2026-10-17). Subiendo tan rápido como baja, la pérdida iba a la media (28 dB) y los picos pasaban por voz.
  const acciones: AccionInterrupcion[] = [];
  for (let i = 0; i < 600; i++) acciones.push(...m.procesa({ ms: i * 32, prob: 0.95, nivelMicDb: i % 10 < 5 ? -37 : -51, nivelSalidaDb: -16 }, true));
  assert.deepEqual(acciones, []);
  assert.ok(m.perdidaDb < 25, `la pérdida sigue cerca del eco, no de la media: ${m.perdidaDb.toFixed(1)} dB`);
});

test('la voz de la persona que no llegó a confirmar no le quita a nadie la posibilidad de interrumpir', () => {
  const m = creaInterrupcion();
  corre(m, 0, 200, { prob: 0.95, mic: -36, salida: -16 }); // eco a −20: aprende ~20
  // La cascada que se midió: cada marco de una sílaba que se apaga queda JUSTO por debajo de la puerta, se aprende como
  // eco, baja el umbral y el siguiente marco vuelve a quedar justo debajo. Con ataque instantáneo, la pérdida se hundía.
  for (let k = 0; k < 120; k++) {
    const mic = -16 - m.perdidaDb + 6 - 1;
    m.procesa({ ms: 10_000 + k * 32, prob: 0.95, nivelMicDb: mic, nivelSalidaDb: -16 }, true);
  }
  assert.ok(m.perdidaDb >= 12, `la pérdida no se hunde por debajo del suelo: ${m.perdidaDb.toFixed(1)} dB`);
  assert.ok(corre(m, 40_000, 8, { prob: 0.95, mic: -18, salida: -15 }).some((a) => a.tipo === 'interrumpe'), 'y un «para» a volumen normal sigue cortando');
});

test('eco desalineado con lo que marca la posición del audio (sílabas, ±5 marcos) no la interrumpe', () => {
  const m = creaInterrupcion();
  const salida = (i: number) => (Math.floor(i / 4) % 2 === 0 ? -16 : -45); // sílabas de 128 ms
  const referencia = (i: number) => Math.max(...Array.from({ length: 16 }, (_, k) => salida(i - 9 + k))); // [−300, +200] ms
  const acciones: AccionInterrupcion[] = [];
  for (let i = 10; i < 400; i++) {
    const eco = salida(i + (i % 7 < 3 ? -5 : 5)) - 20; // el eco llega antes o después que la posición
    acciones.push(...m.procesa({ ms: i * 32, prob: eco > -50 ? 0.95 : 0.05, nivelMicDb: Math.max(eco, -58), nivelSalidaDb: referencia(i) }, true));
  }
  assert.ok(!acciones.some((a) => a.tipo === 'interrumpe'));
  // …y la persona, a su volumen normal, sí la corta
  assert.ok(corre(m, 400 * 32, 10, { prob: 0.95, mic: -20, salida: -16 }).some((a) => a.tipo === 'interrumpe'));
});

test('con la pérdida aprendida, la voz de la persona por encima del eco sí corta', () => {
  const m = creaInterrupcion();
  corre(m, 0, 100, { prob: 0.95, mic: -38, salida: -18 });
  const acciones = corre(m, 3200, 10, { prob: 0.95, mic: -24, salida: -18 });
  assert.ok(acciones.some((a) => a.tipo === 'interrumpe'));
});

test('una tos o un golpe: atenúa, y si no sigue la voz, restaura sin cortar', () => {
  const m = creaInterrupcion();
  const golpe = corre(m, 0, 3, { prob: 0.9, mic: -15, salida: -18 });
  const silencio = corre(m, 96, 10, { prob: 0.1, mic: -60, salida: -18 });
  assert.deepEqual([...golpe, ...silencio].map((a) => a.tipo), ['atenua', 'restaura']);
});

test('con la máquina callada no interrumpe nada (y si estaba atenuada, restaura)', () => {
  const m = creaInterrupcion();
  assert.deepEqual(corre(m, 0, 20, { prob: 0.9 }, false), []);
  corre(m, 0, 2, { prob: 0.9, mic: -10, salida: -18 });
  assert.deepEqual(m.procesa({ ms: 100, prob: 0.9 }, false).map((a) => a.tipo), ['restaura']);
});

test('sin niveles (sin referencia de salida) la puerta se abre y decide la probabilidad', () => {
  const m = creaInterrupcion();
  assert.ok(corre(m, 0, 8, { prob: 0.9 }).some((a) => a.tipo === 'interrumpe'));
});

test('eco que se cuela por la puerta en marcos sueltos (1 de cada 3) no acumula una interrupción', () => {
  const m = creaInterrupcion();
  const acciones: AccionInterrupcion[] = [];
  for (let i = 0; i < 300; i++) {
    const cuela = i % 3 === 0;
    acciones.push(...m.procesa({ ms: i * 32, prob: 0.95, nivelMicDb: cuela ? -20 : -38, nivelSalidaDb: -18 }, true));
  }
  assert.ok(!acciones.some((a) => a.tipo === 'interrumpe'), JSON.stringify(acciones.slice(0, 6)));
});
