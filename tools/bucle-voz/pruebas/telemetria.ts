/**
 * Telemetría honesta: desde el fin real del habla, con el cierre del VAD dentro, hasta el primer
 * audio que suena.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creaTelemetria, latencia, percentil, resume, tramos } from '../dist/index.js';

test('la latencia cuenta desde el fin real, no desde que el VAD decide', () => {
  const t = creaTelemetria();
  t.abre(1, 1000);
  t.marca(1, 'cierre', 1600);
  t.marca(1, 'transcrito', 1700);
  t.marca(1, 'enrutado', 1701);
  t.marca(1, 'vozLista', 1820);
  t.marca(1, 'suena', 1850);
  t.cierra(1, 'completo');
  const r = t.turno(1);
  assert.ok(r);
  assert.equal(latencia(r), 850, 'incluye los 600 ms de cierre del VAD');
  assert.deepEqual(tramos(r).map((x) => [x.etapa, x.desde, x.ms]), [['cierre', 0, 600], ['transcrito', 600, 100], ['enrutado', 700, 1], ['vozLista', 701, 119], ['suena', 820, 30]]);
});

test('un cierre anterior al fin real es un error de quien mide y se rechaza', () => {
  const t = creaTelemetria();
  t.abre(1, 1000);
  assert.throws(() => t.marca(1, 'cierre', 900), /no puede ser anterior/);
  assert.throws(() => t.abre(2, Number.NaN), /instante/);
});

test('la primera marca gana (un evento repetido no mueve la cifra)', () => {
  const t = creaTelemetria();
  t.abre(1, 0);
  t.marca(1, 'suena', 500);
  t.marca(1, 'suena', 900);
  assert.equal(t.turno(1)?.marcas.suena, 500);
});

test('el resumen solo cuenta turnos completos que sonaron, por ruta, con p50 y p95', () => {
  const t = creaTelemetria();
  [400, 500, 600, 700, 2000].forEach((ms, i) => {
    t.abre(i + 1, 0);
    t.anota(i + 1, { ruta: 'orden' });
    t.marca(i + 1, 'suena', ms);
    t.cierra(i + 1, 'completo');
  });
  t.abre(9, 0);
  t.anota(9, { ruta: 'orden' });
  t.marca(9, 'suena', 50);
  t.cierra(9, 'interrumpido');
  assert.deepEqual(resume(t.turnos(), 'orden'), { n: 5, p50: 600, p95: 2000 });
  assert.equal(resume(t.turnos(), 'llm').n, 0);
  assert.equal(percentil([], 50), undefined);
});
