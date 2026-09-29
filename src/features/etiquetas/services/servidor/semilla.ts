/**
 * Datos de DEMOSTRACION, todos ficticios: prefijo 952 (GS1 lo reserva para ejemplos y prohibe
 * usarlo en el mundo real), sitios, productos y lotes inventados. Solo se cargan si la
 * instalacion lo pide con ETIQUETAS_SEMILLA=ficticia: una instalacion real arranca vacia.
 *
 * El catalogo pasa por la MISMA importacion que un Excel real, asi que la semilla tambien
 * prueba la regla mixta. Las caducidades son relativas a hoy para que el tablero siempre
 * muestre los cinco estados del semaforo. Y el inventario NO se escribe a mano: entra por las
 * mismas operaciones que dejan su evento en la cadena de cada sitio (recepcion, movimiento,
 * transferencia, venta, correccion), asi que la semilla tambien prueba el expediente.
 */
import {
  aAammdd, altaConExpediente, aplicaImportacion, CATEGORIAS_EJEMPLO, completaClave, corrige, ESCENARIO_DULCERIA, esErrorLectura, estadoVacio, interpreta, leeFilas,
  mueveConExpediente, parseaLectura, planificaImportacion, recibeConExpediente, ROLLOS_REFERENCIA, salida, sumaDias, transfiere, ubica,
  type ClaveLote, type Compra, type Consumibles, type Consumo, type EstadoAlmacen, type Interpretacion, type Paso, type PerfilImpresora, type Sitio, type Zona,
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
  ['GOM-020', 'Gomitas surtidas 1 kg', 'dulceria', 'CEDIS-NTE;SUC-CENTRO;SUC-PONIENTE;SUC-ORIENTE', 'NO', completaClave('952111100005'), completaClave('1952111100005'), '10', '60', '180'],
  ['CHO-021', 'Chocolate de leche 100 g', 'dulceria', 'CEDIS-NTE;SUC-CENTRO;SUC-PONIENTE', 'NO', completaClave('952111100006'), completaClave('1952111100006'), '48', '50', '270'],
];

/** [sitio, sku, lote, dias hasta caducar, cajas, zona, rack-nivel-posicion]. */
const LOTES: [string, string, string, number, number, Zona, string?][] = [
  ['CEDIS-NTE', 'YOG-001', 'L4471', 35, 120, 'almacen'], ['CEDIS-NTE', 'YOG-001', 'L4502', 8, 40, 'almacen'], ['CEDIS-NTE', 'LEC-002', 'L0921', 2, 18, 'almacen'],
  ['CEDIS-NTE', 'LEC-002', 'L0899', -3, 6, 'almacen'], ['CEDIS-NTE', 'ATU-003', 'A2291', 400, 80, 'almacen'], ['CEDIS-NTE', 'REF-007', 'R551', 25, 64, 'almacen'],
  ['CEDIS-NTE', 'REF-007', 'R560', 110, 200, 'recibo'], ['CEDIS-NTE', 'HLD-011', 'H0003', 190, 30, 'almacen'],
  ['SUC-CENTRO', 'YOG-001', 'L4502', 8, 3, 'almacen', 'A-01-1'], ['SUC-CENTRO', 'YOG-001', 'L4471', 35, 4, 'almacen', 'A-01-2'], ['SUC-CENTRO', 'YOG-001', 'L4471', 35, 2, 'piso'], ['SUC-CENTRO', 'LEC-002', 'L0920', 6, 4, 'piso'],
  ['SUC-CENTRO', 'PAN-004', 'P0078', 4, 3, 'almacen', 'A-02-1'], ['SUC-CENTRO', 'PAN-004', 'P0077', 1, 2, 'piso'], ['SUC-CENTRO', 'SAL-005', 'S0012', 20, 10, 'almacen', 'B-01-1'],
  ['SUC-CENTRO', 'QSO-006', 'Q0009', -1, 1, 'piso'], ['SUC-CENTRO', 'HLD-011', 'H0003', 190, 5, 'piso'],
  ['SUC-PONIENTE', 'YOG-001', 'L4502', 8, 5, 'piso'], ['SUC-PONIENTE', 'QSO-006', 'Q0010', 9, 2, 'almacen'],
  ['SUC-CENTRO', 'CHO-021', 'CH0310', 12, 40, 'piso'], ['SUC-ORIENTE', 'ATU-003', 'A2291', 400, 12, 'piso'], ['SUC-ORIENTE', 'REF-007', 'R551', 25, 8, 'almacen'],
  // Para «Escanear» en Centro: dos rojos y un vencido en piso (retirar), y refresco en almacen que vence
  // antes que el de piso (resurtir FEFO, «baja primero ese»).
  ['SUC-CENTRO', 'YOG-001', 'L0917', 2, 3, 'piso'], ['SUC-CENTRO', 'YOG-001', 'L0916', 3, 2, 'piso'], ['SUC-CENTRO', 'REF-007', 'R540', -2, 2, 'piso'],
  ['SUC-CENTRO', 'REF-007', 'R545', 30, 6, 'almacen', 'B-02-1'], ['SUC-CENTRO', 'REF-007', 'R570', 60, 4, 'almacen', 'B-02-2'], ['SUC-CENTRO', 'REF-007', 'R590', 100, 2, 'piso'],
];

