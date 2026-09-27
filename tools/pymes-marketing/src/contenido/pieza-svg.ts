/**
 * La imagen de cada pieza, generada POR CÓDIGO con la marca del cliente: un SVG determinista
 * (misma semilla, misma imagen), sin servicio de imágenes, sin coste y sin que nada salga de la
 * máquina. Sustituye al paso de Canva de la fuente (`canva-creator`), que exigía su conector.
 * La composición sigue el oficio que funciona en redes: una palabra grande, un solo acento de
 * color, mucho aire y el precio legible en pantalla de teléfono.
 */
import { azarDe, escapaXml, recorta } from '../comun/texto.js';
import { aclara, contraste } from '../marca/colores.js';
import type { PerfilDeMarca } from '../marca/perfil.js';

import { cajaSegura, FORMATOS, type CajaSegura, type FormatoDePieza } from './formatos.js';

export type { FormatoDePieza } from './formatos.js';

export interface DatosDePieza {
  readonly titular: string;
  readonly apoyo?: string;
  readonly precio?: string;
  readonly etiqueta?: string;
  readonly formato?: FormatoDePieza;
  readonly semilla: string;
}

export function lineasDeTitular(texto: string, porLinea: number, maxLineas: number): string[] {
  const palabras = recorta(texto, porLinea * maxLineas).split(/\s+/);
  const lineas: string[] = [];
  for (const p of palabras) {
    const ultima = lineas[lineas.length - 1];
    if (ultima !== undefined && `${ultima} ${p}`.length <= porLinea) lineas[lineas.length - 1] = `${ultima} ${p}`;
    else lineas.push(p);
  }
  return lineas.slice(0, maxLineas);
}

/** Dónde va cada cosa, calculado DENTRO de la zona segura. Lo usan la pieza y la revisión visual. */
export interface Disposicion {
  readonly ancho: number;
  readonly alto: number;
  readonly caja: CajaSegura;
  readonly escala: number;
  readonly lineas: readonly string[];
  readonly tamTitular: number;
  readonly yTitular: number;
  readonly yApoyo: number;
  readonly precio: { readonly x: number; readonly y: number; readonly ancho: number; readonly alto: number } | null;
  readonly yEtiqueta: number;
  readonly yFirma: number;
  readonly recortado: boolean;
}

export function disposicion(d: DatosDePieza): Disposicion {
  const f = FORMATOS[d.formato ?? 'vertical'];
  const caja = cajaSegura(f), k = Math.min(f.ancho, f.alto) / 1080, horizontal = f.ancho > f.alto;
  const px = (n: number) => Math.round(n * k);
  const porLinea = horizontal ? 20 : 14, maxLineas = horizontal ? 2 : 3;
  const lineas = lineasDeTitular(d.titular, porLinea, maxLineas);
  const tam = px(lineas.some((l) => l.length > 11) ? 104 : 124);
  const yEtiqueta = caja.y0 + px(40);
  const yTitular = Math.max(caja.y0 + px(170), Math.round(caja.y0 + (caja.y1 - caja.y0) * 0.3));
  const yApoyo = yTitular + Math.round(tam * 1.05) * (lineas.length - 1) + px(100);
  const yFirma = caja.y1 - px(10);
  const altoPrecio = px(130);
  const precio = d.precio ? { x: caja.x0, y: yFirma - px(90) - altoPrecio, ancho: px(Math.max(300, d.precio.length * 46 + 80)), alto: altoPrecio } : null;
  return { ancho: f.ancho, alto: f.alto, caja, escala: k, lineas, tamTitular: tam, yTitular, yApoyo, precio, yEtiqueta, yFirma, recortado: recorta(d.titular, porLinea * maxLineas) !== d.titular.trim() };
}

function fondo(m: PerfilDeMarca, w: number, h: number, semilla: string): string {
  const c = m.colores;
  const formas = Array.from({ length: 5 }, (_, i) => {
    const x = Math.round(azarDe(semilla, i) * w), y = Math.round(azarDe(semilla, i + 10) * h);
    const r = Math.round(120 + azarDe(semilla, i + 20) * 320);
    const color = i % 2 === 0 ? c.secundario : aclara(c.primario, 0.55);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${(0.10 + azarDe(semilla, i + 30) * 0.18).toFixed(2)}"/>`;
  }).join('');
  return `<rect width="${w}" height="${h}" fill="${c.fondo}"/>${formas}`;
}

/** SVG completo de la pieza. Todo texto se escapa: un nombre de producto nunca se vuelve marcado. */
export function piezaSvg(m: PerfilDeMarca, d: DatosDePieza): string {
  const L = disposicion(d), c = m.colores, x = L.caja.x0;
  const px = (n: number) => Math.round(n * L.escala);
  const cuerpo = escapaXml(m.tipografia.cuerpo);
  const tinta = contraste(c.primario, c.fondo) >= 4.5 ? c.primario : c.texto;
  const titular = L.lineas.map((l, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : Math.round(L.tamTitular * 1.05)}">${escapaXml(l)}</tspan>`).join('');
  const apoyo = d.apoyo ? `<text x="${x}" y="${L.yApoyo}" font-family="${cuerpo}" font-size="${px(44)}" fill="${c.texto}">${escapaXml(recorta(d.apoyo, 42))}</text>` : '';
  const blanco = contraste('#ffffff', c.primario) >= 3 ? '#ffffff' : c.texto;
  const P = L.precio;
  const precio = d.precio && P ? `<g><rect x="${P.x}" y="${P.y}" width="${P.ancho}" height="${P.alto}" rx="${P.alto / 2}" fill="${c.primario}"/><text x="${P.x + px(40)}" y="${P.y + px(88)}" font-family="${cuerpo}" font-size="${px(72)}" font-weight="700" fill="${blanco}">${escapaXml(d.precio)}</text></g>` : '';
  const etiqueta = d.etiqueta ? `<text x="${x}" y="${L.yEtiqueta}" font-family="${cuerpo}" font-size="${px(36)}" letter-spacing="${px(6)}" fill="${c.texto}" opacity="0.75">${escapaXml(recorta(d.etiqueta.toUpperCase(), 32))}</text>` : '';
  const firma = `<text x="${x}" y="${L.yFirma}" font-family="${escapaXml(m.tipografia.titulos)}" font-size="${px(46)}" fill="${tinta}">${escapaXml(recorta(m.nombre, 36))}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.ancho} ${L.alto}" width="${L.ancho}" height="${L.alto}" role="img" aria-label="${escapaXml(d.titular)}">`
    + `${fondo(m, L.ancho, L.alto, d.semilla)}${etiqueta}`
    + `<text x="${x}" y="${L.yTitular}" font-family="${escapaXml(m.tipografia.titulos)}" font-size="${L.tamTitular}" font-weight="700" fill="${tinta}">${titular}</text>`
    + `${apoyo}${precio}${firma}</svg>`;
}

/** Data URL lista para un <img>: la pieza se ve y se descarga sin subirla a ningún lado. */
export function piezaComoDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
