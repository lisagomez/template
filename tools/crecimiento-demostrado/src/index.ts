/**
 * Núcleo de `@tu-scope/crecimiento-demostrado`: ontología, Γ, motor, kernel y narración. Sin React,
 * Next ni Supabase; el lector de CFDI y el proponente se inyectan.
 */
export * from './comun/canonico.js';
export * from './comun/dinero.js';
export * from './comun/periodos.js';
export * from './ontologia/especificacion.js';
export * from './datos/cfdi.js';
export * from './datos/tablas.js';
export * from './datos/gamma.js';
export * from './datos/invariantes.js';
export { construyeGamma, type EntradaDeDatos, type OpcionesDeConstruccion, type Construccion } from './datos/construye.js';
export * from './motor/terminos.js';
export * from './motor/evalua.js';
export * from './motor/plan.js';
export { aportesLmdi, mayorResiduo } from './motor/lmdi.js';
export { generador, pruebaPareada, pruebaDosMuestras } from './motor/estadistica.js';
export * from './kernel/derivacion.js';
export * from './kernel/veredicto.js';
export { verifica, verificaCertificado, esCertificadoDelKernel, VERSION_DEL_KERNEL } from './kernel/kernel.js';
export { decimal, type Escalar } from './kernel/escalar.js';
export { gammaDesdeFuentes, type FuentesCrudas } from './datos/ingesta.js';
export { diaContable } from './datos/cfdi.js';
export { numerosDe, sinRuido, type Numero, type Lectura as LecturaDeNumeros, type Clase as ClaseDeNumero } from './narracion/numeros.js';
export * from './narracion/inclusion.js';
export * from './agentes/tipos.js';
export { interpreta, type Intencion, type TipoDeIntencion } from './agentes/intencion.js';
export { planDe, derivaPuente, Constructor, EXPERIMENTO_POR_OMISION } from './agentes/derivaciones.js';
export { ProponenteSimulado, NarradorSimulado, derivacionHonesta } from './agentes/simulado.js';
export { ProponenteAdversarial, NarradorAdversarial, TRAMPAS_DEL_PROPONENTE, TRAMPAS_DEL_NARRADOR, type TrampaDelProponente, type TrampaDelNarrador } from './agentes/adversarial.js';
export { ProponenteLLM, NarradorLLM, PROMPT_PLAN, PROMPT_DERIVACION, PROMPT_NARRACION, type Modelo, type UsoDelModelo } from './agentes/llm.js';
export { creaOrquestador, type Respuesta, type EstadoDeRespuesta, type Intento, type OpcionesDelOrquestador } from './agentes/orquestador.js';
export { redondea } from './agentes/narrativas.js';
export { SENTENCIAS_ERP, esSoloLectura, fuentesDesdeErp, leeErpSoloLectura, type FilaDeTimbre, type Consulta as ConsultaErp } from './datos/erp.js';
