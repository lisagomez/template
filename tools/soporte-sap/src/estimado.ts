/**
 * El estimado de consumo por cliente y por tamaño. Cada cifra dice qué es:
 *   · MEDIDA: salió de correr algo en el laboratorio, con su comando (carga sintética);
 *   · DERIVADA: una fórmula visible sobre otras cifras (y se ve de qué naturaleza son sus insumos);
 *   · SUPUESTA: un valor del laboratorio sin medición detrás (D11, D15): se dice, no se disfraza.
 * Nunca se mezclan: una derivada de un supuesto sigue diciendo que depende de un supuesto.
 *
 * Alimenta el costo por tier del pricing y el dimensionamiento del VPS (vCPU, RAM y disco; no planes
 * de un proveedor: el producto declara requisitos, y el servidor de la instalación gestionada, D12, se cotiza aparte).
 */

export type Naturaleza = 'medida' | 'derivada' | 'supuesta'

export interface Cifra {
  readonly valor: number | null
  readonly unidad: string
  readonly naturaleza: Naturaleza
  /** El comando que la midió, la fórmula que la deriva o de dónde sale el supuesto. */
  readonly fuente: string
  /** Para una derivada: la naturaleza de sus insumos (si hay un supuesto, se ve). */
  readonly insumos?: readonly Naturaleza[]
}

export interface Insumos {
  readonly bytesBdPorIncidencia: Cifra
  readonly documentosPorIncidencia: Cifra
  readonly bytesPorDocumento: Cifra
  readonly fraccionImagenes: Cifra
  readonly segundosOcrPorPagina: Cifra
  readonly tokensPorIncidencia: Cifra
  readonly msCpuPorIncidencia: Cifra
  readonly bytesExportPorIncidencia: Cifra
  readonly bytesEgresoPorIncidencia: Cifra
  readonly ramBaseMb: Cifra
  readonly ramPorTrabajadorOcrMb: Cifra
}

export type Tamano = 'S' | 'M' | 'L'

/** Incidencias al mes por tamaño (SUPUESTO del laboratorio; los cortes los confirma el laboratorio, D11). */
export const INCIDENCIAS_MES: Readonly<Record<'consultora' | 'cliente', Readonly<Record<Tamano, number>>>> = {
  consultora: { S: 24, M: 64, L: 218 },
  cliente: { S: 8, M: 20, L: 45 },
}

export const supuesta = (valor: number | null, unidad: string, fuente: string): Cifra => ({ valor, unidad, naturaleza: 'supuesta', fuente })
export const medida = (valor: number | null, unidad: string, fuente: string): Cifra => ({ valor, unidad, naturaleza: 'medida', fuente })

const deriva = (formula: string, unidad: string, partes: readonly Cifra[], f: (...v: number[]) => number): Cifra => {
  const valores = partes.map((p) => p.valor)
  // Transitivo: si un insumo derivado dependía de un supuesto, esta cifra también depende de él.
  const insumos = [...new Set(partes.flatMap((p) => [p.naturaleza, ...(p.insumos ?? [])]))]
  if (valores.some((v) => v === null)) return { valor: null, unidad, naturaleza: 'derivada', fuente: `${formula} (falta un insumo: no medido)`, insumos }
  const valor = Math.round(f(...(valores as number[])) * 1000) / 1000
  return { valor, unidad, naturaleza: 'derivada', fuente: formula, insumos }
}

export type Rubro = 'bd' | 'storage' | 'paginasOcr' | 'cpuOcr' | 'tokens' | 'cpuApp' | 'respaldo' | 'egreso'

/** El consumo de un mes para un volumen de incidencias. */
export function consumoMensual(x: Insumos, incidenciasMes: number): Readonly<Record<Rubro, Cifra>> {
  const n = supuesta(incidenciasMes, 'incidencias/mes', 'volumen por tamaño (D11)')
  const paginas = deriva('incidencias × documentos × fracción de imágenes', 'páginas/mes', [n, x.documentosPorIncidencia, x.fraccionImagenes], (a, b, c) => a * b * c)
  return {
    bd: deriva('incidencias × bytes de BD por incidencia', 'MB/mes', [n, x.bytesBdPorIncidencia], (a, b) => (a * b) / 1e6),
    storage: deriva('incidencias × documentos × bytes por documento', 'MB/mes', [n, x.documentosPorIncidencia, x.bytesPorDocumento], (a, b, c) => (a * b * c) / 1e6),
    paginasOcr: paginas,
    cpuOcr: deriva('páginas × segundos de OCR por página', 'CPU-min/mes', [paginas, x.segundosOcrPorPagina], (a, b) => (a * b) / 60),
    tokens: deriva('incidencias × tokens por incidencia', 'tokens/mes', [n, x.tokensPorIncidencia], (a, b) => a * b),
    cpuApp: deriva('incidencias × ms de CPU por incidencia', 'CPU-s/mes', [n, x.msCpuPorIncidencia], (a, b) => (a * b) / 1000),
    respaldo: deriva('incidencias × bytes de export por incidencia', 'MB/mes', [n, x.bytesExportPorIncidencia], (a, b) => (a * b) / 1e6),
    egreso: deriva('incidencias × bytes servidos por incidencia', 'MB/mes', [n, x.bytesEgresoPorIncidencia], (a, b) => (a * b) / 1e6),
  }
}

export interface Maquina { readonly vcpu: Cifra; readonly ramGb: Cifra; readonly discoGb: Cifra }

/**
 * La máquina que pide un tamaño, si corriera solo: la hora pico concentra el triple del promedio
 * (SUPUESTO) de un mes de 22 días hábiles × 9 horas. vCPU: el OCR de la hora pico más uno para la app.
 */
export function maquinaPara(x: Insumos, c: Readonly<Record<Rubro, Cifra>>): Maquina {
  const pico = supuesta(3, '×', 'la hora pico concentra el triple de la hora promedio')
  const ocrPorHora = deriva('CPU-min de OCR / (22 días × 9 h) × pico', 'CPU-min/h', [c.cpuOcr, pico], (a, b) => (a / (22 * 9)) * b)
  const vcpu = deriva('ceil(CPU-min de OCR por hora pico / 60) + 1 de la app', 'vCPU', [ocrPorHora], (a) => Math.max(2, Math.ceil(a / 60) + 1))
  const ramGb = deriva('(RAM base + RAM por trabajador de OCR × vCPU) / 1024', 'GB', [x.ramBaseMb, x.ramPorTrabajadorOcrMb, vcpu], (a, b, v) => Math.ceil(((a + b * v) / 1024) * 2) / 2)
  const sistema = supuesta(20, 'GB', 'sistema, imágenes de Docker y modelos de Tesseract')
  const discoGb = deriva('(BD + Storage + respaldo local) × 12 meses × 1.5 / 1000 + sistema', 'GB', [c.bd, c.storage, c.respaldo, sistema], (a, b, r, s) => Math.ceil(((a + b + r) * 12 * 1.5) / 1000 + s))
  return { vcpu, ramGb, discoGb }
}

/** Una celda legible: valor, unidad y la etiqueta de su naturaleza. */
export function celda(c: Cifra): string {
  const v = c.valor === null ? 'no medido' : c.valor.toLocaleString('es-MX', { maximumFractionDigits: 3 })
  const dep = c.insumos?.includes('supuesta') ? ', con supuesto' : ''
  return `${v} ${c.unidad} · ${c.naturaleza}${dep}`
}
