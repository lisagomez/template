/** La ganancia automatica: sube si entra flojo con texto, baja si satura, no toca lo sano, y respeta los topes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajustaGanancia, factorDe } from '../dist/node/index.js';

test('ganancia: sano no se toca; flojo con texto sube 6; saturando baja 6; topes', () => {
  assert.deepEqual(ajustaGanancia({ actualDb: 0, picoRawDb: -15, picoConGananciaDb: -15, huboTexto: true }), { nuevaDb: 0 });
  assert.deepEqual(ajustaGanancia({ actualDb: 0, picoRawDb: -40, picoConGananciaDb: -40, huboTexto: true }), { nuevaDb: 6, motivo: 'flojo' });
  assert.deepEqual(ajustaGanancia({ actualDb: 0, picoRawDb: -40, picoConGananciaDb: -40, huboTexto: false }), { nuevaDb: 0 });
  assert.deepEqual(ajustaGanancia({ actualDb: 12, picoRawDb: -14, picoConGananciaDb: -2, huboTexto: true }), { nuevaDb: 6, motivo: 'saturando' });
  assert.deepEqual(ajustaGanancia({ actualDb: 18, picoRawDb: -50, picoConGananciaDb: -32, huboTexto: true }), { nuevaDb: 18 });
  assert.deepEqual(ajustaGanancia({ actualDb: 0, picoRawDb: -1, picoConGananciaDb: -1, huboTexto: true }), { nuevaDb: 0, motivo: 'microfono-satura-solo' });
  assert.deepEqual(ajustaGanancia({ actualDb: 0, picoRawDb: -Infinity, picoConGananciaDb: -Infinity, huboTexto: false }), { nuevaDb: 0 });
  assert.ok(Math.abs(factorDe(6) - 1.995) < 0.01);
});
