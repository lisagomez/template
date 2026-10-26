// Pruebas del driver de merge por registro: `node --test infra/cerebro-personal/job/`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fusiona } from './fusiona-registros.mjs';
import { LISTA, motivoNoViaja, revisaCapas } from './politica.mjs';

const CAL = LISTA.registros['.claude/plan/calendario.json'];
const HAB = LISTA.registros['.claude/plan/habitos.json'];
const ev = (id, titulo) => ({ id, titulo, inicio: '2026-10-27T09:00:00-06:00', fin: '2026-10-27T10:00:00-06:00', todoElDia: false });
const cal = (eventos, tareas = []) => ({ version: 1, eventos, tareas, recibos: {} });

test('eventos distintos de cada lado se unen, en el orden de este lado y los nuevos del otro al final', () => {
  const base = cal([ev('a', 'A')]);
  const { resultado, choques } = fusiona(base, cal([ev('a', 'A'), ev('l', 'local')]), cal([ev('a', 'A'), ev('v', 'vps')]), CAL);
  assert.deepEqual(choques, []);
  assert.deepEqual(resultado.eventos.map((e) => e.id), ['a', 'l', 'v']);
});

test('el mismo evento cambiado distinto en los dos lados es choque, y no elige lado', () => {
  const { choques } = fusiona(cal([ev('a', 'A')]), cal([ev('a', 'A local')]), cal([ev('a', 'A vps')]), CAL);
  assert.deepEqual(choques, ['eventos[a]']);
});

test('el mismo cambio en los dos lados no es choque', () => {
  const { resultado, choques } = fusiona(cal([ev('a', 'A')]), cal([ev('a', 'B')]), cal([ev('a', 'B')]), CAL);
  assert.deepEqual(choques, []);
  assert.equal(resultado.eventos[0].titulo, 'B');
});

test('borrado en un lado y sin tocar en el otro: se borra; borrado y cambiado: choque', () => {
  const base = cal([ev('a', 'A'), ev('b', 'B')]);
  const limpio = fusiona(base, cal([ev('b', 'B')]), base, CAL);
  assert.deepEqual(limpio.choques, []);
  assert.deepEqual(limpio.resultado.eventos.map((e) => e.id), ['b']);
  const choque = fusiona(base, cal([ev('b', 'B')]), cal([ev('a', 'A cambiado'), ev('b', 'B')]), CAL);
  assert.deepEqual(choque.choques, ['eventos[a]']);
});

test('alta en los dos lados sin base (primera unión): igual se une, distinto choca', () => {
  assert.deepEqual(fusiona(null, cal([ev('a', 'A')]), cal([ev('a', 'A')]), CAL).choques, []);
  assert.deepEqual(fusiona(null, cal([ev('a', 'A')]), cal([ev('a', 'otro')]), CAL).choques, ['eventos[a]']);
});

test('ids repetidos: no se puede unir por registro y es choque', () => {
  const { choques } = fusiona(cal([]), cal([ev('a', '1'), ev('a', '2')]), cal([ev('b', 'B')]), CAL);
  assert.equal(choques.length, 1);
  assert.match(choques[0], /sin «id» único/);
});

test('hábitos: marcas de días o claves distintas se unen; la misma marca distinta choca', () => {
  const h = (registro) => ({ version: 1, habitos: [{ clave: 'objetivo_dia' }], registro, reflexion: {} });
  const base = h({});
  const local = h({ '2026-10-25': { objetivo_dia: { hecho: true, revision: 1 } } });
  const vps = h({ '2026-10-24': { objetivo_dia: { hecho: false, revision: 1 } } });
  const { resultado, choques } = fusiona(base, local, vps, HAB);
  assert.deepEqual(choques, []);
  assert.deepEqual(Object.keys(resultado.registro).sort(), ['2026-10-24', '2026-10-25']);
  const otra = h({ '2026-10-25': { objetivo_dia: { hecho: false, revision: 1 } } });
  assert.deepEqual(fusiona(base, local, otra, HAB).choques, ['registro.2026-10-25.objetivo_dia']);
});

test('la lista permitida: memoria y plan viajan; now.md, daily, llaves y datos de la app no', () => {
  assert.equal(motivoNoViaja('.claude/memory/MEMORY.md'), null);
  assert.equal(motivoNoViaja('.claude/plan/calendario.json'), null);
  assert.equal(motivoNoViaja('.claude/skills/mi-skill/SKILL.md'), null);
  assert.match(motivoNoViaja('.claude/now.md'), /no viaja/);
  assert.match(motivoNoViaja('.claude/daily/2026-10-25.md'), /no viaja/);
  assert.match(motivoNoViaja('.claude/skills/habit-system/SKILL.md'), /skill del autor/);
  assert.match(motivoNoViaja('.claude/memory/.env'), /negado/);
  assert.match(motivoNoViaja('.claude/plan/habitos.json.lock'), /negado/);
  assert.match(motivoNoViaja('arbrain/server/src/index.ts'), /fuera de la lista/);
  assert.match(motivoNoViaja('../.local/share/ai.arbrain.servidor/web/base/chat_messages.json'), /no canónica/);
});

test('CAPAS.json con una ruta de alumno nueva o una skill del autor nueva: la lista no lo cubre', () => {
  const capas = { alumno: ['.claude/memory/', '.claude/nueva/'], skills_del_autor: [...LISTA.skills_del_autor, 'otra'] };
  const fallos = revisaCapas(capas);
  assert.equal(fallos.length, 2);
});
