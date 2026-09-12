/**
 * Las direcciones de los esquemas del SAT, en un solo sitio y PINEADAS.
 *
 * Estan todas juntas a proposito. Son la unica parte de este lector que no se puede deducir del
 * codigo: si una letra esta mal, el comprobante no se reconoce y el sintoma es cero campos, que es
 * indistinguible de un documento vacio. Tenerlas repartidas por cinco modulos convertiria ese
 * fallo en una caceria.
 *
 * ESTADO DE LA EVIDENCIA:
 *
 * `CFDI_40` y `TIMBRE_11` estan **CONFIRMADAS** contra un CFDI 4.0 real de honorarios, timbrado,
 * el 2026-09-10. Su raiz declara exactamente `http://www.sat.gob.mx/cfd/4` y su timbre exactamente
 * `http://www.sat.gob.mx/TimbreFiscalDigital`, con las versiones "4.0" y "1.1". Nacieron de la
 * norma publicada y ahora las respalda un documento que paso por aqui — que no es lo mismo, y por
 * eso se distingue, igual que `saneado.ts` distingue los numeros MEDIDOS de los supuestos.
 *
 * `PAGOS_20` esta **CONFIRMADA contra su esquema oficial**, no contra un documento: el XSD publicado
 * declara esa direccion como su `targetNamespace`. Es una confirmacion mas debil y conviene no
 * confundirlas — la direccion es correcta, pero el MAPEO de campos de ese complemento sigue sin
 * ejercitarse contra un recibo de pago real, y ahi es donde aparecen las sorpresas.
 *
 * Quien compara todo esto es `medicion/deriva.mjs`, que sale a la red a proposito y se ejecuta a
 * mano. No esta en `npm run validate`: meter la red en el gate lo vuelve intermitente.
 *
 * El documento real dejo ademas un defecto al descubierto que ninguna prueba sintetica veia: el
 * bloque de impuestos se perdia entero y en silencio. Esta arreglado, y `pruebas/fixtures/
 * cfdi-40-honorarios-retenciones.xml` conserva su forma con los datos cambiados.
 */

/** CFDI 4.0. CONFIRMADA contra documento real. Vigente desde 2022; la 3.3 esta fuera de alcance. */
export const CFDI_40 = 'http://www.sat.gob.mx/cfd/4'

/**
 * Timbre fiscal digital 1.1.
 *
 * CONFIRMADA contra documento real, donde ademas el timbre declara este `xmlns` EN SI MISMO y
 * no en la raiz — de ahi que los ambitos tengan que resolverse por elemento.
 *
 * Ojo: la 1.0 y la 1.1 COMPARTEN direccion y solo se distinguen por su atributo `Version`. Es
 * el caso que obliga a que la clave del registro tenga tres partes y no dos.
 */
export const TIMBRE_11 = 'http://www.sat.gob.mx/TimbreFiscalDigital'

/** Pagos 2.0, el que acompana a un comprobante de tipo "P". Direccion confirmada contra el XSD. */
export const PAGOS_20 = 'http://www.sat.gob.mx/Pagos20'

/**
 * Comercio Exterior 2.0, el que acompana a una factura de EXPORTACION (`Exportacion="02"`).
 * Direccion CONFIRMADA contra su esquema oficial (`ComercioExterior20.xsd`, leido el 2026-09-12),
 * no contra un documento: el mapeo sigue sin ejercitarse contra una factura de exportacion real.
 */
export const COMERCIO_EXTERIOR_20 = 'http://www.sat.gob.mx/ComercioExterior20'

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
}

/** El nombre legible de una direccion conocida, o `null` si no la conocemos de nada. */
export function nombreDelEsquema(espacio: string): string | null {
  if (espacio === CFDI_40) return 'CFDI 4.0'
  if (espacio === TIMBRE_11) return 'Timbre fiscal digital'
  if (espacio === PAGOS_20) return 'Pagos 2.0'
  if (espacio === COMERCIO_EXTERIOR_20) return 'Comercio Exterior 2.0'
  return SIN_LECTOR[espacio] ?? null
}
