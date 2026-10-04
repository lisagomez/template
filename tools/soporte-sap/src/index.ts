export {
  leeMatriz, cuentaReuso, bloqueReuso, conBloqueReuso, bloqueReusoActual, MARCAS_REUSO,
} from './arquitectura.js'
export type { TipoCelda, Celda, Matriz, CuentaReuso } from './arquitectura.js'
export {
  PLAYBOOK_FDE, registroVacio, registra, decide, fronteraNucleo, FRONTERAS_NEGATIVAS, DESCRIPCION_FDE, habilidadesFde,
} from './fde.js'
export type { EtapaFde, DefinicionEtapa, Alcance, TrabajoFde, RegistroFde, HabilidadCard } from './fde.js'
export { canonico, sha256, genesis, hashDeEvento, nuevoEvento, agrega, verificaCadena } from './cadena.js'
export type { Json, TipoEvento, EventoIncidencia, Borrador, MotivoRotura, Verificacion } from './cadena.js'
export { simula, ejecuta, reproduce, NoAplica } from './simulador.js'
export type { Sistema, AccionSimulador, SapSimulado, PasoSolucion, Aplicacion, Aprobacion, ResultadoPlan, Sintoma } from './simulador.js'
export {
  conocimientoDeMatriz, consultaMatriz, extraeParametros, pasosDe, DIMENSION, VEREDICTOS, GRADOS_DE_PRODUCCION,
} from './matriz.js'
export type { Grado, EntradaMatriz, ConceptoDelMotor, MotorReglas, ConsultaMatriz } from './matriz.js'
export { categoriza, prioridadItil, complejidadDe, mensajeDe, transaccionDe } from './categoriza.js'
export { ingiere, validaConfig, camposSap, delimitaDocumento } from './ingesta.js'
export type { PuertosIngesta, ConfigIngesta, Via, CampoConEvidencia, ResultadoIngesta, PaginaOcr, ClasePorBytes } from './ingesta.js'
export type { Prioridad, Clasificacion } from './categoriza.js'
export { CALENDARIO_CDMX, continuo, minutosHabiles, sumaMinutosHabiles } from './calendario.js'
export type { Calendario } from './calendario.js'
export { MATRIZ_LABORATORIO } from './laboratorio/matriz.js'
export { azar } from './laboratorio/aleatorio.js'
export type { Azar } from './laboratorio/aleatorio.js'
export { personaSintetica, ticketDeNomina, valoresSensibles, digitoLuhn, digitoClabe } from './laboratorio/pii.js'
export type { DigitosMx, PersonaSintetica } from './laboratorio/pii.js'
export { generaCorpus, CONSULTORAS, CLIENTES, VOLUMEN_MENSUAL } from './laboratorio/corpus.js'
export type { Tamano, ConsultoraLab, ClienteLab, EventoLab, IncidenciaLab, CorpusLab } from './laboratorio/corpus.js'
export { sapDeLaboratorio } from './laboratorio/sap.js'
export {
  proponeMapeo, apruebaMapeo, aplicaMapeo, cuentaPrevia, fechaUtc, seudonimoDe, OBLIGATORIOS, SINONIMOS, VALORES,
} from './mapeo.js'
export type { CampoCanonico, Mapeo, Similitud, Procedencia, IncidenciaCanonica, Fila, ResultadoMapeo } from './mapeo.js'
export { exporteSucio } from './laboratorio/exportes.js'
export type { Exporte } from './laboratorio/exportes.js'
export { huellaTenant, exportaTenant, restauraTenant, verificaRestauracion, TABLAS_DE_TENANT } from './respaldo.js'
export type { Consulta, HuellaTenant, ExportTenant, VerificacionRestauracion } from './respaldo.js'
export { leeArgumentos, ayuda } from './clis.js'
export type { DescripcionCli, Argumentos } from './clis.js'
export { emiteTokenDeTarea, verificaTokenDeTarea } from './token-tarea.js'
export type { ClaimsTarea, RolDeServicio } from './token-tarea.js'
