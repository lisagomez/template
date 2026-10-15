'use client'

import { CSS_CALENDARIO } from './estilos.js'

/** Inyecta los estilos una sola vez por documento (React 19 deduplica por `href`). */
export function EstilosCalendario() {
  return <style href="tu-scope-calendario" precedence="default">{CSS_CALENDARIO}</style>
}
