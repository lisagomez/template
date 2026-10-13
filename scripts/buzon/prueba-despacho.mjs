/**
 * El despliegue en el despacho (spec 015, fase 2: TAR-3 y TAR-4). Parte del gate `prueba:buzon`.
 *
 * Lo que se prueba es el PERÍMETRO, no la buena voluntad: el compose real del despacho se lee y se
 * exige que ningún servicio con documentos tenga salida a internet ni pueda mandar uno fuera; y
 * `configura:deploy` en modo despacho se corre con el caso malo de cada regla. Cada regla tiene su
 * siembra: si la comprobación deja de cazarla, esta prueba se pone roja.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { revisaPerimetro, revisaDespacho, firmaJwt, leeJwt, RAM_MINIMA_DESPACHO_MB } from '../despacho/reglas.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const compose = () => yaml.load(readFileSync(join(raiz, 'docker-compose.despacho.yml'), 'utf8'));
const vacio = { conSalida: [], conPuertos: [], sinPinear: [], respaldoAbierto: [], llavesDeFuera: [], sinRed: [] };

// --- TAR-3 · el perímetro del compose ----------------------------------------------------------

test('el compose del despacho: ningún servicio con documentos tiene salida ni puertos, y todo va pineado', () => {
  assert.deepEqual(revisaPerimetro(compose()), vacio);
});

test('Caddy es la única salida, y de verdad la tiene (la excepción no es papel)', () => {
  const c = compose();
  const redes = Object.keys(c.services.caddy.networks);
  assert.ok(redes.some((red) => c.networks[red].internal !== true), 'Caddy necesita una red con salida para el TLS');
  assert.ok(c.services.caddy.ports.length > 0);
  assert.equal(c.networks.frente.internal, true);
  assert.equal(c.networks.interna.internal, true);
});

test('el compose fija la cola de visión en «ninguno» y no le pasa a nadie llaves de fuera', () => {
  const c = compose();
  assert.equal(c.services.ocr.environment.EXTRACTOR_RESPALDO, 'ninguno');
  for (const [nombre, servicio] of Object.entries(c.services)) {
    for (const clave of Object.keys(servicio.environment ?? {})) {
      assert.doesNotMatch(clave, /MISTRAL|OPENROUTER|SUPABASE_SERVICE_ROLE_KEY|DECISION_C4/, `${nombre} recibe ${clave}`);
    }
  }
});

const siembrasPerimetro = [
  ['la app vuelve a la red `web`', (c) => c.services.app.networks.push('web'), 'conSalida', 'app'],
  ['la base publica su puerto', (c) => { c.services.db.ports = ['5432:5432']; }, 'conPuertos', 'db'],
  ['auth pierde su digest', (c) => { c.services.auth.image = 'supabase/gotrue:v2.196.0'; }, 'sinPinear', 'auth'],
  ['la cola de visión se abre a Mistral', (c) => { c.services.ocr.environment.EXTRACTOR_RESPALDO = 'mistral'; }, 'respaldoAbierto', 'ocr'],
  ['la app recibe la llave service_role', (c) => { c.services.app.environment.SUPABASE_SERVICE_ROLE_KEY = 'x'; }, 'llavesDeFuera', 'app'],
  ['un servicio sin redes cae en `default`', (c) => { delete c.services.rest.networks; }, 'sinRed', 'rest'],
  ['`interna` deja de ser interna', (c) => { c.networks.interna.internal = false; }, 'conSalida', 'db'],
];
for (const [nombre, siembra, regla, servicio] of siembrasPerimetro) {
  test(`siembra del perímetro: ${nombre}`, () => {
    const c = compose();
    siembra(c);
    assert.ok(revisaPerimetro(c)[regla].includes(servicio), `${regla} no caza a ${servicio}`);
  });
}

// --- TAR-4 · configura:deploy en modo despacho -------------------------------------------------

const SECRETO = 'x'.repeat(48);
const ahora = Math.floor(Date.now() / 1000);
const llave = (rol, secreto = SECRETO) => firmaJwt({ role: rol, iss: 'supabase', iat: ahora, exp: ahora + 3600 }, secreto);
const bueno = () => new Map([
  ['DESPLIEGUE', 'despacho'],
  ['DOMAIN', 'buzon.despacho-ejemplo.mx'],
  ['NEXT_PUBLIC_SUPABASE_URL', 'https://buzon.despacho-ejemplo.mx'],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', llave('anon')],
  ['SERVICE_ROLE_KEY', llave('service_role')],
  ['JWT_SECRET', SECRETO],
  ['POSTGRES_PASSWORD', 'p'.repeat(48)],
]);
const RAM = RAM_MINIMA_DESPACHO_MB;

test('un .env de despacho bien hecho no tiene problemas', () => {
  assert.deepEqual(revisaDespacho(bueno(), { ramMB: RAM }).problemas, []);
});

const siembrasEnv = [
  ['Supabase gestionado', (v) => v.set('NEXT_PUBLIC_SUPABASE_URL', 'https://abcdefgh.supabase.co'), /Supabase gestionado/],
  ['URL de Supabase en otro origen', (v) => v.set('NEXT_PUBLIC_SUPABASE_URL', 'https://otra.ejemplo.mx'), /mismo\s+origen/],
  ['respaldo de visión encendido', (v) => v.set('OCR_RESPALDO', 'mistral'), /OCR_RESPALDO=mistral/],
  ['respaldo «compatible» hacia fuera', (v) => v.set('OCR_RESPALDO', 'compatible'), /OCR_RESPALDO=compatible/],
  ['llave de Mistral presente', (v) => v.set('MISTRAL_API_KEY', 'k'.repeat(40)), /MISTRAL_API_KEY está puesta/],
  ['la app con service_role', (v) => v.set('SUPABASE_SERVICE_ROLE_KEY', llave('service_role')), /no usa service_role/],
  ['llave anónima firmada con otro secreto', (v) => v.set('NEXT_PUBLIC_SUPABASE_ANON_KEY', llave('anon', 'y'.repeat(48))), /no está firmada con JWT_SECRET/],
  ['llave anónima con rol de servicio', (v) => v.set('NEXT_PUBLIC_SUPABASE_ANON_KEY', llave('service_role')), /rol «service_role»/],
  ['JWT_SECRET corto', (v) => v.set('JWT_SECRET', 'corto'), /JWT_SECRET falta o tiene menos/],
  ['sin contraseña de la base', (v) => v.delete('POSTGRES_PASSWORD'), /POSTGRES_PASSWORD falta/],
];
for (const [nombre, siembra, espera] of siembrasEnv) {
  test(`siembra del .env: ${nombre}`, () => {
    const valores = bueno();
    siembra(valores);
    const { problemas } = revisaDespacho(valores, { ramMB: RAM });
    assert.ok(problemas.some((p) => espera.test(p)), `no lo caza; problemas: ${problemas.join(' | ')}`);
  });
}

test('siembra de la máquina: menos RAM de la que pide el stack', () => {
  const { problemas } = revisaDespacho(bueno(), { ramMB: RAM - 1 });
  assert.ok(problemas.some((p) => /no cabe el stack del despacho/.test(p)));
});

test('ningún mensaje lleva el valor de un secreto', () => {
  const valores = bueno();
  valores.set('NEXT_PUBLIC_SUPABASE_ANON_KEY', llave('anon', 'y'.repeat(48)));
  valores.set('MISTRAL_API_KEY', 'k'.repeat(40));
  const texto = JSON.stringify(revisaDespacho(valores, { ramMB: RAM }));
  for (const clave of ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'MISTRAL_API_KEY', 'JWT_SECRET', 'POSTGRES_PASSWORD', 'SERVICE_ROLE_KEY']) {
    assert.ok(!texto.includes(valores.get(clave)), `${clave} aparece en un mensaje`);
  }
});

// --- configura:deploy y llaves.mjs, de punta a punta, con un .env temporal ---------------------

function conEnvTemporal(contenido, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'despacho-'));
  const env = join(dir, '.env.production');
  writeFileSync(env, contenido);
  try { return fn(env); } finally { rmSync(dir, { recursive: true, force: true }); }
}
const corre = (script, env, args = []) => {
  try {
    return execFileSync('node', [join(raiz, script), ...args], { env: { ...process.env, ENV_PRODUCCION: env }, encoding: 'utf8' });
  } catch (e) {
    return `${e.stdout}${e.stderr}`;
  }
};

test('llaves.mjs: genera lo que falta, firma con su secreto, no reescribe y no imprime ningún valor', () => {
  conEnvTemporal('DOMAIN=buzon.despacho-ejemplo.mx\n', (env) => {
    const salida = corre('scripts/despacho/llaves.mjs', env);
    const valores = new Map(readFileSync(env, 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => l.split(/=(.*)/s).slice(0, 2)));
    for (const clave of ['POSTGRES_PASSWORD', 'JWT_SECRET', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SERVICE_ROLE_KEY']) {
      assert.ok(valores.get(clave), `${clave} no se escribió`);
      assert.ok(!salida.includes(valores.get(clave)), `${clave} se imprimió`);
    }
    assert.equal(leeJwt(valores.get('NEXT_PUBLIC_SUPABASE_ANON_KEY'), valores.get('JWT_SECRET')).valida, true);
    assert.equal(leeJwt(valores.get('SERVICE_ROLE_KEY'), valores.get('JWT_SECRET')).rol, 'service_role');
    const antes = readFileSync(env, 'utf8');
    assert.match(corre('scripts/despacho/llaves.mjs', env), /no toco nada/);
    assert.equal(readFileSync(env, 'utf8'), antes);
  });
});

test('llaves.mjs: con llaves y sin su secreto no escribe nada', () => {
  conEnvTemporal(`SERVICE_ROLE_KEY=${llave('service_role')}\n`, (env) => {
    const antes = readFileSync(env, 'utf8');
    assert.match(corre('scripts/despacho/llaves.mjs', env), /no sé con qué se firmaron/);
    assert.equal(readFileSync(env, 'utf8'), antes);
  });
});

test('configura:deploy en modo despacho rechaza el Supabase gestionado y no imprime secretos', () => {
  const valores = bueno();
  valores.set('NEXT_PUBLIC_SUPABASE_URL', 'https://abcdefgh.supabase.co');
  valores.set('TLS_EMAIL', 'operacion@despacho-ejemplo.mx');
  valores.set('NEXT_PUBLIC_SITE_URL', 'https://buzon.despacho-ejemplo.mx');
  const contenido = [...valores].map(([c, v]) => `${c}=${v}`).join('\n');
  conEnvTemporal(contenido, (env) => {
    const salida = corre('scripts/configura-deploy.mjs', env);
    assert.match(salida, /Modo despacho/);
    assert.match(salida, /Supabase gestionado/);
    for (const clave of ['JWT_SECRET', 'POSTGRES_PASSWORD', 'SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) {
      assert.ok(!salida.includes(valores.get(clave)), `${clave} se imprimió`);
    }
  });
});
