/** El adaptador de solo lectura al ERP: con un fixture de `erp.cfd_timbre` da los MISMOS hechos que los archivos. Nunca contra producción. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canoniza, esSoloLectura, gammaDesdeFuentes, leeErpSoloLectura, SENTENCIAS_ERP, type Canonizable } from '../dist/index.js';
import { pymeSintetica } from '../dist/sinteticos/index.js';
import { XML, distribuidora } from './_ayuda.ts';

test('solo lectura: SELECT o fijar la sesión en read_only; nada más, ni encadenado', () => {
  assert.ok(esSoloLectura(SENTENCIAS_ERP.soloLectura));
  assert.ok(esSoloLectura(SENTENCIAS_ERP.timbres));
  for (const s of ['delete from erp.fac_factura', 'update erp.cfd_timbre set xml = null', 'select 1; drop table erp.fac_factura', 'set default_transaction_read_only = off', 'insert into erp.sis_bitacora values (1)']) {
    assert.equal(esSoloLectura(s), false, s);
  }
});

test('del ERP (fixture de cfd_timbre) a Γ: mismas transacciones, notas y pagos que desde los XML', async () => {
  const p = pymeSintetica('distribuidora');
  const cancelados = new Set(p.fuentes.cancelados!.split('\n').slice(1));
  const filas = p.fuentes.documentos.filter((d) => /^(ingreso|egreso|pago)-/.test(d.nombre)).map((d) => {
    const uuid = /UUID="([^"]+)"\/><\/cfdi:Complemento>/.exec(d.texto)?.[1] ?? /TimbreFiscalDigital[^>]*UUID="([^"]+)"/.exec(d.texto)![1]!;
    return { uuid, estado: cancelados.has(uuid) ? 'cancelado' : 'timbrado', xml: d.texto };
  });
  const sentencias: string[] = [];
  const consulta = async (sql: string, parametros: readonly unknown[]) => {
    sentencias.push(sql);
    assert.ok(esSoloLectura(sql));
    return sql === SENTENCIAS_ERP.timbres ? (assert.deepEqual(parametros, ['tenant-sintetico']), filas) : [];
  };
  const fuentes = await leeErpSoloLectura(consulta, 'tenant-sintetico', p.fuentes.catalogo);
  assert.deepEqual(sentencias, [SENTENCIAS_ERP.soloLectura, SENTENCIAS_ERP.timbres], 'primero se fija la sesión en solo lectura');
  const c = gammaDesdeFuentes(XML, p.especificacion, fuentes, { rfcPropio: p.rfcPropio, llaveDeSeudonimo: p.llaveDeSeudonimo });
  assert.ok(c.ok);
  const de = (x: unknown) => canoniza(x as Canonizable);
  const archivos = distribuidora().gamma.contenido;
  assert.equal(de(c.gamma.contenido.transacciones), de(archivos.transacciones));
  assert.equal(de(c.gamma.contenido.notas), de(archivos.notas));
  assert.equal(de(c.gamma.contenido.pagos), de(archivos.pagos));
});

test('una fila del ERP que no encaja en el contrato no entra', async () => {
  const consulta = async (sql: string) => (sql === SENTENCIAS_ERP.timbres ? [{ uuid: 'x', estado: 'borrador', xml: '<x/>' }] : []);
  await assert.rejects(leeErpSoloLectura(consulta, 't'));
});
