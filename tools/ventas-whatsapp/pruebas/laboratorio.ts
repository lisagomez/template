/**
 * El laboratorio del agente: cada caso da el estado que declara (pasa, o no-medido con su
 * porqué); las métricas contra las compuertas 0-3 marcan su naturaleza; y hay una conversación
 * de punta a punta por pyme con sus costos.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correCasos, mideLaboratorio, transcribe, CASOS } from '../dist/laboratorio/index.js';
import { FLOWS } from './_ayuda.ts';

test('casos del laboratorio: cada uno da el estado que declara', async () => {
  const r = await correCasos({ flows: FLOWS });
  for (const k of r) console.log(`# ${k.cuadra ? '✓' : '✗'} [${k.estado}] ${k.id}`);
  assert.equal(r.length, CASOS.length);
  assert.deepEqual(r.filter((k) => !k.cuadra).map((k) => `${k.id}: declara ${k.declara}, dio ${k.estado} — ${k.evidencia}`), []);
  assert.ok(r.filter((k) => k.estado === 'pasa').length >= 9);
  assert.ok(r.filter((k) => k.estado === 'no-medido').every((k) => k.evidencia.length > 20), 'todo no-medido dice por qué');
});

test('métricas contra las compuertas 0-3: las medibles pasan y ninguna cifra finge ser real', async () => {
  const m = await mideLaboratorio({ flows: FLOWS });
  for (const f of m.filas) console.log(`# F${f.fase} ${f.compuerta} · meta ${f.meta} · ${f.valor} · ${f.naturaleza}${f.pasa === null ? '' : f.pasa ? ' · pasa' : ' · NO PASA'}`);
  assert.deepEqual(m.filas.filter((f) => f.pasa === false).map((f) => f.compuerta), []);
  assert.ok(m.filas.every((f) => ['medida', 'simulada', 'no medido'].includes(f.naturaleza)));
  assert.equal(m.filas.find((f) => /primera respuesta/.test(f.compuerta))!.naturaleza, 'no medido');
});

test('una conversación de punta a punta por pyme, con lo que cobró Meta y la conversión', async () => {
  const t = await transcribe({ flows: FLOWS });
  assert.equal(t.length, 2);
  for (const x of t) {
    console.log(x.lineas.map((l) => `# ${l}`).join('\n'));
    assert.ok(x.lineas.some((l) => l.includes('Conversions API: Purchase')));
    assert.ok(x.lineas.some((l) => /ROAS/.test(l)));
    assert.equal(x.mensajesSalientes, 4, 'catálogo, Flow, liga y confirmación: cuatro mensajes');
  }
});
