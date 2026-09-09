/**
 * Entry point de React. Todo lo de aqui necesita `react`, que es peerDependency OPCIONAL: quien
 * solo use el nucleo no lo instala, y por eso este subpath vive separado de `.`.
 *
 * `aplana` se re-exporta desde aqui aunque NO importe React: toca API del DOM, asi que no puede
 * vivir en el nucleo, pero se prueba sin navegador.
 */
export { ZonaDeIngesta } from './ZonaDeIngesta.js'
export type { PropiedadesDeIngesta, LoteIngresado } from './ZonaDeIngesta.js'

export { aplanaEntradas, raicesDe, desdeInput } from './aplana.js'
export type { EntradaDeArchivo, ArchivoAplanado, ResultadoDelAplanado } from './aplana.js'
