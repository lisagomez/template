/**
 * Cargar y guardar la plantilla por defecto de un tipo de documento. Cierra el lazo de TAR-12:
 * «el trabajo del humano se paga una vez».
 *
 * POR QUE ESTO NO ES UN HOOK, que es como estaba escrito primero: la version anterior era
 * `usePlantilla`, y hacia la carga dentro de un `useEffect` llamando a `setState` con lo que
 * volviera. `react-hooks/set-state-in-effect` lo rechazo en el gate, y la regla tenia razon de
 * fondo: eso mete IO y una condicion de carrera —una carga lenta de un tipo pisando la del tipo
 * actual— dentro del arbol de React, justo donde no se puede probar sin navegador.
 *
 * Sacarlo aqui lo arregla de raiz en vez de callar la regla: son dos funciones `async` sin React
 * ni DOM, viven en el NUCLEO, y se prueban con `node --test`. Quien las use decide donde cargar
 * —un Server Component, su capa de datos, lo que sea— y le pasa la plantilla a `TablaDeRevision`
 * como prop, que es lo que ese componente ya aceptaba.
 *
 * La leccion, que vale mas alla de este archivo: cuando una regla de lint choca con un diseño,
 * merece la pena mirar si la regla esta señalando el diseño. Aqui lo estaba.
 */
import type { AlmacenPlantillas } from './puertos.js'
import type { CampoDePlantilla, PlantillaDeRevision } from './plantilla.js'

/**
 * Valida lo leido del almacen. Llega como `unknown` por contrato del puerto, y ademas lo escribio
 * una version anterior de la herramienta: una plantilla a medias aplicada a ciegas esconde campos
 * que el revisor tendria que ver.
 */
export function comoPlantilla(crudo: unknown, tipoDocumento: string): PlantillaDeRevision | null {
  if (typeof crudo !== 'object' || crudo === null) return null
  const p = crudo as Record<string, unknown>
  if (!Array.isArray(p.campos)) return null
  const campos = p.campos.filter((c): c is CampoDePlantilla => {
    if (typeof c !== 'object' || c === null) return false
    const campo = c as Record<string, unknown>
    return typeof campo.clave === 'string' && campo.clave.length > 0
  })
  // Una plantilla sin campos utiles no aplica nada: es exactamente como no tener plantilla, y
  // decirlo con `null` evita que la UI distinga dos casos que se comportan igual.
  if (campos.length === 0) return null
  return { tipoDocumento: typeof p.tipoDocumento === 'string' ? p.tipoDocumento : tipoDocumento, campos }
}

export interface PlantillaCargada {
  plantilla: PlantillaDeRevision | null
  /** Por que no hay plantilla, si es que FALLO. `null` cuando simplemente no habia ninguna. */
  error: string | null
}

/**
 * Carga la plantilla por defecto. **No lanza**: un fallo devuelve `plantilla: null` con su motivo.
 *
 * Es deliberado. La revision funciona sin plantilla, asi que no poder leer una preferencia no
 * justifica dejar al revisor sin pantalla. Pero el motivo se conserva en vez de tragarselo: quien
 * llame decide si lo enseña, y sin el, «no habia plantilla» y «no se pudo leer» serian
 * indistinguibles.
 */
export async function cargaPlantilla(
  almacen: AlmacenPlantillas,
  tipoDocumento: string,
): Promise<PlantillaCargada> {
  try {
    const crudo = await almacen.leePorDefecto(tipoDocumento)
    return { plantilla: comoPlantilla(crudo, tipoDocumento), error: null }
  } catch (e) {
    return { plantilla: null, error: e instanceof Error ? e.message : 'no se pudo leer la plantilla' }
  }
}

/**
 * Guarda la disposicion como predeterminada. **Si lanza, lanza**: al reves que la carga.
 *
 * La asimetria es el punto. Fallar al leer una preferencia es un inconveniente; fallar al guardar
 * el trabajo de revision de una persona y no decirselo le hace creer que quedo a salvo cuando no.
 */
export async function guardaPlantilla(
  almacen: AlmacenPlantillas,
  plantilla: PlantillaDeRevision,
): Promise<void> {
  await almacen.guardaPorDefecto(plantilla.tipoDocumento, plantilla)
}
