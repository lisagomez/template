/**
 * El envio por silencio (modo conversacion) con reloj falso: envia una vez y solo una, se cancela
 * si vuelve la voz, no se arma con «dale enter», se pausa mientras habla el agente y se olvida
 * al apagar. Contra `dist/`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { creaEnvioPorSilencio, DEFECTOS_ENVIO, type EventoDictado } from '../dist/index.js';
import { creaConversacion } from '../dist/node/index.js';

test('envio: un pegado pendiente arma el plazo; vence en escuchando → enviar, una sola vez', () => {
  const e = creaEnvioPorSilencio({ msEnvio: 2000 });
  assert.equal(e.pendiente, false);
  assert.equal(e.aplica({ tipo: 'estado', estado: 'escuchando' }, 0), undefined);
  assert.equal(e.aplica({ tipo: 'pegado', pendiente: true }, 1000), undefined);
  assert.equal(e.pendiente, true);
  assert.equal(e.vence(1000), 2000);
  assert.equal(e.aplica({ tipo: 'tick' }, 2999), undefined, 'antes del plazo no');
  assert.equal(e.aplica({ tipo: 'tick' }, 3000), 'enviar');
  assert.equal(e.pendiente, false);
  assert.equal(e.aplica({ tipo: 'tick' }, 3001), undefined, 'ya se envio');
  assert.equal(e.vence(3001), undefined);
  assert.equal(DEFECTOS_ENVIO.msEnvio, 2000, 'provisional hasta la medicion A');
});

test('envio: si vuelve la voz el reloj se quita pero el texto sigue pendiente; el siguiente pegado rearma', () => {
  const e = creaEnvioPorSilencio({ msEnvio: 2000 });
  e.aplica({ tipo: 'estado', estado: 'escuchando' }, 0);
  e.aplica({ tipo: 'pegado', pendiente: true }, 0);
  assert.equal(e.aplica({ tipo: 'inicioHabla' }, 1500), undefined);
  assert.equal(e.vence(1500), undefined);
  assert.equal(e.pendiente, true);
  assert.equal(e.aplica({ tipo: 'tick' }, 9000), undefined, 'sin plazo no envia aunque pase el tiempo');
  // La frase nueva se pega: el plazo cuenta desde ESTE pegado.
  e.aplica({ tipo: 'estado', estado: 'pegando' }, 3000);
  e.aplica({ tipo: 'pegado', pendiente: true }, 3100);
  e.aplica({ tipo: 'estado', estado: 'escuchando' }, 3200);
  assert.equal(e.vence(3200), 2000, 'al volver a escuchar el plazo cuenta desde ahora, no desde el pegado');
  assert.equal(e.aplica({ tipo: 'tick' }, 5100), undefined);
  assert.equal(e.aplica({ tipo: 'tick' }, 5200), 'enviar');
});

test('envio: «dale enter» ya envio (pegado no pendiente) → no se arma; «sin voz» rearma lo pendiente', () => {
  const e = creaEnvioPorSilencio({ msEnvio: 1000 });
  e.aplica({ tipo: 'estado', estado: 'escuchando' }, 0);
  e.aplica({ tipo: 'pegado', pendiente: false }, 0);
  assert.equal(e.pendiente, false);
  assert.equal(e.vence(0), undefined);
  e.aplica({ tipo: 'pegado', pendiente: true }, 100);
  e.aplica({ tipo: 'inicioHabla' }, 500);
  assert.equal(e.vence(500), undefined);
  e.aplica({ tipo: 'sinVoz' }, 900); // hubo ruido, no texto: lo pegado sigue esperando
  assert.equal(e.vence(900), 1000);
  assert.equal(e.aplica({ tipo: 'tick' }, 1900), 'enviar');
});

test('envio: mientras habla el agente no se envia; al callar rearma; en transcribiendo/pegando tampoco', () => {
  const e = creaEnvioPorSilencio({ msEnvio: 1000 });
  e.aplica({ tipo: 'estado', estado: 'escuchando' }, 0);
  e.aplica({ tipo: 'pegado', pendiente: true }, 0);
  e.aplica({ tipo: 'vozAgente', activa: true }, 200);
  assert.equal(e.vence(200), undefined);
  assert.equal(e.aplica({ tipo: 'tick' }, 5000), undefined);
  e.aplica({ tipo: 'vozAgente', activa: false }, 5000);
  assert.equal(e.vence(5000), 1000);
  e.aplica({ tipo: 'estado', estado: 'transcribiendo' }, 5500);
  assert.equal(e.aplica({ tipo: 'tick' }, 6000), undefined, 'a mitad de una transcripcion no se pulsa Enter');
  e.aplica({ tipo: 'estado', estado: 'escuchando' }, 6100);
  assert.equal(e.vence(6100), 1000, 'al volver a escuchar, el plazo cuenta desde ahora');
  assert.equal(e.aplica({ tipo: 'tick' }, 7100), 'enviar');
});

test('envio: apagar el dictado olvida lo pendiente; cambiaMs recalcula un plazo en curso', () => {
  const e = creaEnvioPorSilencio({ msEnvio: 2000 });
  e.aplica({ tipo: 'estado', estado: 'escuchando' }, 0);
  e.aplica({ tipo: 'pegado', pendiente: true }, 0);
  e.aplica({ tipo: 'estado', estado: 'inactivo' }, 500);
  assert.equal(e.pendiente, false);
  assert.equal(e.vence(500), undefined);
  e.aplica({ tipo: 'estado', estado: 'escuchando' }, 1000);
  e.aplica({ tipo: 'pegado', pendiente: true }, 1000);
  e.cambiaMs(500, 1200);
  assert.equal(e.msEnvio, 500);
  assert.equal(e.vence(1200), 500);
  assert.equal(e.aplica({ tipo: 'tick' }, 1700), 'enviar');
});

test('conversacion (node): traduce los eventos del dictado, programa el tick con el reloj inyectado y pulsa Enter una vez', async () => {
  let ahora = 0;
  const programados: Array<{ ms: number; fn: () => void }> = [];
  const enviados: number[] = [];
  const log: string[] = [];
  const c = creaConversacion({
    envio: creaEnvioPorSilencio({ msEnvio: 2000 }),
    alEnviar: () => { enviados.push(ahora); },
    estado: () => 'escuchando',
    ahora: () => ahora,
    programa: (ms, fn) => { const p = { ms, fn }; programados.push(p); return () => { const i = programados.indexOf(p); if (i >= 0) programados.splice(i, 1); }; },
    log: (l) => log.push(l),
  });
  const texto = (t: string, acciones: Array<'enter'> = []): EventoDictado => ({ tipo: 'texto', texto: t, textoCrudo: t, acciones, duracionMs: 1000, latenciaMs: 300, msMotor: 200 });
  c.alEvento(texto('sin modo no pasa nada'));
  assert.equal(programados.length, 0);
  c.activa = true; // arranca con el estado real del dictado
  ahora = 1000;
  c.alEvento(texto('hola'));
  assert.equal(programados.length, 1);
  assert.equal(programados[0]?.ms, 2005);
  // Vuelve a hablar: el tick programado se cancela.
  ahora = 1500;
  c.alEvento({ tipo: 'inicioHabla', ms: 1500 });
  assert.equal(programados.length, 0);
  // Segunda frase: nuevo plazo; el tick a tiempo envia.
  ahora = 3000;
  c.alEvento(texto('que tal'));
  assert.equal(programados.length, 1);
  ahora = 5005;
  programados.shift()?.fn(); // el reloj falso entrega el tick y lo olvida, como setTimeout
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(enviados, [5005]);
  assert.match(log[0] ?? '', /enviado por silencio/);
  // «dale enter» ya envio: no se programa nada.
  c.alEvento(texto('ya', ['enter']));
  assert.equal(programados.length, 0);
  // Apagar olvida lo pendiente.
  c.alEvento(texto('pendiente'));
  assert.equal(programados.length, 1);
  c.activa = false;
  assert.equal(programados.length, 0);
  c.cierra();
});
