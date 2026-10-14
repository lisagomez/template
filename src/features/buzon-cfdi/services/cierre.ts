/**
 * Parar y cerrar el piloto (spec 015, fase 7: RF-25 a RF-27). Puro: la lista para volver a captura manual.
 *
 * RF-26: al parar, cada CFDI del buzón queda confirmado o en esta lista; ninguno se pierde. La impresa de un XML no
 * va aparte (va su XML). El receptor ajeno sí va, marcado: es de otra pyme y una persona decide qué hacer con él.
 */
import { celda } from './lectura.ts'
import type { DocumentoDelBuzon } from '../types/index.ts'

export type EstadoDelPiloto = 'activo' | 'parado' | 'cerrado'

export interface PendienteDeCaptura {
  readonly pyme: string
  readonly archivo: string
  readonly folio: string
  readonly rfc_emisor: string
  readonly total: string
  readonly fecha: string
  readonly motivo: string
}

const valor = (d: DocumentoDelBuzon, clave: string) => d.campos.find((c) => c.clave === clave)?.valor.trim() ?? ''

export function paraCapturaManual(documentos: readonly (DocumentoDelBuzon & { pyme_nombre: string })[]): PendienteDeCaptura[] {
  return documentos
    .filter((d) => d.estado === 'en_revision' || d.estado === 'receptor_ajeno')
    .map((d) => ({
      pyme: d.pyme_nombre, archivo: d.nombre_archivo, folio: d.uuid ?? '', rfc_emisor: valor(d, 'rfc_emisor'), total: valor(d, 'total'),
      fecha: valor(d, 'fecha'), motivo: d.estado === 'receptor_ajeno' ? 'receptor ajeno: decidir a qué pyme va' : 'sin confirmar',
    }))
    .sort((a, b) => a.pyme.localeCompare(b.pyme) || a.archivo.localeCompare(b.archivo))
}

export const COLUMNAS_PENDIENTES = ['pyme', 'archivo', 'folio', 'rfc_emisor', 'total', 'fecha', 'motivo'] as const

/** La lista para captura manual, en CSV para el despacho. Celdas seguras: sin fórmulas al abrirla. */
export function pendientesACsv(pendientes: readonly PendienteDeCaptura[]): string {
  const filas = pendientes.map((p) => COLUMNAS_PENDIENTES.map((c) => celda(p[c])).join(','))
  return [COLUMNAS_PENDIENTES.join(','), ...filas].join('\r\n') + '\r\n'
}
