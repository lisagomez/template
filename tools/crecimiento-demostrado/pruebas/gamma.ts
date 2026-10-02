/** Γ: las dos pymes sellan; lo que se excluye lleva motivo; cada defecto plantado detiene el sellado con SU invariante. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INVARIANTES, verificaSello, type Gamma } from '../dist/index.js';
import { correSucios, hechosConInyeccion, replayDeGamma } from '../dist/laboratorio/index.js';
import { pymeSintetica } from '../dist/sinteticos/index.js';
import { XML, distribuidora, tienda } from './_ayuda.ts';

test('las dos pymes sintéticas sellan Γ, con su hash y sus doce invariantes comprobados', () => {
  for (const { gamma } of [distribuidora(), tienda()]) {
    assert.match(gamma.hash, /^snap:[0-9a-f]{32}$/);
    assert.equal(gamma.contenido.invariantes.length, INVARIANTES.length);
    assert.ok(verificaSello(gamma));
  }
  assert.ok(distribuidora().gamma.contenido.transacciones.length > 2000);
  assert.ok(tienda().gamma.contenido.transacciones.length > 40000);
});

test('nada se descarta en silencio: copia idéntica, compra y cancelados salen con su motivo', () => {
  const motivos = distribuidora().gamma.contenido.exclusiones.map((e) => e.motivo);
  assert.equal(motivos.filter((m) => m.startsWith('copia idéntica')).length, 1);
  assert.equal(motivos.filter((m) => m.includes('es una compra')).length, 1);
  const cancelados = pymeSintetica('distribuidora').libro.ventas.filter((v) => v.cancelada).length;
  assert.equal(motivos.filter((m) => m.startsWith('cancelada')).length, cancelados);
});

test('la global de septiembre se emite en octubre y se atribuye a septiembre (InformacionGlobal)', () => {
  const g = distribuidora().gamma;
  const septiembre = pymeSintetica('distribuidora').libro.ventas.find((v) => v.anonimo && v.dia === '2026-09-30')!;
  assert.match(septiembre.comprobante.fecha, /^2026-10-0[1-3]/, 'emitida fuera del horizonte');
  const tx = g.contenido.transacciones.find((t) => t.id === septiembre.uuid);
  assert.equal(tx?.dia, '2026-09-30', 'pero cuenta en el mes que declara');
});

test('Γ alterado después de sellarse deja de verificar', () => {
  const g = distribuidora().gamma;
  const t0 = g.contenido.transacciones[0]!;
  const alterado: Gamma = { ...g, contenido: { ...g.contenido, transacciones: [{ ...t0, centavos: t0.centavos + 1 }, ...g.contenido.transacciones.slice(1)] } };
  assert.equal(verificaSello(alterado), false);
});

test('snapshots sucios: un defecto por invariante, y cada uno detiene el sellado con su nombre', () => {
  const filas = correSucios(XML);
  const cubiertos = new Set(filas.map((f) => f.esperado));
  assert.deepEqual([...cubiertos].sort(), INVARIANTES.map((i) => i.id).sort(), 'los doce invariantes tienen su defecto plantado');
  for (const f of filas) {
    assert.equal(f.sellado, false, `${f.id}: no debió sellar`);
    assert.ok(f.obtenidos.includes(f.esperado), `${f.id}: esperaba ${f.esperado}, obtuvo ${f.obtenidos.join(',')}`);
  }
});

test('una instrucción escondida en un concepto es DATO: Γ sella y el puente no cambia un centavo', () => {
  const r = hechosConInyeccion(XML, 'distribuidora');
  assert.equal(r.sellado, true);
  assert.equal(r.mismosHechos, true);
  assert.notEqual(r.gammaLimpio, r.gammaInyectado, 'otros bytes, otro Γ: la fuente sí cambió');
});

test('replay de Γ: dos construcciones desde las mismas fuentes son idénticas byte a byte', () => {
  const r = replayDeGamma(XML, 'tienda');
  assert.equal(r.iguales, true);
  assert.equal(r.primera, r.segunda);
  assert.ok(r.bytes > 1_000_000);
});
