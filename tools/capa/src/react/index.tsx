'use client'

/**
 * @tu-scope/capa/react — la interfaz de la capa, APARTE del núcleo (React es peer opcional). La ventana, las
 * ranuras, el freno, el primer arranque, los ajustes y el botón «Modo conversación». Estilos propios con
 * prefijo `capa-` (no dependen del Tailwind del consumidor).
 */
export { CapaProveedor, useCapa, type ComponentesDeModulo, type PropsCapa, type ValorCapa } from './contexto.js'
export { Ventana, Ranura, EstilosCapa, moduloDeRuta, type PropsVentana } from './ventana.js'
export { Hilo, Compositor } from './hilo.js'
export { BotonModoConversacion, BotonDictar, BotonEscuchar, VozNoDisponible, ATAJO_CONVERSACION } from './voz.js'
export { PrimerArranque, Ajustes } from './guia.js'
export { AlmacenNavegador } from './almacen-navegador.js'
export { CSS_CAPA } from './estilos.js'
