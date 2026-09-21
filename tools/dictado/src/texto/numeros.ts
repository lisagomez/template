/**
 * Cantidades dichas en espanol (es-MX), en una sola gramatica que comparten el picking, el dictado
 * y la calibracion (antes habia dos copias distintas que cubrian 0-999 y nada mas).
 *
 * Entiende: cifras con separador es-MX («1,500» = 1500; «2.5» = 2,5) · unidades, decenas con y sin
 * «y», centenas completas (con femenino), «mil» y «N mil» hasta 999 999 · decimales dichos («coma
 * cinco», «punto cinco», «y medio», «y cuarto») · colectivos (media docena, docena, decena, ciento,
 * millar, y sus plurales multiplicados: «dos docenas» = 24) · y la unidad que sigue al numero
 * (piezas, cajas, kilos…), capturada SIN consumir el numero. «Par/pares» es unidad, no
 * colectivo: en un almacen «tres pares de guantes» son tres, no seis; se dice aqui para que nadie
 * lo espere al reves.
 *
 * Lo que queda fuera, a proposito: millones (un pedido no los dicta), multiplicativos («el doble»),
 * fracciones raras («tres octavos») y SKUs. Puro: sin modelo y sin dependencias.
 */

export interface Cantidad {
  valor: number;
  /** La unidad dicha justo despues, normalizada al singular, si la hubo. */
  unidad?: string;
  forma: 'cifras' | 'palabras' | 'colectivo';
  /** Posicion (en tokens normalizados) donde empezo y cuantos tokens consumio: util para seguir leyendo. */
  desde: number;
  tokens: number;
}

const UNIDADES: Record<string, number> = {
  cero: 0, un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
const DECENAS: Record<string, number> = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const CENTENAS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400,
  quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600, setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800,
  novecientos: 900, novecientas: 900,
};
/** Colectivos: cuanto vale uno, y si «media» delante lo parte. */
const COLECTIVOS: Record<string, number> = { docena: 12, docenas: 12, decena: 10, decenas: 10, ciento: 100, cientos: 100, millar: 1000, millares: 1000 };
const FRACCIONES: Record<string, number> = { medio: 0.5, media: 0.5, cuarto: 0.25 };
/** Unidades que suelen seguir a una cantidad dictada; se normalizan al singular. */
const UNIDADES_MEDIDA: Record<string, string> = {
  unidad: 'unidad', unidades: 'unidad', pieza: 'pieza', piezas: 'pieza', pza: 'pieza', pzas: 'pieza', caja: 'caja', cajas: 'caja', paquete: 'paquete', paquetes: 'paquete',
  bolsa: 'bolsa', bolsas: 'bolsa', par: 'par', pares: 'par', kilo: 'kilo', kilos: 'kilo', kg: 'kilo', kilogramo: 'kilo', kilogramos: 'kilo', gramo: 'gramo', gramos: 'gramo',
  litro: 'litro', litros: 'litro', metro: 'metro', metros: 'metro', rollo: 'rollo', rollos: 'rollo', tarima: 'tarima', tarimas: 'tarima', charola: 'charola', charolas: 'charola',
  botella: 'botella', botellas: 'botella', lata: 'lata', latas: 'lata', saco: 'saco', sacos: 'saco', tramo: 'tramo', tramos: 'tramo',
};

const sinAcentos = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Tokens en minusculas sin acentos; las cifras conservan su separador interno («1,500», «2.5», «12%»). */
export const tokenizaNumeros = (texto: string): string[] =>
  sinAcentos(texto.toLowerCase())
    .replace(/[^a-z0-9ñ%.,\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[.,]+|[.,]+$/g, ''))
    .filter(Boolean);

/** Una cifra escrita: «1,500» (miles es-MX) → 1500; «2.5» → 2,5; «12%» → 12. */
function cifra(token: string): number | undefined {
  const m = /^(\d[\d,]*)(?:\.(\d+))?%?$/.exec(token);
  if (!m) return undefined;
  const entero = Number(m[1]?.replace(/,/g, '') ?? '0');
  const decimal = m[2] ? Number(`0.${m[2]}`) : 0;
  return Number.isFinite(entero) ? entero + decimal : undefined;
}

interface Parcial {
  valor: number;
  tokens: number;
  forma: Cantidad['forma'];
}

