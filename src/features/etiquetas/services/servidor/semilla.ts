/**
 * Datos de DEMOSTRACION, todos ficticios: prefijo 952 (GS1 lo reserva para ejemplos y prohibe
 * usarlo en el mundo real), sitios, productos y lotes inventados. Solo se cargan si la
 * instalacion lo pide con ETIQUETAS_SEMILLA=ficticia: una instalacion real arranca vacia.
 *
 * El catalogo pasa por la MISMA importacion que un Excel real, asi que la semilla tambien
 * prueba la regla mixta. Las caducidades son relativas a hoy para que el tablero siempre
 * muestre los cuatro estados del semaforo.
 */
import {
  aplicaImportacion, CATEGORIAS_EJEMPLO, completaClave, ESCENARIO_DULCERIA, estadoVacio, leeFilas, planificaImportacion, ROLLOS_REFERENCIA, sumaDias,
  type Compra, type Consumibles, type Consumo, type EstadoAlmacen, type Existencia, type PerfilImpresora, type Sitio, type Zona,
} from '../nucleo.ts';

/** GLN ficticios, numerados con el prefijo de demostracion 952 (referencias 90001-90004). */
const gln = (ref: number) => completaClave(`9521234${ref}`);

export const SITIOS_DEMO: Sitio[] = [
  { clave: 'CEDIS-NTE', nombre: 'CEDIS Norte', tipo: 'cedis', agente: 'http://127.0.0.1:9180', gln: gln(90001) },
  { clave: 'SUC-CENTRO', nombre: 'Sucursal Centro', tipo: 'sucursal', agente: 'http://127.0.0.1:9181', gln: gln(90002) },
  { clave: 'SUC-PONIENTE', nombre: 'Sucursal Poniente', tipo: 'sucursal', gln: gln(90003) },
  { clave: 'SUC-ORIENTE', nombre: 'Sucursal Oriente', tipo: 'sucursal', gln: gln(90004) },
];

const C = ['sku', 'descripcion', 'categoria', 'sitios', 'marca_propia', 'gtin', 'gtin_caja', 'unidades_por_caja', 'cajas_por_tarima', 'vida_util_dias'];
const F = [
  ['YOG-001', 'Yogurt natural 1 kg', 'lacteos', 'CEDIS-NTE;SUC-CENTRO;SUC-PONIENTE', 'NO', '9521111000013', '19521111000010', '12', '50', '35'],
  ['LEC-002', 'Leche entera 1 L', 'lacteos', 'CEDIS-NTE;SUC-CENTRO;SUC-PONIENTE;SUC-ORIENTE', 'NO', '9521111000020', '', '12', '60', '20'],
  ['ATU-003', 'Atún en agua 140 g', 'abarrotes', 'CEDIS-NTE;SUC-ORIENTE', 'NO', '9521111000037', '', '48', '40', '720'],
  ['PAN-004', 'Pan de caja blanco 680 g', 'panaderia', 'SUC-CENTRO;SUC-PONIENTE', 'SI', '', '', '10', '', '6'],
  ['SAL-005', 'Salsa casera 500 g', 'abarrotes', 'SUC-CENTRO', 'SI', '', '', '1', '120', '180'],
  ['QSO-006', 'Queso fresco a granel', 'lacteos', 'SUC-PONIENTE;SUC-CENTRO', 'NO', '', '', '1', '', '12'],
  ['REF-007', 'Refresco cola 600 ml', 'bebidas', 'CEDIS-NTE;SUC-CENTRO;SUC-ORIENTE', 'NO', '9521111000044', '19521111000041', '24', '80', '120'],
  ['HLD-011', 'Helado de vainilla 1 L', 'congelados', 'CEDIS-NTE;SUC-CENTRO', 'SI', '9521234990017', '', '6', '40', '240'],
];

/** [sitio, sku, lote, dias hasta caducar, cajas, zona]. */
const LOTES: [string, string, string, number, number, Zona][] = [
  ['CEDIS-NTE', 'YOG-001', 'L4471', 35, 120, 'almacen'], ['CEDIS-NTE', 'YOG-001', 'L4502', 8, 40, 'almacen'], ['CEDIS-NTE', 'LEC-002', 'L0921', 2, 18, 'almacen'],
  ['CEDIS-NTE', 'LEC-002', 'L0899', -3, 6, 'almacen'], ['CEDIS-NTE', 'ATU-003', 'A2291', 400, 80, 'almacen'], ['CEDIS-NTE', 'REF-007', 'R551', 25, 64, 'almacen'],
  ['CEDIS-NTE', 'REF-007', 'R560', 110, 200, 'recibo'], ['CEDIS-NTE', 'HLD-011', 'H0003', 190, 30, 'almacen'],
  ['SUC-CENTRO', 'YOG-001', 'L4502', 8, 3, 'almacen'], ['SUC-CENTRO', 'YOG-001', 'L4471', 35, 4, 'almacen'], ['SUC-CENTRO', 'YOG-001', 'L4471', 35, 2, 'piso'], ['SUC-CENTRO', 'LEC-002', 'L0920', 6, 4, 'piso'],
  ['SUC-CENTRO', 'PAN-004', 'P0078', 4, 3, 'almacen'], ['SUC-CENTRO', 'PAN-004', 'P0077', 1, 2, 'piso'], ['SUC-CENTRO', 'SAL-005', 'S0012', 20, 10, 'almacen'],
  ['SUC-CENTRO', 'QSO-006', 'Q0009', -1, 1, 'piso'], ['SUC-CENTRO', 'HLD-011', 'H0003', 190, 5, 'piso'],
  ['SUC-PONIENTE', 'YOG-001', 'L4502', 8, 5, 'piso'], ['SUC-PONIENTE', 'QSO-006', 'Q0010', 9, 2, 'almacen'],
];

