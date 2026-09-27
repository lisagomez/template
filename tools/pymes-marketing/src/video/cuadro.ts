/**
 * El cuadro exacto de un instante: función pura de (escena, t). Sin reloj ni azar: el fondo se mueve
 * con senos de una semilla. Movimiento con carácter: entra con fuerza y se asienta (ease-out); el
 * precio «salta» con un rebote corto. Todo texto se escapa.
 */
import { azarDe, escapaXml } from '../comun/texto.js';
import { aclara } from '../marca/colores.js';
import type { Capa, Escena } from './escena.js';

const r2 = (n: number) => Math.round(n * 100) / 100;
const limita = (x: number) => Math.min(1, Math.max(0, x));
const salida = (p: number) => 1 - (1 - p) ** 3;
/** Rebote corto: pasa un poco de 1 y regresa (el «snap»). */
const rebote = (p: number) => { const c = 1.7; return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2; };

function fondo(e: Escena, t: number): string {
  const circulos = Array.from({ length: 5 }, (_, i) => {
    const bx = azarDe(e.semilla, i) * e.ancho, by = azarDe(e.semilla, i + 10) * e.alto;
    const r = 140 + azarDe(e.semilla, i + 20) * 360, fase = azarDe(e.semilla, i + 40) * Math.PI * 2;
    const x = bx + Math.sin(t * 0.7 + fase) * 110, y = by + Math.cos(t * 0.55 + fase) * 150;
    const color = i % 2 === 0 ? e.colores.secundario : aclara(e.colores.primario, 0.55);
    return `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="${color}" opacity="${r2(0.1 + azarDe(e.semilla, i + 30) * 0.18)}"/>`;
  }).join('');
  return `<rect width="${e.ancho}" height="${e.alto}" fill="${e.colores.fondo}"/>${circulos}`;
}

function capaSvg(c: Capa, t: number): string {
  const p = limita((t - c.entra) / c.dura);
  if (p <= 0) return '';
  const texto = `<text x="${c.x}" y="${c.y}" font-family="${escapaXml(c.fuente)}" font-size="${c.tam}" font-weight="${c.peso}" fill="${c.color}">${escapaXml(c.texto)}</text>`;
  if (c.animacion === 'aparece') return `<g opacity="${r2(salida(p))}">${texto}</g>`;
  if (c.animacion === 'sube') return `<g opacity="${r2(salida(p))}" transform="translate(0 ${r2((1 - salida(p)) * 60)})">${texto}</g>`;
  const s = r2(0.6 + 0.4 * rebote(p)), pas = c.pastilla;
  const cx = c.x + (pas?.ancho ?? 0) / 2, cy = c.y + (pas?.alto ?? 0) / 2;
  const fondoPrecio = pas ? `<rect x="${c.x}" y="${c.y}" width="${pas.ancho}" height="${pas.alto}" rx="${pas.alto / 2}" fill="${pas.color}"/>` : '';
  const numero = `<text x="${c.x + 40}" y="${c.y + Math.round((pas?.alto ?? 0) * 0.68)}" font-family="${escapaXml(c.fuente)}" font-size="${c.tam}" font-weight="${c.peso}" fill="${c.color}">${escapaXml(c.texto)}</text>`;
  return `<g opacity="${r2(limita(p * 3))}" transform="translate(${r2(cx)} ${r2(cy)}) scale(${s}) translate(${r2(-cx)} ${r2(-cy)})">${fondoPrecio}${numero}</g>`;
}

/**
 * Acercamiento lento de todo el contenido (3 % en toda la duración), anclado al margen izquierdo y al
 * centro vertical del texto: nunca se queda congelado y nada sale de la zona segura.
 */
function acercamiento(e: Escena, t: number): string {
  const x0 = Math.min(...e.capas.map((c) => c.x));
  const ys = e.capas.map((c) => c.y);
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2, s = r2(1 + 0.03 * limita(t / e.duracion));
  return `translate(${x0} ${r2(cy)}) scale(${s}) translate(${-x0} ${r2(-cy)})`;
}

export function cuadroSvg(e: Escena, t: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${e.ancho} ${e.alto}" width="${e.ancho}" height="${e.alto}">${fondo(e, t)}<g transform="${acercamiento(e, t)}">${e.capas.map((c) => capaSvg(c, t)).join('')}</g></svg>`;
}

/** Hoja de cuadros en SVG («ver con ojos» sin codificar): columnas × filas cuadros repartidos en el tiempo. */
export function hojaDeCuadrosSvg(e: Escena, columnas = 6, filas = 3, anchoCelda = 180): string {
  const altoCelda = Math.round((anchoCelda * e.alto) / e.ancho), n = columnas * filas, sep = 6;
  const celdas = Array.from({ length: n }, (_, i) => {
    const t = (e.duracion * i) / (n - 1 || 1), cx = (i % columnas) * (anchoCelda + sep), cy = Math.floor(i / columnas) * (altoCelda + sep);
    const interior = cuadroSvg(e, Math.min(t, e.duracion - 1 / e.fps)).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    return `<svg x="${cx}" y="${cy}" width="${anchoCelda}" height="${altoCelda}" viewBox="0 0 ${e.ancho} ${e.alto}">${interior}</svg>`;
  }).join('');
  const w = columnas * (anchoCelda + sep) - sep, h = filas * (altoCelda + sep) - sep;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#111"/>${celdas}</svg>`;
}
