/**
 * Contratos del asesor de ventas. TypeScript puro, CERO dependencias.
 *
 * La ENTRADA es una reunion diarizada: `Segmento[]` (turnos con hablante, texto y confianza)
 * — exactamente lo que producen `@tu-scope/voz` (VAD + diarizacion) y `@tu-scope/dictado`
 * (texto). La SALIDA es la estrategia: insights CON evidencia, score de discovery, acciones,
 * riesgos y mapa de stakeholders. Nada de esto llama a un modelo: es determinista (mismo
 * input → mismo output → mismo porque), y por eso el dato del prospecto no sale de la maquina.
 *
 * Espejado a proposito del dominio de hermes-os-a2a (transcripcion-a2a / tareas_reunion /
 * leads) para que una futura persistencia en Supabase sea aditiva, no una traduccion.
 */

export type TipoReunion = 'discovery' | 'demo' | 'negociacion' | 'revision_tecnica' | 'cierre';

export interface Participante {
  nombre: string;
  rol: string;
  lado: 'interno' | 'cliente';
}

export interface Reunion {
  id: string;
  titulo: string;
  cuenta: string;
  tipoReunion: TipoReunion;
  participantes: Participante[];
  asesor: string;
  fecha: string; // ISO
  leadId?: string;
}

/** Bajo este umbral un segmento se marca [inaudible] — nunca se adivina (doctrina STT). */
export const UMBRAL_INAUDIBLE = 0.5;

export interface Segmento {
  inicioS: number;
  finS: number;
  hablante: string; // nombre del participante o 'desconocido'
  texto: string; // '[inaudible]' si confianza < UMBRAL_INAUDIBLE
  confianza: number; // 0..1
}

export interface Transcripcion {
  id: string;
  reunionId: string;
  motor: string;
  segmentos: Segmento[];
}

export type CategoriaInsight =
  | 'pain'
  | 'objetivo'
  | 'necesidad_explicita'
  | 'necesidad_implicita'
  | 'riesgo'
  | 'objecion'
  | 'herramienta_actual'
  | 'competidor'
  | 'stakeholder'
  | 'presupuesto'
  | 'urgencia'
  | 'proceso_decision'
  | 'senal_compra'
  | 'proximo_paso'
  | 'pregunta_sin_responder';

export interface Evidencia {
  segmentoIdx: number;
  inicioS: number;
  cita: string;
}

export interface Insight {
  id: string;
  reunionId: string;
  categoria: CategoriaInsight;
  texto: string;
  /** ≥1 SIEMPRE: sin evidencia no hay insight. Es la regla de oro del motor. */
  evidencia: Evidencia[];
  confianza: 'alta' | 'media';
  extra?: Record<string, string>;
}

export type DimensionId =
  | 'problema'
  | 'impacto'
  | 'urgencia'
  | 'proceso_decision'
  | 'stakeholders'
  | 'presupuesto'
  | 'competencia'
  | 'proximos_pasos';

export type EstadoDimension = 'cubierta' | 'parcial' | 'faltante';

export interface DimensionScore {
  dimension: DimensionId;
  peso: number;
  estado: EstadoDimension;
  evidencia: Evidencia[];
  explicacion: string;
}

export interface HuecoDiscovery {
  dimension: DimensionId;
  motivo: string;
  preguntaSugerida: string;
  justificacion: string;
}

export interface ConductaLlamada {
  ratioHablaInterno: number; // 0..1, ideal < 0.45
  preguntasAbiertas: number;
  segmentosInaudibles: number;
}

export interface ScoreDiscovery {
  reunionId: string;
  total: number; // 0..100 — NUNCA se muestra sin su desglose
  dimensiones: DimensionScore[];
  conducta: ConductaLlamada;
  huecos: HuecoDiscovery[];
}

export interface Accion {
  id: string; // 'A1', 'A2'... correlativo por reunion (acción)
  reunionId: string;
  tarea: string;
  responsable: string | null;
  fechaLimite: string | null; // ISO; null = sin fecha
  fechaTexto: string | null; // expresion temporal literal detectada
  fuente: string; // "Hablante [mm:ss]"
  estado: 'pendiente' | 'en_curso' | 'hecha' | 'cancelada';
}

export interface RiesgoDeal {
  tipo:
    | 'champion_ausente'
    | 'sin_presupuesto'
    | 'sin_urgencia'
    | 'competidor_activo'
    | 'proceso_desconocido'
    | 'discovery_incompleto'
    | 'objecion_sin_respuesta';
  severidad: 'alta' | 'media' | 'baja';
  descripcion: string;
  evidencia: Evidencia[];
  mitigacion: string;
}

export interface NodoStakeholder {
  nombre: string;
  rol: string;
  presente: boolean;
  influencia: 'decisor' | 'influenciador' | 'usuario' | 'desconocida';
  evidencia: Evidencia[];
}

export interface Playbook {
  id: string;
  tipoReunion: TipoReunion;
  nombre: string;
  dimensiones: { dimension: DimensionId; peso: number; critica: boolean }[]; // Σ pesos = 100
  bancoPreguntas: Record<DimensionId, string[]>;
  umbralSuperficial: number;
}

/** El resultado completo del analisis de una reunion. */
export interface AnalisisReunion {
  insights: Insight[];
  score: ScoreDiscovery;
  acciones: Accion[];
  riesgos: RiesgoDeal[];
  stakeholders: NodoStakeholder[];
}

export const ETIQUETA_DIMENSION: Record<DimensionId, string> = {
  problema: 'Problema',
  impacto: 'Impacto',
  urgencia: 'Urgencia',
  proceso_decision: 'Proceso de decisión',
  stakeholders: 'Stakeholders',
  presupuesto: 'Presupuesto',
  competencia: 'Competencia y herramientas',
  proximos_pasos: 'Próximos pasos',
};
