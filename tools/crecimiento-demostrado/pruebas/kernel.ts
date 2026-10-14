/** El kernel: acepta solo lo que se deriva con sus 11 reglas, y cada rechazo lleva su motivo. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGLAS, TEOREMAS, derivacionHonesta, ejecutaPlan, esCertificadoDelKernel, interpreta, leePlan, planDe, verifica, verificaCertificado, type Derivacion } from '../dist/index.js';
import { distribuidora, tienda } from './_ayuda.ts';

function honesta(pregunta: string, pyme = distribuidora()): Derivacion {
  const e = pyme.pyme.especificacion;
  const i = interpreta(pregunta, e)!;
  const plan = leePlan(planDe(i, e));
  assert.ok(plan.ok);
  const { hechos } = ejecutaPlan(pyme.gamma, e, plan.plan);
  return derivacionHonesta({ gamma: pyme.gamma, especificacion: e, pregunta }, i, hechos, null);
}

const ORIGEN = '¿De dónde salió el crecimiento del trimestre?';
const rechazo = (crudo: unknown, p = distribuidora()) => {
  const v = verifica(crudo, p.gamma, p.pyme.especificacion);
  return v.estado === 'rechazada' ? v.motivo : v.estado;
};

test('un kernel pequeño: 11 reglas y 2 teoremas, nada más', () => {
  assert.equal(REGLAS.length, 11);
  assert.deepEqual([...TEOREMAS], ['puente_clasico', 'nft_lmdi']);
});

test('el puente honesto se acepta con certificado; la forma clásica donde sus hipótesis valen, la general donde no', () => {
  const p = distribuidora();
  const ultimo = verifica(honesta(ORIGEN), p.gamma, p.pyme.especificacion);
  assert.equal(ultimo.estado, 'aceptada');
  assert.equal(ultimo.estado === 'aceptada' && ultimo.certificado.afirmacion.regla, 'teorema');
  const t1 = verifica(honesta('¿De dónde salió el crecimiento del 1T 2026?'), p.gamma, p.pyme.especificacion);
  assert.equal(t1.estado === 'aceptada' && t1.certificado.afirmacion.regla, 'suma_particion', 'R_hasta(L) ≠ 0: solo la general');
});

test('el certificado se re-verifica re-ejecutando el kernel, y solo el kernel los emite', () => {
  const p = distribuidora();
  const d = honesta(ORIGEN);
  const v = verifica(d, p.gamma, p.pyme.especificacion);
  assert.ok(v.estado === 'aceptada');
  assert.ok(esCertificadoDelKernel(v.certificado));
  assert.equal(esCertificadoDelKernel({ ...v.certificado }), false, 'una copia no la emitió el kernel');
  assert.ok(verificaCertificado(v.certificado, d, p.gamma, p.pyme.especificacion));
  assert.equal(verificaCertificado({ ...v.certificado, hash: 'cert:falso' }, d, p.gamma, p.pyme.especificacion), false);
});

test('rechazos con motivo propio: SQL, id repetido, paso desconocido, teorema inexistente, spec ajena, supuesto inexistente', () => {
  const d = honesta(ORIGEN);
  assert.equal(rechazo({ ...d, pasos: [...d.pasos, { regla: 'cita', id: 'q', sql: 'select 1' }] }), 'sql_libre');
  assert.equal(rechazo({ ...d, pasos: [d.pasos[0], d.pasos[0], ...d.pasos.slice(1)] }), 'id_repetido');
  assert.equal(rechazo({ ...d, afirmacion: { paso: 'nadie' } }), 'paso_desconocido');
  assert.equal(rechazo({ ...d, pasos: [...d.pasos, { regla: 'teorema', id: 'tx', nombre: 'fermat', usa: ['p1'] }] }), 'teorema_inexistente');
  assert.equal(rechazo({ ...d, especificacion: 'spec:otra' }), 'especificacion_ajena');
  assert.equal(rechazo({ ...d, supuestos: [...d.supuestos, 'SA-99'] }), 'supuesto_inexistente');
  assert.equal(rechazo({ ...d, nivel: 'casi' }), 'derivacion_mal_formada');
});

test('una afirmación falsa se rechaza; el proponente honesto, con la retroalimentación, afirma lo contrario y pasa', () => {
  const p = distribuidora();
  const e = p.pyme.especificacion;
  const pregunta = '¿El 150 % del crecimiento viene de la expansión?';
  const i = interpreta(pregunta, e)!;
  const plan = leePlan(planDe(i, e));
  assert.ok(plan.ok);
  const { hechos } = ejecutaPlan(p.gamma, e, plan.plan);
  const c = { gamma: p.gamma, especificacion: e, pregunta };
  const primera = verifica(derivacionHonesta(c, i, hechos, null), p.gamma, e);
  assert.equal(primera.estado === 'rechazada' && primera.motivo, 'afirmacion_falsa');
  assert.ok(primera.estado === 'rechazada');
  const segunda = verifica(derivacionHonesta(c, i, hechos, { intento: 1, veredicto: primera }), p.gamma, e);
  assert.equal(segunda.estado, 'aceptada');
});

test('aritmética y comparación exactas: R(N) − R(L) + … se verifica en racionales, y un «>» falso no pasa', () => {
  const p = distribuidora();
  const d = honesta(ORIGEN);
  const citas = d.pasos.filter((x) => x.regla === 'cita').slice(0, 2).map((x) => x.id);
  const suma = { regla: 'aritmetica', id: 'a1', op: 'suma', de: citas };
  const ok = { ...d, afirmacion: { paso: 'a1' }, pasos: [...d.pasos, suma] };
  assert.equal(verifica(ok, p.gamma, p.pyme.especificacion).estado, 'aceptada');
  const falsa = { ...d, afirmacion: { paso: 'k1' }, pasos: [...d.pasos, { regla: 'compara', id: 'k1', a: citas[0], op: '>', b: { constante: 10 ** 12 } }] };
  assert.equal(rechazo(falsa), 'afirmacion_falsa');
});

test('cambio relativo: el ticket de la tienda; con base no positiva no hay cambio relativo', () => {
  const t = tienda();
  const v = verifica(honesta('¿Subió el ticket promedio?', t), t.gamma, t.pyme.especificacion);
  assert.equal(v.estado, 'aceptada');
  const d = honesta(ORIGEN);
  const z = d.pasos.find((x) => x.regla === 'cita' && x.termino.m === 'dR' && x.termino.clase === 'Z')!.id;
  const t1 = d.pasos.find((x) => x.regla === 'cita' && x.termino.m === 'dR' && x.termino.clase === 'T')!.id;
  assert.equal(rechazo({ ...d, afirmacion: { paso: 'cr' }, pasos: [...d.pasos, { regla: 'cambio_relativo', id: 'cr', antes: z, despues: t1, op: '>=', umbralPorMil: 0 }] }), 'proporcion_indeterminada');
});

test('un supuesto citado como paso tiene que estar declarado, y existir', () => {
  const d = honesta(ORIGEN);
  const p = distribuidora();
  const conPaso = { ...d, afirmacion: { paso: 'sa' }, pasos: [...d.pasos, { regla: 'supuesto', id: 'sa', sa: 'SA-04' }] };
  const v = verifica(conPaso, p.gamma, p.pyme.especificacion);
  assert.equal(v.estado, 'requiere_entrada');
  assert.deepEqual(v.estado === 'requiere_entrada' && v.faltan, ['SA-04']);
});

test('causal sin experimento: requiere entrada; con experimento: hipótesis, nunca aceptada', () => {
  const p = distribuidora();
  const d = honesta('¿Debo subir precios 5 %?');
  const v = verifica(d, p.gamma, p.pyme.especificacion);
  assert.equal(v.estado, 'hipotesis');
  const sinExperimento = { ...d, pasos: d.pasos.map((x) => (x.regla === 'hipotesis' ? { ...x, experimento: undefined } : x)) };
  assert.equal(verifica(sinExperimento, p.gamma, p.pyme.especificacion).estado, 'requiere_entrada');
});
