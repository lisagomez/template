/**
 * Registro de agentes: una tarjeta por agente (forma de Agent Card de A2A). El orquestador delega EN PROCESO por este
 * registro; exponer una tarjeta a otro agente fuera de localhost es gate humano (C3 + C4).
 */
import type { AgenteId, TarjetaAgente } from './tipos.js';

export const AGENTES: Readonly<Record<AgenteId, TarjetaAgente>> = {
  orquestador: {
    id: 'orquestador', nombre: 'Orquestador', determinista: true, clase: null, fases: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    descripcion: 'Estado del roadmap, qué falta en cada puerta, a qué agente delegar y recordatorios. Lee el motor; no usa LLM y nunca abre una puerta.',
    habilidades: [{ id: 'plan-de-tareas', descripcion: 'Tareas pendientes de la fase actual con el agente sugerido' }, { id: 'recordatorios', descripcion: 'Tareas vencidas o por vencer' }],
    tipos: ['tarea', 'recordatorio'], entrada: 'Estado del proyecto (ediciones, evidencias aprobadas, fases cerradas) y tareas con fecha', salida: 'Plan de tareas con IDs del catálogo', maxTokens: 0,
  },
  diagnostico: {
    id: 'diagnostico', nombre: 'Diagnóstico', determinista: false, clase: 'agente-sgi-evaluacion', fases: [0, 1, 2, 3, 4, 5, 6, 7],
    descripcion: 'Cuestionario adaptativo por cláusula y el informe de brechas. El puntaje de madurez lo calcula el motor con una regla fija.',
    habilidades: [{ id: 'informe-gap', descripcion: 'Brechas, fortalezas y primeros pasos' }],
    tipos: ['brecha', 'fortaleza', 'prioridad'], entrada: 'Respuestas del cuestionario + madurez calculada', salida: 'Informe GAP con IDs', maxTokens: 3500,
  },
  contexto: {
    id: 'contexto', nombre: 'Contexto', determinista: false, clase: 'agente-sgi-redaccion', fases: [1],
    descripcion: 'Asuntos internos y externos, partes interesadas, alcance y procesos.',
    habilidades: [{ id: 'foda-pestel', descripcion: 'Asuntos internos y externos' }, { id: 'partes-interesadas', descripcion: 'Matriz de partes interesadas' }, { id: 'alcance', descripcion: 'Alcance propuesto' }],
    tipos: ['asunto_interno', 'asunto_externo', 'parte_interesada', 'alcance', 'proceso'], entrada: 'Perfil de la empresa', salida: 'Matrices de contexto', maxTokens: 3500,
  },
  riesgos: {
    id: 'riesgos', nombre: 'Riesgos e IA', determinista: false, clase: 'agente-sgi-evaluacion', fases: [3],
    descripcion: 'Riesgos y oportunidades, riesgos de IA, evaluación de impacto de IA y declaración de aplicabilidad.',
    habilidades: [{ id: 'matriz-riesgos', descripcion: 'Riesgos y oportunidades con probabilidad × impacto' }, { id: 'impacto-ia', descripcion: 'Evaluación de impacto de sistemas de IA' }, { id: 'soa', descripcion: 'Declaración de aplicabilidad propuesta' }],
    tipos: ['riesgo', 'oportunidad', 'riesgo_ia', 'impacto_ia', 'control_soa', 'objetivo'], entrada: 'Perfil + sistemas de IA + contexto aprobado', salida: 'Matrices y SoA propuestas', maxTokens: 5000,
  },
  documental: {
    id: 'documental', nombre: 'Documental', determinista: false, clase: 'agente-sgi-redaccion', fases: [1, 2, 3, 4, 5, 6, 7],
    descripcion: 'Borradores de políticas, procedimientos y formatos con la terminología de la empresa.',
    habilidades: [{ id: 'politica', descripcion: 'Política de calidad o de IA' }, { id: 'procedimiento', descripcion: 'Procedimiento operativo' }],
    tipos: ['documento', 'seccion_pendiente'], entrada: 'Perfil + qué documento + requisitos que atiende', salida: 'Documento en borrador', requiereDocumento: true, maxTokens: 5000,
  },
  capacitacion: {
    id: 'capacitacion', nombre: 'Capacitación', determinista: false, clase: 'agente-sgi-redaccion', fases: [4],
    descripcion: 'Competencias por puesto, brechas y plan de capacitación.',
    habilidades: [{ id: 'matriz-competencias', descripcion: 'Competencias por puesto' }, { id: 'plan-capacitacion', descripcion: 'Cursos y cómo se evalúa su eficacia' }],
    tipos: ['brecha_competencia', 'curso', 'evaluacion_eficacia'], entrada: 'Puestos + sistemas de IA', salida: 'Matriz y plan', maxTokens: 3500,
  },
  proveedores: {
    id: 'proveedores', nombre: 'Proveedores', determinista: false, clase: 'agente-sgi-redaccion', fases: [5],
    descripcion: 'Criterios, evaluación y reevaluación de proveedores, incluidos los de IA.',
    habilidades: [{ id: 'criterios', descripcion: 'Criterios de selección' }, { id: 'evaluacion', descripcion: 'Evaluación propuesta por proveedor' }],
    tipos: ['criterio', 'evaluacion_proveedor', 'requisito_a_proveedor'], entrada: 'Proveedores clave y hechos', salida: 'Criterios y evaluaciones propuestas', maxTokens: 3500,
  },
  kpis: {
    id: 'kpis', nombre: 'KPIs', determinista: false, clase: 'agente-sgi-redaccion', fases: [3, 6],
    descripcion: 'Objetivos medibles e indicadores.',
    habilidades: [{ id: 'indicadores', descripcion: 'Indicadores con fórmula y meta' }],
    tipos: ['objetivo', 'indicador'], entrada: 'Perfil + política', salida: 'Tablero propuesto', maxTokens: 3000,
  },
  auditoria: {
    id: 'auditoria', nombre: 'Auditoría', determinista: false, clase: 'agente-sgi-evaluacion', fases: [6, 7, 8],
    descripcion: 'Listas de verificación, muestreo, hallazgos en borrador y acciones correctivas sugeridas.',
    habilidades: [{ id: 'checklist', descripcion: 'Lista de verificación y muestreo' }, { id: 'hallazgos', descripcion: 'Hallazgos en borrador desde las notas del auditor' }],
    tipos: ['pregunta_auditoria', 'muestra', 'hallazgo', 'accion_sugerida'], entrada: 'Alcance de la auditoría o notas del auditor', salida: 'Checklist o hallazgos en borrador', maxTokens: 5000,
  },
  portafolio: {
    id: 'portafolio', nombre: 'Portafolio (consultor)', determinista: false, clase: 'agente-sgi-redaccion', fases: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    descripcion: 'Reporte de avance para cada cliente del consultor, sobre números ya calculados por el motor.',
    habilidades: [{ id: 'reporte-avance', descripcion: 'Reporte para el cliente' }],
    tipos: ['mensaje', 'siguiente_paso', 'alerta'], entrada: 'Avance y puertas calculados', salida: 'Reporte en borrador', maxTokens: 2500,
  },
};

export const IDS_AGENTES = Object.keys(AGENTES) as AgenteId[];
