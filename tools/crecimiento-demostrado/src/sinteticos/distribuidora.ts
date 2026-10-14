/**
 * DISTRIBUIDORA SOTAVENTO (sintética), B2B en Veracruz: abarrotes e insumos de mayoreo para
 * restaurantes, hoteles y tiendas. 48 clientes con RFC, concentración (pocos mayoristas pesan
 * mucho), 11 trimestres (2024-1T a 2026-3T) con la estacionalidad de México, pagos PPD con
 * complemento, dos clientes en dólares, notas de crédito, cancelaciones con sustitución, y el
 * mostrador facturado en global mensual (emitida los primeros días del mes siguiente).
 *
 * PLANTADO a propósito:
 * - 2026-2T → 2026-3T: tres mayoristas se expanden (+45 %), dos clientes nuevos, dos perdidos.
 * - 2025-4T → 2026-1T: un cliente perdido recibe una nota de crédito en el trimestre en que ya no
 *   compró: R_hasta(L) ≠ 0 y la forma clásica del puente NO aplica.
 * - 2025-2T → 2025-3T: un cliente que no compró en ninguno de los dos recibe una nota: Z ≠ ∅.
 */
import { azarCon, rfcSintetico, type Azar } from './azar.js';
import { ESTACIONALIDAD, dia, diasDe, meses, mesSiguiente, sumaDias, type Mes } from './calendario.js';
import { conceptos, Libreta, PUBLICO_EN_GENERAL } from './libreta.js';
import type { Libro, Plantado } from './libro.js';
import { comprobanteXml } from './xml.js';

const PRODUCTOS = ['Aceite vegetal 20 L', 'Azúcar estándar 50 kg', 'Harina de trigo 44 kg', 'Arroz súper extra 25 kg', 'Frijol negro 25 kg', 'Café molido 10 kg', 'Servilletas caja 24 paquetes', 'Detergente 20 kg', 'Chile jalapeño lata 2.8 kg', 'Atún en agua caja 48', 'Vaso térmico 1000 piezas', 'Sal de mesa 25 kg'];
export const FIN_DEL_HORIZONTE = '2026-09-30';
const MESES = meses({ anio: 2024, mes: 1 }, 33);

interface Perfil {
  readonly rfc: string; readonly nombre: string; readonly segmento: string | null;
  readonly base: number; readonly inicio: number; readonly fin: number; readonly tendencia: number;
  readonly facturas: readonly [number, number]; readonly ppd: boolean; readonly usd: boolean;
  readonly impulso?: { readonly desde: number; readonly factor: number };
}

const NOMBRES = ['Restaurante', 'Hotel', 'Abarrotes', 'Cocina económica', 'Taquería', 'Cafetería', 'Minisúper', 'Comedor industrial'];

function perfil(azar: Azar, i: number): Perfil {
  const mayorista = i < 12;
  const base = mayorista ? azar.entero(9_000_000, 26_000_000) : azar.entero(900_000, 4_200_000);
  const nace = i < 34 ? 0 : azar.entero(1, 26);
  const muere = azar.probabilidad(0.18) && i >= 12 ? azar.entero(nace + 3, 32) : 32;
  return {
    rfc: rfcSintetico(azar), nombre: `${azar.elige(NOMBRES)} sintético ${i + 1}`, segmento: i >= 42 ? null : mayorista ? 'mayorista' : 'minorista',
    base, inicio: nace, fin: muere, tendencia: (azar() - 0.4) * 0.02, facturas: mayorista ? [2, 4] : [1, 2], ppd: azar.probabilidad(mayorista ? 0.6 : 0.15), usd: false,
  };
}

/** Los perfiles, con lo plantado encima de los índices fijos. */
function perfiles(azar: Azar): Perfil[] {
  const ps = Array.from({ length: 48 }, (_, i) => perfil(azar, i));
  const fija = (i: number, cambio: Partial<Perfil>) => { ps[i] = { ...ps[i]!, ...cambio }; };
  for (const i of [0, 1, 2]) fija(i, { inicio: 0, fin: 32, impulso: { desde: 30, factor: 1.45 } });
  for (const i of [12, 13]) fija(i, { inicio: 0, fin: 29 });
  for (const i of [14, 15]) fija(i, { inicio: 30, fin: 32 });
  fija(16, { inicio: 0, fin: 23, ppd: false });
  fija(17, { inicio: 0, fin: 14, ppd: false });
  for (const i of [9, 10]) fija(i, { usd: true, ppd: false, inicio: 0, fin: 32 });
  return ps;
}

function montoDelMes(azar: Azar, p: Perfil, m: Mes): number {
  const impulso = p.impulso && m.indice >= p.impulso.desde ? p.impulso.factor : 1;
  const ruido = Math.max(0.6, 1 + 0.12 * azar.normal());
  return Math.round(p.base * ESTACIONALIDAD[m.mes - 1]! * (1 + p.tendencia * m.indice) * impulso * ruido);
}

