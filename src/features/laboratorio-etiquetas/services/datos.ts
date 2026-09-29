/**
 * Los datos del laboratorio: SINTÉTICOS y dichos. Prefijo 952 (el que GS1 reserva para ejemplos),
 * sitios, artículos y lotes inventados, y un «hoy» FIJO para que cada corrida dé lo mismo.
 */
import {
  aAammdd, altaConExpediente, CATEGORIAS_EJEMPLO, completaClave, esErrorLectura, estadoVacio, interpreta, parseaLectura, sumaDiasIso,
  type Articulo, type EstadoAlmacen, type Evento, type Interpretacion, type Paso, type Zona,
} from '../../../../tools/etiquetas-gs1/dist/index.js';

export const HOY = '2026-10-15';
export const T = (h: number, m = 0, d = 0) => new Date(Date.UTC(2026, 9, 15 + d, h, m)).toISOString();
export const mas = (n: number) => sumaDiasIso(HOY, n);
export const OP = 'op-0a1b2c3d';
export const OTRO = 'op-5e6f7a8b';
export const SUPER = 'op-9c8d7e6f';
export const CENTRO = 'SUC-CENTRO';
export const PONIENTE = 'SUC-PONIENTE';
export const GLN_CENTRO = completaClave('952123490002');
export const SITIOS = [
  { clave: 'CEDIS-NTE', nombre: 'CEDIS Norte', tipo: 'cedis' as const, gln: completaClave('952123490001') },
  { clave: CENTRO, nombre: 'Sucursal Centro', tipo: 'sucursal' as const, gln: GLN_CENTRO },
  { clave: PONIENTE, nombre: 'Sucursal Poniente', tipo: 'sucursal' as const },
];
export const G = { YOG: '19521111000010', DUL: completaClave('1952111100002'), REF: '19521111000041' } as const;

const art = (sku: string, descripcion: string, categoria: string, gtinCaja: string, vidaUtilDias?: number): Articulo => ({
  sku, descripcion, categoria, sitios: SITIOS.map((s) => s.clave), marcaPropia: false, gtinCaja, reglaCaja: 'fabricante', unidadesPorCaja: 12, notas: [], ...(vidaUtilDias ? { vidaUtilDias } : {}),
});

export const ARTICULOS: Readonly<Record<string, Articulo>> = {
  'YOG-001': art('YOG-001', 'Yogurt natural 1 kg', 'lacteos', G.YOG, 35),
  'DUL-001': art('DUL-001', 'Gomitas surtidas 1 kg', 'dulceria', G.DUL, 90),
  'REF-007': art('REF-007', 'Refresco cola 600 ml', 'bebidas', G.REF, 120),
};

export const base = (): EstadoAlmacen => ({ ...estadoVacio({ prefijoEmpresa: '9521234', prefijoInterno: '04', sitios: SITIOS, categorias: CATEGORIAS_EJEMPLO }), articulos: ARTICULOS });

/** El paso del núcleo, o una excepción con su motivo (el caso la vuelve «falla» con evidencia). */
export function ok<T>(p: Paso<T>): { estado: EstadoAlmacen; valor: T; eventos: readonly Evento[] } {
  if (!p.resultado.ok) throw new Error(p.resultado.motivo);
  return { estado: p.estado, valor: p.resultado.valor, eventos: p.resultado.eventos };
}

export function lee(e: EstadoAlmacen, texto: string, hoy = HOY): Interpretacion {
  const r = parseaLectura(texto);
  if (esErrorLectura(r)) throw new Error(r.mensaje);
  return interpreta(r.elementos, e, hoy);
}

export const caja = (gtin: string, dias: number, lote: string, extra = '') => `(01)${gtin}(17)${aAammdd(mas(dias))}(10)${lote}${extra}`;
export const ubicacion = (z: string) => `(414)${GLN_CENTRO}(254)${z}`;

/** Da de alta lotes con su RECIBIDO en la cadena: [sku, lote, días para caducar, cajas, zona, sitio]. */
export function conLotes(lotes: readonly (readonly [string, string, number, number, Zona, string?])[], e0 = base()): EstadoAlmacen {
  let e = e0;
  lotes.forEach(([sku, lote, dias, cantidad, zona, sitio], i) => {
    e = ok(altaConExpediente(e, { sitio: sitio ?? CENTRO, sku, gtin: ARTICULOS[sku]!.gtinCaja!, lote, caducidad: mas(dias), cantidad, zona }, 'recepcion', T(7, i), `alta-${i}`, OP)).estado;
  });
  return e;
}

/** Sucursal Centro con un lote de cada color y un testigo de 137 cajas (la cantidad que el almacenista no debe ver). */
export const sitioSurtido = () => conLotes([
  ['YOG-001', 'A100', 30, 137, 'almacen'], ['YOG-001', 'B050', 20, 5, 'piso'], ['YOG-001', 'R003', 3, 4, 'piso'],
  ['YOG-001', 'X000', -1, 3, 'piso'], ['DUL-001', 'N010', 10, 6, 'piso'], ['REF-007', 'F200', 100, 8, 'recibo'],
]);
