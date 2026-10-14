/**
 * Contratos de la capa agéntica. Cada agente PROPONE: su salida nunca cambia un estado por sí misma, la aprueba una
 * persona con el rol correcto. El modelo de lenguaje se INYECTA (`ModeloLLM`): este paquete no lee el entorno, no
 * elige modelo y no conoce ninguna llave.
 */
import type { Fase, IdEdicion } from '../catalogo/index.js';

export type AgenteId =
  | 'orquestador' | 'diagnostico' | 'contexto' | 'riesgos' | 'documental'
  | 'capacitacion' | 'proveedores' | 'kpis' | 'auditoria' | 'portafolio';

/** Clase de tarea para el routing del proyecto (C8). La elección del modelo la hace el proyecto, no este paquete. */
export type ClaseDeRouting = 'agente-sgi-redaccion' | 'agente-sgi-evaluacion' | null;

/**
 * La «tarjeta» del agente: la misma información que una Agent Card de A2A (nombre, descripción, habilidades,
 * entradas y salidas), para que exponerlo por A2A sea mecánico el día que se firme (PRP-013 fase 13). Hoy la
 * delegación es en proceso.
 */
export interface TarjetaAgente {
  readonly id: AgenteId;
  readonly nombre: string;
  readonly descripcion: string;
  readonly fases: readonly Fase[];
  readonly clase: ClaseDeRouting;
  /** `true` = no usa LLM (el orquestador lee el motor). */
  readonly determinista: boolean;
  readonly habilidades: readonly { readonly id: string; readonly descripcion: string }[];
  /** Valores válidos de `Propuesta.tipo` para este agente. */
  readonly tipos: readonly string[];
  readonly entrada: string;
  readonly salida: string;
  /** El documental DEBE devolver `documento`. */
  readonly requiereDocumento?: boolean;
  readonly maxTokens: number;
}

export interface SistemaIA { readonly nombre: string; readonly proposito: string; readonly papel: string; readonly proveedor?: string }

export interface PerfilOrganizacion {
  readonly nombre: string;
  readonly sector: string;
  readonly empleados: number;
  readonly ubicacion: string;
  readonly procesos: readonly string[];
  readonly productos: readonly string[];
  readonly puestos: readonly string[];
  readonly sistemasIA: readonly SistemaIA[];
  readonly clientesTipo?: readonly string[];
  readonly proveedoresClave?: readonly string[];
  readonly notas?: string;
}

export interface EvidenciaDeTerceros { readonly titulo: string; readonly texto: string }

export interface EntradaAgente {
  readonly organizacion: PerfilOrganizacion;
  readonly ediciones: readonly IdEdicion[];
  /** Qué se le pide concretamente (lo escribe la app o la persona que usa la app). */
  readonly tarea: string;
  /** IDs que el agente puede citar. Si se omite: los de sus fases para las ediciones del proyecto. */
  readonly requisitos?: readonly string[];
  /** Hechos estructurados (respuestas del diagnóstico, avance, riesgos existentes, notas del auditor…). */
  readonly datos?: Readonly<Record<string, unknown>>;
  /** Texto escrito por terceros (evidencias subidas, correos, actas): NO confiable, va delimitado. */
  readonly evidencias?: readonly EvidenciaDeTerceros[];
}

export interface Propuesta {
  readonly tipo: string;
  readonly titulo: string;
  readonly detalle: string;
  readonly requisitos: readonly string[];
  readonly datos?: Readonly<Record<string, string | number | boolean>>;
}

export interface DocumentoPropuesto {
  readonly titulo: string;
  readonly secciones: readonly { readonly titulo: string; readonly parrafos: readonly string[] }[];
}

export interface SalidaAgente {
  readonly resumen: string;
  readonly propuestas: readonly Propuesta[];
  readonly documento?: DocumentoPropuesto;
  readonly preguntasAbiertas: readonly string[];
}

export interface Uso { readonly entrada: number; readonly salida: number; readonly cacheados?: number }

/** El modelo inyectado. `uso: null` cuando el proveedor no lo reporta: se guarda así, nunca como cero.
 * `truncada`: la respuesta se cortó en el límite de salida. No es «ilegible»: le falta el final. */
export interface ModeloLLM {
  readonly id: string;
  completa(p: { sistema: string; usuario: string; maxTokens: number }): Promise<{ texto: string; uso: Uso | null; truncada?: boolean }>;
}

export interface Traza {
  readonly agente: AgenteId;
  readonly versionPrompt: string;
  readonly modelo: string;
  readonly insumos: readonly { readonly tipo: string; readonly huella: string }[];
  readonly salidaHuella: string | null;
  readonly requisitosCitados: readonly string[];
  /** Suma de todos los intentos; `null` si algún intento no reportó uso. */
  readonly uso: Uso | null;
  readonly intentos: number;
  /** Por qué se rechazó cada intento anterior al aceptado (o todos, si ninguno se aceptó). Vacío si pasó a la primera. */
  readonly rechazos: readonly string[];
  /** Citas fuera del catálogo (o de la lista permitida) que se QUITARON como último recurso tras el reintento. Ausente en
   * corridas anteriores al 2026-10-01. */
  readonly citasQuitadas?: readonly string[];
  readonly alertas: {
    readonly instruccionIncrustada: boolean;
    readonly datosMinimizados: Readonly<Record<string, number>>;
  };
  readonly cuando: string;
}

export type ResultadoAgente =
  | { readonly ok: true; readonly salida: SalidaAgente; readonly traza: Traza; readonly avisos: readonly string[] }
  | { readonly ok: false; readonly errores: readonly string[]; readonly traza: Traza; readonly textoCrudo?: string };
