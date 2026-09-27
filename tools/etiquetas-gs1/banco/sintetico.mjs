#!/usr/bin/env node
/**
 * Corpus SINTETICO de fechas impresas: texto de impresora de inyeccion (matriz de puntos 5×7, con
 * el cero con diagonal de esas impresoras) y letra solida, sobre cinco fondos:
 *   blanco (carton, etiqueta) · burbuja (aire detras del PET) · liquido (refresco de cola detras)
 *   · rasante (luz de lado: la tinta brilla mas que el fondo) · solida (letra normal).
 * Cada imagen tiene DOS tomas (otro ruido y un giro leve), como la rafaga del celular.
 *
 *   node banco/sintetico.mjs <carpeta>      → <carpeta>/*.png + esperado.json
 *
 * Es sintetico y se dice: sirve para comparar motores entre si, no para fijar umbrales reales.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const F = {
  A: '01110 10001 10001 11111 10001 10001 10001', B: '11110 10001 10001 11110 10001 10001 11110', C: '01110 10001 10000 10000 10000 10001 01110',
  D: '11110 10001 10001 10001 10001 10001 11110', E: '11111 10000 10000 11110 10000 10000 11111', F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111', H: '10001 10001 10001 11111 10001 10001 10001', I: '01110 00100 00100 00100 00100 00100 01110',
  J: '00111 00010 00010 00010 00010 10010 01100', K: '10001 10010 10100 11000 10100 10010 10001', L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001', N: '10001 10001 11001 10101 10011 10001 10001', O: '01110 10001 10001 10001 10001 10001 01110',
  P: '11110 10001 10001 11110 10000 10000 10000', Q: '01110 10001 10001 10001 10101 10010 01101', R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100', U: '10001 10001 10001 10001 10001 10001 01110',
  V: '10001 10001 10001 10001 10001 01010 00100', W: '10001 10001 10001 10101 10101 10101 01010', X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 10001 01010 00100 00100 00100', Z: '11111 00001 00010 00100 01000 10000 11111',
  0: '01110 10001 10011 10101 11001 10001 01110', 1: '00100 01100 00100 00100 00100 00100 01110', 2: '01110 10001 00001 00010 00100 01000 11111',
  3: '11111 00010 00100 00010 00001 10001 01110', 4: '00010 00110 01010 10010 11111 00010 00010', 5: '11111 10000 11110 00001 00001 10001 01110',
  6: '00110 01000 10000 11110 10001 10001 01110', 7: '11111 00001 00010 00100 01000 01000 01000', 8: '01110 10001 10001 01110 10001 10001 01110',
  9: '01110 10001 10001 01111 00001 00010 01100', '/': '00001 00010 00010 00100 01000 01000 10000', '.': '00000 00000 00000 00000 00000 01100 01100',
  ':': '00000 01100 01100 00000 01100 01100 00000', '-': '00000 00000 00000 11111 00000 00000 00000', ' ': '00000 00000 00000 00000 00000 00000 00000',
}

/** Lo que dice cada imagen y lo que se espera leer. `ambigua`: lo correcto es ENSENAR las opciones. */
export const CONTENIDOS = [
  { id: 'cad-ddmmaa', lineas: ['CAD 30/10/26', 'L4471'], caducidad: '2026-10-30', lote: 'L4471' },
  { id: 'exp-puntos', lineas: ['EXP 15.03.27', 'L0917B'], caducidad: '2027-03-15', lote: 'L0917B' },
  { id: 'cons-pref-mes', lineas: ['CONS. PREF. 30 OCT 26', 'LOTE 88A1'], caducidad: '2026-10-30', lote: '88A1' },
  { id: 'best-before', lineas: ['BEST BEFORE 14/06/27'], caducidad: '2027-06-14' },
  { id: 'cad-pegado-mes', lineas: ['CAD31AGO27', 'L61450215A2'], caducidad: '2027-08-31', lote: 'L61450215A2' },
  { id: 'cad-seis-cifras', lineas: ['CAD 241127', 'L0503'], ambigua: ['2027-11-24', '2024-11-27'], lote: 'L0503' },
  { id: 'elab-derivada', lineas: ['ELAB 22/09/26', 'L5521'], caducidad: '2027-03-21', lote: 'L5521', vidaUtilDias: 180 },
  { id: 'sin-rotulo', lineas: ['03/04/27'], ambigua: ['2027-04-03', '2027-03-04'] },
  { id: 'mes-anio', lineas: ['CAD OCT 2027', 'L7788'], caducidad: '2027-10-31', lote: 'L7788' },
  { id: 'dd-mm-ambigua', lineas: ['CAD 07/11/26'], ambigua: ['2026-11-07', '2026-07-11'] },
  { id: 'remite', lineas: ['LOTE Y CADUCIDAD', 'IMPRESOS EN EL ENVASE'], sinFecha: true },
  { id: 'sin-fecha', lineas: ['13 CAJAS POR CAMA', 'CLAVE 12076239'], sinFecha: true },
]

