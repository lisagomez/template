/**
 * Las relaciones entre documentos, que es donde se esconden los defectos: notas de crédito que
 * corrigen facturas (INV-03, INV-04), complementos de pago que saldan facturas PPD (INV-10), y en
 * B2C la caja contra su espejo fiscal: los tickets nominativos contra su factura (INV-09) y los
 * anónimos de un mes contra la factura global de ese mes (INV-08).
 */
import { centavosDe } from '../comun/dinero.js';
import { periodoDe } from '../comun/periodos.js';
import type { DocumentoFiscal } from './cfdi.js';
import { netoDe, totalDe, type Clasificados, type Contexto } from './construye.js';
import { ANONIMO, type NotaDeCredito, type Pago, type Transaccion } from './gamma.js';
import type { Ticket } from './tablas.js';

export function notasDe(x: Contexto, c: Clasificados): NotaDeCredito[] {
  return c.egresos.flatMap((d) => {
    const neto = netoDe(x, d);
    const relacionadas = d.relacionados.filter((r) => r.tipoRelacion === '01').flatMap((r) => r.uuids);
    if (!relacionadas.length) x.acta.viola('INV-03', d.uuid!, 'nota de crédito sin CfdiRelacionados de tipo 01');
    const cliente = x.cliente(d.rfcReceptor);
    for (const u of relacionadas) {
      const factura = c.todosLosIngresos.get(u);
      if (c.cancelados.has(u)) x.acta.viola('INV-03', d.uuid!, `corrige la factura ${u}, que está cancelada`);
      else if (!factura) x.acta.viola('INV-03', d.uuid!, `huérfana: la factura ${u} no existe en las fuentes`);
      else if (x.cliente(factura.rfcReceptor) !== cliente) x.acta.viola('INV-04', d.uuid!, `corrige la factura ${u}, que es de otro cliente`);
    }
    return neto === null ? [] : [{ id: d.uuid!, dia: d.dia!, cliente, centavos: neto, relacionadas }];
  });
}

export function pagosDe(x: Contexto, c: Clasificados): Pago[] {
  const pagado = new Map<string, number>();
  const fuera: Pago[] = [];
  for (const d of c.pagos) {
    d.pagos.forEach((p, i) => p.documentos.forEach((doc, j) => {
      const id = `${d.uuid}#${i + 1}.${j + 1}`;
      const factura = c.todosLosIngresos.get(doc.uuid);
      const centavos = centavosDe(doc.impPagado);
      if (!p.dia) return x.acta.viola('INV-06', id, 'fecha de pago ilegible');
      if (doc.moneda !== 'MXN') return x.acta.viola('INV-05', id, `pago en ${doc.moneda}: esta versión solo concilia pagos en MXN`);
      if (!factura || factura.metodoPago !== 'PPD') return x.acta.viola('INV-10', id, `el documento ${doc.uuid} no es una factura PPD de las fuentes`);
      if (centavos === null) return x.acta.viola('INV-10', id, 'ImpPagado ilegible');
      pagado.set(doc.uuid, (pagado.get(doc.uuid) ?? 0) + centavos);
      fuera.push({ id, dia: p.dia, documento: doc.uuid, centavos });
    }));
  }
  for (const [uuid, total] of pagado) {
    const factura = c.todosLosIngresos.get(uuid)!;
    if (total > totalDe(factura)) x.acta.viola('INV-10', uuid, 'los complementos pagan más que el total de la factura');
  }
  return fuera;
}

/** Un ticket por folio: copias idénticas se excluyen, importes distintos violan INV-12. */
function unicos(x: Contexto, tickets: readonly Ticket[]): Ticket[] {
  const vistos = new Map<string, Ticket>();
  const fuera: Ticket[] = [];
  for (const t of tickets) {
    const previo = vistos.get(t.ticket);
    if (!previo) { vistos.set(t.ticket, t); fuera.push(t); continue; }
    if (previo.importe !== t.importe || previo.dia !== t.dia) x.acta.viola('INV-12', `tk:${t.ticket}`, `líneas ${previo.linea} y ${t.linea}: el mismo ticket con importes distintos`);
    else if (previo.uuidFactura !== t.uuidFactura) fuera.push(t);
    else x.acta.excluye(`tk:${t.ticket}`, `copia de la línea ${previo.linea}`);
  }
  return fuera;
}

function deTicket(x: Contexto, t: Ticket, nominativas: Map<string, DocumentoFiscal>): Transaccion | null {
  const ref = `tk:${t.ticket}`;
  const centavos = centavosDe(t.importe);
  const total = centavosDe(t.total);
  if (!t.dia) { x.acta.viola('INV-06', ref, `línea ${t.linea}: fecha ilegible`); return null; }
  if (centavos === null || total === null) { x.acta.viola('INV-05', ref, `línea ${t.linea}: importe ilegible`); return null; }
  const p = periodoDe(t.dia, x.e.granularidad);
  if (p < x.e.horizonte.desde || p > x.e.horizonte.hasta) { x.acta.excluye(ref, 'fuera del horizonte de la spec'); return null; }
  let cliente = ANONIMO;
  if (t.uuidFactura) {
    const f = nominativas.get(t.uuidFactura);
    if (!f) { x.acta.viola('INV-09', ref, `cita la factura ${t.uuidFactura}, que no es una nominativa de las fuentes`); return null; }
    cliente = x.cliente(f.rfcReceptor);
  }
  return { id: ref, dia: t.dia, cliente, centavos, totalCentavos: total, metodo: 'PUE', origen: 'caja' };
}

/** INV-09: lo que suman los tickets de una factura nominativa es su neto. INV-08: la global cuadra con su mes. */
function concilia(x: Contexto, c: Clasificados, tickets: readonly Ticket[], tx: readonly Transaccion[]): void {
  const porFactura = new Map<string, number>();
  for (const t of tickets) if (t.uuidFactura) porFactura.set(t.uuidFactura, (porFactura.get(t.uuidFactura) ?? 0) + (centavosDe(t.importe) ?? 0));
  for (const [uuid, sumaTickets] of porFactura) {
    const f = c.todosLosIngresos.get(uuid);
    if (f && netoDe(x, f) !== sumaTickets) x.acta.viola('INV-09', uuid, 'los tickets de la factura no suman su neto');
  }
  const anonimosPorMes = new Map<string, number>();
  for (const t of tx) if (t.cliente === ANONIMO) anonimosPorMes.set(t.dia.slice(0, 7), (anonimosPorMes.get(t.dia.slice(0, 7)) ?? 0) + t.centavos);
  for (const g of c.ingresos.filter((d) => d.global)) {
    if (g.global!.periodicidad !== '04') { x.acta.viola('INV-08', g.uuid!, `periodicidad ${g.global!.periodicidad}: esta versión solo concilia globales mensuales`); continue; }
    const mes = `${g.global!.anio}-${g.global!.meses}`;
    const neto = netoDe(x, g);
    if (neto !== (anonimosPorMes.get(mes) ?? 0)) x.acta.viola('INV-08', g.uuid!, `la global de ${mes} no cuadra con los tickets anónimos de la caja`);
  }
}

export function transaccionesDeCaja(x: Contexto, c: Clasificados, tickets: readonly Ticket[]): Transaccion[] {
  const nominativas = new Map(c.ingresos.filter((d) => !d.global && x.cliente(d.rfcReceptor) !== ANONIMO).map((d) => [d.uuid!, d] as const));
  const validos = unicos(x, tickets);
  const tx = validos.flatMap((t) => deTicket(x, t, nominativas) ?? []);
  concilia(x, c, validos, tx);
  return tx;
}
