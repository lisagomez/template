/**
 * El timbre fiscal digital 1.1: lo que el SAT anade cuando un comprobante se timbra.
 *
 * Es el complemento que trae el identificador unico, y por eso es el primero que se construye. Pero
 * el caso que gobierna el modulo NO es el de su presencia, sino el de su AUSENCIA.
 *
 * Un comprobante sin timbrar —un borrador, o uno que el certificador rechazo— no lo lleva. Si el
 * lector se limitara a devolver un identificador vacio, ese documento entraria al sistema como una
 * factura normal a la que le falta un campo, y seguiria su camino. Que un comprobante NO este
 * timbrado es el hecho mas importante que este lector puede reportar, asi que se reporta como
 * hecho, no como hueco.
 *
 * Cuidado con la version: la 1.0 y la 1.1 comparten direccion y solo se distinguen por su atributo
 * `Version`. Ese es el caso que obliga a que la clave del registro tenga tres partes.
 */
import type { CampoExtraido } from '../../tipos.js'
import type { Elemento } from '../arbol.js'
import { atributo } from '../arbol.js'
import type { LectorDeComplemento } from '../registro.js'
import { TIMBRE_11 } from './espacios.js'

/**
 * Atributo del timbre a clave del campo.
 *
 * `UUID` sale como `uuid` porque es exactamente la clave que emite `camposCfdi` para el codigo
 * impreso del SAT. Esa coincidencia no es casual: es lo que permite que `corrobora` cotee el XML
 * contra el QR sin una linea de codigo nueva.
 */
const CAMPOS: readonly (readonly [string, string])[] = [
  ['UUID', 'uuid'],
  ['FechaTimbrado', 'fecha_timbrado'],
  ['RfcProvCertif', 'rfc_proveedor_certificacion'],
  ['NoCertificadoSAT', 'no_certificado_sat'],
]

/**
 * Los dos sellos del timbre.
 *
 * Salen bajo claves PROPIAS, y jamas bajo `sello`, que es la que usa el codigo impreso. Dos
 * motivos independientes, y cada uno basta:
 *
 *  1. El codigo impreso lleva solo los OCHO ultimos caracteres del sello, no el sello entero.
 *  2. `corrobora` normaliza a mayusculas antes de comparar. Es correcto para un registro fiscal y
 *     FALSO para base64: dejaria pasar por identicos dos sellos que difieren solo en el caso de
 *     una letra, y el sello es justo el campo que existe para detectar una sustitucion.
 */
const SELLOS: readonly (readonly [string, string])[] = [
  ['SelloCFD', 'sello_cfd'],
  ['SelloSAT', 'sello_sat'],
]

const CONOCIDOS = new Set([
  'Version',
  ...CAMPOS.map(([atributoDelSat]) => atributoDelSat),
  ...SELLOS.map(([atributoDelSat]) => atributoDelSat),
])

/**
 * Lee el timbre. Todo campo sale con confianza 1 y procedencia `xml`, que aqui significa "el
 * documento dice esto" — nunca "esto es cierto". Lo segundo depende del sello, y este lector NO lo
 * verifica ni puede.
 */
export const lectorDeTimbre11: LectorDeComplemento = {
  clave: { espacio: TIMBRE_11, nombreLocal: 'TimbreFiscalDigital', version: '1.1' },
  nombre: 'Timbre fiscal digital 1.1',

  lee(nodo: Elemento) {
    const campos: CampoExtraido[] = []
    for (const [atributoDelSat, clave] of [...CAMPOS, ...SELLOS]) {
      const valor = atributo(nodo, atributoDelSat)
      if (valor === null) continue
      campos.push({
        clave,
        valor,
        confianza: 1,
        procedencia: 'xml',
        // Un identificador se resuelve por igualdad EXACTA, nunca por parecido. Dos identificadores
        // que difieren en un caracter son documentos distintos y se parecen un 97 %.
        formato: 'identificador',
      })
    }

    // Si el SAT anade un atributo, este lector lo dice en vez de tragarselo. Sale gratis y es la
    // unica forma de enterarse sin leer la norma cada trimestre.
    const noLeido = nodo.atributos
      .filter((a) => a.espacio === null && !CONOCIDOS.has(a.nombreLocal))
      .map((a) => a.nombreLocal)

    return { campos, noLeido }
  },
}
