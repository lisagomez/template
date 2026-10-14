/**
 * H-20: el conocimiento con el que Soporte SAP resuelve incidencias REALES. Sale de `@tu-scope/conocimiento`, la fuente
 * única de reglas de la casa, con su gate de siembra (solo se añade, cada cambio sube la versión, y lo que cambia un
 * veredicto lo firma el laboratorio). Aquí se exige:
 *
 *   · la versión EXACTA que fijó el producto, y que esa versión esté registrada (`versiones.json`);
 *   · el dominio de Soporte SAP, y solo ese;
 *   · que cada regla de ese dominio tenga la huella registrada para esa versión: un paquete editado a mano, o la matriz
 *     sintética del laboratorio, no pasan aunque digan el número de una versión registrada.
 *
 * La matriz sintética (`laboratorio/matriz.ts`) solo la usa el laboratorio. Con conocimiento de producción, el código
 * de la matriz pone los pasos del plan, pero no puede subir un veredicto: si la regla dice «al experto», ninguna entrada
 * de código lo vuelve «solución» (`consultaMatriz`).
 *
 * Las funciones del grafo se inyectan (`seleccionaDominios` y `huellas`), como el motor: este núcleo no depende de él.
 */

/** El dominio de Soporte SAP en `@tu-scope/conocimiento`. Sus reglas reales entran con la primera incidencia real, firmadas. */
export const DOMINIO_SOPORTE_SAP = 'sap-soporte'

/** Lo mínimo de un conocimiento que mira este candado (el tipo completo es el del grafo). */
export interface ConocimientoDelPaquete {
  readonly version: string
  readonly procedencia?: string
  readonly dominios: ReadonlyArray<{ readonly clave: string }>
  readonly reglas: ReadonlyArray<{ readonly clave: string }>
}

/** El registro de solo añadir del paquete (`versiones.json`): versión y huella de cada regla. */
export interface RegistroDeVersiones {
  readonly versiones: ReadonlyArray<{ readonly version: string; readonly huellas: { readonly reglas: Readonly<Record<string, { readonly huella: string }>> } }>
}

export interface FuncionesDelGrafo<C> {
  readonly seleccionaDominios: (c: C, claves: readonly string[]) => C
  readonly huellas: (c: C) => { readonly reglas: Readonly<Record<string, { readonly huella: string }>> }
}

export class ConocimientoNoAdmitido extends Error {
  constructor(motivo: string) { super(`H-20: ${motivo}`); this.name = 'ConocimientoNoAdmitido' }
}

/** Lo que el producto usa para resolver incidencias reales, o una razón para no arrancar. */
export function conocimientoDeProduccion<C extends ConocimientoDelPaquete>(
  paquete: C, fijada: string, registro: RegistroDeVersiones, grafo: FuncionesDelGrafo<C>,
): C {
  if (!/^\d+\.\d+\.\d+$/.test(fijada)) throw new ConocimientoNoAdmitido(`la versión del conocimiento va exacta, no «${fijada}»`)
  if (paquete.version !== fijada) throw new ConocimientoNoAdmitido(`el paquete es la ${paquete.version} y el producto fijó la ${fijada}`)
  const registrada = registro.versiones.find((v) => v.version === fijada)
  if (!registrada) throw new ConocimientoNoAdmitido(`la versión ${fijada} no está registrada: no pasó el gate de siembra`)
  if (/SINT[ÉE]TICO/i.test(paquete.procedencia ?? '')) throw new ConocimientoNoAdmitido('el conocimiento sintético del laboratorio no resuelve incidencias reales')
  if (!paquete.dominios.some((d) => d.clave === DOMINIO_SOPORTE_SAP)) {
    throw new ConocimientoNoAdmitido(`@tu-scope/conocimiento ${fijada} no trae el dominio ${DOMINIO_SOPORTE_SAP}: sus reglas entran con la primera incidencia real, firmadas por el laboratorio`)
  }
  const propio = grafo.seleccionaDominios(paquete, [DOMINIO_SOPORTE_SAP])
  // Las huellas se toman del paquete entero: seleccionar recorta los impactos de fuera del dominio, y eso cambiaría la
  // huella de una regla que también dicta sobre otro.
  const usadas = new Set(propio.reglas.map((r) => r.clave))
  const distintas = Object.entries(grafo.huellas(paquete).reglas)
    .filter(([clave, h]) => usadas.has(clave) && registrada.huellas.reglas[clave]?.huella !== h.huella).map(([clave]) => clave)
  if (distintas.length) throw new ConocimientoNoAdmitido(`${distintas.join(', ')}: no tienen la huella registrada para la ${fijada}`)
  return propio
}
