export {
  Clave,
  Fecha,
  TextoVeredicto,
  Jurisdiccion,
  Dimension,
  Categoria,
  Impacto,
  Regla,
  Dominio,
  Conocimiento,
  Motivo,
  Fuente,
  ConceptoEvaluado,
  Resultado,
  FalloSinVeredicto,
} from './contrato.js'
export { validaConocimiento, type Problema, type TipoProblema, type Validacion } from './valida.js'
export {
  CORTE_HERMES,
  VOCABULARIO_HERMES,
  desdeHermes,
  SalidaHermes,
  RAZON_SIN_REGLA_HERMES,
  type OpcionesAdaptador,
} from './hermes.js'
export { CorpusParidad, CasoParidad, expandeSalida, compactaCorpus } from './paridad.js'
export { seleccionaDominios } from './selecciona.js'
