/** Instalador, diagnostico e icono: lo puro se prueba sin red, sin Windows y sin microfono. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comprueba } from '../dist/node/cli-instala.js';
import { limpiaParaCompartir, lineasUtilesDelLog } from '../dist/node/cli-diagnostico.js';
import { hayQueRefrescarIcono } from '../dist/node/cli-icono.js';
import { DE_MEDICION, mbDe, NECESARIOS, RUNTIMES, verificaHuella } from '../dist/node/pesos.js';
import { almacenEnMemoria, creaHistorial, fechaHaceDias } from '../dist/index.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('pesos necesarios: cuatro pineados por URL exacta, sin corpus ni whisper; runtimes pineados', () => {
  assert.equal(NECESARIOS.length, 4);
  for (const p of NECESARIOS) assert.match(p.url, /^https:\/\/(github\.com|huggingface\.co)\//);
  assert.ok(!NECESARIOS.some((p) => /whisper|fleurs/i.test(p.url)));
  assert.ok(mbDe(NECESARIOS) < 800, 'menos de 800 MB de pesos');
  assert.deepEqual(Object.keys(RUNTIMES), ['sherpa-onnx-node', 'onnxruntime-node']);
});

test('comprueba: en esta maquina hay Node y ffmpeg, y la lista dice que revisa', () => {
  const c = comprueba();
  assert.ok(c.lineas.some((l) => l.includes('Node')));
  assert.ok(c.lineas.some((l) => l.includes('ffmpeg')));
});

test('diagnostico: limpiaParaCompartir quita tokens, correos, claves y rutas de usuario', () => {
  const sucio = 'token=0123456789abcdef0123456789abcdef correo ana@ejemplo.mx clave sk-abcdefghijklmnop ruta /home/lisa/x y C:\\Users\\lisa\\y VAR_SECRETA=valorlargo123';
  const limpio = limpiaParaCompartir(sucio);
  assert.ok(!limpio.includes('0123456789abcdef'));
  assert.ok(!limpio.includes('ana@'));
  assert.ok(!limpio.includes('sk-abc'));
  assert.ok(!limpio.includes('/home/lisa'));
  assert.ok(!limpio.includes('Users\\lisa'));
  assert.ok(!limpio.includes('valorlargo123'));
});

test('diagnostico: del log solo salen lineas de estado, nunca las que llevan el texto dictado', () => {
  const dir = mkdtempSync(join(tmpdir(), 'diag-'));
  const log = join(dir, 'en-vivo.log');
  writeFileSync(log, ['motor parakeet listo en 80 ms', '▶ escuchando', '✓ esto es lo que dicte y es privado', '[pegar=ninguno] "privado"', '  latencia fin-de-habla→pegado 230 ms', '  pico durante la escucha: -15.0 dBFS', 'otra linea cualquiera'].join('\n'));
  const lineas = lineasUtilesDelLog(log);
  assert.ok(lineas.some((l) => l.includes('latencia')));
  assert.ok(!lineas.some((l) => l.includes('privado')));
  assert.ok(!lineas.some((l) => l.includes('otra linea')));
  rmSync(dir, { recursive: true, force: true });
});

test('icono: se refresca si no hay version o si cambio; no, si es la misma', () => {
  assert.equal(hayQueRefrescarIcono(undefined, 'abc'), true);
  assert.equal(hayQueRefrescarIcono('xyz\n', 'abc'), true);
  assert.equal(hayQueRefrescarIcono('abc\n', 'abc'), false);
});

test('historial: borra todo o solo lo anterior a una fecha; fechaHaceDias resta dias', async () => {
  const h = creaHistorial(almacenEnMemoria());
  await h.agrega({ texto: 'viejo', motor: 'm', duracionMs: 1, fecha: '2025-01-01T00:00:00.000Z' });
  await h.agrega({ texto: 'nuevo', motor: 'm', duracionMs: 1, fecha: '2026-09-01T00:00:00.000Z' });
  assert.equal(await h.borra({ antesDe: '2026-01-01T00:00:00.000Z' }), 1);
  assert.equal(await h.cuenta(), 1);
  assert.equal(await h.borra(), 1);
  assert.equal(await h.cuenta(), 0);
  const uno = await h.agrega({ texto: 'solo', motor: 'm', duracionMs: 1 });
  assert.equal(await h.borraUno('otro'), 0);
  assert.equal(await h.borraUno(uno.id), 1);
  assert.equal(await h.cuenta(), 0);
  assert.equal(fechaHaceDias(365, new Date('2026-09-20T00:00:00.000Z')).slice(0, 10), '2025-09-20');
});

test('los pesos van a referencias inmutables y con huella: nada de master/main, y la que no coincide se borra', async () => {
  const { existsSync } = await import('node:fs');
  for (const p of [...NECESARIOS, ...DE_MEDICION]) {
    assert.doesNotMatch(p.url, /\/(raw|resolve)\/(master|main)\//, `${p.url} apunta a una rama que se mueve`);
    if (p.sha256 !== null) assert.match(p.sha256, /^sha256:[0-9a-f]{64}$/);
  }
  assert.ok(NECESARIOS.every((p) => p.sha256 !== null), 'todo lo que instala un dictado lleva huella');
  const dir = mkdtempSync(join(tmpdir(), 'huella-'));
  const ruta = join(dir, 'peso.onnx');
  writeFileSync(ruta, 'hola');
  verificaHuella(ruta, 'sha256:b221d9dbb083a7f33428d7c2a3c3198ae925614d70210e28716ccaa7cd4ddb79');
  assert.ok(existsSync(ruta), 'la huella buena lo deja');
  assert.throws(() => verificaHuella(ruta, `sha256:${'0'.repeat(64)}`), /no coincide/);
  assert.ok(!existsSync(ruta), 'la mala lo borra');
});
