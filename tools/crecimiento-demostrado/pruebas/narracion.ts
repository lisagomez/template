/** La narración restringida: números(texto) ⊆ hechos verificados, el sentido del verbo, y nada causal sin hipótesis. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numerosDe, verificaNarracion, type ValorVerificado } from '../dist/index.js';

const lee = (t: string) => {
  const r = numerosDe(t);
  assert.ok(r.ok, t);
  return r.numeros.map((n) => `${n.clase}:${n.num}/${n.den}`);
};

test('lee cifras de México: pesos con comas, porcentajes, magnitudes, palabras y fracciones', () => {
  assert.deepEqual(lee('Creció $1,234.56 y bajó -$12.'), ['pesos:123456/100', 'pesos:-12/1']);
  assert.deepEqual(lee('el 12.5 % y el doce por ciento'), ['porcentaje:125/10', 'porcentaje:12/1']);
  assert.deepEqual(lee('$1.2 millones'), ['pesos:12000000/10'], 'un millón doscientos mil, escrito a una décima de millón');
  assert.deepEqual(lee('la mitad de los 14 clientes'), ['fraccion:1/2', 'cantidad:14/1'], 'en el orden del texto');
});

test('lo que no es cifra del negocio no cuenta: periodos, años, supuestos, invariantes y seudónimos', () => {
  assert.deepEqual(lee('Entre 2T 2026 y 2026-3T, en agosto de 2025, según SA-02 e INV-03, cli_0123456789abcdef'), []);
});

test('una coma decimal a la europea no se adivina: se lee como dos cifras, y ninguna está verificada', () => {
  const r = verificaNarracion('el ticket fue de 1,23', [], { causalPermitido: false });
  assert.equal(r.ok, false);
});

const V = (etiqueta: string, clase: ValorVerificado['clase'], num: bigint, den = BigInt(1)): ValorVerificado => ({ etiqueta, clase, num, den });
const permitidos = [V('ΔR(T)', 'pesos', BigInt(85606557), BigInt(100)), V('|N|', 'cantidad', BigInt(2)), V('razón', 'proporcion', BigInt(1284), BigInt(1000)), V('ΔR(L)', 'pesos', -BigInt(19330858), BigInt(100))];

test('cada cifra coincide a la precisión con que se escribió; una sola inventada bloquea', () => {
  assert.equal(verificaNarracion('Creció $856,065.57 con 2 clientes nuevos (128.4 %).', permitidos, { causalPermitido: false }).ok, true);
  assert.equal(verificaNarracion('Creció $856,066 y unos $0.9 millones.', permitidos, { causalPermitido: false }).ok, true);
  const r = verificaNarracion('Creció $856,065.57 y el margen subió 23.7 %.', permitidos, { causalPermitido: false });
  assert.equal(r.ok, false);
  assert.deepEqual(!r.ok && r.bloqueos.map((b) => b.crudo), ['23.7 %']);
});

test('el sentido: una cifra verdadera con el verbo al revés se bloquea (también con acentos)', () => {
  assert.equal(verificaNarracion('El ingreso cayó $856,065.57.', permitidos, { causalPermitido: false }).ok, false);
  assert.equal(verificaNarracion('Los perdidos restaron $193,308.58.', permitidos, { causalPermitido: false }).ok, true);
  assert.equal(verificaNarracion('Los perdidos crecieron $193,308.58.', permitidos, { causalPermitido: false }).ok, false);
});

test('el lenguaje causal sin hipótesis se bloquea, aunque la palabra termine en vocal acentuada', () => {
  for (const t of ['Creció $856,065.57 porque subimos precios.', 'La expansión causó el crecimiento.', 'Bajar el precio aumentará las ventas.', 'Gracias a los mayoristas creció.']) {
    const r = verificaNarracion(t, permitidos, { causalPermitido: false });
    assert.equal(r.ok, false, t);
  }
  assert.equal(verificaNarracion('Subir precios aumentará el margen: es una hipótesis.', [], { causalPermitido: true }).ok, true);
});
