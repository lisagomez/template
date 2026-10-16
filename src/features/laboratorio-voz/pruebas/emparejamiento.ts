/**
 * El token del enlace de emparejamiento (QR o link), que comparten /dictar, /ajustes, /historial, el laboratorio y el
 * centro de mando. Hasta el 2026-10-16 se leía de `hash + search` concatenados: con `?caso=6#t=…` el token arrastraba
 * «?caso=6» y el emparejamiento fallaba.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenDelEnlace } from '../../../shared/lib/token-enlace.ts';

test('el token del hash no arrastra la búsqueda, y la URL limpia la conserva', () => {
  const r = tokenDelEnlace({ pathname: '/laboratorio-voz', search: '?caso=6', hash: '#t=abc123def456ghi7' });
  assert.deepEqual(r, { token: 'abc123def456ghi7', urlLimpia: '/laboratorio-voz?caso=6' });
});

test('también en la búsqueda, y sin dejarlo en la URL limpia', () => {
  assert.deepEqual(tokenDelEnlace({ pathname: '/dictar', search: '?x=1&t=tok%2Bmas', hash: '' }), { token: 'tok+mas', urlLimpia: '/dictar?x=1' });
  assert.deepEqual(tokenDelEnlace({ pathname: '/centro-de-mando', search: '?medicion=1', hash: '#t=zzz' }), { token: 'zzz', urlLimpia: '/centro-de-mando?medicion=1' });
});

test('sin token no hay nada que emparejar', () => {
  assert.equal(tokenDelEnlace({ pathname: '/ajustes', search: '?caso=6', hash: '#seccion' }), undefined);
});
