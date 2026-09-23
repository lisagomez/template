/**
 * Regresion del 2026-09-23 (PR #146): con toques que alternan, Ctrl derecho abria 'alternar'
 * aunque la sesion fuera de manos libres. El segundo toque dejaba el dictado inactivo, el modo
 * conversacion no enviaba y el hook `Stop` callaba. La tecla abre el modo de la sesion, como el icono.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { gestosDeTeclaGlobal } from '../dist/node/cli-dictar-piezas.js';

function controlFalso() {
  const llamadas: string[] = [];
  return {
    llamadas,
    control: {
      empieza: (modo?: string) => (llamadas.push(`empieza ${modo ?? ''}`.trim()), Promise.resolve()),
      termina: () => (llamadas.push('termina'), Promise.resolve()),
      alterna: (modo: string) => (llamadas.push(`alterna ${modo}`), Promise.resolve()),
    },
  };
}

for (const modo of ['manosLibres', 'alternar', 'pulsar'] as const) {
  test(`tecla que alterna: el toque abre el modo de la sesion (${modo})`, () => {
    const { llamadas, control } = controlFalso();
    const gestos = gestosDeTeclaGlobal(control, modo, true);
    gestos.alMantener();
    gestos.alSoltar();
    gestos.alManosLibres(true);
    assert.deepEqual(llamadas, [`alterna ${modo}`]);
  });
}

test('tecla que se mantiene: pulsar al mantener, termina al soltar y el doble toque da manos libres', () => {
  const { llamadas, control } = controlFalso();
  const gestos = gestosDeTeclaGlobal(control, 'manosLibres', false);
  gestos.alMantener();
  gestos.alSoltar();
  gestos.alManosLibres(true);
  gestos.alManosLibres(false);
  assert.deepEqual(llamadas, ['empieza pulsar', 'termina', 'empieza manosLibres', 'termina']);
});
