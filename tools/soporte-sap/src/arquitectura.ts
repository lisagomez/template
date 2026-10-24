/**
 * La matriz dominio × capa del SDD, leída como dato. De ella sale el % de reuso del producto:
 * contado, no estimado. Una celda vacía, un tipo desconocido o un activo que no está en el
 * inventario son errores, no avisos.
 */

export type TipoCelda = 'R' | 'C' | 'F' | 'N'

export interface Celda {
  readonly dominio: string
  readonly capa: string
  readonly tipo: TipoCelda
  readonly texto: string
  readonly activos: readonly string[]
}

export interface Matriz {
  readonly capas: readonly string[]
  readonly celdas: readonly Celda[]
  readonly errores: readonly string[]
}

export interface CuentaReuso {
  readonly reusadas: number
  readonly compuestas: number
  readonly fabricadas: number
  readonly noAplica: number
  readonly denominador: number
  /** (reusadas + compuestas) / denominador: celdas que parten de un activo existente. */
  readonly amplio: number
  /** reusadas / denominador: celdas que un activo cubre sin código nuevo. */
  readonly estricto: number
  readonly porActivo: Readonly<Record<string, number>>
}

const INICIO = '<!-- matriz:inicio -->'
const FIN = '<!-- matriz:fin -->'
const TIPOS: readonly TipoCelda[] = ['R', 'C', 'F', 'N']

const filasDeTabla = (bloque: string): string[][] =>
  bloque.split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') && !/^\|[\s|:-]+\|$/.test(l))
    .map((l) => l.slice(1, -1).split('|').map((c) => c.trim()))

function leeCelda(dominio: string, capa: string, crudo: string): { celda?: Celda; error?: string } {
  const donde = `${dominio} × ${capa}`
  if (!crudo) return { error: `${donde}: celda vacía` }
  const tipo = crudo.charAt(0) as TipoCelda
  const texto = crudo.slice(1).trim()
  if (!TIPOS.includes(tipo) || crudo.charAt(1) !== ' ') return { error: `${donde}: debe empezar con R, C, F o N y un espacio` }
  if (!texto) return { error: `${donde}: «${tipo}» sin texto` }
  const activos = [...texto.matchAll(/TPL-[a-z0-9-]+/g)].map((m) => m[0])
  if ((tipo === 'R' || tipo === 'C') && activos.length === 0) return { error: `${donde}: «${tipo}» sin activo TPL-…` }
  if (tipo === 'C' && !texto.includes('+')) return { error: `${donde}: «C» debe decir qué se suma (… + …)` }
  return { celda: { dominio, capa, tipo, texto, activos } }
}

/** Lee la matriz entre sus marcadores. Devuelve también los errores de forma. */
export function leeMatriz(markdown: string): Matriz {
  const a = markdown.indexOf(INICIO)
  const b = markdown.indexOf(FIN)
  if (a < 0 || b < a) return { capas: [], celdas: [], errores: ['no se encontraron los marcadores de la matriz'] }
  const [cabecera, ...filas] = filasDeTabla(markdown.slice(a + INICIO.length, b))
  const capas = (cabecera ?? []).slice(1)
  const celdas: Celda[] = []
  const errores: string[] = []
  if (capas.length === 0) errores.push('la matriz no tiene capas')
  for (const fila of filas) {
    const [dominio = '', ...resto] = fila
    if (resto.length !== capas.length) errores.push(`${dominio}: ${resto.length} celdas para ${capas.length} capas`)
    capas.forEach((capa, i) => {
      const r = leeCelda(dominio, capa, resto[i] ?? '')
      if (r.error) errores.push(r.error)
      if (r.celda) celdas.push(r.celda)
    })
  }
  return { capas, celdas, errores }
}

const redondea = (x: number): number => Math.round(x * 1000) / 1000

/** Cuenta el reuso. «N» no entra al denominador: lo que no aplica no se fabrica ni se reusa. */
export function cuentaReuso(celdas: readonly Celda[]): CuentaReuso {
  const de = (t: TipoCelda) => celdas.filter((c) => c.tipo === t).length
  const reusadas = de('R')
  const compuestas = de('C')
  const fabricadas = de('F')
  const denominador = reusadas + compuestas + fabricadas
  const porActivo: Record<string, number> = {}
  for (const c of celdas) for (const id of new Set(c.activos)) porActivo[id] = (porActivo[id] ?? 0) + 1
  return {
    reusadas, compuestas, fabricadas, noAplica: de('N'), denominador,
    amplio: denominador ? redondea((reusadas + compuestas) / denominador) : 0,
    estricto: denominador ? redondea(reusadas / denominador) : 0,
    porActivo,
  }
}

const pct = (x: number): string => `${(x * 100).toFixed(1)} %`

/** El bloque que el SDD muestra entre `reuso:inicio` y `reuso:fin`. Lo escribe el CLI, lo verifica la prueba. */
export function bloqueReuso(c: CuentaReuso): string {
  const activos = Object.entries(c.porActivo).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
  return [
    '<!-- ALTO: ARTEFACTO AUTOGENERADO desde la matriz de arriba. No edites este bloque a mano: node tools/soporte-sap/clis/ss-reuso.mjs --escribe -->',
    `**Cuenta de reuso** (la calcula \`ss-reuso\` desde la matriz; la prueba la vuelve a contar):`,
    '',
    `- reusadas (R): ${c.reusadas} · compuestas (C): ${c.compuestas} · a fabricar (F): ${c.fabricadas} · no aplica (N): ${c.noAplica}`,
    `- denominador = R + C + F = ${c.reusadas} + ${c.compuestas} + ${c.fabricadas} = ${c.denominador}`,
    `- **reuso amplio** = (R + C) / denominador = ${c.reusadas + c.compuestas} / ${c.denominador} = **${pct(c.amplio)}**`,
    `- **reuso estricto** = R / denominador = ${c.reusadas} / ${c.denominador} = **${pct(c.estricto)}**`,
    `- celdas por activo: ${activos.map(([id, n]) => `${id} (${n})`).join(', ')}`,
  ].join('\n')
}

export const MARCAS_REUSO = { inicio: '<!-- reuso:inicio -->', fin: '<!-- reuso:fin -->' } as const

/** Sustituye el bloque de reuso del markdown. Lanza si faltan los marcadores. */
export function conBloqueReuso(markdown: string, bloque: string): string {
  const a = markdown.indexOf(MARCAS_REUSO.inicio)
  const b = markdown.indexOf(MARCAS_REUSO.fin)
  if (a < 0 || b < a) throw new Error('faltan los marcadores del bloque de reuso')
  return `${markdown.slice(0, a + MARCAS_REUSO.inicio.length)}\n${bloque}\n${markdown.slice(b)}`
}

/** El bloque de reuso que el markdown trae hoy (para compararlo con el recontado). */
export function bloqueReusoActual(markdown: string): string {
  const a = markdown.indexOf(MARCAS_REUSO.inicio)
  const b = markdown.indexOf(MARCAS_REUSO.fin)
  return a < 0 || b < a ? '' : markdown.slice(a + MARCAS_REUSO.inicio.length, b).trim()
}
