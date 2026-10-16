/**
 * El enrutador local: la orden va a la herramienta sin cerebro, la conversación al cerebro, lo
 * dudoso al cerebro, y la escritura a dry-run.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creaEnrutadorLocal, ORDENES_ES, type Decision } from '../dist/index.js';

const e = creaEnrutadorLocal({ ordenes: ORDENES_ES });
const orden = (d: Decision) => (d.tipo === 'orden' ? d.orden : d.tipo === 'llm' ? `llm:${d.motivo}` : 'nada');

test('las órdenes cortas, con cortesía, sin acentos o con mayúsculas, van a su orden', () => {
  const casos: [string, string][] = [
    ['Para.', 'para'], ['¡Cállate ya!', 'para'], ['detente por favor', 'para'], ['Ya basta.', 'para'],
    ['Repite.', 'repite'], ['¿Qué dijiste?', 'repite'], ['otra vez porfa', 'repite'],
    ['Más despacio.', 'mas-despacio'], ['mas lento', 'mas-despacio'], ['Habla más rápido', 'mas-rapido'],
    ['¿Qué hora es?', 'hora'], ['¿me dices la hora?', 'hora'], ['QUÉ HORAS SON', 'hora'],
    ['¿Qué tengo hoy?', 'agenda-hoy'], ['¿Qué hay en mi agenda?', 'agenda-hoy'], ['¿tengo reuniones hoy?', 'agenda-hoy'],
    ['¿Qué tengo mañana?', 'agenda-manana'], ['¿Qué día es hoy?', 'fecha'], ['¿Cuánto llevas gastado?', 'gasto'],
    ['Adiós.', 'duerme'], ['¿Qué puedes hacer?', 'ayuda'], ['Confirmo', 'confirma'], ['Olvídalo', 'olvida'],
  ];
  for (const [texto, esperada] of casos) assert.equal(orden(e.decide([texto])), esperada, texto);
});

test('las preguntas abiertas van al cerebro, aunque contengan una palabra de orden', () => {
  for (const t of [
    '¿Para qué sirve un flujo de caja?',
    'Explícame la diferencia entre utilidad y flujo',
    '¿Qué estrategia me recomiendas para vender más esta semana?',
    'Espera, tengo otra pregunta sobre los impuestos del mes',
    '¿Cuánto tiempo tarda en llegar un pedido a Monterrey?',
  ]) {
    assert.equal(orden(e.decide([t])), 'llm:conversacion', t);
  }
});

test('lo que se parece a medias a una orden es DUDOSO y va al cerebro', () => {
  const d = e.decide(['dime la hora exacta']);
  assert.equal(d.tipo, 'llm');
  assert.ok(d.tipo === 'llm' && d.motivo === 'dudoso' && d.parecidaA === 'hora');
});

test('una petición de escritura sale como orden de escritura (dry-run), no como lectura', () => {
  for (const t of ['Agenda una reunión con Juan mañana', 'Manda un correo a Pedro', 'Borra la cita del viernes', 'Agéndame una llamada', 'Oye, cancela la junta de mañana']) {
    const d = e.decide([t]);
    assert.ok(d.tipo === 'orden' && d.clase === 'escritura', t);
  }
  assert.equal(orden(e.decide(['¿Qué hay en mi agenda?'])), 'agenda-hoy', '«agenda» como sustantivo es lectura');
  assert.equal(orden(e.decide(['agenda de hoy'])), 'agenda-hoy');
  assert.equal(orden(e.decide(['Cancela'])), 'olvida', '«cancela» sin objeto descarta lo pendiente');
});

test('entre transcripciones alternativas gana la orden más segura', () => {
  assert.equal(orden(e.decide(['But.', 'Para.'])), 'para');
  assert.equal(orden(e.decide(['Must spacious', 'más despacio'])), 'mas-despacio');
  assert.equal(orden(e.decide(['Must spacious'])), 'llm:conversacion', 'el inglés oído no inventa una orden');
});

test('lo vacío no es nada (ni orden ni cerebro)', () => {
  assert.equal(orden(e.decide([''])), 'nada');
  assert.equal(orden(e.decide(['...', '¿?'])), 'nada');
  assert.equal(orden(e.decide(['por favor'])), 'nada');
});
