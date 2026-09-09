/**
 * Nucleo del extractor documental. TypeScript puro, CERO dependencias.
 *
 * Ni React, ni Next, ni Supabase, ni ningun proveedor de OCR: eso es lo que lo hace instalable en
 * cualquier proyecto. Lo que necesite React vive en `./react`; el manifiesto del plugin, en
 * `./plugin`, importable sin React para que un lanzador pueda pintarlo sin arrastrar nada.
 */
export type {
  EstadoDocumento,
  Procedencia,
  ClaseDeFuente,
  FormatoDeCampo,
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
  LectorDeCodigos,
  RepositorioDeRegistros,
  AlmacenDeOriginales,
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

export { identidadDe, esElMismoDocumento, identidadDeLectura } from './identidad.js'
export type { LecturaDeCodigo } from './identidad.js'

export {
  analizaCarga,
  parseaGs1,
  validaModulo10,
  validaGuiaFedexExpress,
  validaDigitoDeControl,
  esRafagaDeEscaner,
} from './codigos.js'
export type { TipoDeCarga, CargaAnalizada, OpcionesDeRafaga } from './codigos.js'

export { corrobora, exigeRevision } from './corroboracion.js'
export type { Cotejo, Acuerdo, Discrepancia } from './corroboracion.js'

export {
  encola,
  marcaSincronizada,
  marcaFallida,
  esperaAntesDeReintentar,
  desfaseDeReloj,
  avisoDeCola,
} from './cola.js'
export type { EstadoEnCola, EntradaEnCola, AlmacenLocal, AvisoDeCola } from './cola.js'

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

export { normaliza, similitud, resuelveValor, resuelveIdentificador, proponeAlta } from './reconciliacion.js'
export type {
  EstadoDeResolucion,
  FilaDeCatalogo,
  Candidato,
  Resolucion,
  OpcionesDeResolucion,
  AltaPropuesta,
} from './reconciliacion.js'

export { puede, accionesDe, exige } from './roles.js'
export type { Rol, Accion } from './roles.js'

export { abreLote, cierraLote, admiteAltas, exigeAbierto, tituloSugerido } from './registros.js'
export type { Lote, EstadoLote, TipoDeTrabajo, DatosDeLote, ResumenParaTitulo } from './registros.js'

export { versionInicial, corrige, vigente, historialLegible } from './versiones.js'
export type { VersionDeCampo } from './versiones.js'

export {
  normalizaIdentificador,
  extraeIdentificadoresIndexables,
  normalizaCriterios,
  estanVacios,
} from './busqueda.js'
export type { EntradaDeIndice, CriteriosDeBusqueda, CriteriosNormalizados } from './busqueda.js'

export { rutaDeOriginal, extensionPermitida, organizacionDeRuta, venceRetencion } from './originales.js'

export { suprime, esSuprimido } from './supresion.js'
export type { Lapida, OrdenDeSupresion, RegistroASuprimir } from './supresion.js'

export { estimaCoste, sumaEstimaciones } from './costes.js'
export type { TarifaDelMotor, Estimacion, OpcionesDeEstimacion } from './costes.js'

export { aCsv, neutralizaFormula, registraExportacion, BOM_UTF8 } from './csv.js'
export type { ColumnaCsv, RegistroDeExportacion } from './csv.js'

export { leeCapaCero, extraeConCapaCero, extraeTextoDeContenido, pareceTexto, cuentaPaginasPdf } from './capa-cero.js'
export type { ResultadoCapaCero, ExtraccionConCapaCero } from './capa-cero.js'

export { proponeModelo, preparaCatalogos, revisaSql, aNombreDeColumna, tipoSqlDe } from './modelo.js'
export type {
  PropuestaDeModelo,
  EntidadPropuesta,
  ColumnaPropuesta,
  RelacionPropuesta,
  OpcionesDeModelo,
} from './modelo.js'

export { cargaPlantilla, guardaPlantilla, comoPlantilla } from './plantilla-por-defecto.js'
export type { PlantillaCargada } from './plantilla-por-defecto.js'
