/**
 * El agente A2A `crecimiento-demostrado` (SDK @a2a-js/sdk 1.1.0, JSON-RPC, protocolo 1.0), con dos
 * skills:
 *  - `pregunta`: una pregunta del dueño → el orquestador completo (plan, kernel, narración);
 *  - `verifica-derivacion`: OTRO agente entrega su derivación y el kernel la juzga.
 * Cada veredicto tiene su estado de tarea, y un «no» tipado nunca viaja con forma de respuesta:
 * rechazada → REJECTED, requiere entrada → INPUT_REQUIRED, y las respuestas legítimas sin
 * veredicto (evidencia insuficiente, hipótesis) → COMPLETED con un artefacto que lo dice.
 * Multi-inquilino: el token trae la pyme y las skills; lo ajeno es indistinguible de lo que no
 * existe. LOCAL: exponerlo a un partner o a internet es gate humano, con C3 + C4.
 */
import { createHmac, timingSafeEqual, type KeyObject } from 'node:crypto';
import { A2A_CONTENT_TYPE, A2A_PROTOCOL_VERSION, A2A_VERSION_HEADER, TaskState, generateAgentCardSignature } from '@a2a-js/sdk';
import type { AgentCard, Task } from '@a2a-js/sdk';
import { DefaultRequestHandler, JsonRpcTransportHandler, defaultServerCallContextBuilder, validateVersion } from '@a2a-js/sdk/server';
import { aTarea, ejecutorDe, type ContextoDePyme, type FabricaDeAgentes } from './ejecutor.js';
import { AlmacenPorInquilino } from './almacen.js';

export interface TokenA2A { readonly tenant: string; readonly skills: readonly string[]; readonly exp: number }

export function emiteToken(secreto: string, t: TokenA2A): string {
  const cuerpo = Buffer.from(JSON.stringify(t)).toString('base64url');
  return `${cuerpo}.${createHmac('sha256', secreto).update(cuerpo).digest('base64url')}`;
}

export function leeToken(secreto: string, token: string, ahora: number): TokenA2A | null {
  const [cuerpo, firma] = token.split('.');
  if (!cuerpo || !firma) return null;
  const [a, b] = [Buffer.from(createHmac('sha256', secreto).update(cuerpo).digest('base64url')), Buffer.from(firma)];
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const t = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as TokenA2A;
    return typeof t.tenant === 'string' && Array.isArray(t.skills) && t.exp > ahora ? t : null;
  } catch { return null; }
}

export const SKILLS = [
  { id: 'pregunta', nombre: 'Responder una pregunta de crecimiento con prueba', descripcion: 'Pregunta en español → respuesta demostrada (con derivación y certificado), evidencia insuficiente, hipótesis con experimento, o un rechazo tipado.' },
  { id: 'verifica-derivacion', nombre: 'Verificar una derivación Γ ⊢ φ', descripcion: 'Una derivación de las 11 reglas → el veredicto del kernel, sin LLM, con su certificado si se acepta.' },
] as const;

export function tarjeta(base: string): AgentCard {
  return {
    name: 'crecimiento-demostrado', description: 'Analítica de growth revenue para pymes: ninguna cifra sin prueba. Local: exponerlo es gate humano.',
    supportedInterfaces: [{ url: `${base.replace(/\/$/, '')}/a2a`, protocolBinding: 'JSONRPC', tenant: '', protocolVersion: A2A_PROTOCOL_VERSION }],
    provider: undefined, version: '0.1.0', capabilities: { streaming: false, pushNotifications: false, extensions: [] },
    securitySchemes: { token: { scheme: { $case: 'httpAuthSecurityScheme', value: { description: 'Token con la pyme y las skills permitidas.', scheme: 'Bearer', bearerFormat: 'HMAC' } } } },
    securityRequirements: [{ schemes: { token: { list: [] } } }], defaultInputModes: ['application/json'], defaultOutputModes: ['application/json'],
    skills: SKILLS.map((s) => ({ id: s.id, name: s.nombre, description: s.descripcion, tags: ['crecimiento', 'prueba'], examples: [], inputModes: ['application/json'], outputModes: ['application/json'], securityRequirements: [] })),
    signatures: [],
  };
}

export interface OpcionesPasarela {
  readonly base: string;
  readonly contexto: (tenant: string) => Promise<ContextoDePyme | null>;
  readonly agentes: FabricaDeAgentes;
  readonly secretoTokens: string;
  readonly llaveFirma: KeyObject;
  readonly kid: string;
  readonly reloj?: () => number;
}

