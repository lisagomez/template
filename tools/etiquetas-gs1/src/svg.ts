/**
 * SVG de la etiqueta con bwip-js (BWIPP), desde el MISMO diseno que el ZPL.
 *
 * bwip-js es peerDependency opcional y se INYECTA (`MotorBwip`): el nucleo no lo importa, y la
 * app le pasa el suyo (`bwip-js` en Node, `bwip-js/browser` en el navegador). BWIPP ademas hace
 * su propio lint GS1: si el nucleo dejara pasar algo que la norma prohibe, bwip-js lo rechaza y
 * la discrepancia sale en las pruebas.
 *
 * El SVG usa las coordenadas de la impresora (puntos): cada modulo mide `puntosPorModulo`, asi
 * que el codigo del SVG y el de la Zebra tienen exactamente las mismas barras.
 */
import { aHri } from './elementos.js'
import type { Diseno, PiezaCodigo } from './etiqueta.js'
import type { Simbolo } from './elementos.js'

export interface MotorBwip {
  toSVG(opciones: { bcid: string; text: string; scale?: number; height?: number; includetext?: boolean; paddingwidth?: number; paddingheight?: number }): string
}

const escapaXml = (t: string): string => t.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** Solo las barras, a un modulo por unidad. Lanza si BWIPP rechaza los datos. */
export function barrasSvg(bwip: MotorBwip, simbolo: Simbolo): { viewBox: string; cuerpo: string; modulos: number } {
  const svg = bwip.toSVG({ bcid: 'gs1-128', text: aHri(simbolo), scale: 1, height: 10, includetext: false, paddingwidth: 0, paddingheight: 0 })
  const vb = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? '0 0 0 0'
  const cuerpo = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  return { viewBox: vb, cuerpo, modulos: Number(vb.split(' ')[2]) }
}

function codigoSvg(bwip: MotorBwip, p: PiezaCodigo): string {
  const b = barrasSvg(bwip, p.simbolo)
  const ancho = b.modulos * p.puntosPorModulo
  const hri = aHri(p.simbolo)
  return [
    `<svg x="${p.x}" y="${p.y}" width="${ancho}" height="${p.altoBarras}" viewBox="${b.viewBox}" preserveAspectRatio="none" data-codigo="${p.indice}" data-hri="${escapaXml(hri)}">${b.cuerpo}</svg>`,
    `<text x="${p.x + ancho / 2}" y="${p.y + p.altoBarras + p.altoHri}" font-size="${p.altoHri}" text-anchor="middle" font-family="'Arial Narrow', 'Helvetica Neue', Arial, sans-serif" font-weight="700">${escapaXml(hri)}</text>`,
  ].join('')
}

/** La etiqueta completa: fondo blanco, textos, lineas y codigos, en puntos de impresora. */
export function aSvg(diseno: Diseno, bwip: MotorBwip): string {
  const partes: string[] = [`<rect width="${diseno.ancho}" height="${diseno.alto}" fill="#fff"/>`]
  for (const p of diseno.piezas) {
    if (p.tipo === 'texto') partes.push(`<text x="${p.x}" y="${p.y + p.alto * 0.85}" font-size="${p.alto}" font-family="'Arial Narrow', 'Helvetica Neue', Arial, sans-serif" font-weight="700">${escapaXml(p.texto)}</text>`)
    else if (p.tipo === 'linea') partes.push(`<rect x="${p.x}" y="${p.y}" width="${p.ancho}" height="${p.alto}" fill="#000"/>`)
    else partes.push(codigoSvg(bwip, p))
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${diseno.ancho} ${diseno.alto}" width="${diseno.ancho}" height="${diseno.alto}" data-dpi="${diseno.dpi}">${partes.join('')}</svg>`
}
