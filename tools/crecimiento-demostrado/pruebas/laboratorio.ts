/** El laboratorio de trampas de punta a punta, los permisos (hijo ⊆ padre) y el orquestador sin poder de ejecutar. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creaOrquestador, NarradorSimulado, ProponenteSimulado, type Narrador } from '../dist/index.js';
import { correTrampas, TRAMPAS } from '../dist/laboratorio/index.js';
import { XML, distribuidora } from './_ayuda.ts';

test('cada trampa del laboratorio produce exactamente el estado (y el motivo) de la defensa', async () => {
  const filas = await correTrampas(XML);
  assert.equal(filas.length, TRAMPAS.length);
  const fallan = filas.filter((f) => !f.pasa).map((f) => `${f.trampa.id}: esperado ${f.trampa.esperado.estado}/${f.trampa.esperado.motivo ?? ''}, obtenido ${f.obtenido.estado}/${f.obtenido.motivo ?? ''}`);
  assert.deepEqual(fallan, []);
});

test('el laboratorio cubre los trece casos del spec (más los extra)', () => {
  const numeros = new Set(TRAMPAS.map((t) => t.numero.replace(/[ab]$/, '')));
  for (const n of ['1', '2', '3', '4', '5', '6', '7', '8', '10', '11', '12']) assert.ok(numeros.has(n), `falta el caso ${n}`);
});

test('un hijo con permisos que el padre no tiene no se puede ni crear', () => {
  const ambicioso: Narrador = { nombre: 'narrador-ambicioso', permisos: ['narrar', 'proponer_accion'], narra: async () => '' };
  assert.throws(() => creaOrquestador({ proponente: new ProponenteSimulado(), narrador: ambicioso, permisos: ['leer_gamma', 'proponer_plan', 'proponer_derivacion', 'narrar'] }), /no puede tener permisos que el padre no tiene/);
});

test('las acciones salen como PROPUESTA con la forma de sis_propuesta, para un humano; sin el permiso, ni eso', async () => {
  const { pyme, gamma } = distribuidora();
  const o = creaOrquestador({ proponente: new ProponenteSimulado(), narrador: new NarradorSimulado() });
  const r = await o.responde('¿Qué clientes perdí y cuánto me costaron?', gamma, pyme.especificacion);
  assert.equal(r.estado, 'demostrada');
  assert.equal(r.propuesta?.estado, 'propuesta');
  assert.equal(r.propuesta?.requiere, 'principal humano');
  assert.ok(r.propuesta?.evidencia.certificado?.startsWith('cert:'));
  const sinPermiso = creaOrquestador({ proponente: new ProponenteSimulado(), narrador: new NarradorSimulado(), permisos: ['leer_gamma', 'proponer_plan', 'proponer_derivacion', 'narrar'] });
  assert.equal((await sinPermiso.responde('¿Qué clientes perdí y cuánto me costaron?', gamma, pyme.especificacion)).propuesta, null);
});
