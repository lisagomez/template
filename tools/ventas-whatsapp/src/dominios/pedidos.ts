/**
 * Dominio `pedidos`: el ÚNICO que escribe pedidos y pagos. Arma el carrito, valida contra el
 * catálogo (por A2A), genera la liga del procesador y concilia. Tres reglas:
 *  - idempotencia: el pedido se ata al `wamid` del mensaje que lo creó y el pago al id del
 *    procesador; un reintento devuelve lo mismo, nunca un segundo pedido ni un segundo cobro;
 *  - el precio es el del catálogo, no el que diga el mensaje: si el `item_price` de Meta difiere,
 *    se anota;
 *  - un monto sobre el umbral del inquilino no se cobra solo: queda `en_revision` y el orquestador
 *    lo pasa al dueño.
 */
import { tarea, artefacto, type AgenteDominio, type ContextoDominio, type Solicitud } from '../agente/a2a-modelo.js';
import type { ItemPedido, Pedido } from '../modelo.js';
import { partesDeReferencia, type EventoDePago } from './pagos.js';

const pideCatalogo = async (ctx: ContextoDominio, s: Solicitud, retailerIds: string[]) => {
  const t = await ctx.bus.envia('catalogo', { tenant: s.tenant, contextId: s.contextId, skill: 'consultar_existencias', datos: { retailerIds }, messageId: `${s.messageId}:catalogo` });
  const a = artefacto(t, 'productos') as { productos: Array<{ retailerId: string; nombre: string; precioCentavos: number; existencias: number }>; faltan: string[] } | undefined;
  return a ?? { productos: [], faltan: retailerIds };
};

const vista = (p: Pedido) => ({ ...p });

async function creaPedido(s: Solicitud, ctx: ContextoDominio) {
  const ahora = ctx.reloj();
  const origenWamid = String(s.datos.origenWamid ?? '');
  const previo = (await ctx.datos.lista('pedidos')).find((p) => p.origenWamid === origenWamid && origenWamid !== '');
  if (previo) return tarea(s, 'pedidos', previo.estado === 'en_revision' ? 'TASK_STATE_REJECTED' : 'TASK_STATE_INPUT_REQUIRED', ahora, ctx.ids, [{ nombre: 'pedido', datos: vista(previo) }], previo.estado === 'en_revision' ? 'monto' : 'entrega');
  const pedidos = Array.isArray(s.datos.items) ? s.datos.items as Array<{ retailerId: string; cantidad: number; precioCentavos?: number }> : [];
  if (!pedidos.length) return tarea(s, 'pedidos', 'TASK_STATE_REJECTED', ahora, ctx.ids, [], 'pedido vacío');
  const cat = await pideCatalogo(ctx, s, pedidos.map((i) => i.retailerId));
  if (cat.faltan.length) return tarea(s, 'pedidos', 'TASK_STATE_REJECTED', ahora, ctx.ids, [{ nombre: 'faltan', datos: { retailerIds: cat.faltan } }], 'producto desconocido');
  const items: ItemPedido[] = [];
  const notas: string[] = [];
  const sinExistencias: string[] = [];
  for (const i of pedidos) {
    const p = cat.productos.find((x) => x.retailerId === i.retailerId);
    if (!p) continue;
    const cantidad = Math.max(1, Math.floor(i.cantidad));
    if (p.existencias < cantidad) { sinExistencias.push(p.nombre); continue; }
    if (i.precioCentavos !== undefined && i.precioCentavos !== p.precioCentavos) notas.push(`precio del mensaje (${i.precioCentavos}) ≠ catálogo (${p.precioCentavos}) en ${p.retailerId}: vale el catálogo`);
    items.push({ retailerId: p.retailerId, nombre: p.nombre, cantidad, precioCentavos: p.precioCentavos });
  }
  if (sinExistencias.length) return tarea(s, 'pedidos', 'TASK_STATE_REJECTED', ahora, ctx.ids, [{ nombre: 'sin_existencias', datos: { productos: sinExistencias } }], 'sin existencias');
  const subtotal = items.reduce((a, i) => a + i.precioCentavos * i.cantidad, 0);
  const excede = subtotal > ctx.inquilino.politicas.umbralTraspasoCentavos;
  const pedido: Pedido = {
    id: ctx.ids('ped'), conversacionId: String(s.datos.conversacionId ?? ''), waId: String(s.datos.waId ?? ''), items,
    subtotalCentavos: subtotal, envioCentavos: 0, totalCentavos: subtotal, moneda: ctx.inquilino.moneda,
    estado: excede ? 'en_revision' : 'carrito', origenWamid: origenWamid || ctx.ids('chat'), creadoEn: ahora, notas,
  };
  await ctx.datos.guarda('pedidos', pedido.id, pedido);
  if (excede) return tarea(s, 'pedidos', 'TASK_STATE_REJECTED', ahora, ctx.ids, [{ nombre: 'pedido', datos: vista(pedido) }], 'monto');
  return tarea(s, 'pedidos', 'TASK_STATE_INPUT_REQUIRED', ahora, ctx.ids, [{ nombre: 'pedido', datos: vista(pedido) }], 'entrega');
}

