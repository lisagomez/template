/**
 * Ventas desde un CSV exportado de la caja, la tienda en línea o un Excel. Las columnas se
 * reconocen por sinónimos en español e inglés; una fila que no se entiende se rechaza con su
 * número de línea y el motivo (nunca se adivina ni se omite).
 */
import { columna, leeCsv } from '../comun/csv.js';
import { leeImporte } from '../comun/dinero.js';
import { leeDia, ordenDeFechas } from '../comun/fechas.js';
import { huella, normaliza } from '../comun/texto.js';
import type { Exclusion, LineaDeVenta, VentasNormalizadas } from './tipos.js';

const SINONIMOS = {
  fecha: ['fecha', 'dia', 'date', 'fecha de venta', 'fecha venta'],
  producto: ['producto', 'articulo', 'concepto', 'descripcion', 'item', 'nombre del producto', 'product'],
  cantidad: ['cantidad', 'piezas', 'unidades', 'cant', 'qty', 'quantity'],
  importe: ['importe', 'total', 'monto', 'venta', 'subtotal', 'amount', 'total venta'],
  moneda: ['moneda', 'currency', 'divisa'],
  canal: ['canal', 'sucursal', 'tienda', 'medio', 'origen', 'channel'],
  cliente: ['cliente', 'customer', 'telefono', 'correo'],
} as const;

type Columnas = Record<keyof typeof SINONIMOS, number>;

function lineaDe(celdas: readonly string[], col: Columnas, linea: number, opciones: { canal: string; moneda: string; orden: 'dmy' | 'mdy' }): LineaDeVenta | string {
  const dia = leeDia(celdas[col.fecha] ?? '', opciones.orden);
  if (!dia) return `fecha «${celdas[col.fecha] ?? ''}» no se entiende (se espera día/mes/año o AAAA-MM-DD)`;
  const producto = (celdas[col.producto] ?? '').trim();
  if (!producto) return 'sin producto';
  const importe = leeImporte(celdas[col.importe] ?? '');
  if (!importe.ok) return importe.motivo;
  const moneda = (col.moneda >= 0 ? celdas[col.moneda]?.trim().toUpperCase() : '') || importe.moneda || opciones.moneda;
  const cantidad = col.cantidad >= 0 ? Number((celdas[col.cantidad] ?? '1').replace(',', '.')) : 1;
  if (!Number.isFinite(cantidad) || cantidad <= 0) return `cantidad «${celdas[col.cantidad]}» no es válida`;
  const cliente = col.cliente >= 0 && celdas[col.cliente] ? huella(normaliza(celdas[col.cliente]!)) : null;
  return {
    dia, producto, clave: normaliza(producto), cantidad, importe: { centavos: importe.centavos, moneda },
    canal: (col.canal >= 0 ? celdas[col.canal] : '') || opciones.canal, origen: 'csv', referencia: `csv:línea ${linea}`, cliente,
  };
}

export function ventasDesdeCsv(texto: string, opciones: { canal?: string; moneda?: string } = {}): VentasNormalizadas {
  const tabla = leeCsv(texto);
  const col = Object.fromEntries(Object.entries(SINONIMOS).map(([k, s]) => [k, columna(tabla.encabezados, s)])) as Columnas;
  const faltan = (['fecha', 'producto', 'importe'] as const).filter((k) => col[k] < 0);
  if (faltan.length) {
    return { lineas: [], excluidas: [], avisos: [`no encontré la(s) columna(s) de ${faltan.join(', ')}; encabezados: ${tabla.encabezados.join(' | ') || '(vacío)'}`] };
  }
  const orden = ordenDeFechas(tabla.filas.map((f) => f.celdas[col.fecha] ?? ''));
  const avisos: string[] = [];
  if (orden.certeza === 'ambigua') avisos.push('ninguna fecha delata si es día/mes o mes/día (todas ≤ 12): se leyeron como día/mes; confírmalo');
  if (orden.certeza === 'contradictoria') avisos.push('el archivo mezcla fechas día/mes y mes/día: se leyeron como día/mes y conviene revisarlo');
  if (orden.orden === 'mdy') avisos.push('las fechas vienen mes/día/año (lo delata el propio archivo) y así se leyeron');
  const lineas: LineaDeVenta[] = [];
  const excluidas: Exclusion[] = tabla.rechazadas.map((r) => ({ referencia: `csv:línea ${r.linea}`, motivo: r.motivo }));
  for (const f of tabla.filas) {
    const r = lineaDe(f.celdas, col, f.linea, { canal: opciones.canal ?? 'mostrador', moneda: opciones.moneda ?? 'MXN', orden: orden.orden });
    if (typeof r === 'string') excluidas.push({ referencia: `csv:línea ${f.linea}`, motivo: r });
    else lineas.push(r);
  }
  if (col.cantidad < 0) avisos.push('el archivo no trae columna de cantidad: cada fila cuenta como 1 pieza (no hay velocidad real)');
  return { lineas, excluidas, avisos };
}

/** Junta varias fuentes (p. ej. CFDI + CSV de la caja) en una sola lista. */
export function juntaVentas(...fuentes: readonly VentasNormalizadas[]): VentasNormalizadas {
  return {
    lineas: fuentes.flatMap((f) => f.lineas),
    excluidas: fuentes.flatMap((f) => f.excluidas),
    avisos: [...new Set(fuentes.flatMap((f) => f.avisos))],
    notasDeCredito: fuentes.reduce((s, f) => ({ centavos: s.centavos + (f.notasDeCredito?.centavos ?? 0), cuantas: s.cuantas + (f.notasDeCredito?.cuantas ?? 0) }), { centavos: 0, cuantas: 0 }),
  };
}
