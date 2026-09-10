/**
 * Las direcciones de los esquemas del SAT, en un solo sitio y PINEADAS.
 *
 * Estan todas juntas a proposito. Son la unica parte de este lector que no se puede deducir del
 * codigo: si una letra esta mal, el comprobante no se reconoce y el sintoma es cero campos, que es
 * indistinguible de un documento vacio. Tenerlas repartidas por cinco modulos convertiria ese
 * fallo en una caceria.
 *
 * ESTADO DE LA EVIDENCIA — leer antes de fiarse:
 *
 * Estas direcciones salen de la norma publicada, NO de un documento que haya pasado por este
 * sistema. Es una diferencia que en esta casa se marca siempre, igual que `saneado.ts` distingue
 * los numeros MEDIDOS de los supuestos.
 *
 * Lo unico corroborado contra un CFDI real (el PDF de la factura que se uso para calibrar
 * `capa-cero.ts`) son las dos VERSIONES: su representacion impresa declara la 4.0, y la cadena
 * original de su timbre empieza por "||1.1|". Las direcciones en si no aparecen impresas en
 * ningun PDF, asi que siguen sin confirmar.
 *
 * QUE HACER EL DIA QUE LLEGUE EL PRIMER XML REAL, antes que nada: abrirlo, comparar cada direccion
 * con lo que declare su raiz, y cambiar esta nota. Cuesta minutos y cierra el hueco entero.
 */

/** CFDI 4.0. Vigente desde 2022; la 3.3 no se lee y esta fuera de alcance. */
export const CFDI_40 = 'http://www.sat.gob.mx/cfd/4'

/**
 * Timbre fiscal digital 1.1.
 *
 * Ojo con esta: la 1.0 y la 1.1 COMPARTEN direccion y solo se distinguen por su atributo
 * `Version`. Es el caso que obliga a que la clave del registro tenga tres partes y no dos.
 */
export const TIMBRE_11 = 'http://www.sat.gob.mx/TimbreFiscalDigital'

/** Complemento de recepcion de pagos 2.0, el que acompana a un comprobante de tipo "P". */
export const PAGOS_20 = 'http://www.sat.gob.mx/Pagos20'

/**
 * Direcciones de complementos que este paquete NO lee todavia.
 *
 * Estan declaradas y no implementadas a proposito, y no es un descuido: sin un documento real de
 * cada uno, escribir su mapeo seria transcribir la norma a ciegas. La de nomina ademas lleva datos
 * de un empleado que no eligio estar aqui, y eso pide su propio analisis de impacto (C4), no una
 * fila anadida de paso.
 *
 * Sirven para que el aviso de complemento sin lector pueda NOMBRARLOS en vez de soltar una
 * direccion cruda a la cara de quien revisa. Registrar el lector el dia que haya documento es una
 * version menor, no mayor.
 */
export const SIN_LECTOR: Readonly<Record<string, string>> = {
  'http://www.sat.gob.mx/nomina12': 'Nomina 1.2',
  'http://www.sat.gob.mx/CartaPorte31': 'Carta Porte 3.1',
  'http://www.sat.gob.mx/ComercioExterior20': 'Comercio Exterior 2.0',
}

/** El nombre legible de una direccion conocida, o `null` si no la conocemos de nada. */
export function nombreDelEsquema(espacio: string): string | null {
  if (espacio === CFDI_40) return 'CFDI 4.0'
  if (espacio === TIMBRE_11) return 'Timbre fiscal digital'
  if (espacio === PAGOS_20) return 'Pagos 2.0'
  return SIN_LECTOR[espacio] ?? null
}
