/**
 * El ejecutor A2A: toma la skill y los datos del mensaje, corre el orquestador (o solo el kernel)
 * para la pyme VERIFICADA por la pasarela, y traduce el resultado a una Task del SDK. El mapeo de
 * estados es el contrato: cada veredicto tiene el suyo y nunca se confunden.
 */
import { Role, TaskState, type Message, type Task } from '@a2a-js/sdk';
import type { AgentExecutor, ExecutionEventBus, RequestContext } from '@a2a-js/sdk/server';
import { z } from 'zod';
import { creaOrquestador, type Respuesta } from '../agentes/orquestador.js';
import type { Narrador, Proponente } from '../agentes/tipos.js';
import type { Gamma } from '../datos/gamma.js';
import { verifica } from '../kernel/kernel.js';
import type { Veredicto } from '../kernel/veredicto.js';
import type { Especificacion } from '../ontologia/especificacion.js';

export interface ContextoDePyme { readonly gamma: Gamma; readonly especificacion: Especificacion }
export type FabricaDeAgentes = () => { proponente: Proponente; narrador: Narrador };

export interface Resultado { readonly estado: TaskState; readonly motivo?: string; readonly artefactos: readonly { readonly nombre: string; readonly datos: Record<string, unknown> }[] }

const carga = z.object({ skill: z.enum(['pregunta', 'verifica-derivacion']), datos: z.record(z.string(), z.unknown()) });
const datosDePregunta = z.object({ pregunta: z.string().min(3).max(500) });

/** El veredicto del kernel → estado de tarea y artefactos. */
export function deVeredicto(v: Veredicto): Resultado {
  switch (v.estado) {
    case 'aceptada': return { estado: TaskState.TASK_STATE_COMPLETED, artefactos: [{ nombre: 'certificado', datos: v.certificado as unknown as Record<string, unknown> }] };
    case 'rechazada': return { estado: TaskState.TASK_STATE_REJECTED, motivo: `${v.motivo}: ${v.detalle}`, artefactos: [] };
    case 'requiere_entrada': return { estado: TaskState.TASK_STATE_INPUT_REQUIRED, motivo: `faltan ${v.faltan.join(', ')}: ${v.detalle}`, artefactos: [] };
    case 'evidencia_insuficiente': return { estado: TaskState.TASK_STATE_COMPLETED, motivo: v.detalle, artefactos: [{ nombre: 'sin-veredicto', datos: { veredicto: 'evidencia_insuficiente', n: v.n, p: v.p, detalle: v.detalle } }] };
    case 'hipotesis': return { estado: TaskState.TASK_STATE_COMPLETED, motivo: v.detalle, artefactos: [{ nombre: 'hipotesis', datos: { veredicto: 'hipotesis', experimento: v.experimento, reetiquetada: v.reetiquetada } }] };
  }
}

/** La respuesta completa del orquestador → estado de tarea y artefactos. */
export function aTarea(r: Respuesta): Resultado {
  if (r.estado === 'sin_plan') return { estado: TaskState.TASK_STATE_REJECTED, motivo: 'sin plan: ninguna regla reconoce la pregunta', artefactos: [] };
  if (r.estado === 'no_medido') return { estado: TaskState.TASK_STATE_FAILED, motivo: 'no medido: sin modelo', artefactos: [] };
  if (!r.veredicto) return { estado: TaskState.TASK_STATE_REJECTED, motivo: r.bloqueos[0]?.motivo ?? 'plan rechazado', artefactos: [] };
  const base = deVeredicto(r.veredicto);
  const extra = [
    { nombre: 'derivacion', datos: { derivacion: r.derivacion, plan: r.plan, planHuella: r.planHuella } },
    ...(r.texto ? [{ nombre: 'respuesta', datos: { texto: r.texto } }] : []),
    ...(r.estado === 'narracion_bloqueada' ? [{ nombre: 'narracion-bloqueada', datos: { bloqueos: r.bloqueos } }] : []),
    ...(r.propuesta ? [{ nombre: 'propuesta', datos: r.propuesta as unknown as Record<string, unknown> }] : []),
  ];
  return { ...base, artefactos: [...base.artefactos, ...extra] };
}

async function resuelve(contexto: ContextoDePyme | null, crudo: unknown, agentes: FabricaDeAgentes): Promise<Resultado> {
  if (!contexto) return { estado: TaskState.TASK_STATE_REJECTED, motivo: 'pyme no disponible', artefactos: [] };
  const c = carga.safeParse(crudo);
  if (!c.success) return { estado: TaskState.TASK_STATE_REJECTED, motivo: 'mensaje fuera del contrato', artefactos: [] };
  if (c.data.skill === 'verifica-derivacion') return deVeredicto(verifica(c.data.datos.derivacion, contexto.gamma, contexto.especificacion));
  const d = datosDePregunta.safeParse(c.data.datos);
  if (!d.success) return { estado: TaskState.TASK_STATE_REJECTED, motivo: 'la pregunta no encaja en el contrato', artefactos: [] };
  return aTarea(await creaOrquestador(agentes()).responde(d.data.pregunta, contexto.gamma, contexto.especificacion));
}

const texto = (t: string, contextId: string, taskId: string): Message => ({
  messageId: `m-${taskId}`, contextId, taskId, role: Role.ROLE_AGENT,
  parts: [{ content: { $case: 'text', value: t }, metadata: undefined, filename: '', mediaType: 'text/plain' }], metadata: undefined, extensions: [], referenceTaskIds: [],
});

function aTask(r: Resultado, taskId: string, contextId: string, tenant: string): Task {
  return {
    id: taskId, contextId, status: { state: r.estado, message: r.motivo ? texto(r.motivo, contextId, taskId) : undefined, timestamp: new Date().toISOString() },
    artifacts: r.artefactos.map((a, i) => ({ artifactId: `${taskId}-${i}`, name: a.nombre, description: '', parts: [{ content: { $case: 'data', value: a.datos }, metadata: undefined, filename: '', mediaType: 'application/json' }], metadata: undefined, extensions: [] })),
    history: [], metadata: { tenant },
  };
}

export function ejecutorDe(contexto: (tenant: string) => Promise<ContextoDePyme | null>, agentes: FabricaDeAgentes, duenos: Map<string, string>): AgentExecutor {
  return {
    async execute(rc: RequestContext, bus: ExecutionEventBus): Promise<void> {
      const tenant = String(rc.userMessage.metadata?.tenantVerificado ?? '');
      const parte = rc.userMessage.parts.find((p) => p.content?.$case === 'data');
      let r: Resultado;
      try { r = await resuelve(tenant ? await contexto(tenant) : null, parte?.content?.$case === 'data' ? parte.content.value : null, agentes); } catch { r = { estado: TaskState.TASK_STATE_FAILED, motivo: 'fallo interno', artefactos: [] }; }
      duenos.set(rc.taskId, tenant);
      bus.publish({ kind: 'task', data: aTask(r, rc.taskId, rc.contextId, tenant) });
      bus.finished();
    },
    async cancelTask(taskId: string, bus: ExecutionEventBus): Promise<void> {
      bus.publish({ kind: 'statusUpdate', data: { taskId, contextId: '', status: { state: TaskState.TASK_STATE_CANCELED, message: undefined, timestamp: new Date().toISOString() }, metadata: undefined } });
      bus.finished();
    },
  };
}