const perfil = (p: Partial<PerfilImpresora> & Pick<PerfilImpresora, 'id' | 'nombre' | 'sitio'>): PerfilImpresora => ({
  dpi: 203, anchoMm: 101.6, altoMm: 50.8, origenX: 0, origenY: 0, corrimientoIzq: 0, corrimientoSup: 0, oscuridad: 0, velocidad: 4, perfilLectura: 'pistola', ...p,
});

export const IMPRESORAS_DEMO: PerfilImpresora[] = [
  perfil({ id: 'zebra-cedis-rampa', nombre: 'ZT411 Rampa (tarimas 4×6)', sitio: 'CEDIS-NTE', altoMm: 152.4 }),
  perfil({ id: 'zebra-cedis-cajas', nombre: 'ZT411 Cajas 4×2', sitio: 'CEDIS-NTE' }),
  perfil({ id: 'zebra-suc-centro', nombre: 'ZD421 Mostrador 4×2', sitio: 'SUC-CENTRO' }),
  perfil({ id: 'zebra-suc-poniente', nombre: 'ZD621 300 dpi 4×2', sitio: 'SUC-PONIENTE', dpi: 300 }),
];

/** Las 8:00 UTC del dia dado, como marca de tiempo de la semilla. */
function aLasOcho(dia: string): string {
  const [a = 1970, m = 1, d = 1] = dia.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d, 8)).toISOString();
}

/**
 * Consumo FICTICIO del mes en curso, hasta ayer: etiquetas por dia hábil por impresora. La
 * ZD621 de Poniente queda SIN rollo asignado a proposito: su consumo se ve «sin costo», no cero.
 */
const RITMO: [string, string, number][] = [
  ['CEDIS-NTE', 'zebra-cedis-cajas', 140], ['CEDIS-NTE', 'zebra-cedis-rampa', 14], ['SUC-CENTRO', 'zebra-suc-centro', 22], ['SUC-PONIENTE', 'zebra-suc-poniente', 18],
];

export function consumiblesFicticios(hoy: string): Consumibles {
  const mes = hoy.slice(0, 7);
  const [anio = 1970, numMes = 1] = mes.split('-').map(Number);
  const a = (dia: number, hora: number) => new Date(Date.UTC(anio, numMes - 1, dia, hora));
  const rolloPorImpresora: Record<string, string> = { 'zebra-cedis-rampa': 'zp1000d-4x6-430', 'zebra-cedis-cajas': 'zp2000d-4x2-1240', 'zebra-suc-centro': 'zp1000d-4x2-690' };
  const consumos: Consumo[] = [];
  for (let d = 1; d < Number(hoy.slice(8, 10)); d++) {
    if (a(d, 12).getUTCDay() === 0) continue;
    for (const [sitio, impresora, n] of RITMO) {
      const etiquetas = n + ((d * 7) % 5);
      const rollo = rolloPorImpresora[impresora];
      consumos.push({ id: `sem-${impresora}-${d}`, fecha: a(d, 16).toISOString(), sitio, impresora, etiquetas, origen: 'impresion', operador: 'semilla', ...(rollo ? { rollo } : {}) });
    }
  }
  const compra = (id: string, sitio: string, rollo: string, rollos: number, costoTotal: number): Compra => ({ id, fecha: a(2, 15).toISOString(), sitio, rollo, rollos, costoTotal, operador: 'semilla' });
  return {
    rollos: ROLLOS_REFERENCIA, rolloPorImpresora,
    presupuestos: [{ sitio: 'CEDIS-NTE', mes, monto: 1500 }, { sitio: 'SUC-CENTRO', mes, monto: 250 }, { sitio: 'SUC-PONIENTE', mes, monto: 200 }],
    consumos,
    compras: [compra('sem-c1', 'CEDIS-NTE', 'zp2000d-4x2-1240', 6, 2569), compra('sem-c2', 'CEDIS-NTE', 'zp1000d-4x6-430', 2, 456), compra('sem-c3', 'SUC-CENTRO', 'zp1000d-4x2-690', 4, 1799)],
    escenarios: [ESCENARIO_DULCERIA],
  };
}

export function semillaFicticia(hoy: string): EstadoAlmacen {
  const cuando = aLasOcho(hoy);
  const base = estadoVacio({ prefijoEmpresa: '9521234', prefijoInterno: '04', extensionSscc: 0, sitios: SITIOS_DEMO });
  const registros = F.map((f) => Object.fromEntries(C.map((c, i) => [c, f[i] ?? ''])));
  const { filas, errores } = leeFilas(registros, CATEGORIAS_EJEMPLO.map((c) => c.id));
  const plan = planificaImportacion(filas, errores, base);
  const e = aplicaImportacion(base, plan, { id: 'semilla', archivo: 'semilla-ficticia', huella: 'sin-archivo', operador: 'semilla', fecha: cuando });
  const existencias: Existencia[] = LOTES.map(([sitio, sku, lote, dias, cantidad, zona], i) => ({
    id: `semilla-${i + 1}`, sitio, sku, gtin: e.articulos[sku]?.gtinCaja ?? '', lote, caducidad: sumaDias(hoy, dias), cantidad, origen: 'semilla', actualizado: cuando, zona,
  }));
  return { ...e, existencias, impresoras: IMPRESORAS_DEMO, consumibles: consumiblesFicticios(hoy) };
}
