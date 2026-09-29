/**
 * Qué pantalla de `/etiquetas` depende de qué herramienta del laboratorio. Vive aparte del catálogo
 * para que el navegador (el marco de `/etiquetas`) lo importe sin arrastrar los casos ni el núcleo.
 */
import type { IdHerramienta } from './tipos.ts';

export const PANTALLAS: Readonly<Record<IdHerramienta, readonly string[]>> = {
  etiqueta: ['/etiquetas', '/etiquetas/rollos'],
  impresion: ['/etiquetas/impresoras'],
  lectura: ['/etiquetas/leer', '/etiquetas/caducidades'],
  catalogo: ['/etiquetas/catalogo'],
  recepcion: ['/etiquetas/recibir'],
  // La fecha por foto no apaga una pantalla: sin aprobar, la recepción con foto sigue y la fecha se teclea.
  'fecha-foto': [],
  zonas: ['/etiquetas/escanear', '/etiquetas/mover'],
  ronda: ['/etiquetas/dia'],
  conteo: ['/etiquetas/conteo'],
  expediente: ['/etiquetas/expediente', '/etiquetas/integridad'],
  agente: ['/etiquetas/riesgo'],
};

export const NOMBRE_HERRAMIENTA: Readonly<Record<IdHerramienta, string>> = {
  etiqueta: 'Etiqueta GS1-128', impresion: 'Impresión en la Zebra', lectura: 'Lectura y semáforo', catalogo: 'Catálogo', recepcion: 'Recepción', 'fecha-foto': 'Fecha por foto',
  zonas: 'Escanear por zona', ronda: 'Ronda del día', conteo: 'Conteo ciego', expediente: 'Expediente e integridad', agente: 'Agente de riesgo',
};

/** La herramienta de la que depende una pantalla (ninguna: la pantalla no depende del laboratorio). */
export function herramientaDePantalla(ruta: string): IdHerramienta | undefined {
  return (Object.keys(PANTALLAS) as IdHerramienta[]).find((id) => PANTALLAS[id].includes(ruta));
}
