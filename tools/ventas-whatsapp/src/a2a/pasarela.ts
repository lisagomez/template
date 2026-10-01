/**
 * Fase 3: `pedidos` y `atribucion` como agentes A2A REALES, con el SDK oficial (@a2a-js/sdk 1.1.0,
 * protocolo 1.0), detrás de una pasarela multi-inquilino. Reglas de la fuente (§Seguridad y
 * operación) y de la guía de multi-tenancy de A2A:
 *  - Agent Card firmada (JWS sobre JCS, RFC 8785) y verificada antes de delegar;
 *  - `A2A-Version` obligatorio;
 *  - el token trae el inquilino y los dominios permitidos; el `tenant` de la solicitud tiene que
 *    coincidir, y el inquilino que ve el dominio lo pone la PASARELA, no el cliente;
 *  - «no autorizado» es indistinguible de «no existe» (mismo error para una tarea ajena);
 *  - `ListTasks` no existe: enumeraría tareas de otros.
 * Es LOCAL: exponerlo a un partner o a internet es gate humano, con C3 + C4.
 */
import { createHmac, timingSafeEqual, type KeyObject } from 'node:crypto';
import { A2A_CONTENT_TYPE, A2A_PROTOCOL_VERSION, A2A_VERSION_HEADER, Role, TaskState, generateAgentCardSignature } from '@a2a-js/sdk';
import type { AgentCard, Message, Task, TaskStatusUpdateEvent } from '@a2a-js/sdk';
import { DefaultRequestHandler, JsonRpcTransportHandler, defaultServerCallContextBuilder, validateVersion } from '@a2a-js/sdk/server';
import type { AgentExecutor, ExecutionEventBus, RequestContext, TaskStore } from '@a2a-js/sdk/server';
import type { AgenteDominio, BusA2A, ContextoDominio, EstadoTarea, Tarea } from '../agente/a2a-modelo.js';

/**
 * El token de cliente: inquilino, dominios y (opcional) las SKILLS que puede pedir. Las skills
 * acotan el PROPÓSITO: una agencia lee el reporte de ROAS, pero no manda conversiones ni ve pedidos.
 */
export interface TokenA2A { tenant: string; dominios: string[]; exp: number; skills?: string[]; proposito?: string }

/** Emite el token de cliente (en producción, OAuth 2.0 client credentials; aquí HMAC con vencimiento). */
export function emiteTokenA2A(secreto: string, t: TokenA2A): string {
  const cuerpo = Buffer.from(JSON.stringify(t)).toString('base64url');
  return `${cuerpo}.${createHmac('sha256', secreto).update(cuerpo).digest('base64url')}`;
}

export function leeTokenA2A(secreto: string, token: string, ahora: number): TokenA2A | null {
  const [cuerpo, firma] = token.split('.');
  if (!cuerpo || !firma) return null;
  const a = Buffer.from(createHmac('sha256', secreto).update(cuerpo).digest('base64url'));
  const b = Buffer.from(firma);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const t = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as TokenA2A;
    return typeof t.tenant === 'string' && Array.isArray(t.dominios) && t.exp > ahora ? t : null;
  } catch { return null; }
}

/** La Agent Card pública de un dominio: lo genérico, sin nada del inquilino. */
export function tarjetaDeDominio(agente: AgenteDominio, base: string): AgentCard {
  return {
    name: `agente-${agente.nombre}`, description: `${agente.descripcion} Local: exponerlo es gate humano.`,
    supportedInterfaces: [{ url: `${base.replace(/\/$/, '')}/a2a/${agente.nombre}`, protocolBinding: 'JSONRPC', tenant: '', protocolVersion: A2A_PROTOCOL_VERSION }],
    provider: undefined, version: '1.0.0',
    capabilities: { streaming: false, pushNotifications: false, extensions: [] },
    securitySchemes: { token: { scheme: { $case: 'httpAuthSecurityScheme', value: { description: 'Token con el inquilino y los dominios permitidos.', scheme: 'Bearer', bearerFormat: 'HMAC' } } } },
    securityRequirements: [{ schemes: { token: { list: [] } } }],
    defaultInputModes: ['application/json'], defaultOutputModes: ['application/json'],
    skills: agente.skills.map((s) => ({ id: s.id, name: s.nombre, description: s.descripcion, tags: [agente.nombre], examples: [], inputModes: ['application/json'], outputModes: ['application/json'], securityRequirements: [] })),
    signatures: [],
  };
}

