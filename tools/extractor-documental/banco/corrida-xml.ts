/**
 * El mismo negocio ficticio, por la via del XML, y comparado contra la via del OCR.
 *
 * QUE PRUEBA ESTO QUE NO PRUEBEN LAS 608 UNITARIAS. Que el camino ENTERO se recorre: leer, mapear
 * contra los catalogos, y decidir si alguien tiene que mirarlo. Las unitarias cubren cada pieza;
 * esto cubre lo que pasa cuando se encadenan, que es donde viven los hechos incomodos.
 *
 * ⚠️ EL UMBRAL ES UN PARAMETRO OBLIGATORIO Y SIN VALOR POR DEFECTO, igual que en `corrida.ts`.
 * TAR-17 sigue bloqueada: el numero de esta demostracion no es una recomendacion.
 */
import type { CampoExtraido } from '../dist/index.js'
import { resuelveValor, resuelveIdentificador } from '../dist/index.js'
import { leeCfdi40, camposParaCotejo, registroDeEsquemas, lectorDeTimbre11 } from '../dist/xml/index.js'
import { aplicaPlantilla, puedeValidarseSinRevision, cuentaBajoUmbral } from '../dist/react/revision.js'
import type { FacturaSintetica } from './documentos.ts'
import { comoCfdi } from './cfdi.ts'
import type { Base } from './base.ts'
import { catalogoDe } from './descriptor.ts'

export interface OpcionesXml {
  umbralDeConfianza: number
  umbralDeSimilitud: number
  margenDeAmbiguedad: number
}

export interface LecturaDelBanco {
  folio: string
  /** Los campos que salieron del XML, ya unidos a los del timbre. */
  campos: readonly CampoExtraido[]
  proveedorResuelto: string | null
  proveedorEstado: string
  gtinResuelto: string | null
  gtinEstado: string
  /** Sin cotejar contra nada: la barrera nueva tiene que decir que NO. */
  seAutoValida: boolean
  /** Y con cotejo, que si: la barrera frena lo no cotejado, no el XML por ser XML. */
  seAutoValidaCotejado: boolean
  bajoUmbral: number
  selloVerificado: boolean
  timbrado: boolean
}

/** El registro que un proyecto declararia: aqui solo el timbre, que es lo universal. */
const REGISTRO = registroDeEsquemas([lectorDeTimbre11])

export function leeComoXml(
  base: Base,
  facturas: readonly FacturaSintetica[],
  opciones: OpcionesXml,
): readonly LecturaDelBanco[] {
  const proveedores = catalogoDe(base, 'proveedores')
  const productos = catalogoDe(base, 'productos')

  return facturas.map((f) => {
    const lectura = leeCfdi40(comoCfdi(f), REGISTRO)
    const campos = camposParaCotejo(lectura)

    // Se reconcilia EXACTAMENTE igual que la via del OCR: mismo catalogo, mismos umbrales. La
    // unica diferencia es de donde salio el dato, que es justo lo que se quiere comparar.
    const escrito = campos.find((c) => c.clave === 'nombre_emisor')?.valor ?? ''
    const proveedor = resuelveValor(escrito, proveedores, {
      umbral: opciones.umbralDeSimilitud,
      margenDeAmbiguedad: opciones.margenDeAmbiguedad,
    })

    const delRenglon = lectura.conceptos[0]?.campos ?? []
    const leidoGtin = delRenglon.find((c) => c.clave === 'no_identificacion')?.valor
    const gtin = leidoGtin === undefined ? null : resuelveIdentificador(leidoGtin, productos)

    // La decision de revision se toma con la MISMA funcion que usa la vista real. Reimplementarla
    // aqui daria un resultado bonito que no significaria nada.
    // Sin plantilla: se juzgan todos los campos, que es el caso por defecto de un proyecto
    // que todavia no ha configurado ninguna.
    const filas = aplicaPlantilla([...campos, ...delRenglon], null, opciones.umbralDeConfianza)

    return {
      folio: f.folio,
      campos,
      proveedorResuelto: proveedor.elegida?.id ?? null,
      proveedorEstado: proveedor.estado,
      gtinResuelto: gtin?.elegida?.id ?? null,
      gtinEstado: gtin === null ? 'sin_dato' : gtin.estado,
      // `false` a proposito: esta corrida NO coteja contra segunda fuente. Es el caso que
      // destapo el hueco, y ahora la barrera lo frena en vez de dejarlo pasar.
      seAutoValida: puedeValidarseSinRevision(filas, false),
      seAutoValidaCotejado: puedeValidarseSinRevision(filas, true),
      bajoUmbral: cuentaBajoUmbral(filas),
      selloVerificado: lectura.sello.verificado,
      timbrado: lectura.timbrado,
    }
  })
}
