export {
  leeMatriz, cuentaReuso, bloqueReuso, conBloqueReuso, bloqueReusoActual, MARCAS_REUSO,
} from './arquitectura.js'
export type { TipoCelda, Celda, Matriz, CuentaReuso } from './arquitectura.js'
export {
  PLAYBOOK_FDE, registroVacio, registra, decide, fronteraNucleo, FRONTERAS_NEGATIVAS, DESCRIPCION_FDE, habilidadesFde,
} from './fde.js'
export type { EtapaFde, DefinicionEtapa, Alcance, TrabajoFde, RegistroFde, HabilidadCard } from './fde.js'
export { emiteTokenDeTarea, verificaTokenDeTarea } from './token-tarea.js'
export type { ClaimsTarea, RolDeServicio } from './token-tarea.js'
