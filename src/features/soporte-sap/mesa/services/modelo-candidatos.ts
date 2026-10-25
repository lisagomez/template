/**
 * El contrato de los candidatos y del mapa. Un candidato es una HIPÓTESIS que sale de una fuente externa fijada
 * (sapstack, por SHA): el experto la valida y su validación es una PROPUESTA para el laboratorio. Nada de aquí es una
 * regla: las reglas se firman en `tools/conocimiento`, fuera de la mesa.
 */
import { z } from 'zod'

export const VALORACIONES = ['correcto', 'mal', 'corrige', 'no_se'] as const
export type Valoracion = (typeof VALORACIONES)[number]

/** Un candidato como lo genera `fuentes/generadores.mjs`. */
export interface Candidato {
  readonly id: string
  readonly tipo: 'tcode' | 'nota'
  readonly clave: string
  readonly titulo: string
  readonly modulos: readonly string[]
  readonly release: string | null
  readonly enAlcance: boolean
  readonly hipotesis: string
  readonly destino: string
  readonly fuente: { readonly archivo: string; readonly linea: number; readonly url: string }
  readonly aviso: string | null
}

/** De dónde salen los candidatos: el pin, la licencia y la última revisión del origen. */
export interface FuenteVista {
  readonly repo: string
  readonly web: string
  readonly sha: string
  readonly version: string
  readonly commitFecha: string
  readonly licencia: string
  readonly copyright: string
  readonly origen: { readonly repo: string; readonly estado: string }
  readonly revision: { readonly fecha: string; readonly head: string }
  /** El catálogo pasó su huella y su SHA; si no, el motivo y no hay candidatos. */
  readonly integro: boolean
  readonly motivo: string | null
}

/** Lo que se guarda de una validación: siempre una propuesta, nunca una regla. */
export interface ValidacionCandidato {
  readonly version: 1
  readonly candidato: string
  readonly valoracion: Valoracion
  readonly comentario: string | null
  readonly correccion: string | null
  readonly estado: 'propuesta'
  readonly por: { readonly usuario: string; readonly correo: string; readonly prueba: boolean }
  readonly creado: string
  readonly actualizado: string
}

/** Lo que ve una identidad: el catálogo y SUS validaciones. */
export interface CandidatosVista {
  readonly fuente: FuenteVista
  readonly candidatos: readonly Candidato[]
  readonly mias: Readonly<Record<string, ValidacionCandidato>>
}

const TEXTO_CORTO = z.string().trim().max(1500)
export const ACCION_VALIDA = z.object({
  tipo: z.literal('valida_candidato'),
  candidato: z.string().max(80),
  valoracion: z.enum(VALORACIONES),
  comentario: TEXTO_CORTO.optional(),
  correccion: TEXTO_CORTO.optional(),
})
export type AccionValida = z.infer<typeof ACCION_VALIDA>

/** Un punto de una serie diaria: el día (AAAA-MM-DD) y cuántos. */
export interface PuntoSerie { readonly dia: string; readonly n: number }
/** Una métrica del mapa: su valor (null = sin datos), su serie y de dónde sale. */
export interface Metrica { readonly valor: number | null; readonly serie: readonly PuntoSerie[]; readonly nota: string }
export interface VersionBase {
  readonly version: string
  readonly fecha: string | null
  readonly firmo: string | null
  readonly firmadas: number
  readonly reglas: number
  readonly dominios: number
  readonly categoriasSapSoporte: number | null
  readonly huella: string
}
export interface CliVista { readonly nombre: string; readonly que: string; readonly readOnly: boolean; readonly dryRunPorDefecto: boolean; readonly grado: string }
/** Lo que dijeron de un candidato, para el laboratorio: cada validación es una propuesta por firmar, o no. */
export interface PropuestaCandidato {
  readonly candidato: Candidato
  readonly validaciones: readonly ValidacionCandidato[]
}

/** El overview del laboratorio: fuentes → base sap-soporte → lo que la usa, con métricas reales. */
export interface MapaVista {
  readonly generado: string
  readonly fuentes: {
    readonly sapstack: { readonly candidatos: number; readonly tcodes: number; readonly notas: number; readonly enAlcance: number; readonly commitNuevo: boolean; readonly porModulo: ReadonlyArray<{ readonly modulo: string; readonly candidatos: number; readonly validados: number; readonly enAlcance: number }> }
    readonly experto: { readonly casos: number; readonly validaciones: number; readonly expertos: number; readonly dePrueba: number }
    readonly notas: { readonly punteros: number; readonly validadas: number }
  }
  readonly base: { readonly paquete: string; readonly dominio: string; readonly existe: boolean; readonly versionActual: string | null; readonly versiones: readonly VersionBase[] }
  readonly usos: {
    readonly triage: { readonly reconocidos: number; readonly total: number; readonly faltan: readonly string[] }
    readonly motor: { readonly casos: number; readonly solucion: number; readonly alExperto: number }
    readonly lexico: { readonly codigosTapados: number; readonly nombresTapados: number; readonly total: number; readonly ejemplos: readonly string[] }
    readonly clis: readonly CliVista[]
  }
  readonly metricas: {
    readonly pendientes: Metrica
    readonly correctos: Metrica
    readonly corregidos: Metrica
    readonly rechazados: Metrica
    readonly noSe: Metrica
    readonly firmados: Metrica
    readonly alExperto: Metrica
  }
  readonly propuestas: readonly PropuestaCandidato[]
  readonly fuente: FuenteVista
}
