/**
 * La confirmación en la base (spec 015, fase 4: RF-12, RF-13, RF-14, RF-16, RF-17). Parte del gate `prueba:buzon`.
 *
 * La pantalla deshabilita «Confirmar» mientras falta algo; esto prueba que, aunque alguien llame a la API a mano,
 * la base tampoco deja confirmar. Con las migraciones reales en PGlite, actuando como la contadora miembro.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { despacho, HUELLA, nuevaPyme, consiente } from './despacho-pglite.mjs';

const LECTURA = '20261007120000_buzon_lectura.sql';
const FOLIO = 'A1B2C3D4-0000-4000-8000-000000000001';
const campo = (clave, valor, porRevisar = false) => ({
  clave, valor, confianza: porRevisar ? 0.5 : 1, procedencia: porRevisar ? 'ocr' : 'xml', evidencia: porRevisar ? 'motor' : 'exacto', revisionHumana: porRevisar,
});
const LIMPIOS = [campo('uuid', FOLIO), campo('rfc_receptor', 'ABC010203XY9'), campo('total', '1160.00')];

async function conPyme(siembra) {
  const d = await despacho(siembra);
  await d.comoMiembro();
  const pyme = await nuevaPyme(d.db);
  await consiente(d.db, pyme.id);
  let n = 0;
  const documento = async ({ tipo = 'xml', uuid = FOLIO, campos = LIMPIOS, discrepancias = [], estado = 'en_revision' } = {}) => {
    n += 1;
    return (await d.db.query(
      `insert into public.buzon_documentos (pyme_id, nombre_archivo, huella, tipo, uuid, campos, discrepancias, estado)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8) returning id`,
      [pyme.id, `doc-${n}`, HUELLA(200 + n), tipo, uuid, JSON.stringify(campos), JSON.stringify(discrepancias), estado],
    )).rows[0].id;
  };
  const confirma = (id) => d.db.query("update public.buzon_documentos set estado = 'confirmado' where id = $1", [id]);
  const lee = async (id) => (await d.db.query('select * from public.buzon_documentos where id = $1', [id])).rows[0];
  return { ...d, pyme, documento, confirma, lee };
}

test('RF-16: un documento entra sin confirmar; nadie lo mete ya confirmado', async () => {
  const { db, documento } = await conPyme();
  await assert.rejects(documento({ estado: 'confirmado' }), /entra sin confirmar/);
  await db.close();
});

test('RF-17: con un campo por revisar no se confirma; revisado, sí, y la fecha la pone la base', async () => {
  const { db, documento, confirma, lee } = await conPyme();
  const id = await documento({ tipo: 'impresa', campos: [...LIMPIOS, campo('fecha', '2026-1O-01', true)] });
  await assert.rejects(confirma(id), /quedan campos por revisar/);
  const revisados = [...LIMPIOS, { ...campo('fecha', '2026-10-01'), procedencia: 'humano', revisado: true }];
  await db.query('update public.buzon_documentos set campos = $2::jsonb where id = $1', [id, JSON.stringify(revisados)]);
  await confirma(id);
  const doc = await lee(id);
  assert.equal(doc.estado, 'confirmado');
  assert.ok(doc.confirmado_en instanceof Date);
  await db.close();
});

test('RF-14, RF-17: con una discrepancia XML↔impresa sin revisar no se confirma; revisada, sí', async () => {
  const { db, documento, confirma } = await conPyme();
  const discrepancia = { clave: 'total', xml: '1160.00', impresa: '1106.00', revisada: false };
  const id = await documento({ discrepancias: [discrepancia] });
  await assert.rejects(confirma(id), /discrepancias entre el XML y la impresa/);
  await db.query('update public.buzon_documentos set discrepancias = $2::jsonb where id = $1', [id, JSON.stringify([{ ...discrepancia, revisada: true }])]);
  await confirma(id);
  await db.close();
});

test('RF-12: si el receptor no es la pyme del buzón, no se confirma aquí', async () => {
  const { db, documento, confirma } = await conPyme();
  const id = await documento({ campos: [campo('uuid', FOLIO), campo('rfc_receptor', 'XYZ040506AB1')] });
  await assert.rejects(confirma(id), /el receptor no es la pyme/);
  const ajeno = await documento({ uuid: null, estado: 'receptor_ajeno' });
  await assert.rejects(confirma(ajeno), /cambio de estado no permitido/);
  await db.close();
});

test('un CFDI confirmado ya no cambia, y ni la fecha de confirmación ni el folio los escribe nadie', async () => {
  const { db, documento, confirma } = await conPyme();
  const id = await documento();
  await assert.rejects(db.query('update public.buzon_documentos set confirmado_en = now() where id = $1', [id]), /permission denied/);
  await assert.rejects(db.query("update public.buzon_documentos set uuid = 'B1B2C3D4-0000-4000-8000-000000000002' where id = $1", [id]), /permission denied/);
  await confirma(id);
  await assert.rejects(db.query("update public.buzon_documentos set campos = '[]'::jsonb where id = $1", [id]), /ya no cambia/);
  await db.close();
});

test('RF-13: el mismo folio no entra dos veces como XML; su impresa sí entra (se empareja)', async () => {
  const { db, documento } = await conPyme();
  await documento({ tipo: 'xml' });
  await assert.rejects(documento({ tipo: 'xml' }), /buzon_folio_unico/);
  await documento({ tipo: 'impresa', estado: 'emparejada' });
  await db.close();
});

test('siembra: sin la regla de campos por revisar, se confirmaría con uno pendiente (RF-17 la mide de verdad)', async () => {
  const { db, documento, confirma } = await conPyme([
    "raise exception 'quedan campos por revisar: no se confirma (RF-17)';", 'null;', LECTURA,
  ]);
  const id = await documento({ tipo: 'impresa', campos: [...LIMPIOS, campo('fecha', '2026-1O-01', true)] });
  await confirma(id);
  await db.close();
});

test('siembra: sin la regla del receptor, se confirmaría el CFDI de otra pyme (RF-12 la mide de verdad)', async () => {
  const { db, documento, confirma } = await conPyme([
    "raise exception 'el receptor no es la pyme de este buzón: no se confirma aquí (RF-12)';", 'null;', LECTURA,
  ]);
  const id = await documento({ campos: [campo('uuid', FOLIO), campo('rfc_receptor', 'XYZ040506AB1')] });
  await confirma(id);
  await db.close();
});
