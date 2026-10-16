/**
 * El oído entre el detector de voz y el bucle: reloj de audio → reloj de página, pausa
 * especulativa, reanudación, cierre e interrupción.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creaOido, creaRelojAudio, type EventoDetector } from '../dist/index.js';

const HZ = 16_000;

function montaOido(habla = false) {
  const llamadas: { que: string; args: unknown[] }[] = [];
  const atenuaciones: boolean[] = [];
  const bucle = {
    vozInicia: (...args: unknown[]) => void llamadas.push({ que: 'vozInicia', args }),
    pausa: (...args: unknown[]) => void llamadas.push({ que: 'pausa', args }),
    vozReanuda: (...args: unknown[]) => void llamadas.push({ que: 'vozReanuda', args }),
    vozTermina: (...args: unknown[]) => void llamadas.push({ que: 'vozTermina', args }),
    interrumpe: (...args: unknown[]) => void llamadas.push({ que: 'interrumpe', args }),
  };
  const oido = creaOido({ bucle, hz: HZ, msSilencioCierre: 600, maquinaHabla: () => habla, atenua: (a) => void atenuaciones.push(a) });
  // 2 s de audio llegaron: el trozo que acaba en el ms 2000 se recibió a la hora 52_000 de la página.
  oido.alimenta(new Float32Array(2 * HZ), 52_000);
  return { oido, llamadas, atenuaciones };
}

const prob = (ms: number, valor: number): EventoDetector => ({ tipo: 'probabilidad', valor, ms });

test('reloj de audio: toma el trozo que llegó con menos retraso', () => {
  const r = creaRelojAudio();
  r.anota(1000, 51_040);
  r.anota(1032, 51_050);
  r.anota(1064, 51_200);
  assert.equal(r.aReloj(500), 50_518);
});

test('pausa de 250 ms dentro del tramo → especula con el audio hasta ahí y el fin real en reloj de página', () => {
  const { oido, llamadas } = montaOido();
  oido.procesa([{ tipo: 'inicioHabla', ms: 200 }]);
  for (let ms = 200; ms < 1000; ms += 32) oido.procesa([prob(ms, 0.9)]);
  for (let ms = 1000; ms < 1300; ms += 32) oido.procesa([prob(ms, 0.1)]);
  const pausa = llamadas.find((l) => l.que === 'pausa');
  assert.ok(pausa);
  const [audio, finReal] = pausa.args as [{ muestras: Float32Array }, number];
  assert.equal(finReal, 51_000, 'el fin real es el primer marco de silencio (ms 1000 de audio) en la página');
  assert.ok(audio.muestras.length >= 0.8 * HZ, 'lleva el audio desde el inicio del tramo');
  assert.equal(llamadas.filter((l) => l.que === 'pausa').length, 1, 'una sola especulación por pausa');
});

test('la voz vuelve tras la pausa → vozReanuda; y el cierre del VAD llega con fin real y cierre', () => {
  const { oido, llamadas } = montaOido();
  oido.procesa([{ tipo: 'inicioHabla', ms: 0 }]);
  for (let ms = 0; ms < 600; ms += 32) oido.procesa([prob(ms, 0.9)]);
  for (let ms = 600; ms < 900; ms += 32) oido.procesa([prob(ms, 0.1)]);
  oido.procesa([prob(900, 0.9)]);
  assert.ok(llamadas.some((l) => l.que === 'vozReanuda'));
  oido.procesa([{ tipo: 'finHabla', turno: { inicioMs: 0, finMs: 1200, audio: new Float32Array(100) } }]);
  const fin = llamadas.find((l) => l.que === 'vozTermina');
  assert.deepEqual((fin?.args as unknown[]).slice(1), [51_200, 51_800]);
});

test('con la máquina hablando, voz de verdad → atenúa e interrumpe', () => {
  const { oido, llamadas, atenuaciones } = montaOido(true);
  for (let ms = 0; ms < 320; ms += 32) oido.procesa([prob(ms, 0.95)]);
  assert.equal(atenuaciones[0], true);
  assert.ok(llamadas.some((l) => l.que === 'interrumpe'));
});

test('alimentar es lineal: 2 minutos en trozos de 43 muestras (lo que entrega el micrófono) en menos de un segundo', () => {
  const llamadas: { que: string; args: unknown[] }[] = [];
  const bucle = { vozInicia: () => undefined, pausa: (...args: unknown[]) => void llamadas.push({ que: 'pausa', args }), vozReanuda: () => undefined, vozTermina: () => undefined, interrumpe: () => undefined };
  const oido = creaOido({ bucle, hz: HZ, msSilencioCierre: 600, maquinaHabla: () => false, atenua: () => undefined });
  const trozo = new Float32Array(43).fill(0.1);
  const t0 = performance.now();
  for (let i = 0; i < (120 * HZ) / 43; i++) oido.alimenta(trozo, i);
  const ms = performance.now() - t0;
  assert.ok(ms < 1000, `tardó ${Math.round(ms)} ms (la versión que concatenaba tardaba minutos)`);
  // y el recorte sigue sirviendo el audio reciente, cruzando trozos
  oido.procesa([{ tipo: 'inicioHabla', ms: 119_000 }]);
  for (let ms = 119_000; ms < 119_500; ms += 32) oido.procesa([prob(ms, 0.9)]);
  for (let ms = 119_500; ms < 119_800; ms += 32) oido.procesa([prob(ms, 0.1)]);
  const pausa = llamadas.find((l) => l.que === 'pausa');
  const audio = (pausa?.args[0] as { muestras: Float32Array } | undefined)?.muestras;
  assert.ok(audio && audio.length > 0.7 * HZ && audio.every((x) => Math.abs(x - 0.1) < 1e-6), 'el audio del tramo sale entero y sin huecos');
});
