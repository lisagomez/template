/**
 * Subtítulos grabados en la imagen (mucha gente ve sin sonido), con la marca del cliente, DENTRO de la
 * zona segura: el 35 % de abajo lo tapan los botones de la red. Se emiten como ASS para libass (ffmpeg).
 * Todo texto se escapa: lo dicho es dato, nunca una etiqueta de estilo (`{\…}`).
 */
import type { MarcaDeNegocio, Palabra } from './tipos.js';
import { FORMATO, ZONA_SEGURA } from './tipos.js';
import { aEditado, type Edl } from './cortes.js';

export interface Rotulo { inicio: number; fin: number; texto: string }

export const REGLAS_DE_ROTULO = { maxPalabras: 4, maxSegundos: 1.8, maxCaracteresPorLinea: 22, tamano: 68 } as const;

/** Agrupa palabras en rótulos cortos, en el tiempo del reel ya editado. Corrige nombres con el diccionario del negocio. */
export function rotulos(palabras: readonly Palabra[], edl: Edl, diccionario: Readonly<Record<string, string>> = {}): Rotulo[] {
  const salida: Rotulo[] = [];
  let actual: { inicio: number; fin: number; palabras: string[] } | null = null;
  for (const p of palabras) {
    const i = aEditado(p.inicio, edl), f = aEditado(p.fin, edl);
    if (i === null || f === null) continue;
    const texto = diccionario[p.texto.toLowerCase().replace(/[.,!?¿¡]/g, '')] ?? p.texto;
    const cierra = actual && (actual.palabras.length >= REGLAS_DE_ROTULO.maxPalabras || f - actual.inicio > REGLAS_DE_ROTULO.maxSegundos || i - actual.fin > 0.35);
    if (!actual || cierra) {
      if (actual) salida.push({ inicio: actual.inicio, fin: actual.fin, texto: actual.palabras.join(' ') });
      actual = { inicio: i, fin: f, palabras: [texto] };
    } else { actual.palabras.push(texto); actual.fin = f; }
    if (/[.!?]$/.test(p.texto) && actual) { salida.push({ inicio: actual.inicio, fin: actual.fin, texto: actual.palabras.join(' ') }); actual = null; }
  }
  if (actual) salida.push({ inicio: actual.inicio, fin: actual.fin, texto: actual.palabras.join(' ') });
  // Que un rótulo dure hasta que empieza el siguiente (máx. 0.4 s de más): leerlo no debe ser una carrera.
  return salida.map((r, k) => ({ ...r, fin: Math.min(r.fin + 0.4, salida[k + 1]?.inicio ?? r.fin + 0.4) }));
}

/** Texto del dueño → texto seguro para ASS: sin llaves ni barra invertida (serían etiquetas), sin saltos. */
export const escapaAss = (s: string): string => s.replace(/\\/g, '＼').replace(/\{/g, '｛').replace(/\}/g, '｝').replace(/[\r\n]+/g, ' ').slice(0, 120);

/** #RRGGBB → &H00BBGGRR (el orden de ASS). */
export function colorAss(hex: string, alfa = 0): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  const [r, g, b] = m ? [m[1], m[2], m[3]] : ['ff', 'ff', 'ff'];
  return `&H${alfa.toString(16).padStart(2, '0')}${b}${g}${r}`.toUpperCase();
}

const tiempoAss = (s: number): string => {
  const cs = Math.max(0, Math.round(s * 100));
  const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), seg = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(seg).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};

/** Parte en dos líneas si hace falta, para no pasar el ancho seguro. */
export function enLineas(texto: string, max = REGLAS_DE_ROTULO.maxCaracteresPorLinea): string[] {
  // Una «palabra» más larga que la línea (un código, una liga) se parte: si no, el rótulo se sale de la zona.
  const palabras = texto.split(/\s+/).flatMap((p) => (p.length > max ? p.match(new RegExp(`.{1,${max}}`, 'g')) ?? [p] : [p]));
  const lineas: string[] = [];
  let l = '';
  for (const p of palabras) {
    if (l && (l + ' ' + p).length > max) { lineas.push(l); l = p; } else l = l ? `${l} ${p}` : p;
  }
  if (l) lineas.push(l);
  return lineas;
}

/** Margen inferior del rótulo: por encima del 35 % que tapan los botones. */
export const MARGEN_INFERIOR = Math.round(FORMATO.alto * ZONA_SEGURA.abajo) + 20;
export const MARGEN_LATERAL = Math.round(FORMATO.ancho * ZONA_SEGURA.lados) + 24;

export function archivoAss(rs: readonly Rotulo[], marca: MarcaDeNegocio): string {
  const fuente = marca.tipografia === 'serif' ? 'DejaVu Serif' : 'DejaVu Sans';
  const cabecera = [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${FORMATO.ancho}`, `PlayResY: ${FORMATO.alto}`, 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Marca,${fuente},${REGLAS_DE_ROTULO.tamano},${colorAss(marca.colores.texto)},${colorAss(marca.colores.texto)},${colorAss(marca.colores.primario)},${colorAss(marca.colores.primario)},-1,0,0,0,100,100,0,0,3,14,0,2,${MARGEN_LATERAL},${MARGEN_LATERAL},${MARGEN_INFERIOR},1`,
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const eventos = rs.map((r) => `Dialogue: 0,${tiempoAss(r.inicio)},${tiempoAss(r.fin)},Marca,,0,0,0,,${enLineas(escapaAss(r.texto)).join('\\N')}`);
  return [...cabecera, ...eventos, ''].join('\n');
}

/** La caja que ocupa un rótulo (aproximada) — para comprobar que cae en la zona segura. */
export function cajaDeRotulo(r: Rotulo): { x0: number; x1: number; y0: number; y1: number } {
  const lineas = enLineas(escapaAss(r.texto));
  const ancho = Math.max(...lineas.map((l) => l.length)) * REGLAS_DE_ROTULO.tamano * 0.56 + 28;
  const alto = lineas.length * REGLAS_DE_ROTULO.tamano * 1.2 + 28;
  const y1 = FORMATO.alto - MARGEN_INFERIOR;
  return { x0: (FORMATO.ancho - ancho) / 2, x1: (FORMATO.ancho + ancho) / 2, y0: y1 - alto, y1 };
}

export function rotulosFueraDeZona(rs: readonly Rotulo[]): Rotulo[] {
  const lim = { x0: FORMATO.ancho * ZONA_SEGURA.lados, x1: FORMATO.ancho * (1 - ZONA_SEGURA.lados), y0: FORMATO.alto * ZONA_SEGURA.arriba, y1: FORMATO.alto * (1 - ZONA_SEGURA.abajo) };
  return rs.filter((r) => { const c = cajaDeRotulo(r); return c.x0 < lim.x0 || c.x1 > lim.x1 || c.y0 < lim.y0 || c.y1 > lim.y1; });
}
