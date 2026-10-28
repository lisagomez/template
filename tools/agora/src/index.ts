/**
 * @tu-scope/agora — el núcleo de Ágora. Sin React, Next ni Supabase: la base (Postgres con RLS forzada) impone
 * las reglas y este núcleo dice quién habla, arma las propuestas con su huella y orquesta a los agentes.
 */
export * from './base/tipos.js'
export * from './base/como.js'
export * from './base/migra.js'
export * from './huella.js'
export * from './tarea.js'
export * from './llaves.js'
export * from './propuesta.js'
export * from './supervisor.js'
export * from './lecturas.js'
export * from './operaciones.js'
