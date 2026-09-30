/**
 * El modelo de A2A desde el día uno (fuente §Modelo multi-inquilino). En las fases 1-2 los
 * dominios se llaman EN PROCESO, pero ya con `Task`, `Message`, `Artifact`, `contextId`, `taskId`
 * y `tenant`: separarlos después (fase 3: `pedidos` y `atribucion`) no reescribe el orquestador.
 *
 * Nombres de estado de la especificación A2A v1.0 (a2a-protocol.org/latest/specification/, y los
 * `TaskState` del SDK @a2a-js/sdk 1.1.0 instalado).
 */
import type { Reloj, GeneradorIds } from '../comun/base.js';
import type { AlmacenInquilino } from '../almacen/almacen.js';
import type { Inquilino } from '../modelo.js';
import type { ClienteGraph } from '../meta/graph.js';
import type { ConectorPagos } from '../dominios/pagos.js';

/** Lo que el dominio usa hacia fuera, inyectado: nunca conoce credenciales. */
export interface Servicios {
  graph?: ClienteGraph;
  pagos?: ConectorPagos;
}

export type EstadoTarea =
  | 'TASK_STATE_SUBMITTED'
  | 'TASK_STATE_WORKING'
  | 'TASK_STATE_COMPLETED'
  | 'TASK_STATE_FAILED'
  | 'TASK_STATE_CANCELED'
  | 'TASK_STATE_INPUT_REQUIRED'
  | 'TASK_STATE_REJECTED'
  | 'TASK_STATE_AUTH_REQUIRED';

export interface Parte {
  texto?: string;
  datos?: Record<string, unknown>;
}

export interface MensajeA2A {
  messageId: string;
  contextId: string;
  taskId?: string;
  rol: 'user' | 'agent';
  partes: Parte[];
}

export interface Artefacto {
  artifactId: string;
  nombre: string;
  datos: Record<string, unknown>;
}

export interface Tarea {
  id: string;
  contextId: string;
  tenant: string;
  dominio: string;
  skill: string;
  estado: EstadoTarea;
  /** Por qué no se completó (entrada requerida, rechazo, error). */
  motivo?: string;
  historial: MensajeA2A[];
  artefactos: Artefacto[];
  creadaEn: number;
  actualizadaEn: number;
}

export interface Solicitud {
  tenant: string;
  contextId: string;
  /** Continuar una tarea que pidió entrada. */
  taskId?: string;
  skill: string;
  datos: Record<string, unknown>;
  /** Idempotencia: un reintento con el mismo `messageId` devuelve la misma tarea. */
  messageId: string;
}

export interface SkillDeDominio {
  id: string;
  nombre: string;
  descripcion: string;
}

/** Lo que un dominio recibe para trabajar: SOLO los datos de su inquilino. */
export interface ContextoDominio {
  inquilino: Inquilino;
  datos: AlmacenInquilino;
  reloj: Reloj;
  ids: GeneradorIds;
  /** Para pedir a otros dominios (nunca escribir en sus datos). */
  bus: BusA2A;
  servicios: Servicios;
}

export interface AgenteDominio {
  nombre: string;
  descripcion: string;
  skills: SkillDeDominio[];
  atiende(s: Solicitud, ctx: ContextoDominio): Promise<Tarea>;
}

export interface BusA2A {
  envia(dominio: string, s: Solicitud): Promise<Tarea>;
}

export interface TrazaA2A {
  instante: number;
  tenant: string;
  contextId: string;
  taskId: string;
  dominio: string;
  skill: string;
  estado: EstadoTarea;
  /** La tarea completa (para la cadena de trazabilidad: sus artefactos entran como huella). */
  tarea?: Tarea;
}

/** Construye una tarea terminal en una línea (los dominios responden casi siempre así). */
export function tarea(
  s: Solicitud, dominio: string, estado: EstadoTarea, ahora: number, ids: GeneradorIds,
  artefactos: Array<{ nombre: string; datos: Record<string, unknown> }> = [], motivo?: string,
): Tarea {
  const id = s.taskId ?? ids('task');
  return {
    id, contextId: s.contextId, tenant: s.tenant, dominio, skill: s.skill, estado,
    ...(motivo ? { motivo } : {}),
    historial: [{ messageId: s.messageId, contextId: s.contextId, taskId: id, rol: 'user', partes: [{ datos: s.datos }] }],
    artefactos: artefactos.map((a) => ({ artifactId: ids('art'), nombre: a.nombre, datos: a.datos })),
    creadaEn: ahora, actualizadaEn: ahora,
  };
}

export const artefacto = (t: Tarea, nombre: string): Record<string, unknown> | undefined =>
  t.artefactos.find((a) => a.nombre === nombre)?.datos;

/** Un dominio remoto (A2A real) o local, visto igual por el bus. */
export type Destino = { tipo: 'local'; agente: AgenteDominio } | { tipo: 'remoto'; envia(s: Solicitud): Promise<Tarea> };

export interface OpcionesBus {
  destinos: Record<string, Destino>;
  contexto: (tenant: string) => Promise<Omit<ContextoDominio, 'bus'>>;
  alTrazar?: (t: TrazaA2A) => void;
}

/**
 * El bus en proceso. Tres reglas: toda solicitud lleva `tenant` y `contextId`; un `messageId`
 * repetido devuelve la tarea ya hecha (un reintento del webhook no crea dos pedidos); cada
 * llamada deja traza con `tenant`, `contextId` y `taskId`.
 */
export function creaBus(o: OpcionesBus): BusA2A {
  const hechas = new Map<string, Tarea>();
  const bus: BusA2A = {
    async envia(dominio, s) {
      if (!s.tenant || !s.contextId) throw new Error('solicitud A2A sin tenant o sin contextId');
      const llave = `${s.tenant}|${dominio}|${s.messageId}`;
      const previa = hechas.get(llave);
      if (previa) return previa;
      const destino = o.destinos[dominio];
      if (!destino) throw new Error(`dominio desconocido: ${dominio}`);
      let t: Tarea;
      if (destino.tipo === 'remoto') t = await destino.envia(s);
      else {
        const ctx = await o.contexto(s.tenant);
        if (ctx.inquilino.id !== s.tenant) throw new Error('contexto de otro inquilino');
        t = await destino.agente.atiende(s, { ...ctx, bus });
      }
      if (t.tenant !== s.tenant) throw new Error('el dominio respondió con otro inquilino');
      hechas.set(llave, t);
      // Acotado: la idempotencia protege reintentos cercanos, no guarda la historia del proceso.
      if (hechas.size > 5000) hechas.delete(hechas.keys().next().value as string);
      o.alTrazar?.({ instante: t.actualizadaEn, tenant: t.tenant, contextId: t.contextId, taskId: t.id, dominio, skill: s.skill, estado: t.estado, tarea: t });
      return t;
    },
  };
  return bus;
}
