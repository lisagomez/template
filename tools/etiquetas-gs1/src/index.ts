/**
 * @tu-scope/etiquetas-gs1 — nucleo sin dependencias.
 *
 * Lo que vive aparte, en su propio punto de entrada:
 *   ./svg                 SVG con bwip-js (peer opcional, inyectado)
 *   ./navegador           clientes de Zebra Browser Print y del agente local (fetch)
 *   ./almacenes/archivo   almacen en un archivo JSON (Node)
 *   ./agente              agente local de impresion (Node, TCP 9100)
 */
export * from './diccionario/index.js'
export * from './digito.js'
export * from './fechas.js'
export * from './elementos.js'
export * from './linters.js'
export * from './prefijos.js'
export * from './valida.js'
export * from './code128.js'
export * from './medidas.js'
export * from './semaforo.js'
export * from './etiqueta.js'
export * from './zpl.js'
export * from './revision.js'
export * from './modelo.js'
export * from './csv.js'
export * from './numeracion.js'
export * from './catalogo.js'
export * from './importacion.js'
export * from './fefo.js'
export * from './almacen.js'
export * from './existencias.js'
export * from './consumibles.js'
export * from './ejemplos-consumibles.js'
