/**
 * El hook `Stop` de punta a punta, sin arnes (RF-42, RF-43): `scripts/habla-respuesta.sh` con el
 * JSON del arnes por stdin. Sin dictado sale 0 en menos de 100 ms y sin escribir nada; con un
 * dictado escuchando manda el primer parrafo y NO espera a que suene; apagado o desde un
 * subagente, no manda nada. El servidor es `escuchaConversacion` con un puerto libre.
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { escuchaConversacion } from '../dist/node/index.js';

const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'habla-respuesta.sh');

function corre(puerto: number, entrada: unknown): Promise<{ codigo: number | null; stdout: string; ms: number }> {
  return new Promise((resuelve) => {
    const t0 = performance.now();
    const hijo = execFile('bash', [script], { env: { ...process.env, DICTADO_CONVERSACION_PUERTO: String(puerto) } }, (_e, stdout) => resuelve({ codigo: hijo.exitCode, stdout, ms: performance.now() - t0 }));
    hijo.stdin?.end(typeof entrada === 'string' ? entrada : JSON.stringify(entrada));
  });
}

const respuesta = { session_id: 'x', hook_event_name: 'Stop', last_assistant_message: 'Listo. **Ya está** medido.\n\n- a\n- b\n\n¿Sigo?' };

test('hook: sin dictado en el puerto sale 0, sin stdout y en menos de 100 ms (no arranca node)', async () => {
  const libre = await escuchaConversacion({ puerto: 0, saludo: () => 'off inactivo', alDi: async () => ({ tipo: 'cortado' }), alCalla: () => undefined });
  const puerto = libre.puerto;
  await libre.cierra();
  const r = await corre(puerto, respuesta);
  assert.equal(r.codigo, 0);
  assert.equal(r.stdout, '');
  assert.ok(r.ms < 100, `${r.ms.toFixed(0)} ms`);
});

test('hook: con el dictado escuchando manda el primer parrafo mas la pregunta y sale antes de que termine de sonar', async () => {
  const dichos: string[] = [];
  let resuelveVoz: () => void = () => undefined;
  const s = await escuchaConversacion({
    puerto: 0,
    saludo: () => 'on escuchando',
    alDi: (t) => { dichos.push(t); return new Promise((r) => { resuelveVoz = () => r({ tipo: 'hecho', msPrimerAudio: 50, msTotal: 3000 }); }); },
    alCalla: () => undefined,
  });
  const r = await corre(s.puerto, respuesta);
  assert.equal(r.codigo, 0);
  assert.equal(r.stdout, '');
  assert.deepEqual(dichos, ['Listo. Ya está medido. ¿Sigo?']);
  assert.ok(r.ms < 1500, `salio en ${r.ms.toFixed(0)} ms sin esperar a la voz`);
  resuelveVoz();
  await s.cierra();
});

test('hook: con la conversacion apagada (o el dictado inactivo) sale en < 100 ms sin arrancar node; sin prosa o desde un subagente no manda nada; a media frase si manda', async () => {
  const dichos: string[] = [];
  const apagado = await escuchaConversacion({ puerto: 0, saludo: () => 'off escuchando', alDi: async (t) => { dichos.push(t); return { tipo: 'cortado' }; }, alCalla: () => undefined });
  const rApagado = await corre(apagado.puerto, respuesta);
  assert.equal(rApagado.codigo, 0);
  assert.ok(rApagado.ms < 100, `apagado: ${rApagado.ms.toFixed(0)} ms`);
  await apagado.cierra();
  const inactivo = await escuchaConversacion({ puerto: 0, saludo: () => 'on inactivo', alDi: async (t) => { dichos.push(t); return { tipo: 'cortado' }; }, alCalla: () => undefined });
  const rInactivo = await corre(inactivo.puerto, respuesta);
  assert.equal(rInactivo.codigo, 0);
  assert.ok(rInactivo.ms < 100, `inactivo: ${rInactivo.ms.toFixed(0)} ms`);
  await inactivo.cierra();
  const aMediaFrase = await escuchaConversacion({ puerto: 0, saludo: () => 'on transcribiendo', alDi: async (t) => { dichos.push(t); return { tipo: 'cortado' }; }, alCalla: () => undefined });
  assert.equal((await corre(aMediaFrase.puerto, respuesta)).codigo, 0);
  await aMediaFrase.cierra();
  assert.deepEqual(dichos, ['Listo. Ya está medido. ¿Sigo?'], 'transcribiendo sigue escuchando: el texto llega y RF-40 espera al cierre del turno');
  dichos.length = 0;
  const encendido = await escuchaConversacion({ puerto: 0, saludo: () => 'on escuchando', alDi: async (t) => { dichos.push(t); return { tipo: 'cortado' }; }, alCalla: () => undefined });
  assert.equal((await corre(encendido.puerto, { ...respuesta, last_assistant_message: '```\nsolo codigo\n```' })).codigo, 0);
  assert.equal((await corre(encendido.puerto, { ...respuesta, agent_id: 'sub-1' })).codigo, 0);
  assert.equal((await corre(encendido.puerto, 'esto no es json')).codigo, 0);
  await encendido.cierra();
  assert.deepEqual(dichos, []);
});
