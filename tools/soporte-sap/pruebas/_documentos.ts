/** Los puertos de la ingesta con el extractor documental REAL; el OCR se pasa aparte (real o de prueba). */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { clasePorBytes, leeCapaCero } from '../../extractor-documental/dist/index.js'
import { leeCfdi40, registroDeEsquemas, lectorDeTimbre11 } from '../../extractor-documental/dist/xml/index.js'
import type { PuertosIngesta } from '../dist/index.js'
import { HERRAMIENTA } from './_ayuda.ts'

const conTimbre = registroDeEsquemas([lectorDeTimbre11])

export function puertos(ocr: PuertosIngesta['ocr']): PuertosIngesta {
  return {
    clasePorBytes,
    leeCapaCero: (pdf) => leeCapaCero(pdf),
    leeCfdi: (xml) => {
      const l = leeCfdi40(xml, conTimbre)
      return { esCfdi: l.esCfdi, motivo: l.motivo, campos: l.campos.map((c) => ({ clave: c.clave, valor: c.valor })) }
    },
    ocr,
  }
}

export const documento = (nombre: string): Uint8Array => new Uint8Array(readFileSync(join(HERRAMIENTA, 'documentos', nombre)))

export const CONFIG = { bytesMaximos: 5_000_000, motor: 'local' as const, decisionC4: null }
