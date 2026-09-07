/**
 * Cotejo entre lo que leyo el OCR y lo que traia el codigo. Puro.
 *
 * Es lo que hace valiosa la segunda fuente, y no es la velocidad. El QR de un CFDI lleva UUID, RFC
 * emisor, RFC receptor, total y 8 caracteres del sello de forma DETERMINISTA. Si el OCR leyo un
 * total de 11.600,00 y el codigo dice 1.160,00, la discrepancia **es detectable** precisamente
 * porque hay dos fuentes independientes.
 *
 * La regla que ordena el modulo: **ninguna fuente gana por decreto**. El codigo no es mas fiable
 * por decodificar limpio — una pegatina falsa decodifica igual de limpio que la legitima. Lo que
 * significa algo es la discrepancia, y una discrepancia manda a revision humana aunque las dos
 * fuentes vengan con confianza alta.
 */
import type { CampoExtraido } from './tipos.js'

export interface Acuerdo {
  clave: string
  valor: string
}

export interface Discrepancia {
  clave: string
  segunOcr: string
  segunCodigo: string
}

export interface Cotejo {
  acuerdos: readonly Acuerdo[]
  discrepancias: readonly Discrepancia[]
  /** Claves que solo aporto una de las dos fuentes. No son un problema: son cobertura distinta. */
  soloOcr: readonly string[]
  soloCodigo: readonly string[]
}

/**
 * Normalizacion minima para comparar valores de dos fuentes.
 *
 * Solo lo que no cambia el significado: espacios y mayusculas. Un importe se compara ademas sin
 * separadores de miles, porque "1,160.00" y "1160.00" son el mismo numero escrito por dos sistemas
 * distintos — y tratarlos como discrepancia llenaria la cola de ruido y la volveria inservible.
 */
function comparable(valor: string): string {
  const t = valor.trim().toUpperCase().replace(/\s+/g, '')
  if (/^-?[\d.,]+$/.test(t)) {
    const sinMiles = t.replace(/,(?=\d{3}\b)/g, '')
    const numero = Number(sinMiles.replace(',', '.'))
    if (Number.isFinite(numero)) return String(numero)
  }
  return t
}

function porClave(campos: readonly CampoExtraido[]): Map<string, CampoExtraido> {
  return new Map(campos.map((c) => [c.clave, c]))
}

/** Coteja las dos fuentes. No decide: describe. Quien decide es `exigeRevision` mas abajo. */
export function corrobora(
  camposOcr: readonly CampoExtraido[],
  camposCodigo: readonly CampoExtraido[],
): Cotejo {
  const ocr = porClave(camposOcr)
  const codigo = porClave(camposCodigo)
  const acuerdos: Acuerdo[] = []
  const discrepancias: Discrepancia[] = []

  for (const [clave, campoOcr] of ocr) {
    const campoCodigo = codigo.get(clave)
    if (campoCodigo === undefined) continue
    if (comparable(campoOcr.valor) === comparable(campoCodigo.valor)) {
      acuerdos.push({ clave, valor: campoCodigo.valor })
    } else {
      discrepancias.push({ clave, segunOcr: campoOcr.valor, segunCodigo: campoCodigo.valor })
    }
  }

  return {
    acuerdos,
    discrepancias,
    soloOcr: [...ocr.keys()].filter((k) => !codigo.has(k)),
    soloCodigo: [...codigo.keys()].filter((k) => !ocr.has(k)),
  }
}

/**
 * Una sola discrepancia basta para exigir revision humana.
 *
 * No se pondera ni se "gana por mayoria": si las dos fuentes independientes no dicen lo mismo, una
 * de ellas esta mal y ninguna maquina sabe cual. Eso es exactamente lo que una persona resuelve
 * mirando el papel.
 */
export function exigeRevision(cotejo: Cotejo): boolean {
  return cotejo.discrepancias.length > 0
}
