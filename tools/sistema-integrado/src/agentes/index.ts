/** Capa agéntica: tarjetas, prompts (CDC), salvaguardas, ejecutor con traza y orquestador determinista. */
export * from './tipos.js';
export { AGENTES, IDS_AGENTES } from './registro.js';
export { SISTEMA_COMUN, INSTRUCCIONES, VERSION_PROMPTS } from './prompts.js';
export {
  minimiza, minimizaValor, delimita, tieneInstruccionIncrustada, promesasDeCertificacion, extraeJson, validaForma,
  revisaCitas, textoDeSalida, type RevisionCitas,
} from './salvaguardas.js';
export { ejecutaAgente, permitidosPara, armaMensaje, type Dependencias } from './ejecuta.js';
export { planDeTareas, agenteSugerido, type Plan, type TareaPlan, type TareaConFecha, type Recordatorio } from './orquestador.js';