/** Lee un numero en palabras desde `i`: 0-9999, con «mil». Devuelve cuanto consumio. */
function palabras(tokens: readonly string[], i: number): Parcial | undefined {
  let j = i;
  let total = 0;
  let parcial = 0;
  let visto = false;
  let hayMil = false;
  while (j < tokens.length) {
    const t = tokens[j] ?? '';
    if (t === 'mil' && !hayMil) {
      total += (visto ? parcial : 1) * 1000;
      parcial = 0;
      visto = true;
      hayMil = true;
      j++;
      continue;
    }
    if (CENTENAS[t] !== undefined && parcial < 100) {
      parcial += CENTENAS[t] ?? 0;
      visto = true;
      j++;
      continue;
    }
    if (DECENAS[t] !== undefined && parcial % 100 === 0) {
      parcial += DECENAS[t] ?? 0;
      visto = true;
      j++;
      // «cincuenta y dos», y tambien «cincuenta dos»: los motores se comen la «y» (medido el
      // 2026-09-20: «52» oido como «cincuenta dos» confirmo una linea de 50). La unidad suelta
      // tras una decena SIEMPRE suma; leerla aparte es lo que confirma mal.
      const sinY = UNIDADES[tokens[j] ?? ''];
      if (tokens[j] === 'y' && UNIDADES[tokens[j + 1] ?? ''] !== undefined && (UNIDADES[tokens[j + 1] ?? ''] ?? 0) < 10) {
        parcial += UNIDADES[tokens[j + 1] ?? ''] ?? 0;
        j += 2;
      } else if (sinY !== undefined && sinY > 0 && sinY < 10) {
        parcial += sinY;
        j += 1;
      }
      continue;
    }
    if (UNIDADES[t] !== undefined && parcial % 100 === 0) {
      parcial += UNIDADES[t] ?? 0;
      visto = true;
      j++;
      // «veinte y cinco» y «veinte cinco»: no son la forma normativa, pero los motores las escriben (medido el 2026-09-20).
      if (t === 'veinte' && tokens[j] === 'y' && UNIDADES[tokens[j + 1] ?? ''] !== undefined && (UNIDADES[tokens[j + 1] ?? ''] ?? 0) < 10) {
        parcial += UNIDADES[tokens[j + 1] ?? ''] ?? 0;
        j += 2;
      } else if (t === 'veinte' && UNIDADES[tokens[j] ?? ''] !== undefined && (UNIDADES[tokens[j] ?? ''] ?? 0) > 0 && (UNIDADES[tokens[j] ?? ''] ?? 0) < 10) {
        parcial += UNIDADES[tokens[j] ?? ''] ?? 0;
        j += 1;
      }
      continue;
    }
    break;
  }
  if (!visto) return undefined;
  return { valor: total + parcial, tokens: j - i, forma: 'palabras' };
}

/** «y medio», «y cuarto», «coma cinco», «punto cinco» tras un numero. */
function decimales(tokens: readonly string[], i: number): { valor: number; tokens: number } | undefined {
  const t = tokens[i] ?? '';
  if (t === 'y' && FRACCIONES[tokens[i + 1] ?? ''] !== undefined) return { valor: FRACCIONES[tokens[i + 1] ?? ''] ?? 0, tokens: 2 };
  if ((t === 'coma' || t === 'punto') && UNIDADES[tokens[i + 1] ?? ''] !== undefined) {
    let j = i + 1;
    let digitos = '';
    while (j < tokens.length && UNIDADES[tokens[j] ?? ''] !== undefined && (UNIDADES[tokens[j] ?? ''] ?? 0) < 10) {
      digitos += String(UNIDADES[tokens[j] ?? '']);
      j++;
    }
    return digitos ? { valor: Number(`0.${digitos}`), tokens: j - i } : undefined;
  }
  return undefined;
}

