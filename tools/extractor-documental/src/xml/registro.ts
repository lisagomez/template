/**
 * El registro de esquemas: el punto donde un proyecto declara QUE complementos sabe leer.
 *
 * El problema que resuelve. Un CFDI no es un formato: es un tronco comun mas un conjunto ABIERTO
 * de complementos autorizados, cada uno con su esquema y su version, y el SAT publica mas. Si la
 * herramienta llevara cada esquema escrito dentro, cada publicacion del SAT obligaria a una
 * version nueva de la herramienta, y un proyecto que necesitara un esquema que no anticipamos se
 * quedaria esperando a que lo publicaramos nosotros.
 *
 * Aqui el esquema deja de ser codigo y pasa a ser una unidad REGISTRABLE. La herramienta trae lo
 * que todo CFDI tiene; cada proyecto declara lo suyo sin tocar este paquete.
 *
 * Este modulo no conoce el SAT: sirve para cualquier esquema de cualquier emisor, y hay una prueba
 * que lo registra con un esquema inventado precisamente para demostrarlo.
 */
import type { CampoExtraido } from '../tipos.js'
import type { Elemento } from './arbol.js'
import { atributo } from './arbol.js'

/**
 * La identidad de un esquema. Las tres partes son obligatorias y ninguna admite comodin.
 *
 * `espacio` es la DIRECCION, jamas el prefijo — ver la cabecera de `arbol.ts`.
 *
 * Y la direccion sola NO basta: las dos versiones del timbre fiscal comparten direccion y solo se
 * distinguen por su atributo `Version`. Un registro con clave de dos partes leeria una con las
 * reglas de la otra.
 */
export interface ClaveDeEsquema {
  readonly espacio: string
  readonly nombreLocal: string
  /**
   * El valor EXACTO del atributo `Version`. Pineado, como el modelo de un motor de OCR (C1).
   *
   * No hay comodin y no lo habra. Aplicado a un esquema fiscal, un comodin significa leer con las
   * reglas de una version los datos de otra, y el resultado no es un error visible: es un dato
   * distinto, con apariencia de correcto, en la casilla de un importe.
   */
  readonly version: string
}

export interface LecturaDeComplemento {
  /** Campos ya con clave. Vacio es una respuesta valida. */
  readonly campos: readonly CampoExtraido[]
  /** Lo que el lector VIO y decidio no traducir. Se declara, no se calla. */
  readonly noLeido: readonly string[]
}

/**
 * Un lector de complemento. Hermano de `MotorOcr` y de `LectorDeCodigos`, y separado de los dos
 * por la misma razon que el SDD da para separarlos entre si: no comparten semantica. El OCR
 * devuelve confianza y region; un decodificador devuelve una carga que decodifico o no; esto
 * devuelve una TRANSCRIPCION de lo que el documento ya afirmaba.
 *
 * `lee` es SINCRONO, y eso es una garantia, no un olvido. Los otros dos puertos devuelven promesa
 * porque cruzan una frontera —red, wasm—. Aqui no hay ninguna que cruzar: es una funcion pura
 * sobre un arbol que ya esta en memoria. Devolver una promesa abriria la puerta a que un lector
 * hiciera entrada y salida, que es justo lo que este modulo no debe permitir.
 */
export interface LectorDeComplemento {
  readonly clave: ClaveDeEsquema
  /** Etiqueta en espanol, para la persona que revisa. */
  readonly nombre: string
  lee(nodo: Elemento): LecturaDeComplemento
}

/** Un complemento que venia en el documento y que nadie leyo. NO desaparece: se reporta. */
export interface ComplementoSinLector {
  readonly espacio: string
  readonly nombreLocal: string
  /** El prefijo tal cual venia. Solo para ensenarselo a una persona; nunca para resolver. */
  readonly prefijo: string | null
  readonly version: string | null
  /** En espanol, y distinguiendo el hueco del desajuste de version. */
  readonly motivo: string
}

export interface ComplementoLeido {
  readonly nombre: string
  readonly clave: ClaveDeEsquema
  readonly campos: readonly CampoExtraido[]
  readonly noLeido: readonly string[]
}

export interface ComplementosLeidos {
  readonly leidos: readonly ComplementoLeido[]
  readonly sinLector: readonly ComplementoSinLector[]
}

export interface RegistroDeEsquemas {
  readonly registrados: readonly ClaveDeEsquema[]
  busca(espacio: string, nombreLocal: string, version: string): LectorDeComplemento | null
  /** Las versiones registradas para esa direccion y nombre. Permite decir "hay 2.0, llego 1.0". */
  versionesDe(espacio: string, nombreLocal: string): readonly string[]
  /** Recorre los hijos de un nodo `Complemento`. Lee lo que sabe y DECLARA lo que no. */
  lee(complemento: Elemento): ComplementosLeidos
}

