/**
 * Un documento que llega en dos formas es UN documento, no dos.
 *
 * El caso normal en un corpus fiscal: el mismo CFDI entra como XML y como PDF impreso, o el mismo
 * escaneo dos veces. Si la inferencia los cuenta como dos, el folio fiscal «se repite» y funda una
 * entidad que no existe, y todo lo demas —importes, fechas, nombres— pasa a depender de el.
 * Medido en la primera corrida del corpus sintetico: `uuid` y `folio` salieron como entidades con
 * 12 de 15 valores vistos una sola vez, y las tablas de documento se quedaron sin columnas.
 *
 * La clave que identifica al documento la declara el PROYECTO (`uuid` en un CFDI): aqui no se
 * sabe. Y la fusion no se calla nada: si dos copias discrepan en un valor, es exactamente la
 * senal de corroboracion de §5.2 del SDD, y sale como duda con las dos copias.
 */
import type { CampoExtraido } from './tipos.js'
import type { DocumentoDelCorpus, DudaDeInferencia } from './corpus.js'

export interface Fusion {
  /** El documento que queda: el primero que llego. */
  readonly documentoId: string
  /** Los que se fundieron en el. */
  readonly copias: readonly string[]
}

export interface CorpusFusionado {
  readonly corpus: readonly DocumentoDelCorpus[]
  readonly fusiones: readonly Fusion[]
}

function valorDe(documento: DocumentoDelCorpus, clave: string): string | undefined {
  const campo = documento.campos.find((c) => c.clave === clave && c.valor.trim().length > 0)
  return campo?.valor.trim()
}

/** Une los campos de una copia a los del original. La primera lectura manda; la discrepancia se declara. */
function absorbe(original: DocumentoDelCorpus, copia: DocumentoDelCorpus, dudas: DudaDeInferencia[]): DocumentoDelCorpus {
  const campos: CampoExtraido[] = [...original.campos]
  for (const campo of copia.campos) {
    const previo = campos.find((c) => c.clave === campo.clave)
    if (previo === undefined) {
      campos.push(campo)
    } else if (previo.valor.trim() !== campo.valor.trim()) {
      dudas.push({
        sobre: `${original.documentoId} · ${campo.clave}`,
        motivo:
          `dos copias del mismo documento discrepan en "${campo.clave}": se conserva la primera lectura ` +
          `(${previo.procedencia}) y se declara la otra (${campo.procedencia}). Es la senal de corroboracion: alguien tiene que mirarlo`,
        documentos: [original.documentoId, copia.documentoId],
      })
    }
  }
  return { ...original, campos }
}

/**
 * Funde los documentos que comparten el valor de `clave`. Los que no la traen quedan como estan.
 * El orden de salida es el de entrada, y el tipo del documento fundido es el del primero.
 */
export function fusionaCopias(
  corpus: readonly DocumentoDelCorpus[],
  clave: string,
  dudas: DudaDeInferencia[],
): CorpusFusionado {
  const porValor = new Map<string, number>()
  const salida: DocumentoDelCorpus[] = []
  const copias = new Map<string, string[]>()
  for (const documento of corpus) {
    const valor = valorDe(documento, clave)
    const posicion = valor === undefined ? undefined : porValor.get(valor)
    if (valor === undefined || posicion === undefined) {
      if (valor !== undefined) porValor.set(valor, salida.length)
      salida.push(documento)
      continue
    }
    const original = salida[posicion]
    salida[posicion] = absorbe(original, documento, dudas)
    copias.set(original.documentoId, [...(copias.get(original.documentoId) ?? []), documento.documentoId])
  }
  const fusiones = [...copias].map(([documentoId, lista]) => ({ documentoId, copias: lista }))
  return { corpus: salida, fusiones }
}
