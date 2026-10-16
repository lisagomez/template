/**
 * Palabra de activación sobre texto: acentos, ñ y límites de palabra Unicode (el `\b` de la
 * fuente era ASCII y fallaba con «Ámbar», «José» o «Begoña»).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creaActivacion, pareceEco, palabras, pliega } from '../dist/index.js';

test('pliega quita acentos y diéresis pero conserva la ñ', () => {
  assert.equal(pliega('ÁMBAR Pingüino Begoña Ñandú'), 'ambar pinguino begoña ñandu');
  assert.deepEqual(palabras('¿Oye, José?¡Ya!'), ['oye', 'jose', 'ya']);
});

test('«oye Begoña»: con ñ, sin ñ, en mayúsculas, con puntuación y pegada', () => {
  const a = creaActivacion({ frases: ['oye Begoña'] });
  for (const t of ['Oye, Begoña, ¿qué hora es?', 'oye begona que hora es', 'OYE BEGOÑA.', 'Oye Begoñá', 'oyebegoña qué tal']) {
    assert.equal(a.detecta(t).activada, true, t);
  }
  const r = a.detecta('Oye, Begoña, ¿qué hora es?');
  assert.ok(r.activada && r.resto === '¿qué hora es?', 'el resto conserva los acentos del original');
});

test('no se activa con palabras parecidas ni con el nombre suelto a media frase', () => {
  const a = creaActivacion({ frases: ['oye Begoña'] });
  for (const t of ['Begoña dijo que no vendría', 'oye, las begonias del jardín', 'hoy ve gonzalo', 'ayer fui con Begoña y le dije oye']) {
    assert.equal(a.detecta(t).activada, false, t);
  }
});

test('nombres con acento al inicio: «Ámbar», «José» (donde `\\b` ASCII fallaba)', () => {
  const ambar = creaActivacion({ frases: ['Ámbar'] });
  assert.equal(ambar.detecta('Ámbar, la hora').activada, true);
  assert.equal(ambar.detecta('ambar, la hora').activada, true);
  assert.equal(ambar.detecta('Vamos a cambiar la luz').activada, false);
  const jose = creaActivacion({ frases: ['oye José'] });
  const r = jose.detecta('oye jose, apaga todo');
  assert.ok(r.activada && r.resto === 'apaga todo');
});

test('la frase de activación tiene que ir al principio', () => {
  const a = creaActivacion({ frases: ['oye mando'] });
  assert.equal(a.detecta('bueno, oye mando, ¿qué tengo hoy?').activada, true);
  assert.equal(a.detecta('le dije a mi jefe que oye mando todo mañana').activada, false);
});

test('pareceEco: lo que acaba de decir el agente no es la persona', () => {
  assert.equal(pareceEco('son las cinco y veinte', 'Son las cinco y veinte de la tarde.'), true);
  assert.equal(pareceEco('¿y mañana qué tengo?', 'Son las cinco y veinte de la tarde.'), false);
});
