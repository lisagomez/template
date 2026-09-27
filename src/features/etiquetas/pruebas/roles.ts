/**
 * Roles del dispositivo: el codigo decide el rol, el de conteo solo puede contar, y su vista del
 * conteo no lleva ninguna cantidad del sistema (ni lo esperado, ni la conciliacion, ni lo que
 * mide una tarima leida por su SSCC).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  abreConteo, aAammdd, altaConExpediente, CATEGORIAS_EJEMPLO, cierraRonda, completaClave, esErrorLectura, estadoVacio, integridadLocal, interpreta, leeEnConteo, parseaLectura,
  type EstadoAlmacen, type Evento,
} from '../services/nucleo.ts';
import { esquemaAccion } from '../services/esquemas.ts';
import { ACCIONES_CONTEO, permitida, rolDeToken, vistaConteo } from '../services/servidor/roles.ts';

const OPERACION = 'codigo-de-operacion-0123456789';
const CONTEO = 'codigo-de-conteo-abcdefghijklmn';

test('el rol lo decide el codigo del dispositivo, no el navegador', () => {
  assert.equal(rolDeToken(OPERACION, { operacion: OPERACION, conteo: CONTEO }), 'operacion');
  assert.equal(rolDeToken(CONTEO, { operacion: OPERACION, conteo: CONTEO }), 'conteo');
  assert.equal(rolDeToken('otro-codigo-cualquiera-xx', { operacion: OPERACION, conteo: CONTEO }), undefined);
  assert.equal(rolDeToken(CONTEO, { operacion: OPERACION }), undefined, 'sin código de conteo configurado no hay rol de conteo');
  assert.equal(rolDeToken('corto', { operacion: OPERACION, conteo: 'corto' }), undefined, 'un código de conteo de menos de 16 no vale');
  assert.equal(rolDeToken(OPERACION, { operacion: OPERACION, conteo: OPERACION }), 'operacion', 'el mismo código para los dos es operación, no conteo');
});

test('un dispositivo de conteo solo puede contar: todo lo demas se le niega', () => {
  const acciones = esquemaAccion.options.map((o) => (o.shape as { accion: { value: string } }).accion.value);
  assert.ok(acciones.length > 20);
  const suyas = acciones.filter((a) => permitida('conteo', a));
  assert.deepEqual(suyas.sort(), [...ACCIONES_CONTEO].sort());
  for (const a of ['lotes', 'expediente', 'riesgo', 'integridad', 'conteo-abre', 'conteo-aplica', 'conteo-cancela', 'recepcion', 'movimiento', 'salida', 'correccion', 'config']) {
    assert.equal(permitida('conteo', a), false, a);
    assert.equal(permitida('operacion', a), true, a);
  }
});

const HOY = '2026-09-26';
const INICIO = Date.UTC(Number(HOY.slice(0, 4)), Number(HOY.slice(5, 7)) - 1, Number(HOY.slice(8, 10)));
const mas = (n: number) => new Date(INICIO + n * 86_400_000).toISOString().slice(0, 10);
const t = (m: number) => new Date(INICIO + 14 * 3_600_000 + m * 60_000).toISOString();
const S = 'SUC-ORIENTE';
const G = '19521111000010';
const SSCC = completaClave('09521234000000001');
function paso<T>(p: { estado: EstadoAlmacen; resultado: { ok: true; valor: T; eventos: readonly Evento[] } | { ok: false; motivo: string } }) {
  assert.ok(p.resultado.ok, p.resultado.ok ? '' : p.resultado.motivo);
  return p.estado;
}
const lee = (e: EstadoAlmacen, texto: string) => { const r = parseaLectura(texto); assert.ok(!esErrorLectura(r)); return interpreta(r.elementos, e, HOY); };

test('la vista del contador no lleva cantidades del sistema: ni esperado, ni conciliacion, ni lo que mide la tarima', () => {
  let e: EstadoAlmacen = {
    ...estadoVacio({ sitios: [{ clave: S, nombre: 'Oriente', tipo: 'sucursal' }], categorias: CATEGORIAS_EJEMPLO }),
    articulos: { YOG: { sku: 'YOG', descripcion: 'Yogurt', categoria: 'lacteos', sitios: [S], marcaPropia: false, gtinCaja: G, reglaCaja: 'fabricante', unidadesPorCaja: 12, notas: [] } },
  };
  e = paso(altaConExpediente(e, { sitio: S, sku: 'YOG', gtin: G, lote: 'L1', caducidad: mas(20), cantidad: 12, zona: 'piso' }, 'recepcion', t(0), 'a1', 'op-aaaa0001'));
  e = paso(altaConExpediente(e, { sitio: S, sku: 'YOG', gtin: G, lote: 'L2', caducidad: mas(25), cantidad: 40, zona: 'almacen', sscc: SSCC }, 'recepcion', t(1), 'a2', 'op-aaaa0001'));
  e = paso(abreConteo(e, { sitio: S, zonas: ['almacen', 'piso'], tolerancia: 1 }, 'CNT-SUC-ORIENTE-20260926140000', t(2), 'op-cccc0003', integridadLocal(e, S)));
  const folio = 'CNT-SUC-ORIENTE-20260926140000';
  e = paso(leeEnConteo(e, folio, { zona: 'piso', lectura: lee(e, `(01)${G}(17)${aAammdd(mas(20))}(10)L1`), veces: 10 }, t(3), 'op-aaaa0001'));
  e = paso(leeEnConteo(e, folio, { zona: 'almacen', lectura: lee(e, `(00)${SSCC}`), veces: 1 }, t(4), 'op-aaaa0001'));
  const c1 = e.conteos![0]!;
  const ciega = vistaConteo(e, c1, 'conteo');
  const tarima = ciega.lecturas.find((x) => x.porRegistro)!;
  assert.equal(tarima.cajas, 0, 'la tarima leída por SSCC no dice cuántas cajas registra el sistema');
  assert.ok(!JSON.stringify(ciega).includes('"cajas":40'));
  e = paso(cierraRonda(e, folio));
  const c2 = e.conteos![0]!;
  assert.equal(c2.estado, 'reconteo');
  const deContador = JSON.stringify(vistaConteo(e, c2, 'conteo'));
  assert.ok(!deContador.includes('esperado') && !deContador.includes('conciliacion'));
  assert.deepEqual(vistaConteo(e, c2, 'conteo').lecturas, [], 'en el reconteo no se ve la ronda 1');
  const cerrado = paso(cierraRonda(e, folio));
  const c3 = cerrado.conteos![0]!;
  assert.equal(c3.estado, 'por-aplicar');
  const alCerrar = vistaConteo(cerrado, c3, 'conteo');
  assert.ok(!('conciliacion' in alCerrar) && !JSON.stringify(alCerrar).includes('esperado'), 'ni al cerrar las rondas');
  const supervisor = vistaConteo(cerrado, c3, 'operacion');
  assert.ok('conciliacion' in supervisor && supervisor.conciliacion.some((r) => r.esperado === 12), 'quien supervisa sí ve la conciliación');
});
