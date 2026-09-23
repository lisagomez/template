/**
 * `paraVoz` (RF-42): el primer parrafo de prosa de una respuesta en markdown, sin codigo, tablas,
 * listas ni titulos, acotado en fin de frase, mas la pregunta final si es corta. Contra `dist/`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFECTOS_PARA_VOZ, paraVoz } from '../dist/index.js';

test('paraVoz: salta titulos, codigo, listas, tablas y citas; limpia el markdown del primer parrafo', () => {
  const md = [
    '# Resultado',
    '',
    '```bash',
    'npm run prueba',
    '```',
    '',
    '- primero',
    '- segundo',
    '',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
    '',
    '> una cita',
    '',
    'Listo. Cambié el **valor por defecto** a `1500 ms` y las pruebas siguen en verde ([detalle](docs/x.md)). 🎉',
    '',
    'Otro párrafo que no se lee.',
  ].join('\n');
  assert.equal(paraVoz(md), 'Listo. Cambié el valor por defecto a 1500 ms y las pruebas siguen en verde (detalle).');
});

test('paraVoz: sin prosa devuelve vacio; un parrafo corto sale entero', () => {
  assert.equal(paraVoz('```\ncodigo\n```\n\n- solo\n- listas'), '');
  assert.equal(paraVoz(''), '');
  assert.equal(paraVoz('Hecho.'), 'Hecho.');
});

test('paraVoz: acota en el ultimo fin de frase que cabe; si ni la primera cabe, corta en palabra con puntos suspensivos', () => {
  const frase = 'Esta es una frase de prueba que mide bastante y sirve para llenar.'; // 66 caracteres
  const largo = Array.from({ length: 8 }, () => frase).join(' ');
  const voz = paraVoz(largo);
  assert.ok(voz.length <= DEFECTOS_PARA_VOZ.maxCaracteres, `${voz.length} caracteres`);
  assert.ok(voz.endsWith('llenar.'), 'termina en fin de frase');
  assert.equal(voz, Array.from({ length: 5 }, () => frase).join(' '));
  const sinPuntos = 'palabra '.repeat(80).trim();
  const corto = paraVoz(sinPuntos, { maxCaracteres: 50 });
  assert.ok(corto.length <= 51 && corto.endsWith('…') && !corto.includes('  '));
});

test('paraVoz: anade la pregunta final si es corta, tambien cuando el corte la dejo fuera; una larga no', () => {
  const md = 'Encontré dos cosas. La primera es un fallo en el reloj.\n\n- a\n- b\n\nEl detalle está arriba. ¿Sigo con la siguiente fase?';
  assert.equal(paraVoz(md), 'Encontré dos cosas. La primera es un fallo en el reloj. ¿Sigo con la siguiente fase?');
  const mismoParrafo = 'Primera frase larga que se lee. Segunda frase que ya no cabe en el tope. ¿Sigo?';
  assert.equal(paraVoz(mismoParrafo, { maxCaracteres: 40 }), 'Primera frase larga que se lee. ¿Sigo?');
  const larga = 'Hecho.\n\n¿Quieres que lo documente en el README, en el registro de la medición, en la spec, en el PRP, en la bitácora de cambios y en la memoria del proyecto, o solo en uno de ellos?';
  assert.equal(paraVoz(larga), 'Hecho.');
});