export const firmaTarjeta = (card: AgentCard, llave: KeyObject, kid: string) => generateAgentCardSignature(llave, { alg: 'ES256', kid, typ: 'JOSE' })(card);

const ESTADOS: Record<EstadoTarea, TaskState> = {
  TASK_STATE_SUBMITTED: TaskState.TASK_STATE_SUBMITTED, TASK_STATE_WORKING: TaskState.TASK_STATE_WORKING, TASK_STATE_COMPLETED: TaskState.TASK_STATE_COMPLETED,
  TASK_STATE_FAILED: TaskState.TASK_STATE_FAILED, TASK_STATE_CANCELED: TaskState.TASK_STATE_CANCELED, TASK_STATE_INPUT_REQUIRED: TaskState.TASK_STATE_INPUT_REQUIRED,
  TASK_STATE_REJECTED: TaskState.TASK_STATE_REJECTED, TASK_STATE_AUTH_REQUIRED: TaskState.TASK_STATE_AUTH_REQUIRED,
};

const textoDe = (texto: string, contextId: string, taskId: string): Message => ({
  messageId: crypto.randomUUID(), contextId, taskId, role: Role.ROLE_AGENT,
  parts: [{ content: { $case: 'text', value: texto }, metadata: undefined, filename: '', mediaType: 'text/plain' }],
  metadata: undefined, extensions: [], referenceTaskIds: [],
});

/** Tarea del dominio → Task del SDK. */
export function aTaskSdk(t: Tarea, taskId: string): Task {
  return {
    id: taskId, contextId: t.contextId,
    status: { state: ESTADOS[t.estado], message: t.motivo ? textoDe(t.motivo, t.contextId, taskId) : undefined, timestamp: new Date(t.actualizadaEn).toISOString() },
    artifacts: t.artefactos.map((a) => ({ artifactId: a.artifactId, name: a.nombre, description: '', parts: [{ content: { $case: 'data', value: a.datos }, metadata: undefined, filename: '', mediaType: 'application/json' }], metadata: undefined, extensions: [] })),
    history: [], metadata: { tenant: t.tenant, dominio: t.dominio, skill: t.skill },
  };
}

/** Task del SDK → tarea del dominio (lado cliente). */
export function deTaskSdk(task: Task, tenant: string, dominio: string, skill: string): Tarea {
  const estado = (Object.entries(ESTADOS).find(([, v]) => v === task.status?.state)?.[0] ?? 'TASK_STATE_FAILED') as EstadoTarea;
  const motivoParte = task.status?.message?.parts.find((p) => p.content?.$case === 'text');
  const motivo = motivoParte?.content?.$case === 'text' ? motivoParte.content.value : undefined;
  const instante = task.status?.timestamp ? Date.parse(task.status.timestamp) : Date.now();
  return {
    id: task.id, contextId: task.contextId, tenant, dominio, skill, estado, ...(motivo ? { motivo } : {}), historial: [],
    artefactos: task.artifacts.map((a) => {
      const p = a.parts.find((x) => x.content?.$case === 'data');
      return { artifactId: a.artifactId, nombre: a.name, datos: p?.content?.$case === 'data' ? (p.content.value as Record<string, unknown>) : {} };
    }),
    creadaEn: instante, actualizadaEn: instante,
  };
}

