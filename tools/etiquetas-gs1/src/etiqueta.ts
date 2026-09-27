/**
 * El modelo de etiqueta y su DISENO en puntos de impresora.
 *
 * El diseno es una lista de piezas (textos, codigos, lineas) en coordenadas de la impresora. De
 * esa MISMA lista salen el ZPL (`zpl.ts`) y el SVG (`svg.ts`): por eso las dos salidas no
 * pueden divergir en posicion, grosor ni contenido del codigo.
 *
 * Estructuras (GS1 + estandar de la casa): caja (01)(17)(10); tarima (00)(02)(37)(17)(10), con
 * el lote siempre al final. La tarima va en DOS codigos: (02)(37)(17)(10) arriba y el SSCC (00)
 * solo, abajo — asi lo pide la guia de etiqueta logistica, y ademas los cinco juntos pasan de
 * 48 caracteres en cuanto el lote tiene mas de cero.
 */
import { valorDe, type Elemento, type Simbolo } from './elementos.js'
import { aAammdd, esFecha, fechaLegible, parseaFechaGs1 } from './fechas.js'
import { mejorGrosor, mideSimbolo, mmAPuntos, type MedidaSimbolo, type PerfilLectura, type TipoUnidad } from './medidas.js'

export interface PerfilImpresora {
  readonly id: string
  readonly nombre: string
  readonly sitio: string
  readonly dpi: 203 | 300 | 600
  readonly anchoMm: number
  readonly altoMm: number
  /** ^LH: origen de la etiqueta, en puntos. */
  readonly origenX: number
  readonly origenY: number
  /** ^LS: corrimiento horizontal de todo el formato, en puntos (-9999..9999). */
  readonly corrimientoIzq: number
  /** ^LT: corrimiento vertical, en puntos (-120..120). */
  readonly corrimientoSup: number
  /** ^MD: oscuridad relativa (-30..30). */
  readonly oscuridad: number
  /** ^PR: velocidad de impresion en pulgadas por segundo (2..14). */
  readonly velocidad: number
  readonly perfilLectura: PerfilLectura
}

export interface DatosCaja {
  readonly tipo: 'caja'
  readonly producto: string
  readonly gtin: string
  /** ISO `AAAA-MM-DD`. */
  readonly caducidad: string
  /** Codificar solo año y mes (DD=00). */
  readonly diaCero?: boolean
  readonly lote: string
  readonly sitio?: string
  readonly unidades?: number
}

export interface DatosTarima {
  readonly tipo: 'tarima'
  readonly producto: string
  readonly sscc: string
  readonly gtinContenido: string
  readonly cantidad: number
  readonly caducidad: string
  readonly diaCero?: boolean
  readonly lote: string
  readonly sitio?: string
}

export type DatosEtiqueta = DatosCaja | DatosTarima

export function simbolosDe(d: DatosEtiqueta): Simbolo[] {
  const cad = aAammdd(d.caducidad, d.diaCero)
  if (d.tipo === 'caja') return [[{ ai: '01', valor: d.gtin }, { ai: '17', valor: cad }, { ai: '10', valor: d.lote }]]
  return [
    [{ ai: '02', valor: d.gtinContenido }, { ai: '37', valor: String(d.cantidad) }, { ai: '17', valor: cad }, { ai: '10', valor: d.lote }],
    [{ ai: '00', valor: d.sscc }],
  ]
}

/** Titulos de datos (texto no HRI) al estilo de la guia de etiqueta logistica, en castellano. */
const TITULOS: Readonly<Record<string, string>> = {
  '00': 'SSCC', '01': 'GTIN', '02': 'CONTENIDO', '37': 'CANTIDAD', '17': 'CADUCIDAD', '15': 'CONSUMIR ANTES',
  '11': 'PRODUCCIÓN', '13': 'EMPAQUE', '10': 'LOTE', '21': 'SERIE',
}

export function lineasLegibles(simbolos: readonly Simbolo[], anioActual: number): string[] {
  const todos: Elemento[] = simbolos.flat()
  return todos.filter((e) => TITULOS[e.ai]).map((e) => {
    let valor = e.valor
    if (['17', '15', '11', '13'].includes(e.ai)) {
      const f = parseaFechaGs1(e.valor, anioActual)
      valor = esFecha(f) ? fechaLegible(f) : e.valor
    }
    if (e.ai === '00' && valor.length === 18) valor = `${valor[0]} ${valor.slice(1, 8)} ${valor.slice(8, 17)} ${valor[17]}`
    return `${TITULOS[e.ai]}: ${valor}`
  })
}

export interface PiezaTexto {
  readonly tipo: 'texto'
  readonly x: number
  readonly y: number
  readonly alto: number
  readonly texto: string
}

export interface PiezaCodigo {
  readonly tipo: 'codigo'
  readonly x: number
  readonly y: number
  readonly altoBarras: number
  readonly puntosPorModulo: number
  readonly simbolo: Simbolo
  readonly indice: number
  /** Alto del texto legible (HRI) que va debajo de las barras. */
  readonly altoHri: number
}

export interface PiezaLinea {
  readonly tipo: 'linea'
  readonly x: number
  readonly y: number
  readonly ancho: number
  readonly alto: number
}

export type Pieza = PiezaTexto | PiezaCodigo | PiezaLinea

export interface Diseno {
  readonly ancho: number
  readonly alto: number
  readonly dpi: number
  readonly piezas: readonly Pieza[]
  readonly medidas: readonly MedidaSimbolo[]
  readonly unidad: TipoUnidad
  /** Ancho util para codigos (la etiqueta menos 1 mm de seguridad por lado), en puntos. */
  readonly anchoUtilCodigo: number
}

