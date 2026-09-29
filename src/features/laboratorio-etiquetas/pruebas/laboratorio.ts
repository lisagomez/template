/**
 * La suite del laboratorio de etiquetas (entra en `npm run validate` dentro de `prueba:etiquetas`):
 * corre TODOS los casos de verdad y exige que cada uno dé el estado que declara, que cada herramienta
 * tenga al menos 5 casos y al menos una trampa, y que la aprobación salga de los resultados y no de
 * una lista escrita a mano. El motor local y el corpus real solo se usan si esta máquina los declara
 * (`ETIQUETAS_MOTOR_PYTHON`, `ETIQUETAS_CORPUS_REAL`); sin ellos, esos casos quedan «no medido».
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { motorPorProceso } from '../../../../tools/etiquetas-gs1/dist/motores/proceso.js';
import { aprobadas, CASOS, correLaboratorio, faltaRequisito, HERRAMIENTAS, herramientaDePantalla } from '../services/catalogo.ts';
import type { ContextoDeLaboratorio } from '../services/tipos.ts';

const python = process.env['ETIQUETAS_MOTOR_PYTHON'];
const corpus = process.env['ETIQUETAS_CORPUS_REAL'];
const ctx: ContextoDeLaboratorio = {
  motor: python ? motorPorProceso({ comando: python, argumentos: [resolve('tools/etiquetas-gs1/motores/rapidocr-json.py')] }) : null,
  corpusReal: corpus && existsSync(resolve(corpus, 'esperado.json')) ? resolve(corpus) : null,
};

test('cada herramienta tiene al menos 5 casos y al menos una trampa; ids únicos', () => {
  for (const h of HERRAMIENTAS) {
    const suyos = CASOS.filter((c) => c.herramienta === h.id);
    assert.ok(suyos.length >= 5, `${h.nombre}: ${suyos.length} casos`);
    assert.ok(suyos.some((c) => c.trampa), `${h.nombre}: sin casos-trampa`);
  }
  assert.equal(new Set(CASOS.map((c) => c.id)).size, CASOS.length, 'ids únicos');
});

test('cada caso da el estado que declara (corrido de verdad)', async () => {
  const corridos = await correLaboratorio(ctx);
  const tabla = corridos.map((c) => `${c.coincide ? '✓' : '✗'} ${c.caso.id.padEnd(20)} ${c.resultado.estado.padEnd(10)} ${c.caso.trampa ? `[trampa: ${c.caso.trampa}] ` : ''}${c.caso.titulo}`);
  console.log(tabla.join('\n'));
  const malos = corridos.filter((c) => !c.coincide);
  assert.equal(malos.length, 0, malos.map((m) => `${m.caso.id}: esperaba ${m.caso.esperado}, dio ${m.resultado.estado} — ${m.resultado.evidencia.filter((e) => e.startsWith('✗') || e.startsWith('error')).join('; ')}`).join('\n'));
});

test('lo aprobado sale de los resultados: sin motor, la fecha por foto NO se aprueba', async () => {
  const a = aprobadas(await correLaboratorio(ctx));
  const esperadas = HERRAMIENTAS.filter((h) => CASOS.filter((c) => c.herramienta === h.id).every((c) => !faltaRequisito(c, ctx))).map((h) => h.id);
  assert.deepEqual(a, esperadas);
  if (!ctx.motor) assert.ok(!a.includes('fecha-foto'), 'sin motor, la fecha por foto sigue en el laboratorio');
});

test('cada pantalla de /etiquetas que depende del laboratorio sabe de qué herramienta', () => {
  assert.equal(herramientaDePantalla('/etiquetas/recibir'), 'recepcion');
  assert.equal(herramientaDePantalla('/etiquetas/escanear'), 'zonas');
  assert.equal(herramientaDePantalla('/etiquetas/ajustes'), undefined, 'ajustes no depende del laboratorio');
  const todas = HERRAMIENTAS.flatMap((h) => h.pantallas);
  assert.equal(new Set(todas).size, todas.length, 'una pantalla, una herramienta');
});
