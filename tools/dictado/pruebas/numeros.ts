/**
 * La gramatica de cantidades, caso por caso (≥ 40): lo que un pedido, una hora o una cifra
 * dictada dicen de verdad. Contra `dist/`, como el resto.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { numerosACifras, parseaCantidad, parseaCantidades, primerNumero } from '../dist/index.js';

const CASOS: Array<[string, number, string?, string?]> = [
  // [texto, valor esperado, unidad esperada, forma esperada]
  ['tres', 3, undefined, 'palabras'],
  ['3', 3, undefined, 'cifras'],
  ['son tres unidades', 3, 'unidad', 'palabras'],
  ['tres piezas', 3, 'pieza', 'palabras'],
  ['doce', 12, undefined, 'palabras'],
  ['veintiuno', 21, undefined, 'palabras'],
  ['veintiún cajas', 21, 'caja', 'palabras'],
  ['veinte y cinco', 25, undefined, 'palabras'],
  ['veinte cinco', 25, undefined, 'palabras'],
  ['cincuenta dos', 52, undefined, 'palabras'],
  ['cincuenta dos metros', 52, 'metro', 'palabras'],
  ['treinta seis', 36, undefined, 'palabras'],
  ['treinta', 30, undefined, 'palabras'],
  ['treinta y cinco', 35, undefined, 'palabras'],
  ['cuarenta y ocho kilos', 48, 'kilo', 'palabras'],
  ['cien', 100, undefined, 'palabras'],
  ['ciento dos', 102, undefined, 'palabras'],
  ['ciento veinticinco', 125, undefined, 'palabras'],
  ['doscientos', 200, undefined, 'palabras'],
  ['doscientas cincuenta', 250, undefined, 'palabras'],
  ['quinientos', 500, undefined, 'palabras'],
  ['seiscientos treinta y dos', 632, undefined, 'palabras'],
  ['novecientos noventa y nueve', 999, undefined, 'palabras'],
  ['mil', 1000, undefined, 'palabras'],
  ['mil doscientos', 1200, undefined, 'palabras'],
  ['dos mil', 2000, undefined, 'palabras'],
  ['tres mil cuatrocientos doce', 3412, undefined, 'palabras'],
  ['nueve mil novecientos noventa y nueve', 9999, undefined, 'palabras'],
  ['1,500', 1500, undefined, 'cifras'],
  ['1,500 piezas', 1500, 'pieza', 'cifras'],
  ['2.5 kilos', 2.5, 'kilo', 'cifras'],
  ['12%', 12, undefined, 'cifras'],
  ['dos coma cinco', 2.5, undefined, 'palabras'],
  ['dos punto cinco litros', 2.5, 'litro', 'palabras'],
  ['tres y medio', 3.5, undefined, 'palabras'],
  ['uno y cuarto', 1.25, undefined, 'palabras'],
  ['medio kilo', 0.5, 'kilo', 'palabras'],
  ['media docena', 6, undefined, 'colectivo'],
  ['una docena', 12, undefined, 'colectivo'],
  ['docena', 12, undefined, 'colectivo'],
  ['dos docenas', 24, undefined, 'colectivo'],
  ['docena y media', 18, undefined, 'colectivo'],
  ['una decena', 10, undefined, 'colectivo'],
  ['un millar', 1000, undefined, 'colectivo'],
  ['un par de guantes', 1, 'par', 'palabras'],
  ['tres pares', 3, 'par', 'palabras'],
  ['confirmo, son doce cajas', 12, 'caja', 'palabras'],
  ['pasillo A, estante 12', 12, undefined, 'cifras'],
  ['sí, tres', 3, undefined, 'palabras'],
  ['a las diez de la mañana', 10, undefined, 'palabras'],
  ['dame veinte', 20, undefined, 'palabras'],
  ['cero', 0, undefined, 'palabras'],
];

for (const [texto, valor, unidad, forma] of CASOS) {
  test(`cantidad: «${texto}» → ${valor}${unidad ? ` ${unidad}` : ''}`, () => {
    const c = parseaCantidad(texto);
    assert.ok(c, 'se esperaba una cantidad');
    assert.equal(c.valor, valor);
    assert.equal(c.unidad, unidad);
    if (forma) assert.equal(c.forma, forma);
  });
}

test('cantidad: sin numero no hay cantidad, y «y» o «coma» sueltas no inventan nada', () => {
  assert.equal(parseaCantidad('repite por favor'), undefined);
  assert.equal(parseaCantidad('no entendí'), undefined);
  assert.equal(parseaCantidad('coma'), undefined);
  assert.equal(primerNumero('otra vez'), undefined);
});

test('cantidad: «N mil» hasta 999 999, en palabras y en cifras', () => {
  assert.equal(parseaCantidad('doce mil')?.valor, 12000);
  assert.equal(parseaCantidad('novecientos noventa y nueve mil')?.valor, 999000);
  assert.equal(parseaCantidad('12,000')?.valor, 12000);
});

test('cantidades: varias en una frase, en orden y sin solaparse', () => {
  const c = parseaCantidades('pasillo doce, estante tres, veinticinco unidades y dos cajas');
  assert.deepEqual(c.map((x) => [x.valor, x.unidad]), [[12, undefined], [3, undefined], [25, 'unidad'], [2, 'caja']]);
  // «cincuenta, dos cajas» sigue siendo 52 cajas: la unidad tras una decena suma aunque falte la «y».
  // Es la lectura SEGURA para confirmar: leer 50 y aparte 2 es lo que confirma mal una linea de 50.
  assert.deepEqual(parseaCantidades('cincuenta dos cajas').map((x) => [x.valor, x.unidad]), [[52, 'caja']]);
});

test('numerosACifras: iguala referencia y motor, y deja el articulo «un» en paz', () => {
  assert.equal(numerosACifras('tres mil cuatrocientos doce pesos'), '3412 pesos');
  assert.equal(numerosACifras('el doce por ciento'), 'el 12 %');
  assert.equal(numerosACifras('un momento, una cotización'), 'un momento una cotizacion');
  assert.equal(numerosACifras('treinta y cinco'), '35');
});
