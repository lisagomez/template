/**
 * Prueba del SEAM dictado → asesor: los turnos que produce `dictado lote` (forma `Turno`)
 * entran al adaptador y salen como `Transcripcion` que el motor analiza de punta a punta.
 * Sin red, sin modelos: se simula la salida de la diarizacion con turnos de fixture.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  analizarReunion,
  participantesDesdeHablantes,
  playbookPorTipo,
  transcripcionDesdeTurnos,
  type Reunion,
  type TurnoDiarizado,
} from '../dist/index.js';

// Lo que entregaría `dictado lote`: turnos con tiempos en ms, hablante y texto (o vacío).
const turnos: TurnoDiarizado[] = [
  { inicioMs: 0, finMs: 6000, hablante: 'Ana', texto: '¿Qué es lo que más se les complica hoy?' },
  { inicioMs: 6000, finMs: 18000, hablante: 'Luis', texto: 'Batallamos con las cotizaciones porque cada quien lo hace a su manera.' },
  { inicioMs: 18000, finMs: 30000, hablante: 'Luis', texto: 'Nos cuesta como veinte horas al mes.' },
  { inicioMs: 30000, finMs: 40000, hablante: 'Luis', texto: 'Quedamos en que te mando la info el jueves.' },
  { inicioMs: 40000, finMs: 44000, hablante: 'Luis', texto: '' }, // turno sin texto → [inaudible]
];

test('adaptador: turnos de dictado → Transcripcion (ms→s, vacío → [inaudible] bajo el umbral)', () => {
  const tr = transcripcionDesdeTurnos(turnos, { reunionId: 'r1', motor: 'parakeet' });
  assert.equal(tr.reunionId, 'r1');
  assert.equal(tr.segmentos.length, 5);
  assert.equal(tr.segmentos[0]?.inicioS, 0);
  assert.equal(tr.segmentos[1]?.finS, 18); // 18000 ms → 18 s
  const inaudible = tr.segmentos[4];
  assert.equal(inaudible?.texto, '[inaudible]');
  assert.ok((inaudible?.confianza ?? 1) < 0.5, 'el turno vacío queda bajo el umbral');
});

test('participantesDesdeHablantes: cada hablante recibe su lado; el no listado cae a cliente', () => {
  const parts = participantesDesdeHablantes(['Ana', 'Luis', 'Pedro'], {
    Ana: { rol: 'Ejecutiva', lado: 'interno' },
    Luis: { rol: 'Gerente', lado: 'cliente' },
  });
  assert.equal(parts.find((p) => p.nombre === 'Ana')?.lado, 'interno');
  assert.equal(parts.find((p) => p.nombre === 'Luis')?.lado, 'cliente');
  assert.equal(parts.find((p) => p.nombre === 'Pedro')?.lado, 'cliente'); // por defecto
});

test('end-to-end: turnos diarizados → adaptador → motor → estrategia', () => {
  const participantes = participantesDesdeHablantes(['Ana', 'Luis'], {
    Ana: { rol: 'Ejecutiva de cuenta', lado: 'interno' },
    Luis: { rol: 'Gerente de operaciones', lado: 'cliente' },
  });
  const reunion: Reunion = {
    id: 'r1',
    titulo: 'Discovery',
    cuenta: 'Aceros del Norte',
    tipoReunion: 'discovery',
    asesor: 'Ana',
    fecha: '2026-09-20T17:00:00.000Z',
    participantes,
  };
  const transcripcion = transcripcionDesdeTurnos(turnos, { reunionId: reunion.id, motor: 'parakeet' });
  const analisis = analizarReunion(reunion, transcripcion, playbookPorTipo('discovery'));

  // El seam completo produce estrategia: pain detectado, acción con fecha, score con desglose.
  assert.ok(analisis.insights.some((i) => i.categoria === 'pain'), 'detecta el pain del cliente');
  assert.ok(analisis.acciones.some((a) => /jueves/.test(a.fechaTexto ?? '')), 'extrae la acción "el jueves"');
  assert.ok(analisis.score.total > 0 && analisis.score.total <= 100, 'score en rango');
  assert.equal(analisis.score.conducta.segmentosInaudibles, 1, 'el turno vacío cuenta como inaudible');
  // Regla de oro se mantiene tras el seam.
  for (const i of analisis.insights) assert.ok(i.evidencia.length >= 1, 'todo insight con evidencia');
});
