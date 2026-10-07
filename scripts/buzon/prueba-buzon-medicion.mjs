/**
 * La medición del piloto (spec 015, fase 6: RF-5, RF-8, RF-20 a RF-22). Parte del gate `prueba:buzon`.
 *
 * Dos frentes: la base (las horas exigen consentimiento, no llevan persona y se borran al revocar) y el cálculo de
 * las cifras con su guardián: lo que sale del despacho es el seudónimo y números, y si se cuela un RFC, un folio o
 * un correo, el archivo no sale.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cifras, cifrasACsv, sinFugas } from '../../src/features/buzon-cfdi/services/medicion.ts';
import { despacho, nuevaPyme, consiente, entra } from './despacho-pglite.mjs';

const MEDICION = '20261007160000_buzon_medicion.sql';
const horas = (db, pyme, { mes = '2026-09-01', fase = 'previo', h = 12.5, cfdi = 40 } = {}) =>
  db.query('insert into public.buzon_horas (pyme_id, mes, fase, horas, cfdi_recibidos) values ($1, $2, $3, $4, $5)', [pyme, mes, fase, h, cfdi]);

// --- La base -----------------------------------------------------------------------------------------------------

test('RF-20: con consentimiento se registran las horas del mes previo y del mes del piloto', async () => {
  const { db, comoMiembro } = await despacho();
  await comoMiembro();
  const pyme = await nuevaPyme(db);
  await consiente(db, pyme.id);
  await horas(db, pyme.id, { fase: 'previo' });
  await horas(db, pyme.id, { mes: '2026-10-01', fase: 'piloto', h: 4, cfdi: null });
  assert.equal((await db.query('select count(*)::int as n from public.buzon_horas')).rows[0].n, 2);
  await db.close();
});

test('RF-5: sin consentimiento no se registran horas de esa pyme', async () => {
  const { db, comoMiembro } = await despacho();
  await comoMiembro();
  const pyme = await nuevaPyme(db);
  await assert.rejects(horas(db, pyme.id), /row-level security/);
  await db.close();
});

test('el mes previo exige cuántos CFDI se capturaron; cada mes y fase se registra una vez', async () => {
  const { db, comoMiembro } = await despacho();
  await comoMiembro();
  const pyme = await nuevaPyme(db);
  await consiente(db, pyme.id);
  await assert.rejects(horas(db, pyme.id, { cfdi: null }), /buzon_horas_previo_con_cfdi/);
  await horas(db, pyme.id);
  await assert.rejects(horas(db, pyme.id), /duplicate key|unique/);
  await assert.rejects(db.query("update public.buzon_horas set mes = '2026-08-01'"), /permission denied/);
  await db.close();
});

test('RF-4, RF-5: al revocar se borran también las horas, y la constancia las cuenta', async () => {
  const { db, comoMiembro } = await despacho();
  await comoMiembro();
  const pyme = await nuevaPyme(db);
  await consiente(db, pyme.id);
  await entra(db, pyme.id, 1);
  await horas(db, pyme.id);
  await horas(db, pyme.id, { mes: '2026-10-01', fase: 'piloto', cfdi: null });
  await db.query('update public.buzon_consentimientos set revocado_en = now()');
  assert.equal((await db.query('select count(*)::int as n from public.buzon_horas')).rows[0].n, 0);
  const [c] = (await db.query('select documentos_borrados, registros_de_horas_borrados from public.buzon_constancias')).rows;
  assert.deepEqual([c.documentos_borrados, c.registros_de_horas_borrados], [1, 2]);
  await db.close();
});

test('siembra: sin exigir consentimiento, se registrarían horas de una pyme que no consiente (RF-5 la mide de verdad)', async () => {
  const { db, comoMiembro } = await despacho([
    'with check (public.buzon_soy_miembro() and public.buzon_consiente(pyme_id));\ndrop policy if exists "miembro: corrige"',
    'with check (public.buzon_soy_miembro());\ndrop policy if exists "miembro: corrige"', MEDICION,
  ]);
  await comoMiembro();
  const pyme = await nuevaPyme(db);
  await horas(db, pyme.id);
  await db.close();
});

// --- Las cifras (RF-8, RF-22) --------------------------------------------------------------------------------------

const PYMES = [{ id: 'p1', seudonimo: 'pyme-aaaa111111', consiente: true }, { id: 'p2', seudonimo: 'pyme-bbbb222222', consiente: false }];
const HORAS = [
  { pyme_id: 'p1', mes: '2026-09-01', fase: 'previo', horas: 12.5, cfdi_recibidos: 40 },
  { pyme_id: 'p1', mes: '2026-10-01', fase: 'piloto', horas: 4, cfdi_recibidos: null },
  { pyme_id: 'p2', mes: '2026-09-01', fase: 'previo', horas: 9, cfdi_recibidos: 30 },
];
const doc = (id, uuid, recibido, confirmado, extra = {}) => ({ id, pyme_id: 'p1', tipo: 'xml', estado: confirmado ? 'confirmado' : 'en_revision', uuid, recibido_en: recibido, confirmado_en: confirmado, ...extra });
const DOCS = [
  doc('d1', 'U1', '2026-10-03T10:00:00Z', '2026-10-05T10:00:00Z'),
  doc('d2', 'U2', '2026-10-10T10:00:00Z', null),
  doc('d3', 'U3', '2026-10-30T10:00:00Z', '2026-11-02T10:00:00Z'),
  doc('d4', 'U1', '2026-10-04T10:00:00Z', null, { tipo: 'impresa', estado: 'emparejada' }),
  doc('d5', 'U9', '2026-10-06T10:00:00Z', null, { estado: 'receptor_ajeno' }),
  doc('d6', 'U4', '2026-09-28T10:00:00Z', null),
];

test('RF-22: en el mes del piloto el buzón cuenta los CFDI y la proporción sin confirmar al cerrar el mes', () => {
  const { filas } = cifras(PYMES, HORAS, DOCS);
  const piloto = filas.find((f) => f.fase === 'piloto');
  assert.equal(piloto.cfdi_recibidos, 3, 'U1, U2 y U3; ni la impresa emparejada, ni el receptor ajeno, ni el de septiembre');
  assert.equal(piloto.proporcion_pendientes, 0.6667, 'U2 sin confirmar y U3 confirmado después del cierre');
});

test('en el mes previo los CFDI los declara el despacho, y no hay proporción (no pasaron por el buzón)', () => {
  const previo = cifras(PYMES, HORAS, DOCS).filas.find((f) => f.fase === 'previo');
  assert.deepEqual([previo.horas, previo.cfdi_recibidos, previo.proporcion_pendientes], [12.5, 40, null]);
});

test('RF-5: una pyme sin consentimiento vigente no aparece en las cifras; las completas se cuentan', () => {
  const { filas, pymesCompletas } = cifras(PYMES, HORAS, DOCS);
  assert.ok(filas.every((f) => f.pyme === 'pyme-aaaa111111'));
  assert.equal(pymesCompletas, 1);
});

test('RF-8: el CSV lleva seudónimo y números, y nada con forma de dato de una pyme', () => {
  const csv = cifrasACsv(cifras(PYMES, HORAS, DOCS).filas);
  assert.match(csv, /^pyme,mes,fase,horas,cfdi_recibidos,proporcion_pendientes\r\n/);
  assert.deepEqual(sinFugas(csv), []);
  assert.doesNotMatch(csv, /U1|U2|p1/);
});

test('siembra: si se cuela un RFC, un folio o un correo, las cifras NO salen', () => {
  const [fila] = cifras(PYMES, HORAS, DOCS).filas;
  for (const fuga of ['XAXX010101000', '11111111-2222-3333-4444-555555555555', 'contadora@despacho-ejemplo.mx']) {
    assert.throws(() => cifrasACsv([{ ...fila, pyme: fuga }]), /las cifras no salen/);
  }
});
