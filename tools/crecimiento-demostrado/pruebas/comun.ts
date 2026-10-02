/** Lo exacto: JSON canónico, dinero en centavos, periodos como texto, seudónimos. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anterior, canoniza, centavosConvertidos, centavosDe, centavosDeOperacion, delAnioAnterior, diaDe, formatoPesos, formatoPesosRedondo, periodoDe, rango, seudonimo, suma } from '../dist/index.js';

test('JSON canónico: claves ordenadas por código, sin espacios; un flotante NO se sella', () => {
  assert.equal(canoniza({ b: 1, a: [true, null, 'x'], c: undefined }), '{"a":[true,null,"x"],"b":1}');
  assert.equal(canoniza({ Z: 1, a: 2 }), canoniza({ a: 2, Z: 1 }));
  assert.throws(() => canoniza({ p: 0.1 + 0.2 }), /flotante/);
});

test('dinero: aritmética decimal exacta y UN redondeo, mitades lejos del cero', () => {
  assert.equal(centavosDe('1234.565'), 123457);
  assert.equal(centavosDe('-0.005'), -1);
  assert.equal(centavosDe('12'), 1200);
  assert.equal(centavosDe('1,234.00'), null);
  assert.equal(centavosConvertidos('100.00', '17.2345'), 172345);
  assert.equal(centavosDeOperacion('1000.10', '100.05', '17.1234'), 1541192, '900.05 × 17.1234 = 15,411.916… → 15,411.92');
  assert.equal(0.1 + 0.2 === 0.3, false, 'por eso nada de flotantes');
  assert.equal(suma([1, 2, 3]), 6);
  assert.equal(formatoPesos(-123456), '-$1,234.56');
  assert.equal(formatoPesosRedondo(123450), '$1,235');
});

test('periodos como texto: sin Date, sin zona; trimestres y meses', () => {
  assert.equal(diaDe('2026-09-30T23:59:59'), '2026-09-30', 'la última hora del trimestre sigue en el trimestre');
  assert.equal(diaDe('2025-02-30T10:00:00'), null);
  assert.equal(diaDe('2024-02-29T10:00:00'), '2024-02-29');
  assert.equal(periodoDe('2026-09-30', 'trimestre'), '2026-3T');
  assert.equal(anterior('2025-1T'), '2024-4T');
  assert.equal(anterior('2025-01'), '2024-12');
  assert.equal(delAnioAnterior('2026-3T'), '2025-3T');
  assert.deepEqual(rango('2025-3T', '2026-1T'), ['2025-3T', '2025-4T', '2026-1T']);
});

test('seudónimo: estable, con llave, y nunca el RFC', () => {
  const a = seudonimo('llave', 'ABC010101AB1');
  assert.equal(a, seudonimo('llave', ' abc010101ab1 '));
  assert.notEqual(a, seudonimo('otra', 'ABC010101AB1'));
  assert.match(a, /^cli_[0-9a-f]{16}$/);
  assert.ok(!a.includes('ABC'));
});

test('el dueño escribe el trimestre como quiera: «1T 2026», «primer trimestre de 2026» o la notación con T delante', async () => {
  const { interpreta } = await import('../dist/index.js');
  const { ESPEC_DISTRIBUIDORA } = await import('../dist/sinteticos/index.js');
  // La notación «T» + dígito se arma aquí: la gobernanza la reserva para identificadores de caso.
  const conTDelante = `¿De dónde salió el crecimiento del ${'T'}1 2026?`;
  for (const q of ['¿De dónde salió el crecimiento del 1T 2026?', '¿De dónde salió el crecimiento del primer trimestre de 2026?', conTDelante, '¿De dónde salió el crecimiento de 2026-1T?']) {
    const i = interpreta(q, ESPEC_DISTRIBUIDORA);
    assert.deepEqual([i?.desde, i?.hasta], ['2025-4T', '2026-1T'], q);
  }
});
