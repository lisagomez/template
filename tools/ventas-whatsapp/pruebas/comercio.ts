/**
 * Fase 2 — comercio en el chat: catálogo desde CSV, `order` → carrito → Flow de entrega → liga →
 * pago → estado del pedido; conciliación sin diferencias; pago duplicado, fallido y que no cuadra.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leeCsvCatalogo, DIA } from '../dist/index.js';
import { circuito } from './_ayuda.ts';

type Circ = Awaited<ReturnType<typeof circuito>>;

async function compra(x: Circ, pyme: 'restaurante' | 'tienda', waId: string, items: Array<{ retailerId: string; cantidad: number }>) {
  const { c } = x;
  const i = x[pyme];
  const cl = c.meta.cliente(i.canal.phoneNumberId, waId, 'Compradora');
  cl.pide(items);
  await c.asienta();
  const pantallaEnvio = pyme === 'tienda' ? 'ENVIO' : 'ENTREGA';
  const flujo = await cl.llenaFlow({
    [pantallaEnvio]: { zona: pyme === 'tienda' ? 'Xalapa' : 'Centro', direccion: 'Calle Ficticia 123', horario: 'lo-antes-posible', recoger: false, ...(pyme === 'tienda' ? { rfc: 'XAXX010101000', razon_social: 'Público en general' } : {}) },
    RESUMEN: { confirmar: true },
  });
  await c.asienta();
  const cta = cl.ultimo()!;
  return { cl, flujo, cta };
}

test('order → carrito → Flow de entrega cifrado → liga → pago → estado del pedido', async () => {
  const x = await circuito();
  const { cl, flujo, cta } = await compra(x, 'restaurante', '5222900020001', [{ retailerId: 'tacos-pastor', cantidad: 2 }, { retailerId: 'cafe-lechero', cantidad: 1 }]);
  assert.deepEqual(flujo.errores, []);
  assert.deepEqual(flujo.pantallas, ['ENTREGA', 'RESUMEN']);
  assert.equal(cta.mensaje.tipo, 'cta_url');
  assert.match(cta.resumen, /Total \$270\.00/, '2 × $95 + $45 + envío Centro $35');
  const liga = x.c.procesador.ligaDeUrl((cta.mensaje as { url: string }).url)!;
  await x.c.procesador.paga(liga.id);
  await x.c.asienta();
  assert.match(cl.ultimo()!.resumen, /Pago recibido/);
  const [p] = await x.c.almacen.de(x.restaurante.id).lista('pedidos');
  assert.equal(p!.estado, 'pagado');
  assert.equal(p!.entrega?.zona, 'Centro');
  const catalogo = await x.c.almacen.de(x.restaurante.id).lista('productos');
  assert.equal(catalogo.find((q) => q.retailerId === 'tacos-pastor')!.existencias, 38, 'las existencias se descuentan al pagar');
});

test('pago: webhook duplicado no cobra dos veces; conciliación sin diferencias', async () => {
  const x = await circuito();
  const pagos = [];
  for (const [k, items] of [[1, [{ retailerId: 'picadas', cantidad: 3 }]], [2, [{ retailerId: 'arroz-tumbada', cantidad: 1 }]], [3, [{ retailerId: 'gordas-negras', cantidad: 2 }]]] as const) {
    const { cta } = await compra(x, 'restaurante', `522290002010${k}`, [...items]);
    const liga = x.c.procesador.ligaDeUrl((cta.mensaje as { url: string }).url)!;
    pagos.push(await x.c.procesador.paga(liga.id, { duplicaWebhook: true }));
  }
  await x.c.asienta();
  const datos = x.c.almacen.de(x.restaurante.id);
  const registrados = await datos.lista('pagos');
  assert.equal(registrados.length, 3, 'un pago por cobro aunque el webhook llegó dos veces');
  assert.ok(registrados.every((p) => p.duplicadosIgnorados === 1));
  const conc = await x.c.vendedor.panel.concilia(x.restaurante.id);
  const d = conc.artefactos[0]!.datos as { diferencias: string[]; pedidosPagados: number; cobros: number };
  console.log(`# conciliación: ${JSON.stringify(d)}`);
  assert.deepEqual(d.diferencias, []);
  assert.equal(d.pedidosPagados, 3);
  assert.equal(d.cobros, 3);
  const purchases = x.c.meta.capi.aceptados.filter((e) => e.event_name === 'Purchase');
  assert.equal(purchases.length, 0, 'sin anuncio (sin ctwa_clid) no hay Purchase a la Conversions API');
});

test('pago fallido: el pedido queda fallido y se avisa; pago que no cuadra: revisión y caso al dueño', async () => {
  const x = await circuito();
  const a = await compra(x, 'tienda', '5222800020201', [{ retailerId: 'bolsa-palma', cantidad: 1 }]);
  const ligaA = x.c.procesador.ligaDeUrl((a.cta.mensaje as { url: string }).url)!;
  await x.c.procesador.paga(ligaA.id, { falla: true });
  await x.c.asienta();
  assert.match(a.cl.ultimo()!.resumen, /no pasó/);
  const b = await compra(x, 'tienda', '5222800020202', [{ retailerId: 'reboso-azul', cantidad: 1 }]);
  const ligaB = x.c.procesador.ligaDeUrl((b.cta.mensaje as { url: string }).url)!;
  await x.c.procesador.paga(ligaB.id, { montoDistinto: 100 });
  await x.c.asienta();
  const pedidos = await x.c.almacen.de(x.tienda.id).lista('pedidos');
  assert.deepEqual(pedidos.map((p) => p.estado).sort(), ['en_revision', 'fallido']);
  const conc = await x.c.vendedor.panel.concilia(x.tienda.id);
  const d = conc.artefactos[0]!.datos as { diferencias: string[] };
  assert.equal(d.diferencias.length, 1, 'la conciliación señala el cobro que no cuadra');
  assert.ok((await x.c.almacen.de(x.tienda.id).lista('casos')).some((k) => k.motivo === 'monto'));
});

test('el precio del carrito es el del catálogo; sin existencias se rechaza; factura con RFC en el checkout', async () => {
  const x = await circuito();
  const cl = x.c.meta.cliente(x.tienda.canal.phoneNumberId, '5222800020301', 'Sombrero');
  cl.pide([{ retailerId: 'sombrero-jarocho', cantidad: 1 }]);
  await x.c.asienta();
  assert.match(cl.ultimo()!.resumen, /Se nos acabó/);
  const { cta } = await compra(x, 'tienda', '5222800020302', [{ retailerId: 'huipil-rojo-m', cantidad: 1 }]);
  assert.match(cta.resumen, /Total \$1,010\.00/, '$950 + envío Xalapa $60');
  const [p] = (await x.c.almacen.de(x.tienda.id).lista('pedidos')).filter((q) => q.waId === '5222800020302');
  assert.equal(p!.facturacion?.rfc, 'XAXX010101000');
});

test('Flow de entrega: zona sin cobertura vuelve a la pantalla con el error; recoger en tienda cuesta $0', async () => {
  const x = await circuito();
  const cl = x.c.meta.cliente(x.restaurante.canal.phoneNumberId, '5222900020401', 'Lejos');
  cl.pide([{ retailerId: 'tacos-bistec', cantidad: 1 }]);
  await x.c.asienta();
  let intento = 0;
  const r = await cl.llenaFlow({
    ENTREGA: () => (intento++ === 0 ? { zona: 'Coatzacoalcos', direccion: 'x', horario: 'lo-antes-posible', recoger: false } : { zona: '', direccion: '', horario: 'lo-antes-posible', recoger: true }),
    RESUMEN: { confirmar: true },
  });
  assert.deepEqual(r.pantallas, ['ENTREGA', 'ENTREGA', 'RESUMEN']);
  assert.ok(r.errores.some((e) => /no llegamos/.test(e)));
  await x.c.asienta();
  assert.match(cl.ultimo()!.resumen, /Total \$105\.00/);
});

test('catálogo desde CSV: altas, cambios, bajas y errores por fila (nada se adivina)', async () => {
  const x = await circuito();
  const csv = 'retailer_id,nombre,precio,existencias,categoria\ntacos-pastor,Orden de tacos al pastor,99,40,tacos\nnuevo-1,Tamal jarocho,35,20,antojitos\nmalo,,-5,x,antojitos';
  const t = await x.c.vendedor.panel.sincronizaCatalogo(x.restaurante.id, csv);
  const s = t.artefactos[0]!.datos as { errores: unknown[] };
  assert.equal(t.estado, 'TASK_STATE_FAILED', 'una hoja con errores no se aplica a medias');
  assert.equal((await x.c.almacen.de(x.restaurante.id).lista('productos')).find((p) => p.retailerId === 'tacos-pastor')!.precioCentavos, 9_500, 'nada cambió');
  assert.equal(s.errores.length, 1);
  assert.deepEqual(leeCsvCatalogo('nombre,precio\nx,1').errores[0]!.error, 'falta la columna retailer_id');
  const csvBueno = 'retailer_id,nombre,precio,existencias,categoria\ntacos-pastor,Orden de tacos al pastor,99,40,tacos\nnuevo-1,Tamal jarocho,35,20,antojitos';
  const t2 = await x.c.vendedor.panel.sincronizaCatalogo(x.restaurante.id, csvBueno);
  const s2 = t2.artefactos[0]!.datos as { altas: string[]; cambios: Array<{ campo: string }>; bajas: string[] };
  assert.equal(t2.estado, 'TASK_STATE_COMPLETED');
  assert.ok(s2.cambios.some((c) => c.campo === 'precioCentavos'));
  assert.equal(s2.bajas.length, 8, 'lo que ya no viene en la hoja se da de baja');
});

test('aviso de pago fuera de la ventana de 24 h: sale como plantilla de utilidad (cobrada)', async () => {
  const x = await circuito();
  const { cta } = await compra(x, 'tienda', '5222800020501', [{ retailerId: 'aretes-filigrana', cantidad: 1 }]);
  x.c.reloj.avanza(2 * DIA);
  const liga = x.c.procesador.ligaDeUrl((cta.mensaje as { url: string }).url)!;
  await x.c.procesador.paga(liga.id);
  await x.c.asienta();
  const ultimo = x.c.meta.cliente(x.tienda.canal.phoneNumberId, '5222800020501', 'Compradora').ultimo()!;
  assert.equal(ultimo.mensaje.tipo, 'plantilla');
  assert.deepEqual([ultimo.precio?.categoria, ultimo.precio?.billable], ['utility', true]);
});
