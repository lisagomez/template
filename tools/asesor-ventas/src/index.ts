/**
 * @tu-scope/asesor-ventas — el cerebro de asesoria de ventas, determinista y sin LLM.
 *
 * De una reunion diarizada (`Reunion` + `Transcripcion` con `Segmento[]` por hablante) saca:
 * insights CON evidencia, `ScoreDiscovery` (0-100 con desglose), acciones, riesgos y mapa de
 * stakeholders. Mismo input → mismo output → mismo porque. No llama a ningun modelo: el dato
 * del prospecto no sale de la maquina (C4). La entrada es exactamente lo que producen
 * `@tu-scope/voz` (diarizacion) y `@tu-scope/dictado` (texto).
 *
 * Uso:
 *   import { analizarReunion, playbookPorTipo } from '@tu-scope/asesor-ventas';
 *   const pb = playbookPorTipo(reunion.tipoReunion);
 *   const analisis = analizarReunion(reunion, transcripcion, pb);
 */
export { analizarReunion, extraerInsights, calcularScore, extraerAcciones, evaluarRiesgos, mapearStakeholders } from './motor.js';
export { PLAYBOOKS_DEFAULT, ORDEN_PRIORIDAD, playbookPorTipo } from './playbooks.js';
export { ETIQUETA_DIMENSION, UMBRAL_INAUDIBLE } from './tipos.js';
export type {
  TipoReunion,
  Participante,
  Reunion,
  Segmento,
  Transcripcion,
  CategoriaInsight,
  Evidencia,
  Insight,
  DimensionId,
  EstadoDimension,
  DimensionScore,
  HuecoDiscovery,
  ConductaLlamada,
  ScoreDiscovery,
  Accion,
  RiesgoDeal,
  NodoStakeholder,
  Playbook,
  AnalisisReunion,
} from './tipos.js';
