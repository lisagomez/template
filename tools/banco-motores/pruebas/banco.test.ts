/**
 * Pruebas del banco de motores. Corren con `npm run prueba` (y dentro de `npm run prueba:tools`).
 * Incluyen las SIEMBRAS que el spec exige: un motor que devuelve basura no llega a la pantalla, y el núcleo
 * no importa React, Next ni Node.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { campoImagen, catalogoDePeorCaso, creaApi, defineFuncion, describeEsquema, ejecuta, FAMILIAS, peorCaso, resumeCasos } from '../dist/index.js';

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

const eco = defineFuncion({
  id: 'eco',
  titulo: 'Eco',
  descripcion: 'Devuelve el texto en mayúsculas.',
  motor: 'función pura de prueba',
  entrada: z.object({ texto: z.string().min(1).meta({ title: 'Texto' }), veces: z.number().int().min(1).max(3).default(1) }),
  salida: z.object({ resultado: z.string(), largo: z.number().meta({ unidad: 'caracteres' }) }),
  ejemplos: [{ id: 'hola', titulo: 'Hola', entrada: { texto: 'hola' }, sintetico: true }],
  async ejecuta(e) {
    const r = e.texto.toUpperCase().repeat(e.veces);
    return { resultado: r, largo: r.length };
  },
});

const basura = defineFuncion({
  id: 'basura',
  titulo: 'Motor que miente',
  descripcion: 'SIEMBRA: devuelve algo fuera de su esquema.',
  motor: 'siembra',
  entrada: z.object({ imagen: campoImagen('Imagen') }),
  salida: z.object({ texto: z.string(), confianza: z.number().min(0).max(1) }),
  ejemplos: [],
  async ejecuta() {
    return { texto: 'DOCUMENTO CONFIDENCIAL QUE NO DEBE SALIR', confianza: 7 } as unknown as { texto: string; confianza: number };
  },
});

const rota = defineFuncion({
  id: 'rota', titulo: 'Rota', descripcion: 'Falla con un volcado.', motor: 'siembra',
  entrada: z.object({}), salida: z.object({}), ejemplos: [],
  async ejecuta() { throw new Error('extractor: el motor falló\nSTDOUT: contenido del documento\nmás líneas'); },
});

test('describeEsquema saca un bloque por campo, con su tipo, etiqueta y unidad', () => {
  const bloques = describeEsquema(z.object({
    nombre: z.string().meta({ title: 'Nombre' }),
    notas: z.string().max(2000),
    edad: z.number().min(0).max(120),
    rol: z.enum(['a', 'b']),
    activo: z.boolean(),
    foto: campoImagen('Foto'),
    filas: z.array(z.object({ clave: z.string(), valor: z.number() })),
    etiquetas: z.array(z.string()),
    datos: z.object({ x: z.number() }),
  }));
  const tipo = Object.fromEntries(bloques.map((b) => [b.campo, b.tipo]));
  assert.deepEqual(tipo, { nombre: 'texto', notas: 'texto-largo', edad: 'numero', rol: 'opcion', activo: 'booleano', foto: 'imagen', filas: 'tabla', etiquetas: 'lista', datos: 'objeto' });
  assert.equal(bloques[0]?.etiqueta, 'Nombre');
  assert.equal(bloques.find((b) => b.campo === 'notas')?.etiqueta, 'Notas');
  assert.deepEqual(bloques.find((b) => b.campo === 'filas')?.columnas, ['clave', 'valor']);
  assert.deepEqual(bloques.find((b) => b.campo === 'rol')?.opciones, ['a', 'b']);
});

test('ejecuta: camino feliz con salida validada y milisegundos', async () => {
  const r = await ejecuta(eco, { texto: 'hola', veces: 2 });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.salida, { resultado: 'HOLAHOLA', largo: 8 });
  assert.equal(typeof r.ms, 'number');
});

test('ejecuta: una entrada inválida se rechaza ANTES del motor, con la ruta del problema', async () => {
  const r = await ejecuta(eco, { texto: '', veces: 9 });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.etapa, 'entrada');
    assert.deepEqual(r.problemas.map((p) => p.ruta).sort(), ['texto', 'veces']);
  }
});

test('SIEMBRA: un motor que devuelve basura no llega a la pantalla, ni su valor crudo', async () => {
  const r = await ejecuta(basura, { imagen: PNG_1PX });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.etapa, 'salida');
  assert.ok(!JSON.stringify(r).includes('CONFIDENCIAL'), 'el valor crudo del motor viajó en el resultado');
});

test('un error del motor viaja recortado a su primera línea, sin el volcado', async () => {
  const r = await ejecuta(rota, {});
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.etapa, 'motor');
    assert.equal(r.mensaje, 'extractor: el motor falló');
  }
});

test('cancelar antes de que termine el motor da la etapa «cancelada»', async () => {
  const lenta = defineFuncion({ id: 'lenta', titulo: 'Lenta', descripcion: '', motor: 'espera', entrada: z.object({}), salida: z.object({}), ejemplos: [],
    ejecuta: () => new Promise<Record<string, never>>((ok) => setTimeout(() => ok({}), 500)) });
  const c = new AbortController();
  setTimeout(() => c.abort(), 20);
  const r = await ejecuta(lenta, {}, { signal: c.signal });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.etapa, 'cancelada');
});

test('API: GET lista, POST ejecuta con el MISMO esquema, 422/404/413/400, y fail-closed', async () => {
  let abierta = true;
  const api = creaApi([eco, basura], { habilitado: () => abierta, maxBytes: 2000 });
  const lista = await api.lista().json() as { funciones: { id: string; entrada: { campo: string }[] }[] };
  assert.deepEqual(lista.funciones.map((f) => f.id), ['eco', 'basura']);
  const post = (cuerpo: string) => new Request('http://localhost/api/banco/eco', { method: 'POST', body: cuerpo });
  assert.equal((await api.ejecuta(post(JSON.stringify({ entrada: { texto: 'hola' } })), 'eco')).status, 200);
  assert.equal((await api.ejecuta(post(JSON.stringify({ entrada: { texto: 42 } })), 'eco')).status, 422);
  assert.equal((await api.ejecuta(post('{no es json'), 'eco')).status, 400);
  assert.equal((await api.ejecuta(post(JSON.stringify({ entrada: { texto: 'x'.repeat(5000) } })), 'eco')).status, 413);
  assert.equal((await api.ejecuta(post('{}'), 'no-existe')).status, 404);
  abierta = false;
  assert.equal(api.lista().status, 404);
  assert.equal((await api.ejecuta(post(JSON.stringify({ entrada: { texto: 'hola' } })), 'eco')).status, 404);
});

test('un ejemplo que no se declara sintético no entra al banco', () => {
  assert.throws(() => defineFuncion({ ...eco, id: 'eco-real', entrada: z.object({}), salida: z.object({}), ejemplos: [{ id: 'x', titulo: 'x', entrada: {}, sintetico: false as unknown as true }], ejecuta: async () => ({}) }));
});

test('peor caso: determinista por semilla, todas las familias, todo rotulado sintético', () => {
  assert.deepEqual(peorCaso('nombres', 7), peorCaso('nombres', 7));
  const catalogo = catalogoDePeorCaso();
  assert.deepEqual(Object.keys(catalogo), [...FAMILIAS]);
  for (const datos of Object.values(catalogo)) {
    assert.ok(datos.length > 0);
    assert.ok(datos.every((d) => d.sintetico === true && d.rompe.length > 0));
  }
});

test('resumeCasos cuenta estados y si todos dieron lo que declaran', () => {
  const caso = { id: 'c', titulo: 't', entrada: 'e', trampa: null, esperado: 'pasa' as const };
  const r = resumeCasos([{ caso, resultado: { estado: 'pasa', evidencia: [], veredicto: 'v' }, coincide: true, ms: 1 },
    { caso, resultado: { estado: 'no-medido', evidencia: [], veredicto: 'v' }, coincide: false, ms: 1 }]);
  assert.deepEqual(r, { total: 2, pasa: 1, falla: 0, noMedido: 1, coinciden: false });
});

test('SIEMBRA de contrato: el núcleo (todo dist salvo cli/) no importa React, Next ni Node', () => {
  const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const archivos = readdirSync(dist).filter((a) => a.endsWith('.js'));
  assert.ok(archivos.length >= 6);
  const prohibido = /from ['"](react|next|node:[a-z/]+|fs|path|child_process)['"]|process\./;
  for (const a of archivos) assert.ok(!prohibido.test(readFileSync(join(dist, a), 'utf8')), `${a} importa algo que el núcleo no debe`);
  assert.ok(prohibido.test("import x from 'node:fs'"), 'la siembra no se caza: el patrón del contrato está roto');
});
