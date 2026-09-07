/**
 * La plantilla de revision y su reducer. Puro.
 *
 * Es el artefacto que justifica toda la herramienta: la revision no solo corrige un documento,
 * PRODUCE la disposicion que la siguiente tanda del mismo tipo hereda. El trabajo del humano se
 * paga una vez.
 *
 * Por eso `deshabilitar` registra quien y cuando: un campo apagado por comodidad desaparece en
 * silencio de los mil documentos siguientes, y meses despues nadie sabe si falta porque no venia
 * o porque alguien lo apago un martes.
 */

export interface CampoDePlantilla {
  clave: string
  etiqueta: string
  visible: boolean
  editable: boolean
  orden: number
  deshabilitadoPor?: string
  deshabilitadoEn?: string
}

export interface PlantillaDeRevision {
  tipoDocumento: string
  campos: readonly CampoDePlantilla[]
}

export type AccionDePlantilla =
  | { tipo: 'habilitar'; clave: string }
  | { tipo: 'deshabilitar'; clave: string; por: string }
  | { tipo: 'renombrar'; clave: string; etiqueta: string }
  | { tipo: 'reordenar'; clave: string; orden: number }

/** Plantilla inicial a partir de las claves que trajo la extraccion. Todo visible y editable. */
export function plantillaInicial(tipoDocumento: string, claves: readonly string[]): PlantillaDeRevision {
  return {
    tipoDocumento,
    campos: claves.map((clave, i) => ({ clave, etiqueta: clave, visible: true, editable: true, orden: i })),
  }
}

function aplicaA(campo: CampoDePlantilla, accion: AccionDePlantilla, ahora: string): CampoDePlantilla {
  switch (accion.tipo) {
    case 'habilitar':
      // Se limpia la marca: si vuelve a apagarse, la autoria nueva no debe heredar la vieja.
      return { clave: campo.clave, etiqueta: campo.etiqueta, visible: true, editable: campo.editable, orden: campo.orden }
    case 'deshabilitar':
      return { ...campo, visible: false, deshabilitadoPor: accion.por, deshabilitadoEn: ahora }
    case 'renombrar':
      return { ...campo, etiqueta: accion.etiqueta }
    case 'reordenar':
      return { ...campo, orden: accion.orden }
  }
}

/**
 * Aplica una accion y devuelve una plantilla NUEVA. Nunca muta la entrada: sin eso, deshacer en la
 * UI es imposible de implementar bien.
 */
export function reducePlantilla(
  plantilla: PlantillaDeRevision,
  accion: AccionDePlantilla,
  ahora: Date = new Date(),
): PlantillaDeRevision {
  if (!plantilla.campos.some((c) => c.clave === accion.clave)) {
    throw new Error(`La plantilla no tiene ningun campo "${accion.clave}"`)
  }
  const marca = ahora.toISOString()
  const campos = plantilla.campos.map((c) => (c.clave === accion.clave ? aplicaA(c, accion, marca) : c))
  return { ...plantilla, campos }
}

/** Los campos que la pantalla muestra, ya en orden. */
export function camposVisibles(plantilla: PlantillaDeRevision): readonly CampoDePlantilla[] {
  return plantilla.campos.filter((c) => c.visible).slice().sort((a, b) => a.orden - b.orden)
}

/** Quien apago que, para poder preguntarselo. Es la traza que exige el impacto sobre terceros. */
export function camposDeshabilitados(plantilla: PlantillaDeRevision): readonly CampoDePlantilla[] {
  return plantilla.campos.filter((c) => !c.visible)
}
