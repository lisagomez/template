#!/usr/bin/env node
/**
 * A2A por HTTP de verdad (red local, puerto efímero): un servidor `node:http` delante de la
 * pasarela, y un cliente que habla JSON-RPC con `fetch`. Imprime la Agent Card (verificada) y una
 * tarea por estado: COMPLETED con la derivación, REJECTED e INPUT_REQUIRED. Llaves y secreto
 * efímeros: nada se guarda, nada sale de la máquina. Un arreglo vacío no viaja (JSON de protobuf).
 */
import { createServer } from 'node:http';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import * as xml from '../../extractor-documental/dist/xml/index.js';
import { NarradorSimulado, ProponenteSimulado } from '../dist/index.js';
import { creaPasarela, emiteToken, verifyAgentCardSignature } from '../dist/a2a/index.js';
import { preparaPyme } from '../dist/laboratorio/index.js';

const llaves = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const secreto = randomBytes(32).toString('hex');
const ids = { 'distribuidora-sotavento': 'distribuidora', 'tienda-la-esquina': 'tienda' };
const servidor = createServer();
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${servidor.address().port}`;
const pasarela = creaPasarela({
  base, secretoTokens: secreto, llaveFirma: llaves.privateKey, kid: 'e2e',
  contexto: async (t) => (ids[t] ? { gamma: preparaPyme(xml, ids[t]).gamma, especificacion: preparaPyme(xml, ids[t]).pyme.especificacion } : null),
  agentes: () => ({ proponente: new ProponenteSimulado(), narrador: new NarradorSimulado() }),
});
servidor.on('request', async (req, res) => {
  const trozos = []; for await (const t of req) trozos.push(t);
  const r = await pasarela.atiende(new Request(`${base}${req.url}`, { method: req.method, headers: req.headers, ...(req.method === 'POST' ? { body: Buffer.concat(trozos) } : {}) }));
  res.writeHead(r.status, { 'content-type': r.headers.get('content-type') ?? 'application/json' }).end(await r.text());
});

const card = await (await fetch(`${base}/a2a/.well-known/agent-card.json`)).json();
await verifyAgentCardSignature(async () => llaves.publicKey)(card);
console.log(`GET ${base}/a2a/.well-known/agent-card.json → «${card.name}» v${card.version}, skills [${card.skills.map((s) => s.id).join(', ')}], firma ${card.signatures[0].protected.slice(0, 16)}… VERIFICADA`);

const token = emiteToken(secreto, { tenant: 'distribuidora-sotavento', skills: ['pregunta', 'verifica-derivacion'], exp: Date.now() + 60_000 });
async function envia(skill, datos, etiqueta) {
  const cuerpo = { jsonrpc: '2.0', id: etiqueta, method: 'SendMessage', params: { tenant: 'distribuidora-sotavento', message: { messageId: crypto.randomUUID(), contextId: 'e2e', role: 'ROLE_USER', parts: [{ data: { skill, datos } }] } } };
  const r = await fetch(`${base}/a2a`, { method: 'POST', headers: { 'content-type': 'application/json', 'a2a-version': '1.0', authorization: `Bearer ${token}` }, body: JSON.stringify(cuerpo) });
  const j = await r.json();
  const t = j.result.task;
  console.log(`\nPOST ${base}/a2a  ${JSON.stringify({ method: 'SendMessage', skill, ...('pregunta' in datos ? { pregunta: datos.pregunta } : { derivacion: '(…)' }) })}`);
  console.log(`  → HTTP ${r.status} · task ${t.id.slice(0, 8)} · ${t.status.state}${t.status.message ? ` · «${t.status.message.parts[0].text.slice(0, 140)}»` : ''}`);
  console.log(`  artefactos: ${(t.artifacts ?? []).map((a) => a.name).join(', ') || '(ninguno)'}`);
  return t;
}
const completada = await envia('pregunta', { pregunta: '¿De dónde salió el crecimiento del trimestre?' }, 1);
const cert = completada.artifacts.find((a) => a.name === 'certificado').parts[0].data;
const der = completada.artifacts.find((a) => a.name === 'derivacion').parts[0].data.derivacion;
console.log(`  certificado ${cert.hash} · Γ ${cert.gamma} · ${der.pasos.length} pasos · afirmación «${cert.afirmacion.enunciado}»`);
const alterada = { ...der, pasos: der.pasos.map((p, i) => (i === 0 ? { ...p, valor: { tipo: 'centavos', v: p.valor.v + 1 } } : p)) };
await envia('verifica-derivacion', { derivacion: alterada }, 2);
await envia('verifica-derivacion', { derivacion: { ...der, supuestos: der.supuestos.filter((s) => s !== 'SA-02') } }, 3);
servidor.close();
