/**
 * Manifiesto del plugin. **Importable sin React**, y sin importar el nucleo tampoco.
 *
 * Un lanzador que solo quiere pintar el nombre y el icono no deberia arrastrar React ni la logica
 * de extraccion. Por eso este archivo no importa nada.
 *
 * El icono viaja como SVG EN LINEA, no como import de una libreria de iconos. Una herramienta que
 * hace `import { FileText } from 'lucide-react'` obliga a instalar lucide en todo proyecto que
 * solo queria leer su nombre — y en este template lucide ni siquiera esta instalado.
 */

export interface ManifiestoDePlugin {
  id: string
  nombre: string
  descripcion: string
  /** Ruta relativa donde la app anfitriona monta la herramienta. */
  ruta: string
  version: string
  /** SVG completo, listo para inyectar. `currentColor` para que herede el tema del anfitrion. */
  icono: string
  capacidades: readonly string[]
}

const ICONO = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"',
  ' stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
  '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>',
  '<path d="M14 3v5h5"/>',
  '<path d="M9 12h6"/><path d="M9 16h4"/>',
  '</svg>',
].join('')

export const manifiesto: ManifiestoDePlugin = {
  id: 'extractor-documental',
  nombre: 'Extractor documental',
  descripcion:
    'Carga masiva de PDF, imagenes y carpetas, revision humana de lo extraido y mapeo contra los catalogos que el proyecto ya tiene.',
  ruta: '/extractor-documental',
  version: '0.2.0',
  icono: ICONO,
  capacidades: ['ingesta', 'revision', 'plantillas', 'mapeo-de-catalogos', 'modelado', 'lectura-de-xml'],
}

export default manifiesto
