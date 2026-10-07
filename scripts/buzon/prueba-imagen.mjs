/**
 * La imagen de la app no lleva llaves (PRP-010 H-29). Parte del gate `prueba:buzon`: el perímetro del
 * despacho promete que la app no recibe llaves de fuera, y `prueba-despacho.mjs` solo mira el compose.
 * Por detrás del compose, el build standalone de Next copiaba `.env.production` a la imagen y lo cargaba
 * al arrancar: la app del despacho tenía `service_role` aunque su compose dijera que no. Vale también
 * para el compose principal, que construye con el mismo `Dockerfile`.
 *
 * Se leen el `.dockerignore` y el `Dockerfile` reales. Cada siembra es una forma de volver a abrir el
 * hueco: si la comprobación deja de cazarla, esta prueba se pone roja.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { revisaImagen } from '../despacho/reglas.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const real = () => ({
  dockerignore: readFileSync(join(raiz, '.dockerignore'), 'utf8'),
  dockerfile: readFileSync(join(raiz, 'Dockerfile'), 'utf8'),
});

test('ningún archivo con llaves entra a la imagen, y el Dockerfile tumba el build si entra uno', () => {
  assert.deepEqual(revisaImagen(real()), { entran: [], sinGuarda: false });
});

const sinLineas = (texto, ...lineas) => texto.split('\n').filter((l) => !lineas.includes(l.trim())).join('\n');
const siembras = [
  ['vuelve la exclusión de antes (`.env` y `.env*.local`)',
    (r) => { r.dockerignore = sinLineas(r.dockerignore, '.env*', '**/.env*') + '\n.env\n.env*.local\n'; }, '.env.production'],
  ['se quita la exclusión de `.env*`', (r) => { r.dockerignore = sinLineas(r.dockerignore, '.env*', '**/.env*'); }, '.env.production'],
  ['solo se excluye en la raíz', (r) => { r.dockerignore = sinLineas(r.dockerignore, '**/.env*'); }, 'tools/una-herramienta/.env.production'],
  ['una excepción la vuelve a meter', (r) => { r.dockerignore += '\n!.env.production\n'; }, '.env.production'],
];
for (const [nombre, siembra, archivo] of siembras) {
  test(`siembra de la imagen: ${nombre}`, () => {
    const r = real();
    siembra(r);
    assert.ok(revisaImagen(r).entran.includes(archivo), `no caza que ${archivo} entra a la imagen`);
  });
}

test('siembra de la imagen: el Dockerfile pierde la guarda', () => {
  const r = real();
  r.dockerfile = r.dockerfile.replace(/RUN if find \.[^\n]*\n[^\n]*exit 1; fi\n/, '');
  assert.equal(revisaImagen(r).sinGuarda, true);
});

test('siembra de la imagen: la guarda queda después del build, cuando ya no sirve', () => {
  const r = real();
  const guarda = r.dockerfile.match(/RUN if find \.[^\n]*\n[^\n]*exit 1; fi\n/)[0];
  r.dockerfile = r.dockerfile.replace(guarda, '').replace('RUN npm run build\n', `RUN npm run build\n${guarda}`);
  assert.equal(revisaImagen(r).sinGuarda, true);
});