/** Las facturas de un cliente en un mes, con sus pagos, notas y alguna cancelación. */
function facturasDelMes(l: Libreta, p: Perfil, m: Mes): void {
  const azar = l.azar;
  const n = azar.entero(p.facturas[0], p.facturas[1]);
  const monto = montoDelMes(azar, p, m);
  for (let k = 0; k < n; k++) {
    const d = dia(m.anio, m.mes, azar.entero(1, diasDe(m.anio, m.mes)));
    const usd = p.usd ? azar.entero(168_000, 205_000) : undefined;
    const importe = usd ? Math.round((monto / n) * 10000 / usd) : Math.round(monto / n);
    const pedido = { dia: d, receptor: { rfc: p.rfc, nombre: p.nombre }, conceptos: conceptos(azar, PRODUCTOS, importe, azar.entero(1, 3)), metodo: p.ppd ? 'PPD' as const : 'PUE' as const, ...(usd ? { usd } : {}) };
    let v = l.venta(pedido);
    if (azar.probabilidad(0.012)) { const s = l.cancelaYSustituye(v, pedido); if (!s) continue; v = s; }
    if (p.ppd) l.pagos(v, azar.probabilidad(0.25) ? [sumaDias(d, azar.entero(10, 30)), sumaDias(d, azar.entero(35, 70))] : [sumaDias(d, azar.entero(15, 60))]);
    if (!usd && azar.probabilidad(0.04)) l.nota(v, sumaDias(d, azar.entero(5, 40)), azar.entero(50, 250));
  }
}

/** El mostrador: una factura global mensual a público en general, emitida del 1 al 3 del mes siguiente. */
function globalDelMes(l: Libreta, m: Mes): void {
  const monto = Math.round(3_800_000 * ESTACIONALIDAD[m.mes - 1]! * (1 + 0.004 * m.indice) * Math.max(0.7, 1 + 0.08 * l.azar.normal()));
  const sig = mesSiguiente(m.anio, m.mes);
  l.venta({
    dia: dia(m.anio, m.mes, diasDe(m.anio, m.mes)), receptor: { rfc: PUBLICO_EN_GENERAL, nombre: 'PUBLICO EN GENERAL' }, metodo: 'PUE',
    conceptos: [{ descripcion: 'Venta', importe: monto, descuento: 0 }],
    global: { mes: String(m.mes).padStart(2, '0'), anio: String(m.anio), emision: dia(sig.anio, sig.mes, l.azar.entero(1, 3)) },
  });
}

/** Las notas plantadas: un perdido con nota en el trimestre siguiente, y un «solo ajustes». */
function plantaNotas(l: Libreta, ps: readonly Perfil[]): void {
  const deCliente = (rfc: string) => l.libro.ventas.filter((v) => v.rfc === rfc && !v.cancelada);
  const ultima = (rfc: string) => deCliente(rfc).sort((a, b) => (a.dia < b.dia ? 1 : -1))[0]!;
  l.nota(ultima(ps[16]!.rfc), '2026-02-11', 300);
  l.nota(ultima(ps[17]!.rfc), '2025-08-19', 300);
}

function extras(l: Libreta): void {
  const copia = l.libro.ventas[7]!;
  l.libro.extras.push({ nombre: `copia-${copia.uuid}.xml`, texto: comprobanteXml(copia.comprobante) });
  const compra = { ...copia.comprobante, uuid: l.azar.uuid(), emisor: { rfc: 'PRV101010SN9', nombre: 'PROVEEDOR SINTETICO' }, receptor: { rfc: l.libro.rfcPropio, nombre: l.libro.nombrePropio } };
  l.libro.extras.push({ nombre: `compra-${compra.uuid}.xml`, texto: comprobanteXml(compra) });
}

export const PLANTADO_DISTRIBUIDORA: readonly Plantado[] = [
  { descripcion: 'Tres mayoristas se expanden 45 %, dos clientes nuevos y dos perdidos', desde: '2026-2T', hasta: '2026-3T' },
  { descripcion: 'Un cliente perdido recibe una nota de crédito: R_hasta(L) ≠ 0, la forma clásica no aplica', desde: '2025-4T', hasta: '2026-1T' },
  { descripcion: 'Un cliente sin compras en ambos periodos recibe una nota: Z ≠ ∅', desde: '2025-2T', hasta: '2025-3T' },
];

export function libroDistribuidora(semilla = 20261002): Libro {
  const azar = azarCon(semilla);
  const libro: Libro = { modelo: 'b2b', rfcPropio: 'DSV150301SN1', nombrePropio: 'DISTRIBUIDORA SOTAVENTO SA DE CV', ventas: [], notas: [], pagos: [], tickets: [], catalogo: [], extras: [] };
  const l = new Libreta(libro, azar, FIN_DEL_HORIZONTE);
  const ps = perfiles(azar);
  for (const m of MESES) {
    for (const p of ps) if (m.indice >= p.inicio && m.indice <= p.fin) facturasDelMes(l, p, m);
    globalDelMes(l, m);
  }
  plantaNotas(l, ps);
  extras(l);
  for (const p of ps) if (p.segmento) libro.catalogo.push({ rfc: p.rfc, segmento: p.segmento });
  return libro;
}
