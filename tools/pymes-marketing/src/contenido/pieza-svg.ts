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

export type FormatoDePieza = 'cuadrado' | 'vertical' | 'historia' | 'horizontal';

const MEDIDAS: Readonly<Record<FormatoDePieza, readonly [number, number]>> = {
  cuadrado: [1080, 1080],
  vertical: [1080, 1350],
  historia: [1080, 1920],
  horizontal: [1200, 630],
};

export interface DatosDePieza {
  readonly titular: string;
  readonly apoyo?: string;
  readonly precio?: string;
  readonly etiqueta?: string;
  readonly formato?: FormatoDePieza;
  readonly semilla: string;
}

function lineasDeTitular(texto: string, porLinea: number): string[] {
  const palabras = recorta(texto, porLinea * 3).split(/\s+/);
  const lineas: string[] = [];
  for (const p of palabras) {
    const ultima = lineas[lineas.length - 1];
    if (ultima !== undefined && `${ultima} ${p}`.length <= porLinea) lineas[lineas.length - 1] = `${ultima} ${p}`;
    else lineas.push(p);
  }
  return lineas.slice(0, 3);
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
  const [w, h] = MEDIDAS[d.formato ?? 'vertical'];
  const k = Math.min(w, h) / 1080, horizontal = w > h;
  const c = m.colores, margen = Math.round(96 * k);
  const px = (n: number) => Math.round(n * k);
  const cuerpo = escapaXml(m.tipografia.cuerpo);
  const tinta = contraste(c.primario, c.fondo) >= 4.5 ? c.primario : c.texto;
  const lineas = lineasDeTitular(d.titular, horizontal ? 20 : 14).slice(0, horizontal ? 2 : 3);
  const tam = px(lineas.some((l) => l.length > 11) ? 104 : 124);
  const yTitular = Math.round(h * (horizontal ? 0.3 : 0.34));
  const titular = lineas.map((l, i) => `<tspan x="${margen}" dy="${i === 0 ? 0 : Math.round(tam * 1.05)}">${escapaXml(l)}</tspan>`).join('');
  const yApoyo = yTitular + Math.round(tam * 1.05) * (lineas.length - 1) + px(100);
  const apoyo = d.apoyo ? `<text x="${margen}" y="${yApoyo}" font-family="${cuerpo}" font-size="${px(44)}" fill="${c.texto}">${escapaXml(recorta(d.apoyo, 42))}</text>` : '';
  const alto = px(130), yPrecio = h - px(150) - alto - px(60);
  const blanco = contraste('#ffffff', c.primario) >= 3 ? '#ffffff' : c.texto;
  const precio = d.precio ? `<g><rect x="${margen}" y="${yPrecio}" width="${px(Math.max(300, d.precio.length * 46 + 80))}" height="${alto}" rx="${alto / 2}" fill="${c.primario}"/><text x="${margen + px(40)}" y="${yPrecio + px(88)}" font-family="${cuerpo}" font-size="${px(72)}" font-weight="700" fill="${blanco}">${escapaXml(d.precio)}</text></g>` : '';
  const etiqueta = d.etiqueta ? `<text x="${margen}" y="${margen + px(40)}" font-family="${cuerpo}" font-size="${px(36)}" letter-spacing="${px(6)}" fill="${c.texto}" opacity="0.75">${escapaXml(recorta(d.etiqueta.toUpperCase(), 32))}</text>` : '';
  const firma = `<rect x="0" y="${h - px(150)}" width="${w}" height="${px(150)}" fill="${c.primario}" opacity="0.08"/><text x="${margen}" y="${h - px(60)}" font-family="${escapaXml(m.tipografia.titulos)}" font-size="${px(46)}" fill="${tinta}">${escapaXml(recorta(m.nombre, 36))}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${escapaXml(d.titular)}">`
    + `${fondo(m, w, h, d.semilla)}${etiqueta}`
    + `<text x="${margen}" y="${yTitular}" font-family="${escapaXml(m.tipografia.titulos)}" font-size="${tam}" font-weight="700" fill="${tinta}">${titular}</text>`
    + `${apoyo}${precio}${firma}</svg>`;
}

/** Data URL lista para un <img>: la pieza se ve y se descarga sin subirla a ningún lado. */
export function piezaComoDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
