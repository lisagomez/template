/**
 * Cuadros para la camara FALSA de las capturas: la cara de una caja (carton) con el EAN-13 del
 * proveedor arriba y la fecha en tinta de puntos 5×7 (con el cero con diagonal) en la franja que
 * cubre la guia de encuadre. Todo ficticio (prefijo 952). El texto de puntos sale del mismo
 * generador que el corpus sintetico del banco.
 */
import sharp from 'sharp';
import bwipjs from 'bwip-js/node';
import { circulosDePuntos } from '../../../../tools/etiquetas-gs1/banco/sintetico.mjs';

export async function cuadroDeCaja(lineas, { fondo = '#d9c7a7', tinta = '#1a1a1a', ean, solida = false } = {}) {
  const P = 11;
  const ancho = Math.max(...lineas.map((l) => l.length)) * 6 * P;
  const x0 = Math.round((1280 - ancho) / 2);
  const texto = solida
    ? lineas.map((l, i) => `<text x="640" y="${330 + i * 62}" text-anchor="middle" font-family="DejaVu Sans Mono" font-weight="bold" font-size="54" fill="${tinta}">${l}</text>`).join('')
    : circulosDePuntos(lineas, x0, 290, P, tinta, () => 0.5);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="100%" height="100%" fill="${fondo}"/><text x="40" y="690" font-family="DejaVu Sans" font-size="26" fill="#6b5a3e">HECHO EN MEXICO · CONSERVESE EN LUGAR FRESCO</text>${texto}</svg>`;
  const capas = ean ? [{ input: await bwipjs.toBuffer({ bcid: 'ean13', text: ean, scale: 3, height: 22, includetext: true, paddingwidth: 12, paddingheight: 6, backgroundcolor: 'FFFFFF' }), left: 60, top: 30 }] : [];
  return sharp(Buffer.from(svg)).composite(capas).png().toBuffer();
}
