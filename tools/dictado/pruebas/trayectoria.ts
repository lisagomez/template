/**
 * La trayectoria de una sesion es forma: contadores, percentiles y avisos; nunca texto ni rutas.
 * Se prueba el constructor puro con contadores de guion.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construyeTrayectoria, creaContadores, idDeTrayectoria } from '../dist/node/index.js';

interface Trayectoria {
  id: string;
  linea: string;
  actor: { herramienta: string };
  acciones: { herramientas: Record<string, number>; turnos: number };
  tiempos: { totalMs: number; porEtapaMs: Record<string, number> };
  resultado: { errores: number; metricas: Record<string, number | null> };
  uso: null;
  costoUsd: null;
  avisos?: string[];
}
const como = (t: Record<string, unknown>): Trayectoria => t as unknown as Trayectoria;

const contexto = { motorId: 'sherpa:nemo-parakeet-tdt-0.6b-v3-int8+faster-whisper-small-int8-cpu', modo: 'manosLibres', silencioMs: 1000, gananciaDb: 0, umbralVozDb: -45, inicio: new Date('2026-09-20T10:00:00Z'), fin: new Date('2026-09-20T10:02:00Z') };

test('trayectoria: contadores → percentiles, etapas y avisos, sin ninguna cadena larga', () => {
  const c = creaContadores();
  for (const [lat, motor, pegado, dur] of [[900, 250, 40, 3000], [1100, 300, 30, 4000], [700, 200, 35, 2500]]) {
    c.turnos += 1; c.pegados += 1; c.latenciasMs.push(lat); c.msMotor.push(motor); c.msPegado.push(pegado); c.duracionesMs.push(dur);
  }
  c.sinVoz = 1; c.descartadosEnergia = 2; c.muletillas = 1; c.respaldo = 1; c.picosDb.push(-12, -8, -2);
  const t = como(construyeTrayectoria(c, contexto));
  assert.equal(t.linea, 'herramientas');
  assert.equal(t.id, idDeTrayectoria('herramientas', 'salida-dictar-2026-09-20T10-00-00'));
  assert.equal(t.actor.herramienta, 'dictado');
  assert.equal(t.acciones.herramientas.turnos, 3);
  assert.equal(t.acciones.turnos, 4);
  assert.equal(t.tiempos.totalMs, 120000);
  assert.equal(t.tiempos.porEtapaMs.motor, 750);
  assert.equal(t.resultado.metricas.latenciaP50Ms, 900);
  assert.equal(t.resultado.metricas.msMotorP50, 250);
  assert.equal(t.resultado.metricas.picoDbMax, -2);
  assert.deepEqual(t.avisos, ['microfono saturando en alguna escucha']);
  assert.equal(t.uso, null);
  assert.equal(t.costoUsd, null);
  const cadenas = JSON.stringify(t).match(/"[^"]*"/g) ?? [];
  assert.ok(cadenas.every((s) => s.length <= 82), 'ninguna cadena pasa de 80 caracteres');
  assert.ok(!JSON.stringify(t).includes('/home/'), 'sin rutas de la maquina');
});

test('trayectoria: el modo conversacion deja envios, respuestas y sus latencias; apagado, envioMs es null', () => {
  const c = creaContadores();
  c.turnos = 2; c.pegados = 2; c.enviosPorSilencio = 2; c.respuestasHabladas = 1;
  c.msPrimerAudio.push(180);
  const con = como(construyeTrayectoria(c, { ...contexto, envioMs: 2000 }));
  assert.equal(con.acciones.herramientas.enviosPorSilencio, 2);
  assert.equal(con.acciones.herramientas.respuestasHabladas, 1);
  assert.equal(con.resultado.metricas.envioMs, 2000);
  assert.equal(con.resultado.metricas.msPrimerAudioP50, 180);
  const sin = como(construyeTrayectoria(creaContadores(), contexto));
  assert.equal(sin.resultado.metricas.envioMs, null);
  assert.equal(sin.resultado.metricas.msPrimerAudioP50, null);
});

test('trayectoria: una sesion sin turnos lo dice en avisos y deja percentiles en null', () => {
  const t = como(construyeTrayectoria(creaContadores(), contexto));
  assert.equal(t.resultado.metricas.latenciaP50Ms, null);
  assert.deepEqual(t.avisos, ['sesion sin turnos con texto']);
  assert.equal(t.resultado.errores, 0);
});
