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
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { revisaImagen, revisaConstruible } from '../despacho/reglas.mjs';

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

// --- La imagen se construye desde un clon limpio (PRP-010 H-30) ----------------------------------
// Un servidor recién clonado no tiene `tools/<x>/dist`, ni el peer `@tu-scope/voz` del dictado, ni
// `.claude/`: hasta el 2026-10-07 la imagen no se construía en ninguno. Las tres capas tienen siembra.

/** Lo que `src/` importa, por ruta relativa, desde FUERA de `src/` (rutas relativas a la raíz). */
function importadosDeFuera() {
  const fuera = new Set();
  const especificador = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g;
  const recorre = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') recorre(ruta); continue; }
      if (!/\.(ts|tsx|mjs|js)$/.test(e.name)) continue;
      for (const [, spec] of readFileSync(ruta, 'utf8').matchAll(especificador)) {
        const destino = relative(raiz, resolve(dirname(ruta), spec)).split('\\').join('/');
        if (!destino.startsWith('src/')) fuera.add(destino);
      }
    }
  };
  recorre(join(raiz, 'src'));
  return [...fuera].sort();
}
const construible = () => ({
  ...real(),
  scripts: JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')).scripts,
  importados: importadosDeFuera(),
});

test('el escáner de imports ve lo que la app trae de fuera de src/ (si no, la prueba de abajo pasaría en vacío)', () => {
  const importados = importadosDeFuera();
  assert.ok(importados.includes('.claude/routing-modelos.json'), 'no ve el import del routing');
  assert.ok(importados.some((r) => /^tools\/[^/]+\/dist\//.test(r)), 'no ve ningún import de tools/<x>/dist');
});

test('la imagen se construye desde un clon limpio: compila las herramientas, trae lo que importa y nada del anfitrión', () => {
  assert.deepEqual(revisaConstruible(construible()), { sinHerramientas: false, importsExcluidos: [], delAnfitrion: [] });
});

const siembrasConstruible = [
  ['`npm run build` deja de compilar las herramientas (capas 1 y 3: sin dist ni peers)',
    (r) => { delete r.scripts.prebuild; }, (x) => x.sinHerramientas === true],
  ['`.claude` vuelve a salir entero del contexto (capa 2)',
    (r) => { r.dockerignore = sinLineas(r.dockerignore, '!.claude/routing-modelos.json'); },
    (x) => x.importsExcluidos.includes('.claude/routing-modelos.json')],
  ['la app importa otro archivo que `.dockerignore` deja fuera',
    (r) => { r.importados.push('.claude/otro-catalogo.json'); }, (x) => x.importsExcluidos.includes('.claude/otro-catalogo.json')],
  ['solo se excluye el `node_modules` de la raíz',
    (r) => { r.dockerignore = sinLineas(r.dockerignore, '**/node_modules'); },
    (x) => x.delAnfitrion.some((ruta) => ruta.includes('/node_modules/'))],
  ['el `dist` de una herramienta entra del anfitrión',
    (r) => { r.dockerignore = sinLineas(r.dockerignore, '**/dist'); }, (x) => x.delAnfitrion.some((ruta) => ruta.includes('/dist/'))],
  ['un tarball viejo del anfitrión entra en vez de compilarse',
    (r) => { r.dockerignore = sinLineas(r.dockerignore, '**/*.tgz'); }, (x) => x.delAnfitrion.some((ruta) => ruta.endsWith('.tgz'))],
];
for (const [nombre, siembra, caza] of siembrasConstruible) {
  test(`siembra del clon limpio: ${nombre}`, () => {
    const r = construible();
    siembra(r);
    assert.ok(caza(revisaConstruible(r)), `no caza: ${nombre}`);
  });
}

// --- Lo que nunca viaja en la imagen (PRP-010 H-31) ----------------------------------------------
// El file tracing de Next metía en la imagen `erp/`, `trayectorias/`, `src/` y `docs/`. Se prueba la
// configuración REAL con la semántica de Next (`collect-build-traces.js`): cada clave casa con la ruta y
// cada patrón con la ruta absoluta del archivo, con el picomatch que trae Next y sus mismas opciones.
const picomatch = createRequire(import.meta.url)('next/dist/compiled/picomatch');
const { default: nextConfig } = await import('../../next.config.ts');

function excluido(config, ruta, archivo) {
  const opciones = { dot: true, contains: true };
  const patrones = Object.entries(config.outputFileTracingExcludes ?? {})
    .filter(([clave]) => picomatch(clave, opciones)(ruta))
    .flatMap(([, ps]) => ps.map((p) => join(raiz, p)));
  return patrones.length > 0 && picomatch(patrones, opciones)(join(raiz, archivo));
}
const RUTAS = ['/', '/estudio', '/laboratorio-pymes', '/soporte-sap', '/api/ventas-whatsapp/a2a/[dominio]',
  '/api/laboratorio/muestra', '/api/contenido/video'];
const NO_SALEN = ['erp/casa/huellas.txt', 'erp/entrega.json', 'trayectorias/datos/aplicacion/2026-09/una.json',
  'inventario/activos.json', 'productos/soporte-sap.json', 'docs/analisis/2026-10-02/analisis.json', '.claude/routing-modelos.json',
  'scripts/package.json', 'src/features/etiquetas/services/servidor/puerta.ts', 'tools/extractor-documental/src/lote-pagina.ts',
  'tools/soporte-sap/pruebas/aislamiento.ts', 'tools/extractor-documental/manual/pantallas/caso-cfdi.png',
  'tools/dictado/medicion/corpus-propio/pildora/captura-idle.png'];
const SI_SALEN = ['tools/reel/dist/index.js', 'tools/conocimiento/dominios/un-dominio.json', 'public/manifest.json',
  'node_modules/next/package.json', 'package.json'];
const fugas = (c) => RUTAS.flatMap((r) => NO_SALEN.filter((a) => !excluido(c, r, a)).map((a) => `${r}: ${a}`));
const faltan = (c) => RUTAS.flatMap((r) => SI_SALEN.filter((a) => excluido(c, r, a)).map((a) => `${r}: ${a}`));

test('ninguna ruta lleva a la imagen lo que no sale (erp, trayectorias, la fuente…), y sí lo que necesita', () => {
  assert.deepEqual({ fugas: fugas(nextConfig), faltan: faltan(nextConfig) }, { fugas: [], faltan: [] });
});

const copia = () => ({ ...nextConfig, outputFileTracingExcludes: Object.fromEntries(
  Object.entries(nextConfig.outputFileTracingExcludes).map(([k, v]) => [k, [...v]])) });
const sinPatron = (c, patron) => { c.outputFileTracingExcludes['/**'] = c.outputFileTracingExcludes['/**'].filter((p) => p !== patron); };
const siembrasTraza = [
  ['se quita `erp/**`', (c) => sinPatron(c, 'erp/**'), (c) => fugas(c).some((f) => f.includes(': erp/'))],
  ['se quita `trayectorias/**`', (c) => sinPatron(c, 'trayectorias/**'), (c) => fugas(c).some((f) => f.includes(': trayectorias/'))],
  ['se quita `src/**`', (c) => sinPatron(c, 'src/**'), (c) => fugas(c).some((f) => f.includes(': src/'))],
  ['la clave solo cubre `/api/**` y deja fuera las páginas', (c) => {
    c.outputFileTracingExcludes['/api/**'] = c.outputFileTracingExcludes['/**']; delete c.outputFileTracingExcludes['/**'];
  }, (c) => fugas(c).some((f) => f.startsWith('/estudio:'))],
  ['una exclusión demasiado ancha se lleva el `dist` que la app ejecuta', (c) => { c.outputFileTracingExcludes['/**'].push('tools/**'); },
    (c) => faltan(c).some((f) => f.includes('tools/reel/dist/'))],
];
for (const [nombre, siembra, caza] of siembrasTraza) {
  test(`siembra de la traza: ${nombre}`, () => {
    const c = copia();
    siembra(c);
    assert.ok(caza(c), `no caza: ${nombre}`);
  });
}
