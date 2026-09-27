/**
 * La suite del laboratorio (entra en `npm run validate`): corre TODOS los casos de verdad y exige
 * que cada uno dé el estado que declara, que cada herramienta tenga al menos 5 casos y al menos
 * una trampa, y que la aprobación salga de los resultados y no de una lista escrita a mano.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aprobadas, CASOS, correLaboratorio, HERRAMIENTAS } from '../services/catalogo.ts';

const ctx = { llaveLlm: Boolean(process.env['OPENROUTER_API_KEY']) };

test('cada herramienta tiene al menos 5 casos y al menos una trampa', () => {
  for (const h of HERRAMIENTAS) {
    const suyos = CASOS.filter((c) => c.herramienta === h.id);
    assert.ok(suyos.length >= 5, `${h.nombre}: ${suyos.length} casos`);
    assert.ok(suyos.some((c) => c.trampa), `${h.nombre}: sin casos-trampa`);
  }
  assert.equal(new Set(CASOS.map((c) => c.id)).size, CASOS.length, 'ids únicos');
});

test('cada caso da el estado que declara (corrido de verdad)', async () => {
  const corridos = await correLaboratorio(ctx);
  const tabla = corridos.map((c) => `${c.coincide ? '✓' : '✗'} ${c.caso.id.padEnd(15)} ${c.resultado.estado.padEnd(10)} ${c.caso.trampa ? `[trampa: ${c.caso.trampa}] ` : ''}${c.caso.titulo}`);
  console.log(tabla.join('\n'));
  const malos = corridos.filter((c) => !c.coincide);
  assert.equal(malos.length, 0, malos.map((m) => `${m.caso.id}: esperaba ${m.caso.esperado}, dio ${m.resultado.estado} — ${m.resultado.evidencia.filter((e) => e.startsWith('✗')).join('; ')}`).join('\n'));
});

test('la app solo usa lo aprobado: las 9 herramientas sí, el redactor con LLM no (no medido)', async () => {
  const a = aprobadas(await correLaboratorio(ctx));
  assert.deepEqual(a, ['marca', 'ventas', 'contenido', 'resenas', 'visibilidad', 'pulso', 'piezas', 'video', 'aprobacion']);
});