async function agregaEntrega(s: Solicitud, ctx: ContextoDominio) {
  const ahora = ctx.reloj();
  const pedido = await ctx.datos.lee('pedidos', String(s.datos.pedidoId ?? ''));
  if (!pedido) return tarea(s, 'pedidos', 'TASK_STATE_REJECTED', ahora, ctx.ids, [], 'pedido no existe');
  if (pedido.estado !== 'carrito') return tarea(s, 'pedidos', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'pedido', datos: vista(pedido) }]);
  const recoger = s.datos.recoger === true;
  const zona = String(s.datos.zona ?? '');
  const cobertura = ctx.inquilino.politicas.cobertura ?? [];
  const tarifa = recoger ? { zona: 'recoger en tienda', costoCentavos: 0, minutos: 20 } : cobertura.find((c) => c.zona === zona);
  if (!tarifa) return tarea(s, 'pedidos', 'TASK_STATE_REJECTED', ahora, ctx.ids, [{ nombre: 'cobertura', datos: { zonas: cobertura.map((c) => c.zona) } }], 'sin cobertura');
  const actualizado: Pedido = {
    ...pedido, envioCentavos: tarifa.costoCentavos, totalCentavos: pedido.subtotalCentavos + tarifa.costoCentavos,
    entrega: { zona: tarifa.zona, direccion: String(s.datos.direccion ?? ''), horario: String(s.datos.horario ?? '') },
    ...(s.datos.rfc ? { facturacion: { rfc: String(s.datos.rfc), razonSocial: String(s.datos.razonSocial ?? '') } } : {}),
  };
  await ctx.datos.guarda('pedidos', pedido.id, actualizado);
  return tarea(s, 'pedidos', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'pedido', datos: vista(actualizado) }]);
}

async function generaLiga(s: Solicitud, ctx: ContextoDominio) {
  const ahora = ctx.reloj();
  const pedido = await ctx.datos.lee('pedidos', String(s.datos.pedidoId ?? ''));
  if (!pedido) return tarea(s, 'pedidos', 'TASK_STATE_REJECTED', ahora, ctx.ids, [], 'pedido no existe');
  if (pedido.liga) return tarea(s, 'pedidos', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'liga', datos: { ...pedido.liga, pedido: vista(pedido) } }]);
  if (pedido.estado !== 'carrito' || !pedido.entrega) return tarea(s, 'pedidos', 'TASK_STATE_INPUT_REQUIRED', ahora, ctx.ids, [{ nombre: 'pedido', datos: vista(pedido) }], 'entrega');
  const pagos = ctx.servicios.pagos;
  if (!pagos) return tarea(s, 'pedidos', 'TASK_STATE_FAILED', ahora, ctx.ids, [], 'sin procesador de pagos');
  const r = await pagos.creaLiga({ referencia: `${ctx.inquilino.id}|${pedido.id}`, montoCentavos: pedido.totalCentavos, moneda: pedido.moneda, descripcion: `${ctx.inquilino.nombre} · pedido ${pedido.id}`, idempotencia: pedido.id });
  if (!r.ok) return tarea(s, 'pedidos', 'TASK_STATE_FAILED', ahora, ctx.ids, [], r.error);
  const actualizado: Pedido = { ...pedido, liga: r.liga, estado: 'por_pagar' };
  await ctx.datos.guarda('pedidos', pedido.id, actualizado);
  return tarea(s, 'pedidos', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'liga', datos: { ...r.liga, pedido: vista(actualizado) } }]);
}

