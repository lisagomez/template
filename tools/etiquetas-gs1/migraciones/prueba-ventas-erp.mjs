#!/usr/bin/env node
/**
 * Ventas del ERP para el agente de riesgo, contra el ERP REAL (001..005) en el Postgres efimero.
 * Lo llama `prueba-efimera.sh` (fase 5) con el nombre del contenedor. Nada toca produccion.
 *
 *  1. siembra ventas de PRUEBA en el tenant 1: pedidos confirmados y facturados dentro de la
 *     ventana, y los que NO deben contar (borrador, cancelado, fuera de ventana, de hoy, de otro
 *     tenant);
 *  2. lee con el SQL del nucleo como lo haria `erp_lector`: `set role rol_swm` (solo lectura) y
 *     `app.cliente_id` del tenant (RLS);
 *  3. arma la FuenteVentas y corre el agente sobre un lote de gomitas en Poniente.
 */
import { execFileSync } from 'node:child_process'
import {
  altaConExpediente, CATEGORIAS_EJEMPLO, cargaVentasErp, completaClave, estadoVacio, evaluaRiesgo, SQL_VENTAS_ERP,
} from '../dist/index.js'

const ID = process.argv[2]
if (!ID) { console.error('uso: node prueba-ventas-erp.mjs <contenedor>'); process.exit(2) }
const TENANT_UNO = '11111111-1111-4111-8111-111111111111'
const TENANT_DOS = '22222222-2222-4222-8222-222222222222'
const HOY = new Date().toISOString().slice(0, 10)
const psql = (entrada) => execFileSync('docker', ['exec', '-i', ID, 'psql', '-U', 'postgres', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'], { input: entrada, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
const falla = (m) => { console.error(`  ✗ ${m}`); process.exit(1) }

// 1. Siembra (como dueño del esquema, que en el efimero no pasa por RLS al sembrar).
psql(`
insert into erp.cob_cliente (cliente_id, nombre) values ('${TENANT_UNO}', 'Mostrador (prueba)'), ('${TENANT_DOS}', 'Otro tenant (prueba)');
insert into erp.inv_articulo (cliente_id, sku, nombre, clave_unidad) values
  ('${TENANT_UNO}', 'GOM-020', 'Gomitas surtidas 1 kg', 'H87'), ('${TENANT_UNO}', 'CHO-021', 'Chocolate de leche 100 g', 'XBX'), ('${TENANT_UNO}', 'ATU-003', 'Atun en agua 140 g', 'H87'),
  ('${TENANT_DOS}', 'GOM-020', 'Gomitas de otro tenant', 'H87');
-- 14 pedidos de gomitas (30 piezas c/u = 420) y 7 de chocolate (2 cajas c/u = 14), confirmados o facturados, dentro de la ventana
insert into erp.ped_pedido (cliente_id, folio, cob_cliente_id, fecha, estado)
  select '${TENANT_UNO}', 'PED-G' || g, (select id from erp.cob_cliente where cliente_id = '${TENANT_UNO}'), date '${HOY}' - g, case when g % 2 = 0 then 'confirmado' else 'facturado' end from generate_series(1, 14) g;
insert into erp.ped_pedido (cliente_id, folio, cob_cliente_id, fecha, estado)
  select '${TENANT_UNO}', 'PED-C' || g, (select id from erp.cob_cliente where cliente_id = '${TENANT_UNO}'), date '${HOY}' - g * 3, 'facturado' from generate_series(1, 7) g;
-- Lo que NO cuenta: borrador, cancelado, fuera de la ventana de 28 dias, de hoy (dia incompleto) y de otro tenant
insert into erp.ped_pedido (cliente_id, folio, cob_cliente_id, fecha, estado) values
  ('${TENANT_UNO}', 'PED-X1', (select id from erp.cob_cliente where cliente_id = '${TENANT_UNO}'), date '${HOY}' - 2, 'borrador'),
  ('${TENANT_UNO}', 'PED-X2', (select id from erp.cob_cliente where cliente_id = '${TENANT_UNO}'), date '${HOY}' - 2, 'cancelado'),
  ('${TENANT_UNO}', 'PED-X3', (select id from erp.cob_cliente where cliente_id = '${TENANT_UNO}'), date '${HOY}' - 35, 'facturado'),
  ('${TENANT_UNO}', 'PED-X4', (select id from erp.cob_cliente where cliente_id = '${TENANT_UNO}'), date '${HOY}', 'facturado'),
  ('${TENANT_DOS}', 'PED-Y1', (select id from erp.cob_cliente where cliente_id = '${TENANT_DOS}'), date '${HOY}' - 2, 'facturado');
insert into erp.ped_partida (cliente_id, ped_pedido_id, inv_articulo_id, cantidad, precio_unitario, importe)
  select o.cliente_id, o.id, a.id, 30, 12.5, 375.00 from erp.ped_pedido o join erp.inv_articulo a on a.cliente_id = o.cliente_id and a.sku = 'GOM-020' where o.cliente_id = '${TENANT_UNO}' and o.folio like 'PED-G%';
insert into erp.ped_partida (cliente_id, ped_pedido_id, inv_articulo_id, cantidad, precio_unitario, importe)
  select o.cliente_id, o.id, a.id, 2, 250, 500.00 from erp.ped_pedido o join erp.inv_articulo a on a.cliente_id = o.cliente_id and a.sku = 'CHO-021' where o.cliente_id = '${TENANT_UNO}' and o.folio like 'PED-C%';
insert into erp.ped_partida (cliente_id, ped_pedido_id, inv_articulo_id, cantidad, precio_unitario, importe)
  select o.cliente_id, o.id, a.id, 500, 12.5, 6250.00 from erp.ped_pedido o join erp.inv_articulo a on a.cliente_id = o.cliente_id and a.sku = 'GOM-020' where o.folio like 'PED-X%' or o.folio like 'PED-Y%';
`)

// 2. La consulta como erp_lector: rol de solo lectura y tenant fijado.
const consultaComo = (tenant) => async (sql, [desde, hasta, estados]) => {
  const salida = psql(`set role rol_swm;\nset app.cliente_id = '${tenant}';\nprepare v(date, date, text[]) as select coalesce(json_agg(t), '[]'::json) from (${sql}) t;\nexecute v('${desde}', '${hasta}', '{${estados.join(',')}}');\n`)
  return JSON.parse(salida.trim())
}
try {
  psql(`set role rol_swm;\nset app.cliente_id = '${TENANT_UNO}';\ninsert into erp.cob_cliente (cliente_id, nombre) values ('${TENANT_UNO}', 'no debe entrar');\n`)
  falla('rol_swm pudo escribir en el ERP')
} catch (e) {
  if (!/permission denied/.test(String(e.stderr ?? e.message))) falla(`el intento de escritura falló por otra razón: ${String(e.stderr ?? e.message).trim()}`)
  console.log('  OK la lectura corre con rol_swm: escribir le da «permission denied»')
}

const G = { 'GOM-020': completaClave('1952111100005'), 'CHO-021': completaClave('1952111100006'), 'ATU-003': completaClave('1952111100007') }
const art = (sku, categoria, unidadesPorCaja) => ({ sku, descripcion: sku, categoria, sitios: ['SUC-PONIENTE'], marcaPropia: false, gtinCaja: G[sku], reglaCaja: 'fabricante', unidadesPorCaja, notas: [] })
const articulos = { 'GOM-020': art('GOM-020', 'dulceria', 10), 'CHO-021': art('CHO-021', 'dulceria', 48), 'ATU-003': art('ATU-003', 'abarrotes', 48) }
const r = await cargaVentasErp(consultaComo(TENANT_UNO), { sitio: 'SUC-PONIENTE', hoy: HOY, articulos })
console.log(`  ventana ${r.ventana.desde} a ${r.ventana.hasta} (sin incluir hoy) · ${r.filas.length} artículo(s) del ERP · ${r.descartadas} fila(s) descartada(s)`)
const venta = (sku) => r.fuente.promedioDiario('SUC-PONIENTE', G[sku])
const esperado = { 'GOM-020': 1.5, 'CHO-021': 0.5, 'ATU-003': 0 }
for (const [sku, v] of Object.entries(esperado)) {
  if (venta(sku) !== v) falla(`${sku}: esperaba ${v} cajas/día y el ERP dio ${venta(sku)}`)
}
console.log('  OK cajas por día: GOM-020 1.5 (420 piezas / 10 / 28), CHO-021 0.5 (14 cajas XBX / 28), ATU-003 0 (el ERP lo tiene y no se vendió)')
console.log('  OK no cuentan borrador, cancelado, fuera de ventana, de hoy ni de otro tenant')
const otro = await cargaVentasErp(consultaComo(TENANT_DOS), { sitio: 'SUC-PONIENTE', hoy: HOY, articulos })
const suya = otro.fuente.promedioDiario('SUC-PONIENTE', G['GOM-020'])
if (suya !== Math.round((500 / 10 / 28) * 1000) / 1000 || otro.filas.some((f) => f.sku === 'CHO-021')) falla(`el tenant 2 no ve solo lo suyo: ${JSON.stringify(otro.filas)}`)
console.log(`  OK aislamiento por tenant: el tenant 2 ve solo su pedido de 500 piezas (${suya}/día) y el tenant 1 no lo cuenta`)

// 3. El agente con ventas del ERP: un lote VERDE de gomitas que no se vende a tiempo.
const LOTE = { gtin: G['GOM-020'], lote: 'SUC03-L4471', caducidad: new Date(Date.parse(`${HOY}`) + 50 * 86_400_000).toISOString().slice(0, 10) }
let e = { ...estadoVacio({ sitios: [{ clave: 'SUC-PONIENTE', nombre: 'Sucursal Poniente', tipo: 'sucursal' }], categorias: CATEGORIAS_EJEMPLO }), articulos }
const alta = altaConExpediente(e, { sitio: 'SUC-PONIENTE', sku: 'GOM-020', ...LOTE, cantidad: 112, zona: 'almacen' }, 'recepcion', new Date().toISOString(), 'a1', 'op-0a1b2c3d')
if (!alta.resultado.ok) falla(alta.resultado.motivo)
e = alta.estado
const riesgos = evaluaRiesgo(e, 'SUC-PONIENTE', HOY, r.fuente)
const x = riesgos[0]
if (!x || x.semaforo !== 'vigente' || x.venta !== 1.5) falla(`el agente no vio el lote verde en riesgo con la venta del ERP: ${JSON.stringify(riesgos)}`)
console.log(`  OK agente con ventas del ERP: lote ${x.lote.lote} en verde, ${x.cajas} cajas, vende ${x.venta}/día → ${x.diasInventario} días de inventario contra ${x.diasVendibles} vendibles; ${x.cajasEnRiesgo} cajas en riesgo`)
console.log(`     recomienda: ${x.recomendacion.texto}`)
if (!/^select /.test(SQL_VENTAS_ERP)) falla('la consulta no es un select')
