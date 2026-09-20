/**
 * Pruebas del cerebro de asesoria. Sin red, sin modelos: una reunion de discovery de fixture
 * pasa por el motor y se verifica lo que importa — la REGLA DE ORO (todo insight cita
 * evidencia), el score con desglose, las acciones/riesgos, y el determinismo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  analizarReunion,
  calcularScore,
  playbookPorTipo,
  PLAYBOOKS_DEFAULT,
  type Reunion,
  type Transcripcion,
} from '../dist/index.js';

const reunion: Reunion = {
  id: 'r1',
  titulo: 'Discovery con Aceros del Norte',
  cuenta: 'Aceros del Norte',
  tipoReunion: 'discovery',
  asesor: 'Ana',
  fecha: '2026-09-20T17:00:00.000Z',
  participantes: [
    { nombre: 'Ana', rol: 'Ejecutiva de cuenta', lado: 'interno' },
    { nombre: 'Luis', rol: 'Gerente de operaciones', lado: 'cliente' },
  ],
};

// Turnos diarizados (lo que entregan voz + dictado). Cliente = Luis, interno = Ana.
const transcripcion: Transcripcion = {
  id: 't1',
  reunionId: 'r1',
  motor: 'parakeet',
  segmentos: [
    { inicioS: 0, finS: 6, hablante: 'Ana', texto: '¿Qué es lo que más se les complica hoy en la operación?', confianza: 0.95 },
    { inicioS: 6, finS: 18, hablante: 'Luis', texto: 'Batallamos con las cotizaciones porque cada quien lo hace a su manera y se nos complica.', confianza: 0.92 },
    { inicioS: 18, finS: 30, hablante: 'Luis', texto: 'Nos cuesta como veinte horas al mes en retrabajo.', confianza: 0.9 },
    { inicioS: 30, finS: 40, hablante: 'Luis', texto: 'La verdad se me hace caro, no sé si tengamos presupuesto.', confianza: 0.9 },
    { inicioS: 40, finS: 46, hablante: 'Ana', texto: '¿Cómo se decide una compra así en su empresa?', confianza: 0.94 },
    { inicioS: 46, finS: 54, hablante: 'Luis', texto: 'Pues tendría que preguntar, no me sé los pasos.', confianza: 0.9 },
    { inicioS: 54, finS: 66, hablante: 'Luis', texto: 'Quedamos en que te mando la información el jueves.', confianza: 0.93 },
    { inicioS: 66, finS: 70, hablante: 'Luis', texto: '[inaudible]', confianza: 0.2 },
  ],
};

test('regla de oro: TODO insight cita al menos una evidencia', () => {
  const pb = playbookPorTipo('discovery');
  const { insights } = analizarReunion(reunion, transcripcion, pb);
  assert.ok(insights.length > 0, 'debe extraer insights de esta reunión');
  for (const i of insights) {
    assert.ok(i.evidencia.length >= 1, `insight ${i.id} (${i.categoria}) sin evidencia`);
    for (const e of i.evidencia) {
      assert.ok(e.cita.length > 0, 'la evidencia debe traer una cita');
      assert.ok(e.segmentoIdx >= 0 && e.segmentoIdx < transcripcion.segmentos.length, 'el índice de evidencia debe existir');
    }
  }
});

test('extrae los insights esperados de un discovery real', () => {
  const pb = playbookPorTipo('discovery');
  const { insights, acciones, riesgos } = analizarReunion(reunion, transcripcion, pb);
  const cats = new Set(insights.map((i) => i.categoria));
  assert.ok(cats.has('pain'), 'debe detectar el pain');
  assert.ok(cats.has('objecion'), 'debe detectar la objeción de precio');
  assert.ok(cats.has('proximo_paso'), 'debe detectar el próximo paso');
  // El "te mando ... el jueves" es una acción con fecha textual.
  const acc = acciones.find((a) => /jueves/.test(a.fechaTexto ?? ''));
  assert.ok(acc, 'debe extraer la acción con fecha "el jueves"');
  assert.equal(acc?.responsable, 'Luis');
  // Una objeción registrada ⇒ riesgo de objeción sin respuesta.
  assert.ok(riesgos.some((r) => r.tipo === 'objecion_sin_respuesta'), 'la objeción debe generar riesgo');
});

test('score: total 0..100 con desglose, y el turno inaudible se cuenta pero no se transcribe a ciegas', () => {
  const pb = playbookPorTipo('discovery');
  const score = calcularScore(reunion, transcripcion, pb);
  assert.ok(score.total >= 0 && score.total <= 100, 'total en rango');
  assert.equal(score.dimensiones.length, pb.dimensiones.length, 'una fila por dimensión del playbook');
  assert.equal(score.conducta.segmentosInaudibles, 1, 'el segmento de confianza 0.2 cuenta como inaudible');
  // El problema tiene causa ("porque cada quien...") ⇒ dimensión problema cubierta.
  assert.equal(score.dimensiones.find((d) => d.dimension === 'problema')?.estado, 'cubierta');
});

test('determinismo: mismo input → mismo output', () => {
  const pb = playbookPorTipo('discovery');
  const a = calcularScore(reunion, transcripcion, pb);
  const b = calcularScore(reunion, transcripcion, pb);
  assert.deepEqual(a, b);
});

test('cada playbook por defecto suma exactamente 100 en pesos', () => {
  for (const pb of PLAYBOOKS_DEFAULT) {
    const suma = pb.dimensiones.reduce((s, d) => s + d.peso, 0);
    assert.equal(suma, 100, `el playbook ${pb.id} suma ${suma}, no 100`);
  }
});