/**
 * Ventas FICTICIAS (cajas por dia), detras del adaptador `FuenteVentas`. Leer las reales del ERP
 * es una propuesta con gate humano. Poniente vende pocas gomitas y Centro muchas: el agente debe
 * ver el lote verde de Poniente en riesgo con semanas de anticipacion.
 */
const G_GOM = completaClave('1952111100005');
const G_CHO = completaClave('1952111100006');
export const VENTAS_DEMO: Readonly<Record<string, number>> = {
  [`SUC-PONIENTE|${G_GOM}`]: 1.5, [`SUC-CENTRO|${G_GOM}`]: 4, [`SUC-ORIENTE|${G_GOM}`]: 2,
  [`SUC-CENTRO|${G_CHO}`]: 1, [`SUC-PONIENTE|${G_CHO}`]: 0.5,
  'SUC-CENTRO|19521111000010': 1, 'SUC-PONIENTE|19521111000010': 1,
};

/** Seudonimos fijos de la semilla: la cadena nunca lleva nombres. */
const OP = { cedis: 'op-5e1a0c01', centro: 'op-5e1a0c02', poniente: 'op-5e1a0c03', supervisor: 'op-5e1a0c09', sistema: 'op-apertura' } as const;

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

/** Las HH:00 de la operacion (Ciudad de Mexico, UTC-6 sin horario de verano) de hoy + `dias`, en UTC. */
function a(hoy: string, dias: number, hora: number): string {
  const [y = 1970, m = 1, d = 1] = sumaDias(hoy, dias).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hora + 6)).toISOString();
}

function lee(e: EstadoAlmacen, texto: string, dia: string): Interpretacion {
  const r = parseaLectura(texto);
  if (esErrorLectura(r)) throw new Error(`semilla: ${r.mensaje}`);
  return interpreta(r.elementos, e, dia);
}

/**
 * La historia del lote SUC03-L4471 (gomitas, 180 dias de vida util): entra al CEDIS por lectura
 * GS1-128 cumpliendo la regla de 2/3, se ubica en rack, se transfiere a Poniente, baja a piso y se
 * vende poco. Mas: la apertura del inventario, una correccion de conteo y un rechazo por 2/3.
 */
