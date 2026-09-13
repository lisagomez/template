/**
 * De que evidencia sale la confianza de cada campo. Logica pura.
 *
 * POR QUE EXISTE. La confianza de un motor no esta calibrada (medido 2026-09-11: el preprocesado
 * la mueve 0-3 puntos; un modelo de vision devolvio 0.90 en los 25 campos). Un consumidor que
 * solo ve un numero entre 0 y 1 no puede distinguir «lo leyo un QR» de «lo estimo el OCR». Aqui
 * cada campo dice QUE lo sostiene, y la marca de revision sale de eso, no de un umbral que nadie
 * midio (spec 010, RF-7 y RF-8).
 *
 * Las cinco evidencias, de mas a menos fuerte:
 *   codigo         leido de un QR o codigo de barras en la imagen (procedencia `codigo`, via motor)
 *   exacto         texto nativo del documento: capa 0, XML, o lo que confirmo una persona
 *   corroboracion  una lectura del OCR que coincidio con una fuente independiente (codigo o respaldo)
 *   checksum       una lectura del OCR que el digito verificador acepta, sin segunda fuente
 *   motor          solo la estimacion del OCR
 *
 * LO QUE NO HACE: no calibra, no promedia y no inventa un umbral. `revisionHumana` es verdadero
 * cuando la unica evidencia es el motor; el proyecto puede ampliar ese conjunto (un checksum de
 * modulo 10 deja pasar una sustitucion de cada diez, medido en la spec 009), nunca reducirlo.
 */
import type { CampoExtraido } from './tipos.js'
import type { Cotejo } from './corroboracion.js'

export type Evidencia = 'codigo' | 'exacto' | 'corroboracion' | 'checksum' | 'motor'

export interface CampoConEvidencia extends CampoExtraido {
  readonly evidencia: Evidencia
  /** Verdadero cuando la evidencia no basta para auto-validar. Sale de `evidencia`, no de un umbral. */
  readonly revisionHumana: boolean
}

export interface ContextoDeEvidencia {
  /** `capa-cero` y `xml` son vias exactas: lo que sale con procedencia `codigo` ahi es texto nativo, no un QR. */
  readonly ruta: 'capa-cero' | 'xml' | 'motor' | 'ninguna'
  /** Cotejos disponibles (codigos, respaldo): sus acuerdos son la corroboracion. */
  readonly cotejos?: readonly (Cotejo | undefined)[]
  /** Claves que tienen validador con digito verificador. */
  readonly conValidador?: ReadonlySet<string>
  /** Evidencias que el PROYECTO manda a revision ademas de `motor`. Solo amplia. */
  readonly revisaTambien?: ReadonlySet<Evidencia>
}

const comparable = (valor: string): string => valor.trim().toUpperCase().replace(/\s+/g, '')

function corroborado(campo: CampoExtraido, cotejos: readonly (Cotejo | undefined)[]): boolean {
  for (const cotejo of cotejos) {
    if (cotejo === undefined) continue
    if (cotejo.acuerdos.some((a) => a.clave === campo.clave && comparable(a.valor) === comparable(campo.valor))) return true
  }
  return false
}

export function evidenciaDe(campo: CampoExtraido, contexto: ContextoDeEvidencia): Evidencia {
  switch (campo.procedencia) {
    case 'humano':
    case 'xml':
      return 'exacto'
    case 'codigo':
      return contexto.ruta === 'motor' ? 'codigo' : 'exacto'
    case 'ocr':
      if (corroborado(campo, contexto.cotejos ?? [])) return 'corroboracion'
      if (contexto.conValidador?.has(campo.clave) === true) return 'checksum'
      return 'motor'
  }
}

export function conEvidencia(campos: readonly CampoExtraido[], contexto: ContextoDeEvidencia): CampoConEvidencia[] {
  const revisa = new Set<Evidencia>(['motor', ...(contexto.revisaTambien ?? [])])
  return campos.map((campo) => {
    const evidencia = evidenciaDe(campo, contexto)
    return { ...campo, evidencia, revisionHumana: revisa.has(evidencia) }
  })
}

/** Cuantos campos hay por evidencia: la cifra que un operador mira antes que cualquier confianza media. */
export function resumenDeEvidencia(campos: readonly CampoConEvidencia[]): Readonly<Record<Evidencia, number>> {
  const salida: Record<Evidencia, number> = { codigo: 0, exacto: 0, corroboracion: 0, checksum: 0, motor: 0 }
  for (const campo of campos) salida[campo.evidencia]++
  return salida
}