export interface EntradaDiseno {
  readonly simbolos: readonly Simbolo[]
  readonly titulo: string
  readonly lineas: readonly string[]
  readonly unidad: TipoUnidad
  /** Puntos por modulo fijos para todos los codigos; si falta, el mayor que quepa. */
  readonly grosor?: number
}

/** Ancho aproximado de un texto en la fuente 0 de Zebra (escalable, condensada). */
export function anchoTexto(texto: string, alto: number): number {
  return Math.round(texto.length * alto * 0.52)
}

function recorta(texto: string, alto: number, ancho: number): string {
  if (anchoTexto(texto, alto) <= ancho) return texto
  const cabe = Math.max(4, Math.floor(ancho / (alto * 0.52)) - 3)
  return texto.slice(0, cabe) + '...'
}

export function disenaEtiqueta(entrada: EntradaDiseno, perfil: PerfilImpresora): Diseno {
  const { dpi } = perfil
  const ancho = mmAPuntos(perfil.anchoMm, dpi)
  const alto = mmAPuntos(perfil.altoMm, dpi)
  const margen = mmAPuntos(2.5, dpi)
  const anchoUtilCodigo = ancho - 2 * mmAPuntos(1, dpi)
  const piezas: Pieza[] = []
  const tarima = entrada.unidad === 'tarima'
  const altoTitulo = mmAPuntos(tarima ? 6 : 4.5, dpi)
  const altoLinea = mmAPuntos(tarima ? 4 : 3.2, dpi)
  const hueco = mmAPuntos(1.2, dpi)

  let y = margen
  piezas.push({ tipo: 'texto', x: margen, y, alto: altoTitulo, texto: recorta(entrada.titulo, altoTitulo, ancho - 2 * margen) })
  y += altoTitulo + hueco
  // En caja las lineas van de dos en dos para ahorrar alto; en tarima, una por renglon.
  const renglones: string[] = []
  const lineas = [...entrada.lineas]
  if (!tarima) while (lineas.length) renglones.push(lineas.splice(0, 2).join('   '))
  else renglones.push(...lineas)
  for (const r of renglones) {
    piezas.push({ tipo: 'texto', x: margen, y, alto: altoLinea, texto: recorta(r, altoLinea, ancho - 2 * margen) })
    y += altoLinea + hueco
  }
  if (tarima) {
    piezas.push({ tipo: 'linea', x: margen, y, ancho: ancho - 2 * margen, alto: Math.max(2, mmAPuntos(0.4, dpi)) })
    y += hueco * 2
  }

  const k = Math.max(1, entrada.simbolos.length)
  const altoHri = mmAPuntos(tarima ? 3.2 : 2.8, dpi)
  const disponible = alto - y - margen
  const porCodigo = Math.floor(disponible / k)
  const altoBarras = Math.max(mmAPuntos(3, dpi), Math.min(mmAPuntos(35, dpi), porCodigo - altoHri - 2 * hueco))
  const medidas: MedidaSimbolo[] = []
  entrada.simbolos.forEach((simbolo, indice) => {
    const grosor = entrada.grosor ?? mejorGrosor(simbolo, anchoUtilCodigo, dpi, entrada.unidad) ?? 1
    const medida = mideSimbolo(simbolo, grosor, dpi)
    medidas.push(medida)
    const x = Math.max(0, Math.round((ancho - medida.anchoPuntos) / 2))
    piezas.push({ tipo: 'codigo', x, y, altoBarras, puntosPorModulo: grosor, simbolo, indice, altoHri })
    y += altoBarras + altoHri + 2 * hueco
  })
  return { ancho, alto, dpi, piezas, medidas, unidad: entrada.unidad, anchoUtilCodigo }
}

/** Diseno directo desde los datos de una caja o tarima. */
export function disenaDesdeDatos(d: DatosEtiqueta, perfil: PerfilImpresora, anioActual: number, grosor?: number): Diseno {
  const simbolos = simbolosDe(d)
  const lineas = lineasLegibles(simbolos, anioActual).filter((l) => !(d.tipo === 'caja' && l.startsWith('GTIN')))
  if (d.tipo === 'caja' && d.unidades) lineas.push(`UNIDADES: ${d.unidades}`)
  if (d.sitio) lineas.push(`SITIO: ${d.sitio}`)
  return disenaEtiqueta({ simbolos, titulo: d.producto, lineas, unidad: d.tipo, ...(grosor ? { grosor } : {}) }, perfil)
}

/** Los codigos de un diseno, en orden. */
export function codigosDe(d: Diseno): PiezaCodigo[] {
  return d.piezas.filter((p): p is PiezaCodigo => p.tipo === 'codigo')
}

export function unidadDe(simbolos: readonly Simbolo[]): TipoUnidad {
  if (simbolos.some((s) => valorDe(s, '414') !== undefined)) return 'ubicacion'
  return simbolos.some((s) => valorDe(s, '00') !== undefined || valorDe(s, '02') !== undefined) ? 'tarima' : 'caja'
}

export const PERFIL_EJEMPLO: PerfilImpresora = {
  id: 'zebra-ejemplo', nombre: 'Zebra de ejemplo', sitio: 'SIN-SITIO', dpi: 203, anchoMm: 101.6, altoMm: 50.8,
  origenX: 0, origenY: 0, corrimientoIzq: 0, corrimientoSup: 0, oscuridad: 0, velocidad: 4, perfilLectura: 'pistola',
}