function historia(inicio: EstadoAlmacen, hoy: string): EstadoAlmacen {
  let e = inicio;
  const paso = <T>(p: Paso<T>): T => { if (!p.resultado.ok) throw new Error(`semilla: ${p.resultado.motivo}`); e = p.estado; return p.resultado.valor; };
  const gom: ClaveLote = { gtin: G_GOM, lote: 'SUC03-L4471', caducidad: sumaDias(hoy, 50) };
  const caja = `(01)${G_GOM}(17)${aAammdd(gom.caducidad)}(10)${gom.lote}`;
  const tarima = `(02)${G_GOM}(37)200(17)${aAammdd(gom.caducidad)}(10)${gom.lote}`;
  const recibido = paso(recibeConExpediente(e, lee(e, tarima, sumaDias(hoy, -80)), 'CEDIS-NTE', a(hoy, -80, 14), 'sem-r1', OP.cedis, tarima));
  paso(mueveConExpediente(e, { sitio: 'CEDIS-NTE', destino: 'almacen', lectura: lee(e, caja, sumaDias(hoy, -80)), veces: 200, operador: OP.cedis }, a(hoy, -80, 16), 'sem-m1', sumaDias(hoy, -80), 'B-04-2'));
  paso(transfiere(e, { origen: 'CEDIS-NTE', destino: 'SUC-PONIENTE', lote: gom, cajas: 120 }, sumaDias(hoy, -60), a(hoy, -60, 9), 'sem-t1', OP.cedis));
  paso(mueveConExpediente(e, { sitio: 'SUC-PONIENTE', destino: 'almacen', lectura: lee(e, caja, sumaDias(hoy, -60)), veces: 120, operador: OP.poniente }, a(hoy, -60, 15), 'sem-m2', sumaDias(hoy, -60), 'A-02-1'));
  paso(mueveConExpediente(e, { sitio: 'SUC-PONIENTE', destino: 'piso', lectura: lee(e, caja, sumaDias(hoy, -30)), veces: 10, operador: OP.poniente }, a(hoy, -30, 8), 'sem-m3', sumaDias(hoy, -30)));
  paso(salida(e, { sitio: 'SUC-PONIENTE', tipo: 'VENDIDO', lote: gom, cajas: 3 }, sumaDias(hoy, -20), a(hoy, -20, 20), OP.poniente));
  LOTES.forEach(([sitio, sku, lote, dias, cantidad, zona, posicion], i) => {
    const gtin = e.articulos[sku]?.gtinCaja ?? '';
    paso(altaConExpediente(e, { sitio, sku, gtin, lote, caducidad: sumaDias(hoy, dias), cantidad, zona }, 'semilla', a(hoy, -12, 7), `semilla-${i + 1}`, OP.sistema, { apertura: true }));
    if (posicion) paso(ubica(e, sitio, { gtin, lote, caducidad: sumaDias(hoy, dias) }, posicion, a(hoy, -12, 8), OP.sistema));
  });
  paso(salida(e, { sitio: 'SUC-PONIENTE', tipo: 'VENDIDO', lote: gom, cajas: 3 }, sumaDias(hoy, -10), a(hoy, -10, 20), OP.poniente));
  paso(salida(e, { sitio: 'SUC-PONIENTE', tipo: 'VENDIDO', lote: gom, cajas: 2 }, sumaDias(hoy, -2), a(hoy, -2, 20), OP.poniente));
  const ev = recibido.existencia ? e.eventos?.['CEDIS-NTE']?.[0] : undefined;
  if (ev) paso(corrige(e, { sitio: 'CEDIS-NTE', corrige: ev.hash, motivo: 'conteo físico en rack B-04-2: eran 198', ajuste: { zona: 'almacen', cajas: -2 } }, a(hoy, -1, 10), 'sem-c1', OP.supervisor));
  const corto = `(02)${G_GOM}(37)60(17)${aAammdd(sumaDias(hoy, 99))}(10)L5120`;
  paso(recibeConExpediente(e, lee(e, corto, sumaDias(hoy, -1)), 'SUC-CENTRO', a(hoy, -1, 11), 'sem-r2', OP.centro, corto));
  return e;
}

export function semillaFicticia(hoy: string): EstadoAlmacen {
  const cuando = aLasOcho(hoy);
  const base = estadoVacio({ prefijoEmpresa: '9521234', prefijoInterno: '04', extensionSscc: 0, sitios: SITIOS_DEMO });
  const registros = F.map((f) => Object.fromEntries(C.map((c, i) => [c, f[i] ?? ''])));
  const { filas, errores } = leeFilas(registros, CATEGORIAS_EJEMPLO.map((c) => c.id));
  const plan = planificaImportacion(filas, errores, base);
  const e = aplicaImportacion(base, plan, { id: 'semilla', archivo: 'semilla-ficticia', huella: 'sin-archivo', operador: 'semilla', fecha: cuando });
  return historia({ ...e, impresoras: IMPRESORAS_DEMO, consumibles: consumiblesFicticios(hoy) }, hoy);
}
