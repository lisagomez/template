/** Pruebas de ventas (CFDI y CSV) y marca. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ventasDesdeCfdi, ventasDesdeCsv, resumeVentas, juntaVentas, type CfdiLeido } from '../dist/ventas/index.js';
import { capturaDeDescripcion, capturaDeSitio, contraste, confirmaMarca, ajustaMarca } from '../dist/marca/index.js';

const c = (clave: string, valor: string) => ({ clave, valor });
function cfdi(uuid: string, fecha: string, conceptos: [string, string, string][], extra: { tipo?: string; moneda?: string; tc?: string; emisor?: string; receptor?: string } = {}): CfdiLeido {
  return {
    esCfdi: true, motivo: null, tipoDeComprobante: extra.tipo ?? 'I', timbrado: true,
    campos: [c('uuid', uuid), c('fecha', fecha), c('moneda', extra.moneda ?? 'MXN'), c('rfc_emisor', extra.emisor ?? 'EKU9003173C9'), c('rfc_receptor', extra.receptor ?? 'XAXX010101000'), ...(extra.tc ? [c('tipo_cambio', extra.tc)] : [])],
    conceptos: conceptos.map(([d, cant, imp], i) => ({ indice: i, campos: [c('descripcion', d), c('cantidad', cant), c('importe', imp)] })),
  };
}

test('CFDI: solo ingresos propios; egreso, pago, otro RFC y repetido se excluyen CON motivo', () => {
  const v = ventasDesdeCfdi([
    cfdi('A', '2026-09-01T10:00:00', [['Concha', '10', '120.00'], ['Pan de muerto', '2', '90.00']]),
    cfdi('A', '2026-09-01T10:00:00', [['Concha', '10', '120.00']]),
    cfdi('B', '2026-09-02T10:00:00', [['Devolución', '1', '30.00']], { tipo: 'E' }),
    cfdi('C', '2026-09-02T10:00:00', [['Pago', '1', '0']], { tipo: 'P' }),
    cfdi('D', '2026-09-03T10:00:00', [['Harina', '1', '800.00']], { emisor: 'AAA010101AAA' }),
    { esCfdi: false, motivo: 'los bytes no son UTF-8 valido', tipoDeComprobante: null, timbrado: false, campos: [], conceptos: [] },
  ], { rfcPropio: 'EKU9003173C9' });
  assert.equal(v.lineas.length, 2);
  assert.equal(v.excluidas.length, 4);
  assert.ok(v.excluidas.some((e) => /repetida/.test(e.motivo)));
  assert.deepEqual(v.notasDeCredito, { centavos: 3000, cuantas: 1 }, 'la nota de crédito RESTA, no se tira');
  assert.ok(v.avisos.some((a) => /nota\(s\) de crédito/.test(a)));
  assert.ok(v.excluidas.some((e) => /otro RFC/.test(e.motivo)));
  assert.equal(v.lineas[0]!.cliente, null, 'público en general no genera huella de cliente');
});

test('CFDI en dólares: con TipoCambio se convierte y se dice; sin él, se reporta aparte y no se suma', () => {
  const v = ventasDesdeCfdi([
    cfdi('E', '2026-09-05', [['Pastel', '1', '100.00']], { moneda: 'USD', tc: '18.50' }),
    cfdi('F', '2026-09-05', [['Pastel', '1', '100.00']], { moneda: 'USD' }),
    cfdi('G', '2026-09-05', [['Pastel', '1', '500.00']]),
  ]);
  assert.equal(v.lineas.find((l) => l.referencia === 'E')!.importe.centavos, 185000);
  assert.ok(v.avisos.some((a) => /sin tipo de cambio/.test(a)));
  const r = resumeVentas(v);
  assert.equal(r.estado, 'ok');
  if (r.estado === 'ok') {
    assert.equal(r.valor.totalPesos, 235000, '1,850 + 500; los 100 USD sin tipo de cambio NO se suman');
    assert.deepEqual(r.valor.enOtraMoneda, [{ moneda: 'USD', centavos: 10000 }]);
  }
});

test('CSV de caja: sinónimos, filas malas con línea y motivo; formato europeo rechazado', () => {
  const v = ventasDesdeCsv('Fecha,Artículo,Piezas,Total,Sucursal\n01/09/2026,Concha,10,"$120.00",Centro\n02/09/2026,,1,$20,Centro\n03/09/2026,Rosca,1,"1.234,50",Centro\n32/09/2026,Bolillo,5,$15,Centro\n04/09/2026,Bolillo,5,$15,Norte\n');
  assert.equal(v.lineas.length, 2);
  assert.deepEqual(v.excluidas.map((e) => e.referencia), ['csv:línea 3', 'csv:línea 4', 'csv:línea 5']);
  assert.equal(v.lineas[1]!.canal, 'Norte');
  assert.match(v.excluidas[1]!.motivo, /europeo/);
});

test('CSV sin columna de importe: no inventa, dice qué falta', () => {
  const v = ventasDesdeCsv('dia,producto\n01/09/2026,Concha\n');
  assert.equal(v.lineas.length, 0);
  assert.match(v.avisos[0]!, /importe/);
});

test('resumen: sin ventas es «sin datos», nunca cero; con 70 días compara 30 contra 30 y nombra lo que se movió >25%', () => {
  assert.equal(resumeVentas({ lineas: [], excluidas: [], avisos: [] }).estado, 'sin-datos');
  const filas = ['fecha,producto,cantidad,importe'];
  for (let d = 0; d < 70; d++) {
    const dia = new Date(Date.UTC(2026, 7, 1 + d)).toISOString().slice(0, 10);
    filas.push(`${dia},Concha,10,${d < 40 ? 100 : 160}`);
    filas.push(`${dia},Rosca,1,${d < 40 ? 300 : 90}`);
    filas.push(`${dia},Bolillo,20,${d < 40 ? 60 : 66}`);
  }
  const r = resumeVentas(juntaVentas(ventasDesdeCsv(filas.join('\n'))));
  assert.equal(r.estado, 'ok');
  if (r.estado === 'ok') {
    assert.equal(r.valor.comparable, true);
    assert.equal(r.valor.bajando[0]!.producto, 'Rosca');
    assert.equal(r.valor.subiendo[0]!.producto, 'Concha');
    assert.ok(!r.valor.subiendo.some((p) => p.producto === 'Bolillo'), '+10% no llega al umbral de 25%');
    assert.equal(r.valor.productos.find((p) => p.producto === 'Concha')!.precioUnitario, 1600);
  }
});

test('fechas ambiguas del CSV: se deducen del archivo o se avisa', () => {
  const mdy = ventasDesdeCsv('fecha,producto,importe\n09/13/2026,Concha,10\n09/14/2026,Concha,10\n');
  assert.equal(mdy.lineas[0]!.dia, '2026-09-13');
  assert.ok(mdy.avisos.some((a) => /mes\/día/.test(a)));
  const ambigua = ventasDesdeCsv('fecha,producto,importe\n03/04/2026,Concha,10\n');
  assert.equal(ambigua.lineas[0]!.dia, '2026-04-03', 'México: día primero');
  assert.ok(ambigua.avisos.some((a) => /confírmalo/.test(a)));
});

test('marca desde palabras: sin hex, contraste AA garantizado, requiere confirmación', () => {
  const m = capturaDeDescripcion('verde bosque y crema, algo rústico', 'Panadería La Espiga');
  assert.equal(m.origen, 'descripcion');
  assert.equal(m.colores.fondo, '#f6efe2');
  assert.ok(contraste(m.colores.texto, m.colores.fondo) >= 4.5);
  assert.equal(m.confirmado, false);
  assert.equal(confirmaMarca(m).confirmado, true);
  assert.equal(ajustaMarca(confirmaMarca(m), 'mas-oscuro').confirmado, false, 'un ajuste pide volver a confirmar');
  assert.match(capturaDeDescripcion('azul marino oscuro').colores.primario, /^#[0-9a-f]{6}$/);
  assert.equal(capturaDeDescripcion('algo bonito').notas.length > 0, true);
});

test('marca desde el HTML del sitio: nombre, lema, colores del CSS, tipografía y logo; texto ajeno revisado', () => {
  const html = `<html><head><title>La Espiga | Panadería artesanal en Puebla</title>
<meta name="description" content="Pan recién horneado todos los días desde 1998">
<meta name="theme-color" content="#1f4d3a"><meta property="og:image" content="/img/logo-espiga.png">
<style>:root{--color-primary:#1f4d3a;--accent:#c0643c} body{font-family:'Playfair Display',serif;color:#222}</style></head></html>`;
  const m = capturaDeSitio(html, 'https://laespiga.example.mx/');
  assert.equal(m.nombre, 'La Espiga');
  assert.equal(m.lema, 'Pan recién horneado todos los días desde 1998');
  assert.equal(m.colores.primario, '#1f4d3a');
  assert.equal(m.colores.secundario, '#c0643c');
  assert.match(m.tipografia.titulos, /Playfair Display/);
  assert.equal(m.logo, 'https://laespiga.example.mx/img/logo-espiga.png');
  assert.ok(capturaDeSitio('<html><body>sin estilos</body></html>').notas[0]!.includes('marca neutra'));
});
