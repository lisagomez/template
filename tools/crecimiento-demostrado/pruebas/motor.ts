/** El motor contra la verdad plantada, al centavo; y las propiedades que el kernel da por buenas solo porque se comprueban. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anterior, ejecutaPlan, leePlan, mayorResiduo, particionDe, pruebaPareada, rango, valorDe } from '../dist/index.js';
import { cotejaConLaVerdad } from '../dist/laboratorio/index.js';
import { verdadDelPuente } from '../dist/sinteticos/index.js';
import { XML, distribuidora, tienda } from './_ayuda.ts';
import { indiceDe } from '../dist/motor/indice.js';

test('el puente del sistema = la verdad plantada, al centavo: 2 pymes × 10 transiciones × 3 métricas × 8 clases', () => {
  for (const id of ['distribuidora', 'tienda'] as const) {
    const filas = cotejaConLaVerdad(XML, id);
    assert.equal(filas.length, 30);
    const malas = filas.filter((f) => !f.cierra);
    assert.deepEqual(malas.map((f) => `${f.desde}→${f.hasta} ${f.metrica}`), [], `${id}: no cierran`);
  }
});

test('{N, K_exp, K_con, K_flat, L, Z, A} parte T en TODAS las transiciones (disjuntas y exhaustivas)', () => {
  for (const { pyme, gamma } of [distribuidora(), tienda()]) {
    const e = pyme.especificacion;
    for (const hasta of rango(e.horizonte.desde, e.horizonte.hasta).slice(1)) for (const m of ['neto', 'facturado', 'cobrado'] as const) {
      const P = particionDe(indiceDe(gamma), e, m, { desde: anterior(hasta), hasta });
      const partes = [P.N, P.K_exp, P.K_con, P.K_flat, P.L, P.Z, P.A].flat();
      assert.equal(new Set(partes).size, partes.length, 'disjuntas');
      assert.deepEqual([...partes].sort(), [...P.T].sort(), 'exhaustivas');
    }
  }
});

test('lo plantado aparece: un perdido con nota (R_hasta(L) ≠ 0) y un «solo ajustes» (ΔR(Z) ≠ 0)', () => {
  const { pyme, gamma } = distribuidora();
  const e = pyme.especificacion;
  const RL = valorDe(gamma, e, { m: 'R', metrica: 'neto', clase: 'L', desde: '2025-4T', hasta: '2026-1T', en: 'hasta' });
  const dZ = valorDe(gamma, e, { m: 'dR', metrica: 'neto', clase: 'Z', desde: '2025-2T', hasta: '2025-3T' });
  assert.ok(RL.tipo === 'centavos' && RL.v < 0, 'el perdido recibió una nota');
  assert.ok(dZ.tipo === 'centavos' && dZ.v < 0, 'Z no es vacío ni neutro');
  const v = verdadDelPuente(pyme.libro, 'neto', '2025-4T', '2026-1T', 50);
  assert.equal(RL.tipo === 'centavos' ? RL.v : NaN, v.hipotesis.RhastaL);
});

test('LMDI: los aportes de clientes, frecuencia y ticket suman ΔR EXACTAMENTE en cada transición', () => {
  for (const { pyme, gamma } of [distribuidora(), tienda()]) {
    const e = pyme.especificacion;
    const alcance = e.pyme.modelo === 'b2b' ? 'identificados' as const : 'todos' as const;
    const factores = alcance === 'identificados' ? (['N', 'F', 'T'] as const) : (['Tx', 'T'] as const);
    for (const hasta of rango(e.horizonte.desde, e.horizonte.hasta).slice(1)) {
      const t = { metrica: 'neto' as const, desde: anterior(hasta), hasta };
      const aportes = factores.map((factor) => valorDe(gamma, e, { m: 'nft', factor, alcance, ...t }));
      const dR = valorDe(gamma, e, { m: 'dR', clase: alcance === 'identificados' ? 'U' : 'T', ...t });
      const suma = aportes.reduce((s, a) => s + (a.tipo === 'centavos' ? a.v : NaN), 0);
      assert.equal(suma, dR.tipo === 'centavos' ? dR.v : NaN, `${t.desde}→${hasta}`);
    }
  }
});

test('mayor residuo: enteros que suman el total, cada uno a menos de un centavo de su real', () => {
  const reales = [10.4, 20.4, -5.3];
  const r = mayorResiduo(reales, 26);
  assert.equal(r.reduce((s, x) => s + x, 0), 26);
  r.forEach((x, i) => assert.ok(Math.abs(x - reales[i]!) < 1));
});

test('el plan: SQL libre se rechaza con su motivo, lo que no encaja también, y la ejecución va a caché por hash', () => {
  const sql = leePlan({ pregunta: 'x', consultas: [{ tipo: 'puente', metrica: 'neto', desde: '2026-2T', hasta: '2026-3T', sql: 'select 1' }] });
  assert.equal(sql.ok ? '' : sql.motivo, 'sql_libre');
  const mal = leePlan({ pregunta: 'x', consultas: [{ tipo: 'puente', metrica: 'margen', desde: '2026-2T', hasta: '2026-3T' }] });
  assert.equal(mal.ok ? '' : mal.motivo, 'plan_invalido');
  const { pyme, gamma } = distribuidora();
  const ok = leePlan({ pregunta: 'x', consultas: [{ tipo: 'puente', metrica: 'neto', desde: '2026-2T', hasta: '2026-3T' }] });
  assert.ok(ok.ok);
  const [a, b] = [ejecutaPlan(gamma, pyme.especificacion, ok.plan), ejecutaPlan(gamma, pyme.especificacion, ok.plan)];
  assert.equal(a.huella, b.huella);
  assert.equal(b.deCache, true);
  assert.deepEqual(a.hechos.map((h) => h.id), b.hechos.map((h) => h.id));
});

test('la prueba de permutación es determinista con la semilla, y cambia si la semilla cambia', () => {
  const d = [3, -1, 4, 1, -5, 9, 2, -6, 5, 3, -5, 8, 9, 7, -9, 3, 2, 3, 8, 4];
  assert.deepEqual(pruebaPareada(d, 500, 42), pruebaPareada(d, 500, 42));
  assert.notDeepEqual(pruebaPareada(d, 500, 42).exitos, pruebaPareada(d, 500, 43).exitos);
});
