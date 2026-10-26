/**
 * @tu-scope/capa — la capa común de la fábrica: toda herramienta, app y producto se siente igual (una ventana,
 * operación por intención, memoria propia, plan, voz, lienzo, el freno y el primer arranque) y en sus ranuras
 * se enchufa lo que cada módulo ya hizo.
 *
 * El NÚCLEO no importa React, ni Next, ni Supabase. El disco va aparte (`./almacenes/archivo`) y la interfaz
 * también (`./react`). Lo adoptado de Arbrain (Apache-2.0) lleva su procedencia en `mapa.json` y `NOTICE`.
 */
export * from './ranuras.js'
export * from './enchufe.js'
export * from './freno.js'
export * from './intencion.js'
export * from './memoria.js'
export * from './voz.js'
export * from './composicion.js'
export * from './resumen.js'
export * from './primer-arranque.js'
export * from './conversacion.js'
