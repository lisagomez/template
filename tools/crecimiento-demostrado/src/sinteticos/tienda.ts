/**
 * ABARROTES LA ESQUINA (sintética), B2C en Xalapa. La venta es la CAJA: decenas de tickets al día
 * a público en general, y unos 18 clientes que piden factura nominativa (fondas y oficinas del
 * barrio). El SAT ve el espejo: una nominativa por ticket facturado y una global mensual por los
 * tickets anónimos, emitida los primeros días del mes siguiente.
 *
 * PLANTADO a propósito, en 2026-3T (julio a septiembre de 2026): los precios suben ~9 % y las
 * visitas caen ~8 %. El ingreso casi no se mueve y su composición cambia: el ticket sube y la
 * frecuencia baja. En los clientes identificados, n = 18 < 20: con ellos no se puede inferir.
 */
import { azarCon, rfcSintetico, type Azar } from './azar.js';
import { ESTACIONALIDAD, dia, diasDe, fechaHora, meses, mesSiguiente, sumaDias, type Mes } from './calendario.js';
import { Libreta, PUBLICO_EN_GENERAL } from './libreta.js';
import type { Libro, Plantado } from './libro.js';
import { ivaDe, textoDe } from './xml.js';

export const FIN_DEL_HORIZONTE_TIENDA = '2026-09-30';
const MESES = meses({ anio: 2024, mes: 1 }, 33);
const SEMANA = [0.75, 0.95, 0.9, 0.95, 1.05, 1.2, 1.2] as const;

interface Cliente { readonly rfc: string; readonly nombre: string; readonly inicio: number; readonly fin: number; readonly visitas: readonly [number, number]; readonly ticket: number }

function clientes(azar: Azar): Cliente[] {
  const cs = Array.from({ length: 18 }, (_, i): Cliente => ({
    rfc: rfcSintetico(azar), nombre: `${azar.elige(['Fonda', 'Oficina', 'Consultorio', 'Papelería', 'Taller'])} sintético ${i + 1}`,
    inicio: i < 13 ? 0 : azar.entero(2, 20), fin: 32, visitas: [1, 3], ticket: azar.entero(60_000, 240_000),
  }));
  for (const i of [14, 15]) cs[i] = { ...cs[i]!, inicio: 30 };
  for (const i of [3, 4]) cs[i] = { ...cs[i]!, fin: 29 };
  return cs;
}

/** Índice de precios y de visitas del mes (lo plantado entra en julio de 2026: mes 30). */
const precio = (m: Mes) => (1 + 0.004 * m.indice) * (m.indice >= 30 ? 1.09 : 1);
const visitas = (m: Mes) => (1 + 0.003 * m.indice) * (m.indice >= 30 ? 0.92 : 1);

function diaDeLaSemana(a: number, m: number, d: number): number {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const y = m < 3 ? a - 1 : a;
  return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[m - 1]! + d) % 7;
}

function ticketsAnonimos(l: Libreta, m: Mes, folio: { n: number }): number {
  const azar = l.azar;
  let suma = 0;
  for (let d = 1; d <= diasDe(m.anio, m.mes); d++) {
    const cuantos = Math.max(5, Math.round(38 * ESTACIONALIDAD[m.mes - 1]! * SEMANA[diaDeLaSemana(m.anio, m.mes, d)]! * visitas(m) * (1 + 0.1 * azar.normal())));
    for (let k = 0; k < cuantos; k++) {
      const importe = Math.max(1_200, Math.round(Math.exp(Math.log(14_500) + 0.55 * azar.normal()) * precio(m)));
      const diaTexto = dia(m.anio, m.mes, d);
      l.libro.tickets.push({ ticket: `T${String(folio.n++).padStart(7, '0')}`, dia: diaTexto, hora: fechaHora(diaTexto, azar.entero(7, 21), azar.entero(0, 59)), importe, total: importe + ivaDe(importe), uuidFactura: '', rfc: null });
      suma += importe;
    }
  }
  return suma;
}

function ticketsNominativos(l: Libreta, c: Cliente, m: Mes, folio: { n: number }): void {
  const azar = l.azar;
  for (let k = azar.entero(c.visitas[0], c.visitas[1]); k > 0; k--) {
    const d = dia(m.anio, m.mes, azar.entero(1, diasDe(m.anio, m.mes)));
    const importe = Math.round(c.ticket * precio(m) * Math.max(0.5, 1 + 0.2 * azar.normal()));
    const v = l.venta({ dia: d, receptor: { rfc: c.rfc, nombre: c.nombre }, metodo: 'PUE', conceptos: [{ descripcion: 'Mercancía según ticket', importe, descuento: 0 }] });
    l.libro.tickets.push({ ticket: `T${String(folio.n++).padStart(7, '0')}`, dia: d, hora: fechaHora(d, azar.entero(7, 21), azar.entero(0, 59)), importe, total: v.totalMxn, uuidFactura: v.uuid, rfc: c.rfc });
    if (azar.probabilidad(0.01)) l.nota(v, sumaDias(d, azar.entero(1, 20)), azar.entero(100, 500));
  }
}

export const PLANTADO_TIENDA: readonly Plantado[] = [
  { descripcion: 'Los precios suben ~9 % y las visitas caen ~8 %: el ticket sube, la frecuencia baja', desde: '2026-2T', hasta: '2026-3T' },
  { descripcion: 'Solo 18 clientes identificados: n < 20, una prueba pareada no puede concluir', desde: '2026-2T', hasta: '2026-3T' },
];

export function libroTienda(semilla = 20261003): Libro {
  const azar = azarCon(semilla);
  const libro: Libro = { modelo: 'b2c', rfcPropio: 'ALE180611SN3', nombrePropio: 'ABARROTES LA ESQUINA SA DE CV', ventas: [], notas: [], pagos: [], tickets: [], catalogo: [], extras: [] };
  const l = new Libreta(libro, azar, FIN_DEL_HORIZONTE_TIENDA);
  const cs = clientes(azar);
  const folio = { n: 1 };
  for (const m of MESES) {
    const anonimos = ticketsAnonimos(l, m, folio);
    for (const c of cs) if (m.indice >= c.inicio && m.indice <= c.fin) ticketsNominativos(l, c, m, folio);
    const sig = mesSiguiente(m.anio, m.mes);
    l.venta({
      dia: dia(m.anio, m.mes, diasDe(m.anio, m.mes)), receptor: { rfc: PUBLICO_EN_GENERAL, nombre: 'PUBLICO EN GENERAL' }, metodo: 'PUE',
      conceptos: [{ descripcion: 'Venta', importe: anonimos, descuento: 0 }],
      global: { mes: String(m.mes).padStart(2, '0'), anio: String(m.anio), emision: dia(sig.anio, sig.mes, azar.entero(1, 3)) },
    });
  }
  return libro;
}

/** La caja como CSV: ticket, fecha, importe (sin IVA), IVA, total y el UUID de su factura nominativa. */
export function cajaCsv(libro: Libro): string {
  const filas = libro.tickets.map((t) => [t.ticket, t.hora, textoDe(t.importe), textoDe(t.total - t.importe), textoDe(t.total), t.uuidFactura].join(','));
  return ['ticket,fecha,importe,iva,total,uuid_factura', ...filas].join('\n');
}
