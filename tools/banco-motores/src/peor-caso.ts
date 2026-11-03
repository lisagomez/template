/**
 * Generador de datos de PEOR CASO, determinista y sintético. Es la parte comprobable del skill `break-ui`
 * de Emil Kowalski (su CATALOG.md, commit f1090bec): nombres largos y de una letra, correos que no se
 * cortan, texto no latino y de derecha a izquierda, cifras y montos enormes, colecciones vacías o gigantes,
 * fechas extremas y estados. Leer qué se rompió sigue siendo juicio (el skill, en el estante).
 *
 * Todo valor sale rotulado `sintetico: true`. Ninguno es de una persona real. El emoji va escapado: es dato
 * de usuario posible, no voz de la marca, y así el revisor de voz no lo confunde con copy.
 */
export const FAMILIAS = ['nombres', 'correos', 'etiquetas', 'cifras', 'montos', 'colecciones', 'fechas', 'textos', 'estados'] as const;
export type Familia = (typeof FAMILIAS)[number];

export interface DatoDePeorCaso {
  readonly familia: Familia;
  readonly valor: string | number;
  /** Qué rompe, dicho. */
  readonly rompe: string;
  readonly sintetico: true;
}

type Semilla = readonly [string | number, string];

const CATALOGO: Readonly<Record<Familia, readonly Semilla[]>> = {
  nombres: [
    ['María de los Ángeles Fernández-Villaseñor y Ruiz de Alarcón', 'nombre compuesto muy largo con acentos'],
    ['Ñ', 'una sola letra'],
    ['Wolfeschlegelsteinhausenbergerdorff Gutiérrez', 'apellido sin cortes'],
    ['王小明', 'escritura china'],
    ['محمد عبد الله', 'árabe, de derecha a izquierda'],
    ['Nguyễn Văn Ánh', 'diacríticos apilados'],
  ],
  correos: [
    ['nombre.apellido.segundoapellido.compras.sucursal-norte@subdominio.empresa-con-nombre-largo.com.mx', 'correo que no se puede cortar'],
    ['a@b.co', 'correo mínimo'],
    ['compras+facturas-octubre@ejemplo.mx', 'subdireccionamiento con +'],
  ],
  etiquetas: [
    ['Captura manual de facturas de proveedores nacionales y extranjeros con complemento de pago y retenciones', 'etiqueta larguísima'],
    ['X', 'etiqueta de un carácter'],
    ['', 'etiqueta vacía'],
    ['Tacos al pastor \u{1F32E} sucursal centro', 'emoji en un dato del usuario'],
  ],
  cifras: [
    [0, 'cero'], [-0.0001, 'negativo diminuto'], [1234567890123, 'trece dígitos'],
    [0.1 + 0.2, 'coma flotante (0.30000000000000004)'], [Number.MAX_SAFE_INTEGER, 'el entero seguro más grande'],
  ],
  montos: [['$0.00', 'monto cero'], ['$1,234,567,890.12 MXN', 'monto enorme con moneda'], ['-$45.50', 'monto negativo']],
  colecciones: [[0, 'lista vacía'], [1, 'un solo elemento'], [500, 'quinientos elementos']],
  fechas: [['2028-02-29', 'año bisiesto'], ['1970-01-01', 'época Unix'], ['9999-12-31', 'fin del calendario'], ['2026-11-02T23:59:59-06:00', 'a un segundo de cambiar de día']],
  textos: [['Electroencefalografistas'.repeat(6), 'palabra sin espacios de 144 letras'], ['   ', 'solo espacios']],
  estados: [['vacío', 'sin datos'], ['cargando', 'esperando al motor'], ['error', 'el motor falló'], ['lento', 'más de 30 s']],
};

/** mulberry32: el mismo número de semilla da siempre la misma secuencia. */
function generador(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Todos los datos de una familia, en un orden que depende solo de la semilla. */
export function peorCaso(familia: Familia, semilla = 25): readonly DatoDePeorCaso[] {
  const azar = generador(semilla + FAMILIAS.indexOf(familia));
  const datos = CATALOGO[familia].map(([valor, rompe]) => ({ familia, valor, rompe, sintetico: true as const }));
  return datos.map((d) => ({ d, k: azar() })).sort((x, y) => x.k - y.k).map((x) => x.d);
}

/** El catálogo entero, por familia. */
export function catalogoDePeorCaso(semilla = 25): Readonly<Record<Familia, readonly DatoDePeorCaso[]>> {
  return Object.fromEntries(FAMILIAS.map((f) => [f, peorCaso(f, semilla)])) as Record<Familia, readonly DatoDePeorCaso[]>;
}
