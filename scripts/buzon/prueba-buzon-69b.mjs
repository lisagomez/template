/**
 * El listado 69-B del SAT (spec 015, fase 5: RF-18, RF-19). Parte del gate `prueba:buzon`.
 *
 * El listado de prueba es SINTÉTICO: imita el formato real medido el 2026-10-07 (Latin-1, preámbulo con la fecha,
 * cabecera, RFC repetidos con varias situaciones, filas de relleno) sin copiar ningún contribuyente real.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandera, decodifica, fechaDelPreambulo, leeListado69B } from '../../src/features/buzon-cfdi/services/lista-69b.ts';
import { despacho, HUELLA } from './despacho-pglite.mjs';

const LISTADO = [
  '"Información actualizada al 30 de septiembre de 2026; los listados a que se hace mención, son de carácter público.",,,,',
  'Listado completo de contribuyentes (Artículo 69-B del CFF),,,,',
  'No,RFC,Nombre del Contribuyente,Situación del contribuyente,Número y fecha de oficio global de presunción SAT',
  '1,EJE010101AB1,"EMPRESA DE EJEMPLO, S.A. DE C.V.",Presunto,500-05-2026-1 de fecha 1 de enero de 2026',
  '2,PRU020202CD2,PRUEBA SINTETICA SA,Definitivo,500-05-2026-2',
  '3,PRU020202CD2,PRUEBA SINTETICA SA,Sentencia Favorable,500-05-2026-3',
  '4, sin030303ef3 ,SIN ÑANDÚ SC,Desvirtuado,500-05-2026-4',
  '5,EJE010101AB1,"EMPRESA DE EJEMPLO, S.A. DE C.V.",Presunto,500-05-2026-5',
  '6,AAAAAAAAAAAA,RELLENO,Definitivo,',
  '7,OTR040404GH4,OTRA,Situación nueva,',
  ',,,,',
].join('\r\n');
const enLatin1 = Buffer.from(LISTADO, 'latin1');

// --- Lectura ---------------------------------------------------------------------------------------------------

test('decodifica: el Latin-1 del SAT y el UTF-8 dan el mismo texto', () => {
  assert.equal(decodifica(new Uint8Array(enLatin1)), LISTADO);
  assert.equal(decodifica(new Uint8Array(Buffer.from(LISTADO, 'utf8'))), LISTADO);
});

test('la fecha sale del propio listado («actualizada al…»), no la pone quien importa', () => {
  assert.equal(fechaDelPreambulo('Información actualizada al 31 de diciembre de 2025; …'), '2025-12-31');
  assert.equal(fechaDelPreambulo('actualizada al 3 de Marzo de 2026'), '2026-03-03');
  assert.equal(fechaDelPreambulo('sin fecha'), null);
});

test('el listado se lee: RFC normalizados, repetidos colapsados, varias situaciones por RFC, y lo malo descartado y contado', () => {
  const l = leeListado69B(decodifica(new Uint8Array(enLatin1)));
  assert.equal(l.actualizadaAl, '2026-09-30');
  assert.deepEqual(l.filas.map((f) => `${f.rfc}:${f.situacion}`), [
    'EJE010101AB1:Presunto', 'PRU020202CD2:Definitivo', 'PRU020202CD2:Sentencia Favorable', 'SIN030303EF3:Desvirtuado',
  ]);
  assert.deepEqual(l.descartadas.map((d) => d.motivo), ['el RFC no tiene formato de RFC', 'situación desconocida: «Situación nueva»']);
});

test('un archivo que no es el listado 69-B se rechaza con el porqué', () => {
  assert.throws(() => leeListado69B('a,b,c\n1,2,3'), /no es el listado 69-B/);
});

// --- La bandera (RF-18, RF-19) -----------------------------------------------------------------------------------

const LISTA = { fuente: 'SAT, Listado completo del artículo 69-B (sintético)', actualizadaAl: '2026-09-30' };

test('RF-18: «Presunto» o «Definitivo» se resaltan, con la fuente y la fecha del listado', () => {
  const b = bandera('EJE010101AB1', ['Presunto'], LISTA);
  assert.equal(b.alerta, true);
  assert.match(b.texto, /«Presunto»/);
  assert.ok(b.texto.includes(LISTA.fuente) && b.texto.includes('2026-09-30'));
});

test('decisión del laboratorio: quien desmontó la presunción se ve, pero sin alerta y diciéndolo', () => {
  const b = bandera('PRU020202CD2', ['Sentencia Favorable', 'Definitivo'], LISTA);
  assert.equal(b.alerta, false);
  assert.match(b.texto, /«Definitivo» y «Sentencia Favorable»/);
  assert.match(b.texto, /desmontó la presunción/);
  assert.equal(bandera('SIN030303EF3', ['Desvirtuado'], LISTA).alerta, false);
});

test('RF-19: ninguna bandera es un veredicto: ni campo de veredicto ni palabras que lo sean', () => {
  for (const situaciones of [['Presunto'], ['Definitivo'], ['Desvirtuado'], ['Sentencia Favorable'], ['Definitivo', 'Presunto']]) {
    const b = bandera('EJE010101AB1', situaciones, LISTA);
    assert.ok(!('veredicto' in b), 'la bandera no lleva campo de veredicto');
    assert.doesNotMatch(b.texto, /no deducible|apócrif|fraud|factur(er)?[ao]s? falsa|riesgos|ilegal|evit[ae]|no (le )?pagues|bloque/i);
    assert.match(b.texto, /No es un veredicto/);
  }
  assert.equal(bandera('EJE010101AB1', [], LISTA), null);
});

// --- La base: importar es todo o nada --------------------------------------------------------------------------

const importa = (db, huella, filas, descartados = 0) =>
  db.query('select public.buzon_importa_69b($1, $2, $3, $4, $5::jsonb) as id', [LISTA.fuente, '2026-09-30', huella, descartados, JSON.stringify(filas)]);
const FILAS = [{ rfc: 'EJE010101AB1', situacion: 'Presunto' }, { rfc: 'PRU020202CD2', situacion: 'Definitivo' }, { rfc: 'PRU020202CD2', situacion: 'Sentencia Favorable' }];

test('un miembro importa el listado y se consulta por RFC, con todas sus situaciones', async () => {
  const { db, comoMiembro } = await despacho();
  await comoMiembro();
  await importa(db, HUELLA(1), FILAS, 1);
  const [lista] = (await db.query('select registros, descartados, actualizada_al from public.buzon_listas_69b')).rows;
  assert.equal(lista.registros, 3);
  assert.equal(lista.descartados, 1);
  const { rows } = await db.query("select situacion from public.buzon_lista_69b_rfc where rfc = 'PRU020202CD2' order by situacion");
  assert.deepEqual(rows.map((r) => r.situacion), ['Definitivo', 'Sentencia Favorable']);
  await db.close();
});

test('todo o nada: una fila que no cabe y no queda ninguna lista a medias', async () => {
  const { db, comoMiembro } = await despacho();
  await comoMiembro();
  await assert.rejects(importa(db, HUELLA(2), [...FILAS, { rfc: 'OTR040404GH4', situacion: 'Inventada' }]), /check constraint/);
  assert.equal((await db.query('select count(*)::int as n from public.buzon_listas_69b')).rows[0].n, 0);
  await db.close();
});

test('el mismo archivo no se importa dos veces; quien no es miembro no importa nada', async () => {
  const { db, comoMiembro, comoAjena } = await despacho();
  await comoMiembro();
  await importa(db, HUELLA(3), FILAS);
  await assert.rejects(importa(db, HUELLA(3), FILAS), /duplicate key|unique/);
  await comoAjena();
  await assert.rejects(importa(db, HUELLA(4), FILAS), /row-level security/);
  assert.equal((await db.query('select count(*)::int as n from public.buzon_listas_69b')).rows[0].n, 0, 'la ajena no ve las listas');
  await db.close();
});
