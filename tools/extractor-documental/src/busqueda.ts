/**
 * Recuperacion: por titulo y, sobre todo, por los identificadores que la herramienta YA extrajo.
 *
 * El titulo es para el humano; lo que se busca de verdad es "la factura A-1234" o "la guia
 * 4490...". Esos identificadores salen de `analizaCarga()`, asi que indexarlos es aprovechar
 * trabajo hecho en vez de pedirle al usuario que titule con disciplina.
 */
import type { CampoExtraido } from './tipos.js'

/**
 * Normalizacion de un identificador para comparar y para indexar.
 *
 * Vive AQUI y la usan tanto el indice como `resuelveIdentificador()`. Si divergieran, la busqueda
 * no encontraria lo que la reconciliacion si resolvio, y el fallo seria invisible: no da error,
 * simplemente no aparece nada.
 *
 * Solo se toca lo que no cambia la identidad: espacios y mayusculas. NO se quitan diacriticos ni
 * sufijos — en un identificador cada caracter significa algo, y "limpiarlo" es corromperlo.
 */
export function normalizaIdentificador(valor: string): string {
  return valor.trim().toUpperCase().replace(/\s+/g, '')
}

export interface EntradaDeIndice {
  clave: string
  valorNormalizado: string
}

/** Claves que valen como identificador buscable. Lo que no este aqui no se indexa. */
const CLAVES_INDEXABLES: readonly string[] = [
  'uuid', 'folio', 'rfc_emisor', 'rfc_receptor', 'gtin', 'sscc', 'guia', 'fnsku', 'lote', 'serie',
]

/**
 * Proyecta los campos de un documento a entradas de indice.
 *
 * Solo entran los marcados como identificador o cuya clave esta en la lista: indexar texto libre
 * convertiria el indice en otra cosa, y la busqueda por texto completo esta fuera de alcance.
 */
export function extraeIdentificadoresIndexables(campos: readonly CampoExtraido[]): readonly EntradaDeIndice[] {
  const vistas = new Set<string>()
  const entradas: EntradaDeIndice[] = []
  for (const campo of campos) {
    const esIdentificador = campo.formato === 'identificador' || CLAVES_INDEXABLES.includes(campo.clave)
    if (!esIdentificador) continue
    const valorNormalizado = normalizaIdentificador(campo.valor)
    if (valorNormalizado.length === 0) continue
    const huella = `${campo.clave}|${valorNormalizado}`
    if (vistas.has(huella)) continue
    vistas.add(huella)
    entradas.push({ clave: campo.clave, valorNormalizado })
  }
  return entradas
}

export interface CriteriosDeBusqueda {
  /** Coincidencia parcial, sin distinguir mayusculas. Es lo unico que se busca "por parecido". */
  titulo?: string
  /** Igualdad EXACTA sobre el valor normalizado. Nunca por similitud (ver §2.10 del SDD). */
  identificador?: string
  tipoTrabajo?: string
  estado?: string
  desde?: string
  hasta?: string
}

export interface CriteriosNormalizados extends CriteriosDeBusqueda {
  identificador?: string
}

/**
 * Normaliza los criterios antes de consultar. Sin esto, buscar "aaa 010101 aaa" no encontraria
 * "AAA010101AAA", que es exactamente como la gente teclea un RFC.
 */
export function normalizaCriterios(criterios: CriteriosDeBusqueda): CriteriosNormalizados {
  const salida: CriteriosNormalizados = { ...criterios }
  if (criterios.identificador !== undefined) {
    salida.identificador = normalizaIdentificador(criterios.identificador)
  }
  if (criterios.titulo !== undefined) salida.titulo = criterios.titulo.trim()
  return salida
}

/** Criterios vacios significan "todo": es una respuesta valida, no un error. */
export function estanVacios(criterios: CriteriosDeBusqueda): boolean {
  return Object.values(criterios).every((v) => v === undefined || String(v).trim() === '')
}