const identidad = (clave: ClaveDeEsquema): string =>
  `${clave.espacio} ${clave.nombreLocal} ${clave.version}`

/**
 * Fabrica. Patron de la casa: funcion que devuelve un object literal, con los lectores en closure.
 *
 * Sin lectores registrados devuelve un registro vacio, y un registro vacio recorre EXACTAMENTE el
 * mismo codigo que uno poblado — la misma decision que `esquemaVacio()`. Un camino distinto para
 * el caso vacio es un camino que casi nunca se ejercita.
 */
export function registroDeEsquemas(lectores: readonly LectorDeComplemento[]): RegistroDeEsquemas {
  const porClave = new Map<string, LectorDeComplemento>()
  for (const lector of lectores) {
    const llave = identidad(lector.clave)
    if (porClave.has(llave)) {
      // Elegir uno en silencio produciria una lectura equivocada permanente que nadie encontraria.
      // El proyecto lo cableo mal y tiene que verlo al arrancar, no seis meses despues.
      throw new Error(
        `Dos lectores registrados para el mismo esquema: "${lector.clave.nombreLocal}" ` +
          `version ${lector.clave.version} en ${lector.clave.espacio}`,
      )
    }
    porClave.set(llave, lector)
  }

  const busca = (
    espacio: string,
    nombreLocal: string,
    version: string,
  ): LectorDeComplemento | null =>
    porClave.get(identidad({ espacio, nombreLocal, version })) ?? null

  const versionesDe = (espacio: string, nombreLocal: string): readonly string[] =>
    [...porClave.values()]
      .filter((l) => l.clave.espacio === espacio && l.clave.nombreLocal === nombreLocal)
      .map((l) => l.clave.version)

  return {
    registrados: lectores.map((l) => l.clave),
    busca,
    versionesDe,

    lee(complemento: Elemento): ComplementosLeidos {
      const leidos: ComplementoLeido[] = []
      const sinLector: ComplementoSinLector[] = []

      for (const nodo of complemento.hijos) {
        const espacio = nodo.espacio ?? ''
        const version = atributo(nodo, 'Version')
        const disponibles = versionesDe(espacio, nodo.nombreLocal)
        const hueco = `sin lector registrado para "${nodo.nombreLocal}" en ${espacio}`

        // Los tres motivos NO son el mismo hecho, y confundirlos esconde una migracion de esquema
        // del SAT detras de un "no lo soportamos". Para quien integra son dos acciones distintas:
        // registrar algo nuevo, o actualizar lo que ya registro.
        if (version === null) {
          sinLector.push({
            espacio,
            nombreLocal: nodo.nombreLocal,
            prefijo: nodo.prefijo,
            version: null,
            motivo:
              disponibles.length === 0
                ? hueco
                : `hay lector para la version ${disponibles.join(' o ')} y el complemento no declara ninguna`,
          })
          continue
        }

        const lector = busca(espacio, nodo.nombreLocal, version)
        if (lector === null) {
          sinLector.push({
            espacio,
            nombreLocal: nodo.nombreLocal,
            prefijo: nodo.prefijo,
            version,
            motivo:
              disponibles.length === 0
                ? hueco
                : `hay lector para la version ${disponibles.join(' o ')} y el documento declara ${version}`,
          })
          continue
        }

        const lectura = lector.lee(nodo)
        leidos.push({
          nombre: lector.nombre,
          clave: lector.clave,
          campos: lectura.campos,
          noLeido: lectura.noLeido,
        })
      }

      return { leidos, sinLector }
    },
  }
}

/**
 * Un aviso en espanol cuando quedo algo sin leer, o `null` cuando no quedo nada.
 *
 * Devolver `null` en vez de una cadena vacia es deliberado: obliga a decidir si se pinta o no, en
 * vez de dejar un hueco vacio en la pantalla. Mismo patron que `resumenDeSaneado`.
 */
export function avisoDeComplementos(resultado: ComplementosLeidos): string | null {
  if (resultado.sinLector.length === 0) return null
  const partes = resultado.sinLector.map((c) => `"${c.nombreLocal}" (${c.motivo})`)
  return (
    `Este comprobante trae ${partes.length} complemento(s) que no se leyeron: ` +
    `${partes.join('; ')}. Sus datos NO estan en el resultado.`
  )
}
