/**
 * Fabrica de documentos sinteticos: las "facturas" que entran al extractor.
 *
 * Son texto plano, no PDF ni imagen, y es deliberado. Un PDF de verdad obligaria a meter un
 * generador de PDF —una dependencia— para producir algo cuyo unico proposito es que el motor de
 * mentira lo lea. Lo que este banco ejercita es el CAMINO (ingesta, revision, mapeo, persistencia,
 * recuperacion), no el OCR: el OCR real se mide con `npm run mide` sobre el corpus real, que es
 * otra cosa y esta bloqueada a proposito.
 *
 * Lo que si es fiel es el CONTENIDO: cada factura trae una variante ortografica del proveedor
 * —nunca su forma canonica— porque si el documento dijera exactamente lo que dice el catalogo, la
 * reconciliacion no tendria nada que resolver y la prueba pasaria sin probar nada.
 */
import type { Aleatorio } from './aleatorio.ts'
import { PROVEEDORES, PRODUCTOS, GTIN_AUSENTES } from './negocio.ts'

export interface FacturaSintetica {
  /** Folio del documento. Es lo que una persona busca despues. */
  folio: string
  /** El nombre TAL COMO aparece escrito en el papel: una variante, no la forma del catalogo. */
  proveedorEscrito: string
  /** El id del catalogo al que deberia resolver. `null` si es un proveedor que no esta. */
  proveedorEsperado: string | null
  rfc: string
  gtin: string
  /** `true` si ese GTIN NO esta en el catalogo (el escenario peligroso de §2.10). */
  gtinAusente: boolean
  total: string
  emitidaEn: string
  /** El texto completo, que es lo que "lee" el motor. */
  texto: string
}

const MESES = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']

function componeTexto(f: Omit<FacturaSintetica, 'texto'>): string {
  return [
    'FACTURA',
    `Folio: ${f.folio}`,
    `Emisor: ${f.proveedorEscrito}`,
    `RFC: ${f.rfc}`,
    `Fecha: ${f.emitidaEn}`,
    '',
    'Concepto                         GTIN            Importe',
    `Mercancia surtida                ${f.gtin}   ${f.total}`,
    '',
    `Total: ${f.total}`,
  ].join('\n')
}

/**
 * Genera `cuantas` facturas de forma determinista a partir del generador con semilla.
 *
 * Una de cada seis lleva un GTIN AUSENTE del catalogo. No es ruido: es el caso que decide si la
 * herramienta responde "no esta" o cuela el pariente mas parecido, y sin sembrarlo no aparece.
 */
export function generaFacturas(azar: Aleatorio, cuantas: number): readonly FacturaSintetica[] {
  const salida: FacturaSintetica[] = []
  for (let i = 0; i < cuantas; i += 1) {
    const proveedor = azar.elige(PROVEEDORES)
    const usaAusente = i % 6 === 5
    const producto = azar.elige(PRODUCTOS)
    const ausente = azar.elige(GTIN_AUSENTES)
    const sin = {
      folio: `A-${String(1000 + i).padStart(4, '0')}`,
      proveedorEscrito: azar.elige(proveedor.variantes),
      proveedorEsperado: proveedor.id,
      rfc: proveedor.rfc,
      gtin: usaAusente ? ausente.gtin : producto.gtin,
      gtinAusente: usaAusente,
      total: `${azar.entero(1200, 98000) / 100}`,
      emitidaEn: `2026-${azar.elige(MESES)}-${String(azar.entero(1, 28)).padStart(2, '0')}`,
    }
    salida.push({ ...sin, texto: componeTexto(sin) })
  }
  return salida
}

/** Los bytes que se le pasan al motor. UTF-8, que es lo que `identidadDe()` va a hashear. */
export function comoBytes(factura: FacturaSintetica): Uint8Array {
  return new TextEncoder().encode(factura.texto)
}