/** Un TaskStore sin historial, con dueño por tarea: `load` de una tarea ajena = no existe. */
class AlmacenDeTareasPorInquilino implements TaskStore {
  private readonly tareas = new Map<string, Task>();
  readonly duenos = new Map<string, string>();
  async save(task: Task): Promise<void> { this.tareas.set(task.id, { ...task, history: [] }); }
  async load(taskId: string): Promise<Task | undefined> { return this.tareas.get(taskId); }
  async list() { return { tasks: [], nextPageToken: '', pageSize: 0, totalSize: 0 }; }
}

class EjecutorDeDominio implements AgentExecutor {
  private readonly agente: AgenteDominio;
  private readonly contexto: (tenant: string) => Promise<ContextoDominio>;
  private readonly duenos: Map<string, string>;
  constructor(agente: AgenteDominio, contexto: (tenant: string) => Promise<ContextoDominio>, duenos: Map<string, string>) {
    this.agente = agente;
    this.contexto = contexto;
    this.duenos = duenos;
  }
  async execute(rc: RequestContext, bus: ExecutionEventBus): Promise<void> {
    const tenant = String(rc.userMessage.metadata?.tenantVerificado ?? '');
    const parte = rc.userMessage.parts.find((p) => p.content?.$case === 'data');
    const carga = (parte?.content?.$case === 'data' ? parte.content.value : {}) as { skill?: string; datos?: Record<string, unknown> };
    let task: Task;
    try {
      const t = await this.agente.atiende({ tenant, contextId: rc.contextId, skill: String(carga.skill ?? ''), datos: carga.datos ?? {}, messageId: rc.userMessage.messageId }, await this.contexto(tenant));
      task = aTaskSdk(t, rc.taskId);
    } catch {
      task = aTaskSdk({ id: rc.taskId, contextId: rc.contextId, tenant, dominio: this.agente.nombre, skill: String(carga.skill ?? ''), estado: 'TASK_STATE_FAILED', motivo: 'fallo interno del dominio', historial: [], artefactos: [], creadaEn: Date.now(), actualizadaEn: Date.now() }, rc.taskId);
    }
    this.duenos.set(rc.taskId, tenant);
    bus.publish({ kind: 'task', data: task });
    bus.finished();
  }
  async cancelTask(taskId: string, bus: ExecutionEventBus): Promise<void> {
    const ev: TaskStatusUpdateEvent = { taskId, contextId: '', status: { state: TaskState.TASK_STATE_CANCELED, message: undefined, timestamp: new Date().toISOString() }, metadata: undefined };
    bus.publish({ kind: 'statusUpdate', data: ev });
    bus.finished();
  }
}

export interface OpcionesPasarela {
  base: string;
  agentes: AgenteDominio[];
  /** El contexto del dominio para el inquilino VERIFICADO (sin bus: se le añade el de la plataforma). */
  contexto: (tenant: string) => Promise<Omit<ContextoDominio, 'bus'>>;
  bus: () => BusA2A;
  secretoTokens: string;
  llaveFirma: KeyObject;
  kid: string;
  reloj?: () => number;
}

const ERROR_NO_EXISTE = { code: -32001, message: 'tarea o recurso no encontrado' };
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const rpc = (id: unknown, error: { code: number; message: string }, status = 200) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error }), { status, headers: { 'content-type': A2A_CONTENT_TYPE } });

