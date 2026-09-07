/**
 * Nucleo del extractor documental. TypeScript puro, CERO dependencias.
 *
 * Ni React, ni Next, ni Supabase, ni ningun proveedor de OCR: eso es lo que lo hace instalable en
 * cualquier proyecto. Lo que necesite React vive en `./react`; el manifiesto del plugin, en
 * `./plugin`, importable sin React para que un lanzador pueda pintarlo sin arrastrar nada.
 */
export type {
  EstadoDocumento,
  Region,
  CampoExtraido,
  PaginaExtraida,
  TipoDeArchivo,
  ArchivoEntrante,
  ArchivoAceptado,
  ArchivoRechazado,
  Clasificacion,
  LimitesDelMotor,
} from './tipos.js'

export type {
  MotorOcr,
  AlmacenDocumentos,
  AlmacenPlantillas,
  EsquemaExistente,
  OpcionesDeExtraccion,
} from './puertos.js'

export {
  ESTADO_INICIAL,
  ESTADOS_TERMINALES,
  esTerminal,
  esFallo,
  esperaHumano,
  puedeTransitar,
  transita,
  siguientes,
} from './estados.js'

export { tipoDe, clasificaArchivo, clasificaLote, troceaPaginas } from './archivos.js'
export type { ResultadoDeIngesta } from './archivos.js'

export { identidadDe, esElMismoDocumento } from './identidad.js'

export { plantillaInicial, reducePlantilla, camposVisibles, camposDeshabilitados } from './plantilla.js'
export type { CampoDePlantilla, PlantillaDeRevision, AccionDePlantilla } from './plantilla.js'

export {
  esquemaVacio,
  esquemaDeclarado,
  validaDescriptor,
  buscaTabla,
  buscaColumna,
  catalogos,
  detectaDesalineacion,
} from './esquema.js'
export type {
  DescriptorDeEsquema,
  TablaDescrita,
  ColumnaDescrita,
  ReferenciaAColumna,
  ResultadoDeValidacion,
  Desalineacion,
} from './esquema.js'

export { normaliza, similitud, resuelveValor, proponeAlta } from './reconciliacion.js'
export type {
  EstadoDeResolucion,
  FilaDeCatalogo,
  Candidato,
  Resolucion,
  OpcionesDeResolucion,
  AltaPropuesta,
} from './reconciliacion.js'
