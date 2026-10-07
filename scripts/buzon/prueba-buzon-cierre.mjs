/**
 * Parar y cerrar el piloto (spec 015, fase 7: RF-25 a RF-29). Parte del gate `prueba:buzon`.
 *
 * La base: el piloto solo avanza (activo → parado → cerrado); parado, no entra ningún documento; cerrado, no queda
 * nada de lo que el piloto generó y sí la constancia. Y lo puro: la lista para volver a captura manual, y que con el
 * piloto parado la ingesta ni llama al extractor.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paraCapturaManual, pendientesACsv } from '../../src/features/buzon-cfdi/services/cierre.ts';
import { ingresa } from '../../src/features/buzon-cfdi/services/servidor/buzon.ts';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { despacho, HUELLA, nuevaPyme, consiente, entra, cuenta } from './despacho-pglite.mjs';

const CIERRE = '20261007180000_buzon_cierre.sql';
const estado = async (db) => (await db.query('select estado from public.buzon_piloto')).rows[0].estado;
const avanza = (db, a) => db.query('update public.buzon_piloto set estado = $1', [a]);
const horas = (db, pyme, mes = '2026-09-01') => db.query("insert into public.buzon_horas (pyme_id, mes, fase, horas, cfdi_recibidos) values ($1, $2, 'previo', 10, 30)", [pyme, mes]);

async function conDatos(siembra) {
  const d = await despacho(siembra);
  await d.comoMiembro();
  const pyme = await nuevaPyme(d.db);
  await consiente(d.db, pyme.id);
  await entra(d.db, pyme.id, 1);
  await entra(d.db, pyme.id, 2);
  await horas(d.db, pyme.id);
  await d.db.query("select public.buzon_importa_69b('sintético', '2026-09-30', $1, 0, '[{\"rfc\":\"EJE010101AB1\",\"situacion\":\"Presunto\"}]'::jsonb)", [HUELLA(77)]);
  return { ...d, pyme };
}

test('el piloto empieza activo y solo avanza: no se cierra sin parar, ni se reanuda', async () => {
  const { db, comoMiembro } = await despacho();
  await comoMiembro();
  assert.equal(await estado(db), 'activo');
  await assert.rejects(avanza(db, 'cerrado'), /solo avanza/);
  await avanza(db, 'parado');
  assert.ok((await db.query('select parado_en from public.buzon_piloto')).rows[0].parado_en instanceof Date);
  await assert.rejects(avanza(db, 'activo'), /solo avanza/);
  await db.close();
});

test('RF-25: parado, no entra ningún documento; las horas sí se pueden completar', async () => {
  const { db, pyme } = await conDatos();
  await avanza(db, 'parado');
  await assert.rejects(entra(db, pyme.id, 3), /row-level security/);
  await horas(db, pyme.id, '2026-10-01');
  await db.close();
});

test('RF-27, RF-29: al cerrar no queda nada de lo generado, y sí la constancia, las cuentas y los retiros', async () => {
  const { db, pyme, comoMiembro } = await conDatos();
  const otra = await nuevaPyme(db, 'XYZ040506AB1');
  await consiente(db, otra.id, HUELLA(2));
  await db.query('update public.buzon_consentimientos set revocado_en = now() where pyme_id = $1', [otra.id]);
  await avanza(db, 'parado');
  await avanza(db, 'cerrado');
  for (const t of ['buzon_pymes', 'buzon_consentimientos', 'buzon_documentos', 'buzon_horas', 'buzon_listas_69b', 'buzon_lista_69b_rfc']) {
    assert.equal(await cuenta(db, t), 0, `${t} sigue con filas`);
  }
  const constancias = (await db.query('select motivo, documentos_borrados, registros_de_horas_borrados, pymes_borradas, listados_borrados from public.buzon_constancias order by borrado_en')).rows;
  assert.deepEqual(constancias.map((c) => c.motivo), ['retiro_de_consentimiento', 'cierre_del_piloto']);
  const cierre = constancias[1];
  assert.deepEqual([cierre.documentos_borrados, cierre.registros_de_horas_borrados, cierre.pymes_borradas, cierre.listados_borrados], [2, 1, 2, 1]);
  await db.exec('reset role');
  assert.equal(await cuenta(db, 'buzon_miembros'), 1, 'la cuenta del despacho se conserva');
  await comoMiembro();
  assert.equal(await estado(db), 'cerrado');
  void pyme;
  await db.close();
});

test('quien no es miembro no para ni cierra el piloto', async () => {
  const { db, comoAjena } = await despacho();
  await comoAjena();
  await avanza(db, 'parado');
  await db.exec('reset role');
  assert.equal(await estado(db), 'activo', 'el RLS no deja ver ni tocar la fila a la ajena');
  await db.close();
});

test('siembra: si el cierre no borrara los listados, quedarían vivos (RF-27 lo mide de verdad)', async () => {
  const { db } = await conDatos(['  delete from public.buzon_listas_69b where true;\n', '  perform 1; -- sembrado: no borra los listados\n', CIERRE]);
  await avanza(db, 'parado');
  await avanza(db, 'cerrado');
  assert.equal(await cuenta(db, 'buzon_listas_69b'), 1);
  await db.close();
});

// --- Lo puro ---------------------------------------------------------------------------------------------------

const campo = (clave, valor) => ({ clave, valor, confianza: 1, procedencia: 'xml', evidencia: 'exacto', revisionHumana: false });
const doc = (archivo, estadoDoc, pyme_nombre, extra = {}) => ({
  id: archivo, pyme_id: 'p', nombre_archivo: archivo, tipo: 'xml', ruta: 'xml', uuid: 'F-1', rfc_receptor: null,
  campos: [campo('rfc_emisor', 'EMI990101AB1'), campo('total', '1160.00'), campo('fecha', '2026-10-01')], discrepancias: [],
  estado: estadoDoc, recibido_en: '', confirmado_en: null, pyme_nombre, ...extra,
});

test('RF-26: vuelve a captura manual todo lo no confirmado; el receptor ajeno va marcado, la impresa emparejada no', () => {
  const lista = paraCapturaManual([
    doc('b.xml', 'en_revision', 'Pyme B'), doc('a.xml', 'confirmado', 'Pyme A'),
    doc('c.pdf', 'emparejada', 'Pyme A'), doc('d.xml', 'receptor_ajeno', 'Pyme A'),
  ]);
  assert.deepEqual(lista.map((p) => `${p.pyme}:${p.archivo}:${p.motivo}`), [
    'Pyme A:d.xml:receptor ajeno: decidir a qué pyme va', 'Pyme B:b.xml:sin confirmar',
  ]);
});

test('la lista para captura manual no ejecuta fórmulas al abrirla', () => {
  const csv = pendientesACsv(paraCapturaManual([doc('=MAL()', 'en_revision', 'Pyme')]));
  assert.match(csv, /"'=MAL\(\)"/);
});

test('RF-25: con el piloto parado, la ingesta ni comprueba el consentimiento ni llama al extractor', async () => {
  const llamadas = [];
  const cliente = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'p', rfc: 'ABC010203XY9' } }) }) }) }),
    rpc: async (f) => { llamadas.push(f); return { data: f === 'buzon_piloto_activo' ? false : true }; },
  };
  let leyo = false;
  const r = await ingresa(cliente, 'p', { bytes: new Uint8Array([1]), nombre: 'x.xml', tipoMime: 'application/xml' }, async () => { leyo = true; });
  assert.equal(r.ok, false);
  assert.equal(r.estado, 409);
  assert.match(r.aviso, /piloto está parado/);
  assert.deepEqual(llamadas, ['buzon_piloto_activo']);
  assert.equal(leyo, false);
});

// --- Lo que PGlite no ve: pg_safeupdate del Supabase real -------------------------------------------------------

const DIR = join(resolve(dirname(fileURLToPath(import.meta.url)), '../..'), 'supabase/migrations');
/** Las sentencias DELETE/UPDATE de un SQL que no llevan WHERE. Quita comentarios y corta por punto y coma. */
export function sinWhere(sql) {
  return sql.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim())
    .filter((s) => /^(delete\s+from|update)\s/i.test(s.replace(/^.*\b(begin|then|loop|else)\b\s*/is, '')))
    .map((s) => s.replace(/^.*\b(begin|then|loop|else)\b\s*/is, ''))
    .filter((s) => !/\bwhere\b/i.test(s));
}

test('ninguna migración del buzón hace DELETE o UPDATE sin WHERE: el Supabase real (pg_safeupdate) lo rechaza', () => {
  for (const archivo of readdirSync(DIR).filter((f) => f.includes('buzon') && f.endsWith('.sql'))) {
    assert.deepEqual(sinWhere(readFileSync(join(DIR, archivo), 'utf8')), [], `${archivo} lleva un DELETE o UPDATE sin WHERE`);
  }
});

test('siembra: el detector caza un DELETE sin WHERE dentro del cuerpo de una función', () => {
  const malo = "create function f() returns trigger language plpgsql as $$ begin delete from public.buzon_pymes; return new; end; $$;";
  assert.equal(sinWhere(malo).length, 1);
  assert.equal(sinWhere(malo.replace('buzon_pymes;', 'buzon_pymes where true;')).length, 0);
});

