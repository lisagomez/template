/**
 * El agente por A2A (JSON-RPC, SDK 1.1.0): Agent Card firmada y verificada; cada veredicto con su
 * estado de tarea (COMPLETED con la derivación, REJECTED, INPUT_REQUIRED); el certificado recibido
 * se re-verifica del lado del consumidor; y la pyme A no ve nada de la B, tampoco por A2A.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { A2A_VERSION_HEADER } from '@a2a-js/sdk';
import { NarradorSimulado, ProponenteSimulado, derivacionHonesta, ejecutaPlan, interpreta, leePlan, planDe, verificaCertificado, type Certificado } from '../dist/index.js';
import { creaPasarela, emiteToken, verifyAgentCardSignature } from '../dist/a2a/index.js';
import { distribuidora, tienda } from './_ayuda.ts';

const BASE = 'http://interno.local/crecimiento';
const llaves = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const SECRETO = 'secreto-de-prueba-efimero';
const pymes = { 'distribuidora-sotavento': distribuidora, 'tienda-la-esquina': tienda } as const;
const pasarela = creaPasarela({
  base: BASE, secretoTokens: SECRETO, llaveFirma: llaves.privateKey, kid: 'prueba',
  contexto: async (t) => { const p = pymes[t as keyof typeof pymes]?.(); return p ? { gamma: p.gamma, especificacion: p.pyme.especificacion } : null; },
  agentes: () => ({ proponente: new ProponenteSimulado(), narrador: new NarradorSimulado() }),
});
const token = (tenant: string, skills = ['pregunta', 'verifica-derivacion'], exp = Date.now() + 60_000) => emiteToken(SECRETO, { tenant, skills, exp });
const rpc = (method: string, params: object) => JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
const mensaje = (tenant: string, skill: string, datos: object) => rpc('SendMessage', { tenant, message: { messageId: crypto.randomUUID(), contextId: 'ctx', role: 'ROLE_USER', parts: [{ data: { skill, datos } }] } });
type Tarea = { id: string; status: { state: string; message?: { parts: { text?: string }[] } }; artifacts: { name: string; parts: { data: Record<string, unknown> }[] }[] };
async function llama(cuerpo: string, tok?: string): Promise<{ status: number; json: { result?: { task?: Tarea }; error?: { code: number; message: string } } }> {
  const r = await pasarela.atiende(new Request(`${BASE}/a2a`, { method: 'POST', headers: { 'content-type': 'application/json', [A2A_VERSION_HEADER]: '1.0', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: cuerpo }));
  return { status: r.status, json: await r.json() };
}
const artefacto = (t: Tarea, nombre: string) => t.artifacts.find((a) => a.name === nombre)?.parts[0]?.data;

test('Agent Card firmada (JWS ES256) que verifica con la llave pública; alterada, no', async () => {
  const card = await (await pasarela.atiende(new Request(`${BASE}/a2a/.well-known/agent-card.json`))).json();
  const verificador = verifyAgentCardSignature(async () => llaves.publicKey);
  await verificador(card);
  assert.deepEqual(card.skills.map((s: { id: string }) => s.id), ['pregunta', 'verifica-derivacion']);
  await assert.rejects(verificador({ ...card, skills: [...card.skills, { ...card.skills[0], id: 'ejecutar_precio' }] }));
});

test('pregunta → COMPLETED con la derivación y el certificado, que el consumidor re-verifica', async () => {
  const { json } = await llama(mensaje('distribuidora-sotavento', 'pregunta', { pregunta: '¿De dónde salió el crecimiento del trimestre?' }), token('distribuidora-sotavento'));
  const t = json.result!.task!;
  assert.equal(t.status.state, 'TASK_STATE_COMPLETED');
  const cert = artefacto(t, 'certificado') as unknown as Certificado;
  const der = artefacto(t, 'derivacion') as { derivacion: unknown };
  assert.match(cert.hash, /^cert:/);
  assert.match(String(artefacto(t, 'respuesta')?.texto), /cierra al centavo/);
  const p = distribuidora();
  assert.ok(verificaCertificado(cert, der.derivacion, p.gamma, p.pyme.especificacion), 'el consumidor re-ejecuta el kernel y obtiene el mismo hash');
});

test('verifica-derivacion: alterada → REJECTED; sin un supuesto → INPUT_REQUIRED; evidencia insuficiente → COMPLETED sin veredicto', async () => {
  const p = distribuidora();
  const e = p.pyme.especificacion;
  const derivacion = (pregunta: string) => {
    const i = interpreta(pregunta, e)!;
    const plan = leePlan(planDe(i, e));
    assert.ok(plan.ok);
    return derivacionHonesta({ gamma: p.gamma, especificacion: e, pregunta }, i, ejecutaPlan(p.gamma, e, plan.plan).hechos, null);
  };
  const d = derivacion('¿De dónde salió el crecimiento del trimestre?');
  const alterada = { ...d, pasos: d.pasos.map((x, i) => (i === 0 && x.regla === 'cita' && x.valor.tipo === 'centavos' ? { ...x, valor: { tipo: 'centavos', v: x.valor.v + 1 } } : x)) };
  const tok = token('distribuidora-sotavento');
  const r1 = (await llama(mensaje('distribuidora-sotavento', 'verifica-derivacion', { derivacion: alterada }), tok)).json.result!.task!;
  assert.equal(r1.status.state, 'TASK_STATE_REJECTED');
  assert.match(String(r1.status.message?.parts[0]?.text), /^valor_alterado/);
  const r2 = (await llama(mensaje('distribuidora-sotavento', 'verifica-derivacion', { derivacion: { ...d, supuestos: d.supuestos.filter((s) => s !== 'SA-02') } }), tok)).json.result!.task!;
  assert.equal(r2.status.state, 'TASK_STATE_INPUT_REQUIRED');
  assert.match(String(r2.status.message?.parts[0]?.text), /SA-02/);
  const r3 = (await llama(mensaje('distribuidora-sotavento', 'verifica-derivacion', { derivacion: derivacion('¿La caída de frecuencia de los mayoristas es real?') }), tok)).json.result!.task!;
  assert.equal(r3.status.state, 'TASK_STATE_COMPLETED');
  assert.equal(artefacto(r3, 'sin-veredicto')?.veredicto, 'evidencia_insuficiente');
  assert.equal(artefacto(r3, 'certificado'), undefined, 'un «no» tipado no trae certificado');
});

test('aislamiento: sin token 401; otra pyme, otra skill o la tarea ajena → el MISMO «no existe»; ListTasks cerrado', async () => {
  const q = { pregunta: '¿De dónde salió el crecimiento del trimestre?' };
  assert.equal((await llama(mensaje('tienda-la-esquina', 'pregunta', q))).status, 401);
  const tokTienda = token('tienda-la-esquina');
  const ajena = (await llama(mensaje('distribuidora-sotavento', 'pregunta', q), tokTienda)).json.error;
  const sinSkill = (await llama(mensaje('tienda-la-esquina', 'verifica-derivacion', {}), token('tienda-la-esquina', ['pregunta']))).json.error;
  const noExiste = (await llama(rpc('GetTask', { tenant: 'tienda-la-esquina', id: 'no-existe' }), tokTienda)).json.error;
  assert.deepEqual(ajena, noExiste);
  assert.deepEqual(sinSkill, noExiste);
  const propia = (await llama(mensaje('distribuidora-sotavento', 'pregunta', q), token('distribuidora-sotavento'))).json.result!.task!;
  const robada = (await llama(rpc('GetTask', { tenant: 'tienda-la-esquina', id: propia.id }), tokTienda)).json.error;
  assert.deepEqual(robada, noExiste, 'la tarea de la distribuidora no existe para la tienda');
  assert.equal((await llama(rpc('ListTasks', { tenant: 'tienda-la-esquina' }), tokTienda)).json.error?.code, -32601);
  assert.equal((await llama(mensaje('tienda-la-esquina', 'pregunta', q), token('tienda-la-esquina', ['pregunta'], Date.now() - 1))).status, 401);
});
