/** Ajustes: defectos, validacion, precedencia, migracion, archivo (roto, atomico), catalogo. Sin microfono ni Windows. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { catalogo, CLAVES, DEFECTOS, ESQUEMA, GRUPOS, ID_MEDIDO, migra, pon, quita, resuelve, serializa, valida, valoresDe, VERSION_AJUSTES } from '../dist/ajustes.js';
import { escribeArchivoAjustes, leeArchivoAjustes, rutaAjustes, vigilaArchivoAjustes } from '../dist/node/ajustes-archivo.js';
import { tono } from '../dist/node/sonidos.js';

const temporal = () => mkdtempSync(join(tmpdir(), 'ajustes-'));

test('defectos: un solo sitio, cada clave del esquema tiene defecto y cada defecto pasa su propia validacion', () => {
  assert.equal(ESQUEMA.length, CLAVES.length);
  assert.deepEqual(new Set(ESQUEMA.map((c) => c.clave)), new Set(Object.keys(DEFECTOS)));
  for (const c of ESQUEMA) {
    const v = valida(c.clave, DEFECTOS[c.clave], { motoresInstalados: ['parakeet'] });
    assert.ok(v.ok, `${c.clave}: ${v.ok ? '' : v.error}`);
    assert.ok(GRUPOS.some((g) => g.id === c.grupo), `${c.clave} tiene grupo`);
  }
  assert.equal(DEFECTOS.motor, 'parakeet', 'el defecto de motor es el medido');
  assert.equal(DEFECTOS.retencionDias, 365, 'la retencion firmada en la AISIA');
});

test('valida: tipos, rangos, elecciones, motor contra los instalados, y lo sin proveedor no se enciende', () => {
  assert.deepEqual(valida('silencioMs', '800'), { ok: true, valor: 800 });
  assert.equal(valida('silencioMs', 'abc').ok, false);
  assert.equal(valida('silencioMs', 100).ok, false, 'fuera de rango');
  assert.equal(valida('silencioMs', 800.5).ok, false, 'entero');
  assert.deepEqual(valida('gananciaDb', 'auto'), { ok: true, valor: 'auto' });
  assert.deepEqual(valida('gananciaDb', '12'), { ok: true, valor: 12 });
  assert.equal(valida('gananciaDb', 40).ok, false);
  assert.deepEqual(valida('comandos', 'no'), { ok: true, valor: false });
  assert.deepEqual(valida('comandos', true), { ok: true, valor: true });
  assert.equal(valida('comandos', 'quizas').ok, false);
  assert.deepEqual(valida('pegar', 'teclear'), { ok: true, valor: 'teclear' });
  assert.equal(valida('pegar', 'fax').ok, false);
  assert.equal(valida('tecla', '0xA2').ok, true);
  assert.equal(valida('tecla', 'ctrl').ok, false);
  assert.equal(valida('idioma', 'pt-BR').ok, true);
  assert.equal(valida('idioma', 'español').ok, false);
  const r = valida('motor', 'whisper-turbo', { motoresInstalados: ['parakeet', 'faster-whisper:small'] });
  assert.equal(r.ok, false);
  assert.match(r.ok ? '' : r.error, /Instalados: parakeet, faster-whisper:small/);
  assert.equal(valida('motor', 'parakeet', { motoresInstalados: ['parakeet'] }).ok, true);
  assert.equal(valida('motor', 'lo-que-sea').ok, true, 'sin lista no se comprueba');
  assert.deepEqual(valida('respaldo', ''), { ok: true, valor: 'ninguno' });
  assert.equal(valida('respaldo', 'nada', { motoresInstalados: ['parakeet'] }).ok, false);
  const sp = valida('limpiezaLlm', true);
  assert.equal(sp.ok, false);
  assert.match(sp.ok ? '' : sp.error, /no se puede encender/);
  assert.deepEqual(valida('limpiezaLlm', false), { ok: true, valor: false });
  assert.match((valida('noExiste', 1) as { error: string }).error, /no existe el ajuste/);
});

test('precedencia: argumento > entorno > ajustes > defecto, los cuatro casos, y el origen de cada valor', () => {
  const archivo = { retencionDias: 30, pegar: 'teclear' as const };
  const todo = resuelve({ argumentos: { 'silencio-ms': '700' }, entorno: { DICTADO_RETENCION_DIAS: '90' }, archivo });
  assert.deepEqual(todo.ajustes.silencioMs, { valor: 700, origen: 'argumento' });
  assert.deepEqual(todo.ajustes.retencionDias, { valor: 90, origen: 'entorno' });
  assert.deepEqual(todo.ajustes.pegar, { valor: 'teclear', origen: 'ajustes' });
  assert.deepEqual(todo.ajustes.motor, { valor: 'parakeet', origen: 'defecto' });
  assert.deepEqual(todo.avisos, []);
  // entorno por encima de ajustes; ajustes por encima de defecto
  const sinArg = resuelve({ entorno: { DICTADO_RETENCION_DIAS: '90' }, archivo });
  assert.deepEqual(sinArg.ajustes.retencionDias, { valor: 90, origen: 'entorno' });
  const soloArchivo = resuelve({ archivo });
  assert.deepEqual(soloArchivo.ajustes.retencionDias, { valor: 30, origen: 'ajustes' });
  assert.equal(valoresDe(soloArchivo.ajustes).retencionDias, 30);
  // una capa invalida se descarta con aviso y se sigue con la siguiente: nunca se cae
  const roto = resuelve({ argumentos: { 'silencio-ms': 'abc' }, archivo: { silencioMs: 900 } });
  assert.deepEqual(roto.ajustes.silencioMs, { valor: 900, origen: 'ajustes' });
  assert.equal(roto.avisos.length, 1);
  assert.match(roto.avisos[0], /--silencio-ms/);
  // `--tecla` a secas es presencia, no valor: sin aviso
  const presencia = resuelve({ argumentos: { tecla: true, icono: true } });
  assert.deepEqual(presencia.ajustes.tecla, { valor: '0xA3', origen: 'defecto' });
  assert.deepEqual(presencia.avisos, []);
  // y una bandera booleana a secas si es valor
  assert.deepEqual(resuelve({ argumentos: { 'tecla-alternar': true } }).ajustes.teclaAlternar, { valor: true, origen: 'argumento' });
});

test('migra: version 0 con nombres de bandera se renombra; claves desconocidas se conservan; una version futura avisa', () => {
  const v0 = migra({ 'silencio-ms': 800, 'ganancia-db': 'auto', pegar: 'teclear' });
  assert.equal(v0.version, 0);
  assert.deepEqual(v0.valores, { silencioMs: 800, gananciaDb: 'auto', pegar: 'teclear' });
  assert.equal(v0.avisos.length, 2);
  const futuro = migra({ version: VERSION_AJUSTES + 1, pegar: 'teclear', colorDeLaPildora: 'rojo' });
  assert.deepEqual(futuro.valores, { pegar: 'teclear' });
  assert.deepEqual(futuro.desconocidas, { colorDeLaPildora: 'rojo' });
  assert.match(futuro.avisos[0], /version 2/);
  assert.deepEqual(migra([1, 2]).valores, {});
  assert.match(migra('hola').avisos[0], /no es un objeto/);
  // serializa: solo lo que difiere del defecto, con version, y lo desconocido conservado
  const texto = serializa({ pegar: 'teclear', motor: 'parakeet' }, { colorDeLaPildora: 'rojo' });
  assert.deepEqual(JSON.parse(texto), { version: VERSION_AJUSTES, pegar: 'teclear', colorDeLaPildora: 'rojo' });
});

test('pon y quita: un solo camino para el CLI y la pagina', () => {
  const p = pon({}, 'pegar', 'teclear');
  assert.ok(p.ok);
  assert.deepEqual(p.ok ? p.valores : {}, { pegar: 'teclear' });
  const q = quita({ pegar: 'teclear', silencioMs: 800 }, 'pegar');
  assert.deepEqual(q.ok ? q.valores : {}, { silencioMs: 800 });
  assert.equal(quita({}, 'nada').ok, false);
  assert.equal(pon({}, 'motor', 'whisper-turbo', { motoresInstalados: ['parakeet'] }).ok, false);
});

test('archivo: no existe → vacio sin aviso; roto → defectos + aviso y NO se pisa; escritura atomica sin temporales', () => {
  const datos = temporal();
  const vacio = leeArchivoAjustes(datos);
  assert.equal(vacio.existe, false);
  assert.deepEqual(vacio.valores, {});
  assert.deepEqual(vacio.avisos, []);
  writeFileSync(rutaAjustes(datos), '{ esto no es json', 'utf8');
  const roto = leeArchivoAjustes(datos);
  assert.equal(roto.existe, true);
  assert.deepEqual(roto.valores, {});
  assert.match(roto.avisos[0], /no es JSON valido/);
  assert.equal(readFileSync(rutaAjustes(datos), 'utf8'), '{ esto no es json', 'el archivo roto sigue tal cual');
  const r = resuelve({ archivo: roto.valores });
  assert.equal(r.ajustes.pegar.origen, 'defecto');
  // escribir encima: entero, sin dejar .tmp
  escribeArchivoAjustes(datos, { pegar: 'teclear' }, { colorDeLaPildora: 'rojo' });
  assert.deepEqual(JSON.parse(readFileSync(rutaAjustes(datos), 'utf8')), { version: VERSION_AJUSTES, pegar: 'teclear', colorDeLaPildora: 'rojo' });
  assert.deepEqual(readdirSync(datos).filter((n) => n.endsWith('.tmp')), []);
  const leido = leeArchivoAjustes(datos);
  assert.deepEqual(leido.valores, { pegar: 'teclear' });
  assert.deepEqual(leido.desconocidas, { colorDeLaPildora: 'rojo' });
  rmSync(datos, { recursive: true, force: true });
});

test('archivo: dos escrituras seguidas dejan la ultima entera; carpeta de solo lectura → error claro, no caida', () => {
  const datos = temporal();
  for (let i = 0; i < 20; i++) escribeArchivoAjustes(datos, { silencioMs: 300 + i });
  assert.deepEqual(JSON.parse(readFileSync(rutaAjustes(datos), 'utf8')), { version: VERSION_AJUSTES, silencioMs: 319 });
  assert.deepEqual(readdirSync(datos).filter((n) => n.endsWith('.tmp')), []);
  if (process.getuid?.() !== 0) {
    chmodSync(datos, 0o500);
    assert.throws(() => escribeArchivoAjustes(datos, { pegar: 'teclear' }), /no se pudo escribir/);
    chmodSync(datos, 0o700);
    assert.equal(JSON.parse(readFileSync(rutaAjustes(datos), 'utf8')).silencioMs, 319, 'lo anterior sigue entero');
  }
  rmSync(datos, { recursive: true, force: true });
});

test('vigila: avisa solo cuando el archivo cambia de verdad', async () => {
  const datos = temporal();
  escribeArchivoAjustes(datos, {});
  const cambios: string[] = [];
  const deja = vigilaArchivoAjustes(datos, (a) => cambios.push(JSON.stringify(a.valores)), 50);
  await new Promise((r) => setTimeout(r, 120));
  assert.deepEqual(cambios, [], 'sin cambio, sin aviso');
  await new Promise((r) => setTimeout(r, 20));
  escribeArchivoAjustes(datos, { pegar: 'ninguno' });
  await new Promise((r) => setTimeout(r, 200));
  deja();
  assert.deepEqual(cambios, ['{"pegar":"ninguno"}']);
  rmSync(datos, { recursive: true, force: true });
});

test('catalogo: cruza los instalados con una medicion fija; sin cifra dice «sin medir»; el defecto va primero', () => {
  const medicion = {
    fecha: '2026-09-15',
    motores: [
      { motor: ID_MEDIDO['parakeet']!, wer: 0.033, latenciaP50Ms: 532, latenciaP95Ms: 926, cargaMs: 76 },
      { motor: ID_MEDIDO['faster-whisper:small']!, wer: 0.058, latenciaP50Ms: 1626, latenciaP95Ms: 1923 },
      { motor: ID_MEDIDO['whisper-turbo']!, wer: 0.114, latenciaP50Ms: 4470, latenciaP95Ms: 7707 },
    ],
  };
  const c = catalogo(['whisper-turbo', 'faster-whisper:small', 'parakeet', 'remoto'], medicion);
  assert.deepEqual(c.map((e) => e.nombre), ['parakeet', 'faster-whisper:small', 'whisper-turbo', 'remoto']);
  assert.equal(c[0]!.medido, true);
  assert.equal(c[0]!.cargaMs, 76);
  assert.match(c[0]!.nota ?? '', /defecto/);
  assert.match(c[2]!.nota ?? '', /lento/);
  assert.deepEqual(c[3], { nombre: 'remoto', instalado: true, medido: false, nota: 'sin medir en esta maquina (npm run mide)' });
  assert.equal(catalogo(['parakeet'], undefined)[0]!.medido, false, 'sin medicion nada se inventa');
});

test('tono: sin clics (empieza y termina en cero) y con el largo pedido', () => {
  const t = tono([880], 50, 16_000);
  assert.equal(t.length, 800);
  assert.equal(t[0], 0);
  assert.ok(Math.abs(t[t.length - 1]!) < 0.01);
  assert.ok(Math.max(...t) > 0.2);
});