async function confirmaPago(s: Solicitud, ctx: ContextoDominio) {
  const ahora = ctx.reloj();
  const e = s.datos.evento as unknown as EventoDePago;
  const partes = partesDeReferencia(e.referencia);
  if (!partes || partes.inquilinoId !== ctx.inquilino.id) return tarea(s, 'pedidos', 'TASK_STATE_REJECTED', ctx.reloj(), ctx.ids, [], 'referencia de otro inquilino');
  const previo = await ctx.datos.lee('pagos', e.pagoId);
  if (previo) {
    await ctx.datos.guarda('pagos', e.pagoId, { ...previo, duplicadosIgnorados: previo.duplicadosIgnorados + 1 });
    return tarea(s, 'pedidos', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'duplicado', datos: { pagoId: e.pagoId } }]);
  }
  const pedido = await ctx.datos.lee('pedidos', partes.pedidoId);
  if (!pedido) return tarea(s, 'pedidos', 'TASK_STATE_REJECTED', ahora, ctx.ids, [], 'pago de un pedido que no existe');
  await ctx.datos.guarda('pagos', e.pagoId, { id: e.pagoId, pedidoId: pedido.id, montoCentavos: e.montoCentavos, moneda: e.moneda, estado: e.estado, recibidoEn: ahora, duplicadosIgnorados: 0 });
  if (e.estado === 'fallido') {
    await ctx.datos.guarda('pedidos', pedido.id, { ...pedido, estado: 'fallido' });
    return tarea(s, 'pedidos', 'TASK_STATE_FAILED', ahora, ctx.ids, [{ nombre: 'pedido', datos: vista({ ...pedido, estado: 'fallido' }) }], 'pago rechazado');
  }
  if (e.montoCentavos !== pedido.totalCentavos || e.moneda !== pedido.moneda) {
    const revisar: Pedido = { ...pedido, estado: 'en_revision', notas: [...pedido.notas, `pago ${e.pagoId} por ${e.montoCentavos} ${e.moneda} ≠ total ${pedido.totalCentavos} ${pedido.moneda}`] };
    await ctx.datos.guarda('pedidos', pedido.id, revisar);
    return tarea(s, 'pedidos', 'TASK_STATE_FAILED', ahora, ctx.ids, [{ nombre: 'pedido', datos: vista(revisar) }], 'monto no cuadra');
  }
  const pagado: Pedido = { ...pedido, estado: 'pagado', pagoId: e.pagoId, pagadoEn: ahora };
  await ctx.datos.guarda('pedidos', pedido.id, pagado);
  await ctx.bus.envia('catalogo', { tenant: s.tenant, contextId: s.contextId, skill: 'descontar', datos: { items: pagado.items.map((i) => ({ retailerId: i.retailerId, cantidad: i.cantidad })) }, messageId: `${e.pagoId}:descontar` });
  await ctx.bus.envia('atribucion', {
    tenant: s.tenant, contextId: s.contextId, skill: 'reportar_conversion',
    datos: { nombre: 'Purchase', conversacionId: pagado.conversacionId, pedidoId: pagado.id, valorCentavos: pagado.totalCentavos, moneda: pagado.moneda },
    messageId: `${e.pagoId}:purchase`,
  });
  return tarea(s, 'pedidos', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'pedido', datos: vista(pagado) }]);
}

