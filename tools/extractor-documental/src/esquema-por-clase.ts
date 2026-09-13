/**
 * Estructura la lectura de un documento en el JSON que su CLASE declara. Logica pura.
 *
 * `clasifica-pagina.ts` dice que clase de hoja es cada pagina; esto dice que claves espera esa
 * clase y ordena los campos segun eso: presentes, faltantes DECLARADOS y no previstos CONSERVADOS.
 * Un documento que no encaja en ninguna clase sale como tal, con sus campos crudos: forzarlo a un
 * esquema seria inventar una estructura (spec 010, RF-12 y RF-13).
 *
 * Los esquemas los declara el PROYECTO, como las clases y los patrones. Aqui no se sabe si el
 * corpus es de expedientes laborales o de albaranes. Y no hay Zod: el nucleo no importa nada.
 * La validacion con esquema explicito va en la frontera (el puente A2A), sobre esta salida.
 */
import type { ClasificacionDePagina } from './clasifica-pagina.js'
import { SIN_CLASIFICAR } from './clasifica-pagina.js'
import type { CampoConEvidencia } from './evidencia.js'

export interface ClaveDeEsquema {
  readonly clave: string
  /** Una clave obligatoria ausente se declara en `faltantes`; una opcional ausente, no. */
  readonly obligatoria?: boolean
}

export interface EsquemaDeClase {
  readonly clase: string
  readonly claves: readonly ClaveDeEsquema[]
}

export interface DocumentoEstructurado {
  readonly clase: string
  /** Verdadero cuando ninguna clase declarada caso: los campos van crudos en `noPrevistos`. */
  readonly sinClase: boolean
  /** Por clave del esquema: TODOS los valores que salieron para ella (dos `rfc` en una hoja son dos). */
  readonly campos: Readonly<Record<string, readonly CampoConEvidencia[]>>
  readonly faltantes: readonly string[]
  readonly noPrevistos: readonly CampoConEvidencia[]
  readonly paginas: readonly ClasificacionDePagina[]
}

/** Valida la lista una vez: dos esquemas para la misma clase es un error de configuracion. */
export function declaraEsquemas(esquemas: readonly EsquemaDeClase[]): readonly EsquemaDeClase[] {
  const vistas = new Set<string>()
  for (const { clase, claves } of esquemas) {
    if (vistas.has(clase)) throw new Error(`esquema repetido para la clase "${clase}"`)
    vistas.add(clase)
    const repetida = claves.map((c) => c.clave).find((c, i, todas) => todas.indexOf(c) !== i)
    if (repetida !== undefined) throw new Error(`clave repetida "${repetida}" en el esquema de "${clase}"`)
  }
  return esquemas
}

/**
 * La clase del DOCUMENTO: la mas frecuente entre sus paginas, sin contar las no clasificadas.
 * Un XML no tiene paginas: su clase la declara quien lo lee (`claseFija`).
 */
export function claseDeDocumento(paginas: readonly ClasificacionDePagina[], claseFija?: string): string {
  if (claseFija !== undefined) return claseFija
  const cuenta = new Map<string, number>()
  for (const p of paginas) {
    if (p.clase === SIN_CLASIFICAR) continue
    cuenta.set(p.clase, (cuenta.get(p.clase) ?? 0) + 1)
  }
  let ganadora = SIN_CLASIFICAR
  let mejor = 0
  for (const [clase, n] of cuenta) {
    if (n > mejor) { ganadora = clase; mejor = n }
  }
  return ganadora
}

export function estructuraPorClase(
  campos: readonly CampoConEvidencia[],
  paginas: readonly ClasificacionDePagina[],
  esquemas: readonly EsquemaDeClase[],
  claseFija?: string,
): DocumentoEstructurado {
  const clase = claseDeDocumento(paginas, claseFija)
  const esquema = esquemas.find((e) => e.clase === clase)
  if (esquema === undefined) {
    return { clase, sinClase: true, campos: {}, faltantes: [], noPrevistos: [...campos], paginas }
  }
  const previstas = new Set(esquema.claves.map((c) => c.clave))
  const porClave: Record<string, CampoConEvidencia[]> = {}
  const noPrevistos: CampoConEvidencia[] = []
  for (const campo of campos) {
    if (!previstas.has(campo.clave)) { noPrevistos.push(campo); continue }
    ;(porClave[campo.clave] ??= []).push(campo)
  }
  const faltantes = esquema.claves.filter((c) => c.obligatoria === true && porClave[c.clave] === undefined).map((c) => c.clave)
  return { clase, sinClase: false, campos: porClave, faltantes, noPrevistos, paginas }
}
