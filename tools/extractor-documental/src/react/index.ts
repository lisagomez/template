/**
 * Entry point de React. Todo lo de aqui necesita `react`, que es peerDependency OPCIONAL: quien
 * solo use el nucleo no lo instala, y por eso este subpath vive separado de `.`.
 *
 * `aplana` y `revision` se re-exportan desde aqui aunque NO importen React: tocan el DOM o son las
 * decisiones de la vista, asi que no pueden vivir en el nucleo, pero se prueban sin navegador. Ese
 * reparto es lo que hace que la UI de este paquete tenga pruebas de verdad y no capturas.
 */
export { ZonaDeIngesta } from './ZonaDeIngesta.js'
export type { PropiedadesDeIngesta, LoteIngresado } from './ZonaDeIngesta.js'

export { TablaDeRevision } from './TablaDeRevision.js'
export type { PropiedadesDeRevision } from './TablaDeRevision.js'

export { aplicaPlantilla, cuentaBajoUmbral, puedeValidarseSinRevision, disposicionDe } from './revision.js'
export type { FilaDeRevision } from './revision.js'

export { aplanaEntradas, raicesDe, desdeInput } from './aplana.js'
export type { EntradaDeArchivo, ArchivoAplanado, ResultadoDelAplanado } from './aplana.js'

export { columnasOfrecidas, mapeaCampo, altasPendientes, requiereDecisionHumana } from './mapeo.js'
export type { ColumnaOfrecida, MapeoDeCampo, EstadoDelMapeo, OpcionesDeMapeo } from './mapeo.js'

export {
  borradorDeLote, editaTitulo, refrescaSugerencia, tituloValido, puedeBuscar,
  puedeLanzar, totalDelLote, costeLegible,
  impedimentosParaSuprimir, puedeSuprimir, candidatosPorRetencion, admiteMasDocumentos,
} from './pantallas.js'
export type {
  BorradorDeLote, ConfirmacionDeCoste, PeticionDeSupresion,
  ImpedimentoDeSupresion, CandidatoAVencer, MotivoSinBusqueda,
} from './pantallas.js'

export { detectaLectura, dependeDeLaHeuristica, avisoDeConfiguracion } from './escaner.js'
export type { Pulsacion, ConfiguracionDelEscaner, LecturaDetectada, ViaDeDeteccion } from './escaner.js'

export { lectorDeCamara, fabricaDelNavegador } from './camara.js'
export type { OpcionesDeCamara, FabricaDeDetector, DetectorNativo, LectorConMotor, MotorDeCodigos } from './camara.js'
