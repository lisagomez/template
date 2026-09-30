/** Catálogo (L1, L2) y motor (avance, puertas, migración, diagnóstico). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGO, verificaCobertura, verificaDerechos, mapeoCruzado, controlesAnexoA, existe } from '../dist/catalogo/index.js';
import {
  avance, puerta, autorizaCierre, migraEdicion, madurez, preguntasDiagnostico, puedeAprobar, APROBADORES, ROL_CIERRE,
  type EstadoProyecto,
} from '../dist/motor/index.js';

const Q15 = 'iso-9001:2015+a1:2024' as const, Q26 = 'iso-9001:2026' as const, IA = 'iso-iec-42001:2023' as const;

test('L2 cobertura: todas las cláusulas de las 3 ediciones y los 38 controles, IDs únicos, sin huérfanos', () => {
  const v = verificaCobertura();
  assert.equal(v.ok, true, JSON.stringify({ sinCubrir: v.sinCubrir, refsFuera: v.refsFuera, huerfanos: v.huerfanosMapeo }));
  assert.equal(controlesAnexoA().length, 38);
  assert.equal(new Set(CATALOGO.requisitos.map((r) => r.id)).size, CATALOGO.requisitos.length);
  assert.ok(CATALOGO.requisitos.every((r) => r.refs.length > 0 && r.pregunta.endsWith('?')), 'toda pregunta guía es pregunta');
  assert.equal(CATALOGO.estado, 'borrador-sin-revision-experta');
  assert.ok(CATALOGO.ediciones.every((e) => e.verificada === false), 'ninguna edición se declara verificada sin firma');
});

test('L2 cobertura: una cláusula sin requisito pone el gate en rojo', () => {
  const roto = { ...CATALOGO, requisitos: CATALOGO.requisitos.filter((r) => r.id !== 'SGI-Q-7.1-06') };
  const v = verificaCobertura(roto);
  assert.equal(v.ok, false);
  assert.ok(v.sinCubrir.some((x) => x.clausula === '7.1.5.2'));
});

test('L1 derechos: sin copia licenciada es «no medido», nunca «pasa»', () => {
  const r = verificaDerechos(null);
  assert.equal(r.medido, false);
  assert.equal(r.ok, null);
});

test('L1 derechos: detecta 8 palabras seguidas en común y reporta DÓNDE, no el fragmento', () => {
  // Referencia sintética (no es texto de ninguna norma): contiene una pregunta propia del catálogo.
  const pregunta = CATALOGO.requisitos.find((r) => r.id === 'SGI-C-7.4-01')!.pregunta;
  const sintetica = `Texto de relleno que no dice nada. ${pregunta} Más relleno sin relación.`;
  const r = verificaDerechos(sintetica, 8);
  assert.equal(r.medido, true);
  assert.equal(r.ok, false);
  assert.ok(r.coincidencias.some((c) => c.id === 'SGI-C-7.4-01' && c.campo === 'pregunta'));
  assert.ok(!JSON.stringify(r).includes(pregunta), 'el informe no reproduce el fragmento');
  assert.equal(verificaDerechos('Un texto cualquiera sobre panes y bicicletas que no coincide con nada del catálogo.', 8).ok, true);
});

test('mapeo cruzado: la revisión por la dirección y la auditoría interna son comunes a 9001 y 42001', () => {
  const pares = mapeoCruzado(Q15);
  for (const c of ['9.3.1', '9.3.2', '9.3.3', '9.2.2', '5.2.1', '7.5.3']) assert.ok(pares.some((p) => p.clausula9001 === c), c);
});

const ACTA = { id: 'ev-acta', requisitos: ['SGI-C-9.3-01', 'SGI-C-9.3-02', 'SGI-C-9.3-05', 'SGI-Q-9.3-03', 'SGI-IA-9.3-04'], aprobada: true };
const base: EstadoProyecto = { ediciones: [Q15, IA], evidencias: [], fasesCerradas: [] };

test('motor: el acta de revisión por la dirección sube el avance en AMBAS normas, y una evidencia sin aprobar no cuenta', () => {
  const antes = avance(base);
  const despues = avance({ ...base, evidencias: [ACTA] });
  assert.ok(despues.porNorma[Q15]!.cubiertos > antes.porNorma[Q15]!.cubiertos);
  assert.ok(despues.porNorma[IA]!.cubiertos > antes.porNorma[IA]!.cubiertos);
  assert.equal(despues.porNorma[Q15]!.cubiertos, 4); // 3 comunes + 1 de calidad
  assert.equal(despues.porNorma[IA]!.cubiertos, 4); // 3 comunes + 1 de IA
  assert.equal(despues.global.cubiertos, 5, 'los comunes cuentan una sola vez en el global');
  const sinAprobar = avance({ ...base, evidencias: [{ ...ACTA, aprobada: false }] });
  assert.equal(sinAprobar.global.cubiertos, 0);
  assert.deepEqual(avance({ ...base, evidencias: [ACTA] }), despues, 'mismos hechos, mismo número');
});

test('motor: retirar la evidencia baja las dos normas (trampa 10)', () => {
  const con = avance({ ...base, evidencias: [ACTA] });
  const sin = avance({ ...base, evidencias: [] });
  assert.ok(con.porNorma[Q15]!.pct > sin.porNorma[Q15]!.pct && con.porNorma[IA]!.pct > sin.porNorma[IA]!.pct);
});

test('motor: «no aplica» solo cuenta con justificación escrita', () => {
  const total = avance(base).porNorma[Q15]!.total;
  assert.equal(avance({ ...base, noAplica: { 'SGI-Q-8.3-02': 'No diseñamos: maquilamos sobre planos del cliente' } }).porNorma[Q15]!.total, total - 1);
  assert.equal(avance({ ...base, noAplica: { 'SGI-Q-8.3-02': '   ' } }).porNorma[Q15]!.total, total);
});

test('puertas: la fase 2 no cierra sin la política aprobada, ni con el rol equivocado (trampas 2 y 3)', () => {
  const estado: EstadoProyecto = { ...base, fasesCerradas: [0, 1] };
  const p = puerta(estado, 2);
  assert.equal(p.puedeCerrarse, false);
  assert.ok(p.faltan.some((f) => f.id === 'SGI-C-5.2-01'));
  assert.equal(autorizaCierre(estado, 2, 'alta_direccion').ok, false);
  const obligatorios = p.obligatorios.map((id) => ({ id: `ev-${id}`, requisitos: [id], aprobada: true }));
  const completo: EstadoProyecto = { ...estado, evidencias: obligatorios };
  assert.equal(puerta(completo, 2).puedeCerrarse, true);
  assert.deepEqual(autorizaCierre(completo, 2, 'dueno_proceso'), { ok: false, motivo: 'La fase 2 solo la cierra: alta_direccion' });
  assert.equal(autorizaCierre(completo, 2, 'consultor').ok, false, 'el consultor nunca cierra');
  assert.deepEqual(autorizaCierre(completo, 2, 'alta_direccion'), { ok: true });
});

test('puertas: fase 0 pide diagnóstico y plan; fase 8 pide simulacro y cero NC abiertas', () => {
  assert.equal(puerta(base, 0).faltan.length, 2);
  assert.equal(puerta({ ...base, diagnosticoCompleto: true, planAprobado: true }, 0).puedeCerrarse, true);
  const casi: EstadoProyecto = { ...base, fasesCerradas: [0, 1, 2, 3, 4, 5, 6, 7], simulacroRealizado: true, ncAbiertas: 2 };
  assert.ok(puerta(casi, 8).faltan.some((f) => f.id === 'nc-abiertas'));
  assert.equal(puerta({ ...casi, ncAbiertas: 0 }, 8).puedeCerrarse, true);
});

test('roles: el consultor no aprueba nada; el hallazgo solo lo firma el auditor interno', () => {
  for (const tipo of Object.keys(APROBADORES) as (keyof typeof APROBADORES)[]) assert.equal(puedeAprobar(tipo, 'consultor'), false, tipo);
  assert.equal(puedeAprobar('hallazgo', 'auditor_interno'), true);
  assert.equal(puedeAprobar('hallazgo', 'alta_direccion'), false);
  assert.equal(puedeAprobar('politica', 'admin_pyme'), false);
  assert.equal(puedeAprobar('cierre_fase', ROL_CIERRE[6], 6), true);
});

test('migración 9001:2015+A1 → 9001:2026: lo nuevo, lo remapeado y las evidencias que siguen valiendo', () => {
  const m = migraEdicion(Q15, Q26, [ACTA, { id: 'ev-borrador', requisitos: ['SGI-C-4.1-01'], aprobada: false }]);
  for (const id of ['SGI-Q-5.1-05', 'SGI-Q-6.1-03', 'SGI-Q-6.1-04', 'SGI-Q-7.3-02']) assert.ok(m.nuevos.includes(id), id);
  assert.ok(m.remapeados.some((r) => r.id === 'SGI-C-10.3-01' && r.de === '10.3' && r.a === '10.1'));
  assert.deepEqual(m.retirados, []);
  assert.deepEqual(m.evidenciasVigentes, ['ev-acta']);
  assert.ok(m.nuevos.every((id) => existe(id)));
});

test('diagnóstico: madurez con regla fija y cuestionario adaptativo', () => {
  const m = madurez({ 'SGI-C-4.1-01': 'si', 'SGI-C-4.2-01': 'parcial', 'SGI-C-4.3-01': 'no' }, [Q15]);
  assert.equal(m.porClausula['4'], 2.5); // (1 + 0.5 + 0) / 3 × 5 = 2.5
  assert.equal(m.contestadas, 3);
  const sinIA = preguntasDiagnostico({ ediciones: [Q15, IA], usaIA: false, disena: false });
  assert.ok(!sinIA.some((r) => r.familia === 'A' || r.familia === 'IA'));
  assert.ok(!sinIA.some((r) => r.id === 'SGI-Q-8.3-02'));
  assert.ok(preguntasDiagnostico({ ediciones: [Q15, IA], usaIA: true, disena: true }).some((r) => r.familia === 'A'));
});
