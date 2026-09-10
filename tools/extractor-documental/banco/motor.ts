/**
 * Un `MotorOcr` de mentira, determinista y sin red.
 *
 * QUE ES: un adaptador que cumple el puerto y produce campos con confianzas reproducibles a partir
 * del contenido. Sirve para ejercitar el camino completo —incluida la cola de revision, que solo
 * aparece cuando algun campo queda por debajo del umbral que el integrador elija.
 *
 * QUE **NO** ES, y conviene que quede escrito porque es la confusion cara: **esto no mide nada, y
 * las confianzas que emite no autorizan a fijar ningun umbral.** Son numeros fabricados por este
 * archivo, no medidos sobre documentos reales. TAR-17 y TAR-25 siguen bloqueadas y este motor no
 * las toca ni las acerca: lo que decide donde cortar es la correlacion entre la puntuacion de un
 * motor DE VERDAD y el error real sobre un corpus real, y eso se mide con `npm run mide`.
 *
 * El `modelo` va pineado como exige el puerto (C1). Que sea un motor de mentira no lo exime: un
 * alias autoactualizable en un adaptador de pruebas ensena el patron equivocado.
 */
import type { MotorOcr, PaginaExtraida, CampoExtraido, LimitesDelMotor } from '../dist/index.js'
import { estadoDeSemilla } from './aleatorio.ts'

/** Limites inventados pero con la FORMA de los reales: el troceo se ejercita igual. */
const LIMITES: LimitesDelMotor = {
  bytesMaximos: 50 * 1024 * 1024,
  paginasMaximas: 1000,
  paginasPorAnotacion: 8,
}

const PATRONES: readonly (readonly [string, RegExp, CampoExtraido['formato']])[] = [
  ['folio', /^Folio:\s*(.+)$/m, 'identificador'],
  ['proveedor', /^Emisor:\s*(.+)$/m, 'texto'],
  ['rfc_emisor', /^RFC:\s*(.+)$/m, 'identificador'],
  ['fecha', /^Fecha:\s*(.+)$/m, 'texto'],
  ['gtin', /(\d{13})/, 'identificador'],
  ['total', /^Total:\s*(.+)$/m, 'texto'],
]

/**
 * Confianza derivada del contenido y de la clave. Reproducible: el mismo documento produce siempre
 * la misma, que es lo que permite afirmar en una prueba "este campo cae en revision" sin que
 * dependa de la suerte.
 *
 * El reparto —la mayoria alta, una minoria baja— imita la forma de un motor real, y esa es toda su
 * ambicion. No es una distribucion medida.
 */
function confianzaDe(texto: string, clave: string): number {
  const h = estadoDeSemilla(`${clave}::${texto}`)
  const bruto = (h % 1000) / 1000
  // Cuatro de cada cinco caen en [0,86 , 0,99]; el resto, en [0,40 , 0,72]. La cola baja tiene que
  // existir: sin campos dudosos, la cola de revision nunca se recorre y el flujo que mas importa
  // —el humano corrigiendo— se quedaria sin probar.
  return bruto < 0.8 ? 0.86 + (bruto / 0.8) * 0.13 : 0.4 + ((bruto - 0.8) / 0.2) * 0.32
}

export interface OpcionesDelMotor {
  /** Identificador PINEADO del modelo simulado. */
  modelo?: string
}

export function motorDeBanco(opciones: OpcionesDelMotor = {}): MotorOcr {
  const modelo = opciones.modelo ?? 'banco-ficticio-1.0.0'
  return {
    modelo,
    limites: LIMITES,
    async extrae(documento: Uint8Array): Promise<PaginaExtraida[]> {
      if (documento.byteLength > LIMITES.bytesMaximos) {
        throw new Error(`el documento excede ${LIMITES.bytesMaximos} bytes`)
      }
      const texto = new TextDecoder().decode(documento)
      const campos: CampoExtraido[] = []
      for (const [clave, patron, formato] of PATRONES) {
        const encontrado = patron.exec(texto)
        if (encontrado === null) continue
        const valor = encontrado[1].trim()
        campos.push({
          clave,
          valor,
          confianza: confianzaDe(texto, clave),
          procedencia: 'ocr',
          formato,
          // La region es obligatoria de hecho para todo lo que venga de una imagen: un dato sin
          // coordenada no se puede auditar a los seis meses. Se deriva de la linea en que aparecio.
          region: {
            pagina: 0,
            x: 0.08,
            y: Math.min(0.95, 0.05 + texto.slice(0, encontrado.index).split('\n').length * 0.07),
            ancho: 0.84,
            alto: 0.05,
          },
        })
      }
      return [{ indice: 0, markdown: texto, campos }]
    },
  }
}