export const FONDOS = {
  blanco: { fondo: 243, tinta: 18, ruido: 6 },
  burbuja: { fondo: 196, tinta: 28, ruido: 14 },
  liquido: { fondo: 40, tinta: 12, ruido: 7 },
  rasante: { fondo: 42, tinta: 108, ruido: 12 },
  solida: { fondo: 245, tinta: 20, ruido: 4, solida: true },
}

const P = 9

/** Circulos SVG de un texto en matriz de puntos 5×7 (tambien lo usan las capturas de la app). */
export function circulosDePuntos(lineas, x0, y0, paso, color, azar = Math.random) {
  let c = ''
  lineas.forEach((linea, li) => [...linea].forEach((ch, ci) => (F[ch] ?? F[' ']).split(' ').forEach((fila, fi) => [...fila].forEach((b, co) => {
    if (b !== '1') return
    const x = x0 + (ci * 6 + co) * paso + (azar() - 0.5) * paso * 0.2
    const y = y0 + (li * 10 + fi) * paso + (azar() - 0.5) * paso * 0.2
    c += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(paso * 0.37).toFixed(1)}" fill="${color}"/>`
  }))))
  return c
}

function svgPuntos(lineas, { fondo, tinta }, azar) {
  const ancho = 40 + Math.max(...lineas.map((l) => l.length)) * 6 * P
  const alto = 40 + lineas.length * 10 * P
  const g = (v) => `rgb(${v},${v},${v})`
  let circulos = ''
  lineas.forEach((linea, li) => [...linea].forEach((ch, ci) => (F[ch] ?? F[' ']).split(' ').forEach((fila, fi) => [...fila].forEach((b, co) => {
    if (b !== '1') return
    const x = 20 + (ci * 6 + co) * P + (azar() - 0.5) * 2
    const y = 20 + (li * 10 + fi) * P + (azar() - 0.5) * 2
    circulos += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(P * 0.37).toFixed(1)}" fill="${g(tinta)}"/>`
  }))))
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}"><rect width="100%" height="100%" fill="${g(fondo)}"/>${circulos}</svg>`, ancho, alto }
}

function svgSolida(lineas, { fondo, tinta }) {
  const ancho = 40 + Math.max(...lineas.map((l) => l.length)) * 30
  const alto = 30 + lineas.length * 62
  const g = (v) => `rgb(${v},${v},${v})`
  const textos = lineas.map((l, i) => `<text x="20" y="${60 + i * 62}" font-family="DejaVu Sans Mono, monospace" font-size="48" fill="${g(tinta)}">${l}</text>`).join('')
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}"><rect width="100%" height="100%" fill="${g(fondo)}"/>${textos}</svg>`, ancho, alto }
}

/** Generador pseudoaleatorio con semilla: el corpus sale igual cada vez. */
function azarCon(semilla) {
  let s = semilla >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 }
}

async function toma(contenido, nombreFondo, n) {
  const f = FONDOS[nombreFondo]
  const azar = azarCon([...`${contenido.id}${nombreFondo}${n}`].reduce((a, c) => a * 31 + c.charCodeAt(0), 7))
  const { svg } = f.solida ? svgSolida(contenido.lineas, f) : svgPuntos(contenido.lineas, f, azar)
  const { data, info } = await sharp(Buffer.from(svg)).greyscale().raw().toBuffer({ resolveWithObject: true })
  for (let i = 0; i < data.length; i++) data[i] = Math.max(0, Math.min(255, data[i] + Math.round((azar() + azar() + azar() - 1.5) * f.ruido)))
  const giro = n === 1 ? 0 : (azar() - 0.5) * 6
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 1 } }).blur(n === 1 ? 1.1 : 1.4)
    .rotate(giro, { background: { r: f.fondo, g: f.fondo, b: f.fondo } }).png().toBuffer()
}

export async function generaCorpus(carpeta) {
  mkdirSync(carpeta, { recursive: true })
  const esperado = []
  for (const c of CONTENIDOS) for (const fondo of Object.keys(FONDOS)) {
    const archivos = []
    for (const n of [1, 2]) {
      const archivo = `${c.id}--${fondo}--toma${n}.png`
      writeFileSync(join(carpeta, archivo), await toma(c, fondo, n))
      archivos.push(archivo)
    }
    esperado.push({ id: `${c.id}--${fondo}`, fondo, tomas: archivos, texto: c.lineas.join(' / '), ...c })
  }
  writeFileSync(join(carpeta, 'esperado.json'), JSON.stringify({ nota: 'Corpus SINTETICO generado por banco/sintetico.mjs (determinista). No sustituye fotos reales.', imagenes: esperado }, null, 1))
  return esperado
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const carpeta = process.argv[2] ?? '.datos/corpus-caducidades/sintetico'
  const e = await generaCorpus(carpeta)
  console.log(`${e.length} imágenes × 2 tomas en ${carpeta}`)
}