/** Pedidos pagados contra el reporte del procesador. Sin diferencias = conciliado. */
async function concilia(s: Solicitud, ctx: ContextoDominio) {
  const ahora = ctx.reloj();
  const reporte = ctx.servicios.pagos ? await ctx.servicios.pagos.reporte() : [];
  const pedidos = await ctx.datos.lista('pedidos');
  const diferencias: string[] = [];
  const propios = reporte.map((r) => ({ ...r, pedidoId: partesDeReferencia(r.referencia)?.pedidoId ?? '', inquilinoId: partesDeReferencia(r.referencia)?.inquilinoId }))
    .filter((r) => r.inquilinoId === ctx.inquilino.id);
  const cobrados = propios.filter((r) => r.estado === 'pagado');
  const porPedido = new Map<string, number>();
  for (const r of cobrados) porPedido.set(r.pedidoId, (porPedido.get(r.pedidoId) ?? 0) + 1);
  for (const [pedidoId, n] of porPedido) if (n > 1) diferencias.push(`${pedidoId}: ${n} cobros en el procesador`);
  for (const r of cobrados) {
    const p = pedidos.find((x) => x.id === r.pedidoId);
    if (!p) continue;
    if (p.estado !== 'pagado') diferencias.push(`${p.id}: cobrado en el procesador y ${p.estado} aquí`);
    else if (p.totalCentavos !== r.montoCentavos) diferencias.push(`${p.id}: total ${p.totalCentavos} ≠ cobrado ${r.montoCentavos}`);
  }
  for (const p of pedidos) if (p.estado === 'pagado' && !cobrados.some((r) => r.pedidoId === p.id)) diferencias.push(`${p.id}: pagado aquí y sin cobro en el procesador`);
  const total = cobrados.reduce((a, r) => a + r.montoCentavos, 0);
  return tarea(s, 'pedidos', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'conciliacion', datos: { pedidosPagados: pedidos.filter((p) => p.estado === 'pagado').length, cobros: cobrados.length, totalCentavos: total, diferencias } }]);
}

export const agentePedidos: AgenteDominio = {
  nombre: 'pedidos',
  descripcion: 'Crea pedidos, genera ligas de pago, confirma pagos y concilia. Único dueño de pedidos y pagos.',
  skills: [
    { id: 'crear_pedido', nombre: 'Crear pedido', descripcion: 'Carrito desde un mensaje order o desde el chat, validado contra el catálogo' },
    { id: 'agregar_entrega', nombre: 'Datos de entrega', descripcion: 'Zona con cobertura, dirección y horario; calcula el envío' },
    { id: 'liga_pago', nombre: 'Generar liga de pago', descripcion: 'Liga del procesador, una sola por pedido' },
    { id: 'confirmar_pago', nombre: 'Confirmar pago', descripcion: 'Webhook del procesador: idempotente por id de pago' },
    { id: 'estado_pedido', nombre: 'Estado del pedido', descripcion: 'Estado vigente del pedido' },
    { id: 'conciliar', nombre: 'Conciliar', descripcion: 'Pedidos pagados contra el reporte del procesador' },
  ],
  async atiende(s, ctx) {
    switch (s.skill) {
      case 'crear_pedido': return creaPedido(s, ctx);
      case 'agregar_entrega': return agregaEntrega(s, ctx);
      case 'liga_pago': return generaLiga(s, ctx);
      case 'confirmar_pago': return confirmaPago(s, ctx);
      case 'conciliar': return concilia(s, ctx);
      case 'estado_pedido': {
        const p = await ctx.datos.lee('pedidos', String(s.datos.pedidoId ?? ''));
        return p ? tarea(s, 'pedidos', 'TASK_STATE_COMPLETED', ctx.reloj(), ctx.ids, [{ nombre: 'pedido', datos: vista(p) }])
          : tarea(s, 'pedidos', 'TASK_STATE_REJECTED', ctx.reloj(), ctx.ids, [], 'no existe');
      }
      default: return tarea(s, 'pedidos', 'TASK_STATE_REJECTED', ctx.reloj(), ctx.ids, [], `skill desconocida: ${s.skill}`);
    }
  },
};