export function creaPasarelaA2A(o: OpcionesPasarela) {
  const reloj = o.reloj ?? Date.now;
  const montados = new Map<string, { card: Promise<AgentCard>; transporte: JsonRpcTransportHandler; almacen: AlmacenDeTareasPorInquilino }>();
  for (const agente of o.agentes) {
    const almacen = new AlmacenDeTareasPorInquilino();
    const card = tarjetaDeDominio(agente, o.base);
    const contexto = async (tenant: string): Promise<ContextoDominio> => ({ ...(await o.contexto(tenant)), bus: o.bus() });
    const manejador = new DefaultRequestHandler(card, almacen, new EjecutorDeDominio(agente, contexto, almacen.duenos));
    montados.set(agente.nombre, { card: firmaTarjeta(card, o.llaveFirma, o.kid), transporte: new JsonRpcTransportHandler(manejador), almacen });
  }
  const trazas: Array<{ dominio: string; metodo: string; tenant: string; resultado: string }> = [];

  async function atiende(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const m = /\/a2a\/([a-z]+)(\/\.well-known\/agent-card\.json)?$/.exec(url.pathname);
    const montado = m ? montados.get(m[1]!) : undefined;
    if (!m || !montado) return new Response('no encontrado', { status: 404 });
    if (m[2]) return new Response(JSON.stringify(await montado.card), { headers: { 'content-type': 'application/json' } });
    let cuerpo: Record<string, unknown> = {};
    try { const c: unknown = await request.json(); if (esObjeto(c)) cuerpo = c; } catch { return rpc(null, { code: -32700, message: 'el cuerpo no es JSON' }); }
    const token = leeTokenA2A(o.secretoTokens, (request.headers.get('authorization') ?? '').replace(/^Bearer /, ''), reloj());
    if (!token) return rpc(cuerpo.id, { code: -32001, message: 'no autenticado' }, 401);
    const metodo = String(cuerpo.method ?? '');
    const params = esObjeto(cuerpo.params) ? cuerpo.params : {};
    const traza = (resultado: string) => trazas.push({ dominio: m[1]!, metodo, tenant: token.tenant, resultado });
    // Un tenant distinto al del token, un dominio no permitido o una tarea ajena: la MISMA respuesta que «no existe».
    const pedido = typeof params.tenant === 'string' && params.tenant ? params.tenant : token.tenant;
    if (pedido !== token.tenant || !token.dominios.includes(m[1]!)) { traza('no_existe'); return rpc(cuerpo.id, ERROR_NO_EXISTE); }
    if (metodo === 'ListTasks') { traza('cerrado'); return rpc(cuerpo.id, { code: -32601, message: 'metodo no disponible' }); }
    if ((metodo === 'GetTask' || metodo === 'CancelTask') && montado.almacen.duenos.get(String(params.id ?? '')) !== token.tenant) { traza('no_existe'); return rpc(cuerpo.id, ERROR_NO_EXISTE); }
    if (metodo === 'SendMessage' && esObjeto(params.message) && token.skills) {
      const partes = Array.isArray(params.message.parts) ? params.message.parts : [];
      const datos = partes.map((p) => (esObjeto(p) && esObjeto(p.data) ? p.data : null)).find(Boolean) as Record<string, unknown> | undefined;
      if (!token.skills.includes(String(datos?.skill ?? ''))) { traza('fuera_de_proposito'); return rpc(cuerpo.id, ERROR_NO_EXISTE); }
    }
    if (metodo === 'SendMessage' && esObjeto(params.message)) {
      params.message.metadata = { ...(esObjeto(params.message.metadata) ? params.message.metadata : {}), tenantVerificado: token.tenant };
    }
    try {
      const cabeceras: Record<string, string> = {};
      request.headers.forEach((v, k) => { cabeceras[k] = v; });
      const version = request.headers.get(A2A_VERSION_HEADER)?.slice(0, 32) || undefined;
      const ctx = defaultServerCallContextBuilder({ extensions: undefined, user: undefined, headers: cabeceras, requestedVersion: version });
      validateVersion(ctx.requestedVersion, await montado.card, 'JSONRPC');
      const r = await montado.transporte.handle({ ...cuerpo, params }, ctx);
      traza('ok');
      return new Response(JSON.stringify(r), { headers: { 'content-type': A2A_CONTENT_TYPE } });
    } catch (e) {
      const mapeado = JsonRpcTransportHandler.mapToJSONRPCError(e);
      traza(`error ${mapeado.code}`);
      return rpc(cuerpo.id, mapeado.code === -32603 ? { code: -32603, message: 'fallo interno' } : { code: mapeado.code, message: mapeado.message });
    }
  }

  return { atiende, trazas, tarjeta: (dominio: string) => montados.get(dominio)?.card };
}