/** Cantidad que EMPIEZA en el token `i`, o nada. */
export function cantidadEn(tokens: readonly string[], i: number): Cantidad | undefined {
  const t = tokens[i] ?? '';
  let base: Parcial | undefined;
  // «media docena», «medio kilo»
  if (FRACCIONES[t] !== undefined && t !== 'cuarto') {
    const col = COLECTIVOS[tokens[i + 1] ?? ''];
    if (col !== undefined) base = { valor: col * 0.5, tokens: 2, forma: 'colectivo' };
    else if (UNIDADES_MEDIDA[tokens[i + 1] ?? ''] !== undefined) base = { valor: 0.5, tokens: 1, forma: 'palabras' };
  }
  if (!base) {
    const c = cifra(t);
    if (c !== undefined) base = { valor: c, tokens: 1, forma: 'cifras' };
  }
  if (!base) base = palabras(tokens, i);
  if (!base) {
    // «docena», «una docena» ya cae en palabras (una=1) + colectivo abajo; «docena» a secas:
    const col = COLECTIVOS[t];
    if (col !== undefined && t !== 'ciento') base = { valor: col, tokens: 1, forma: 'colectivo' };
  }
  if (!base) return undefined;
  let { valor, tokens: consumidos, forma } = base;
  // «dos docenas», «un millar», «tres decenas»: el numero multiplica al colectivo
  const col = COLECTIVOS[tokens[i + consumidos] ?? ''];
  if (col !== undefined && forma !== 'colectivo' && Number.isInteger(valor) && valor > 0) {
    valor *= col;
    consumidos += 1;
    forma = 'colectivo';
    // «docena y media»
    if (tokens[i + consumidos] === 'y' && (tokens[i + consumidos + 1] === 'media' || tokens[i + consumidos + 1] === 'medio')) {
      valor += col * 0.5;
      consumidos += 2;
    }
  } else if (forma === 'colectivo' && tokens[i + consumidos] === 'y' && (tokens[i + consumidos + 1] === 'media' || tokens[i + consumidos + 1] === 'medio')) {
    valor += (COLECTIVOS[t] ?? 0) * 0.5;
    consumidos += 2;
  } else {
    const d = decimales(tokens, i + consumidos);
    if (d) {
      valor += d.valor;
      consumidos += d.tokens;
    }
  }
  const salida: Cantidad = { valor: Math.round(valor * 1000) / 1000, forma, desde: i, tokens: consumidos };
  const unidad = UNIDADES_MEDIDA[tokens[i + consumidos] ?? ''];
  if (unidad) salida.unidad = unidad;
  return salida;
}

/** La primera cantidad del texto, en cifras o en palabras. `undefined` si no hay ninguna. */
export function parseaCantidad(texto: string): Cantidad | undefined {
  const tokens = tokenizaNumeros(texto);
  for (let i = 0; i < tokens.length; i++) {
    const c = cantidadEn(tokens, i);
    if (c) return c;
  }
  return undefined;
}

/** Todas las cantidades del texto, en orden. */
export function parseaCantidades(texto: string): Cantidad[] {
  const tokens = tokenizaNumeros(texto);
  const salida: Cantidad[] = [];
  for (let i = 0; i < tokens.length; ) {
    const c = cantidadEn(tokens, i);
    if (c) {
      salida.push(c);
      i += c.tokens;
    } else i++;
  }
  return salida;
}

/** Primer numero del texto (valor), para quien solo quiere la cifra. */
export const primerNumero = (texto: string): number | undefined => parseaCantidad(texto)?.valor;

/**
 * Numeros en palabras → cifras en todo el texto («tres mil cuatrocientos doce» → «3412», «doce por
 * ciento» → «12 %»), para comparar una referencia dictada con la salida del motor sin contar como
 * error lo que un lector no notaria. Los colectivos NO se convierten: «una docena» sigue siendo eso.
 */
export function numerosACifras(texto: string): string {
  const tokens = tokenizaNumeros(texto);
  const salida: string[] = [];
  for (let i = 0; i < tokens.length; ) {
    const t = tokens[i] ?? '';
    if (t === 'por' && tokens[i + 1] === 'ciento') {
      salida.push('%');
      i += 2;
      continue;
    }
    const p = t === 'un' || t === 'una' || t === 'uno' ? undefined : palabras(tokens, i);
    if (p && p.tokens > 0 && !(p.tokens === 1 && (t === 'un' || t === 'una' || t === 'uno'))) {
      salida.push(String(p.valor));
      i += p.tokens;
    } else {
      salida.push(t);
      i++;
    }
  }
  return salida.join(' ').replace(/(\d+) por ciento/g, '$1 %').replace(/(\d+)\s*%/g, '$1 %');
}