const NO_EXISTE = { code: -32001, message: 'tarea o recurso no encontrado' };
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const rpc = (id: unknown, error: { code: number; message: string }, status = 200) => new Response(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error }), { status, headers: { 'content-type': A2A_CONTENT_TYPE } });

/** Deja pasar solo lo del inquilino del token y de sus skills; todo lo demás es «no existe». */
function autoriza(duenos: ReadonlyMap<string, string>, cuerpo: Record<string, unknown>, token: TokenA2A, traza: (r: string) => void): Response | null {
  const metodo = String(cuerpo.method ?? '');
  const params = esObjeto(cuerpo.params) ? cuerpo.params : {};
  const pedido = typeof params.tenant === 'string' && params.tenant ? params.tenant : token.tenant;
  if (pedido !== token.tenant) { traza('no_existe'); return rpc(cuerpo.id, NO_EXISTE); }
  if (metodo === 'ListTasks') { traza('cerrado'); return rpc(cuerpo.id, { code: -32601, message: 'metodo no disponible' }); }
  if ((metodo === 'GetTask' || metodo === 'CancelTask') && duenos.get(String(params.id ?? '')) !== token.tenant) { traza('no_existe'); return rpc(cuerpo.id, NO_EXISTE); }
  if (metodo === 'SendMessage' && esObjeto(params.message)) {
    const partes = Array.isArray(params.message.parts) ? params.message.parts : [];
    const datos = partes.map((p) => (esObjeto(p) && esObjeto(p.data) ? p.data : null)).find(Boolean) as Record<string, unknown> | undefined;
    if (!token.skills.includes(String(datos?.skill ?? ''))) { traza('fuera_de_proposito'); return rpc(cuerpo.id, NO_EXISTE); }
    params.message.metadata = { ...(esObjeto(params.message.metadata) ? params.message.metadata : {}), tenantVerificado: token.tenant };
  }
  return null;
}

export function creaPasarela(o: OpcionesPasarela) {
  const reloj = o.reloj ?? Date.now;
  const card = tarjeta(o.base);
  const almacen = new AlmacenPorInquilino();
  const transporte = new JsonRpcTransportHandler(new DefaultRequestHandler(card, almacen, ejecutorDe(o.contexto, o.agentes, almacen.duenos)));
  const firmada = generateAgentCardSignature(o.llaveFirma, { alg: 'ES256', kid: o.kid, typ: 'JOSE' })(card);
  const trazas: { metodo: string; tenant: string; resultado: string }[] = [];

  async function atiende(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (/\/\.well-known\/agent-card\.json$/.test(url.pathname)) return new Response(JSON.stringify(await firmada), { headers: { 'content-type': 'application/json' } });
    let cuerpo: Record<string, unknown> = {};
    try { const c: unknown = await request.json(); if (esObjeto(c)) cuerpo = c; } catch { return rpc(null, { code: -32700, message: 'el cuerpo no es JSON' }); }
    const token = leeToken(o.secretoTokens, (request.headers.get('authorization') ?? '').replace(/^Bearer /, ''), reloj());
    if (!token) return rpc(cuerpo.id, { code: -32001, message: 'no autenticado' }, 401);
    const traza = (resultado: string) => trazas.push({ metodo: String(cuerpo.method ?? ''), tenant: token.tenant, resultado });
    const negado = autoriza(almacen.duenos, cuerpo, token, traza);
    if (negado) return negado;
    try {
      const cabeceras: Record<string, string> = {};
      request.headers.forEach((v, k) => { cabeceras[k] = v; });
      const ctx = defaultServerCallContextBuilder({ extensions: undefined, user: undefined, headers: cabeceras, requestedVersion: request.headers.get(A2A_VERSION_HEADER)?.slice(0, 32) || undefined });
      validateVersion(ctx.requestedVersion, card, 'JSONRPC');
      const r = await transporte.handle(cuerpo, ctx);
      traza('ok');
      return new Response(JSON.stringify(r), { headers: { 'content-type': A2A_CONTENT_TYPE } });
    } catch (e) {
      const m = JsonRpcTransportHandler.mapToJSONRPCError(e);
      traza(`error ${m.code}`);
      return rpc(cuerpo.id, m.code === -32603 ? { code: -32603, message: 'fallo interno' } : { code: m.code, message: m.message });
    }
  }

  return { atiende, tarjeta: firmada, trazas };
}

export { aTarea, TaskState, type Task };
