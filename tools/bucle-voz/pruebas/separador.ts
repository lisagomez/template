/**
 * El separador: frases enteras cuando el texto llega token a token, sin partir decimales,
 * miles, horas, abreviaturas ni iniciales, y con el primer trozo pronto.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creaSeparador, limpiaParaVoz } from '../dist/index.js';

/** Empuja el texto de 3 en 3 caracteres, como un flujo de tokens cortos. */
function porTrozos(texto: string, tam = 3): { frases: string[]; cuandoPrimera: number } {
  const s = creaSeparador();
  const frases: string[] = [];
  let cuandoPrimera = -1;
  for (let i = 0; i < texto.length; i += tam) {
    const salida = s.empuja(texto.slice(i, i + tam));
    if (salida.length > 0 && cuandoPrimera < 0) cuandoPrimera = i + tam;
    frases.push(...salida);
  }
  frases.push(...s.cierra());
  return { frases, cuandoPrimera };
}

test('no corta en decimales, miles, dinero ni horas', () => {
  const { frases } = porTrozos('La tasa subió a 3.5 por ciento en el trimestre. Vendimos $1,214.50 y 1.500 piezas a las 10:30 de la mañana. Bien.');
  assert.deepEqual(frases, ['La tasa subió a 3.5 por ciento en el trimestre.', 'Vendimos $1,214.50 y 1.500 piezas a las 10:30 de la mañana.', 'Bien.']);
});

test('no corta en abreviaturas ni iniciales del español', () => {
  // «Bien.» va primero para que el primer trozo ávido (que cortaría en la coma) no intervenga.
  const { frases } = porTrozos('Bien. Habló el Sr. Pérez con la Dra. López y el Lic. Ruiz, p. ej. sobre EE. UU. y J. K. Rowling. Luego seguimos.');
  assert.deepEqual(frases, ['Bien.', 'Habló el Sr. Pérez con la Dra. López y el Lic. Ruiz, p. ej. sobre EE. UU. y J. K. Rowling.', 'Luego seguimos.']);
});

test('«etc.» cierra frase solo si sigue mayúscula; los suspensivos igual', () => {
  assert.deepEqual(porTrozos('Hay mesas, sillas, etc. y más cosas. Fin.').frases, ['Hay mesas, sillas, etc. y más cosas.', 'Fin.']);
  assert.deepEqual(porTrozos('Compré pan, leche, etc. Después volví.').frases, ['Compré pan, leche, etc.', 'Después volví.']);
  assert.deepEqual(porTrozos('Bueno... la verdad es que sí. Pero... Ya veremos.').frases, ['Bueno... la verdad es que sí.', 'Pero...', 'Ya veremos.']);
});

test('no corta dentro de una dirección web ni de un correo', () => {
  assert.deepEqual(porTrozos('Entra a ejemplo.com.mx o escribe a ana.lopez@correo.mx para más datos. Gracias.').frases, ['Entra a ejemplo.com.mx o escribe a ana.lopez@correo.mx para más datos.', 'Gracias.']);
});

test('una respuesta que empieza con «Sí.» emite esa frase ya (la fuente no emitía nada hasta el final)', () => {
  const s = creaSeparador();
  assert.deepEqual(s.empuja('Sí.'), [], 'falta saber qué viene detrás');
  assert.deepEqual(s.empuja(' Claro'), ['Sí.']);
});

test('el primer trozo sale en la primera pausa a partir de 20 caracteres, sin esperar al punto', () => {
  const texto = 'Un balance general, también llamado estado de situación, muestra lo que la empresa tiene y lo que debe en una fecha.';
  const { frases, cuandoPrimera } = porTrozos(texto);
  assert.equal(frases[0], 'Un balance general, también llamado estado de situación,');
  assert.ok(cuandoPrimera > 0 && cuandoPrimera < 62, `primer trozo a los ${cuandoPrimera} caracteres de ${texto.length}`);
  assert.equal(frases.join(' '), texto);
});

test('sin pausa, el primer trozo sale en un espacio pasados 70 caracteres', () => {
  const texto = 'Esta es una frase muy larga sin ninguna coma que sigue y sigue hablando de cosas importantes para el negocio y no termina';
  const s = creaSeparador();
  const primeras = s.empuja(texto);
  assert.equal(primeras.length, 1);
  assert.ok((primeras[0] ?? '').length >= 70);
  assert.ok(texto.startsWith(primeras[0] ?? ''));
});

test('la pregunta y la exclamación cierran; ¿ y ¡ abren', () => {
  assert.deepEqual(porTrozos('¿Qué hora es? ¡Son las cinco! Vamos.').frases, ['¿Qué hora es?', '¡Son las cinco!', 'Vamos.']);
});

test('las marcas de lista y el markdown no se leen', () => {
  const { frases } = porTrozos('Tres ideas:\n1. Ofrece **envío gratis** hoy.\n2. Usa `cupones`.\n- Llama a tus clientes.');
  assert.deepEqual(frases, ['Tres ideas:', 'Ofrece envío gratis hoy.', 'Usa cupones.', 'Llama a tus clientes.']);
  assert.equal(limpiaParaVoz('## Título *énfasis* y _otro_'), 'Título énfasis y otro');
});

test('ninguna frase pasa del máximo: se corta en una pausa', () => {
  const larga = `${'palabra, '.repeat(40)}fin.`;
  const { frases } = porTrozos(larga, 5);
  for (const f of frases) assert.ok(f.length <= 240, `frase de ${f.length}`);
  assert.equal(frases.join(' ').replace(/\s+/g, ' '), larga.trim());
});
