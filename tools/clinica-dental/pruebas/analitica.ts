/**
 * Unit economics y grafo de atención (lazo l-metricas en su parte de cálculo): cada cifra declara su origen y su
 * fuente; ningún supuesto queda sin fuente; el grafo sale en el esquema de docs/grafos/ con conteo y p50 por arista.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clinica, grafoDeAtencion, unitEconomics, type CorteSemantico } from '../dist/index.js';

const doble = (x: number | null) => ({ metricflow: x, directo: x });
const CORTE: CorteSemantico = {
  metricas: {
    pacientes_nuevos: { maguey: doble(5) }, citas_confirmadas: { maguey: doble(6) }, citas_atendidas_n: { maguey: doble(4) }, tasa_inasistencia: { maguey: doble(0.2) },
    ingreso_atendido_mxn: { maguey: doble(2600) }, margen_atendido_mxn: { maguey: doble(2200) }, avisos_entregados_n: { maguey: doble(12) }, costo_por_aviso_usd: { maguey: doble(0.0004) },
    conversaciones_asistente_n: { maguey: doble(3) }, costo_por_conversacion_usd: { maguey: doble(0.0009) }, entregabilidad: { maguey: doble(0.9) },
  },
  porCanal: [{ clinica: 'maguey', canal: 'busqueda', visitantes: 4, registrados: 2, conversion: 0.5 }, { clinica: 'maguey', canal: 'directo', visitantes: 8, registrados: 1, conversion: 0.125 }],
  aristas: [{ arista: 'visita→registro', metricflow: { n: 5, p50: 120.5 } }, { arista: 'asistente→urgencia', metricflow: { n: 2, p50: 0 } }, { arista: 'cita→cancelada', metricflow: { n: 0, p50: null } }],
  aristasPorClinica: [],
};

test('unit economics: cada cifra trae origen y fuente; las cuentas cuadran', () => {
  const u = unitEconomics(CORTE, clinica('maguey'), 10);
  for (const [k, c] of Object.entries(u.cifras)) {
    assert.ok(['medida', 'simulada', 'supuesta', 'compuesta'].includes(c.origen), k);
    assert.ok(c.fuente.length >= 10, `${k} sin fuente`);
  }
  assert.equal(u.cifras['margen_por_cita']!.valor, 550);
  assert.equal(u.cifras['precio_promedio_cita']!.valor, 650);
  assert.equal(u.cifras['costo_asistente_por_conversacion']!.origen, 'medida', 'el costo del LLM es lo único MEDIDO');
  assert.equal(u.cifras['entregabilidad']!.origen, 'simulada');
  const gastoMensual = Object.values(clinica('maguey').supuestos.gastoMarketingMensualMxn).reduce((s, g) => s + g.valor, 0);
  assert.equal(u.cifras['cac']!.valor, Math.round(((gastoMensual * 10) / 30 / 5) * 100) / 100);
  const busqueda = u.porCanal.find((x) => x.canal === 'busqueda')!;
  assert.equal(busqueda.registrados.valor, 2);
  assert.equal(busqueda.cac.valor, Math.round(((6000 * 10) / 30 / 2) * 100) / 100);
  assert.equal(u.porCanal.find((x) => x.canal === 'redes')!.cac.valor, null, 'sin registrados en el canal no hay CAC (no se inventa)');
  // El canal sin gasto declarado (directo) NO se cae de la tabla: sus registrados cuentan y su gasto es 0, dicho.
  const directo = u.porCanal.find((x) => x.canal === 'directo');
  assert.ok(directo, 'el canal directo, con un registrado, falta en el CAC por canal');
  assert.equal(directo.registrados.valor, 1);
  assert.equal(directo.gastoPeriodoMxn.valor, 0);
  assert.match(directo.gastoPeriodoMxn.fuente, /sin gasto declarado/);
});

test('cada supuesto de costo de las dos clínicas declara su fuente', () => {
  for (const id of ['maguey', 'colibri']) {
    const s = clinica(id).supuestos;
    const todos = [...Object.values(s.gastoMarketingMensualMxn), s.visitasPorAnio, s.aniosRetencion, s.costoCorreoUsd, s.costoTelegramUsd, s.tipoCambioMxnPorUsd];
    for (const x of todos) assert.ok(x.fuente.length >= 10 && x.unidad.length > 0, `${id}: supuesto sin fuente`);
  }
});

test('grafo de atención: esquema de docs/grafos (slug/titulo/nodos/aristas/lazos), sin aristas vacías, con n y p50', () => {
  const g = grafoDeAtencion(CORTE);
  assert.deepEqual(Object.keys(g).sort(), ['aristas', 'fuente', 'lazos', 'nodos', 'slug', 'titulo']);
  assert.equal(g.slug, 'clinica-dental-atencion');
  assert.deepEqual(g.aristas.map((a) => [a.from, a.to, a.n, a.p50_s]), [['visita', 'registro', 5, 120.5], ['asistente', 'urgencia', 2, 0]]);
  const ids = new Set(g.nodos.map((n) => n.id));
  for (const a of g.aristas) assert.ok(ids.has(a.from) && ids.has(a.to), `arista ${a.id} con nodo inexistente`);
  assert.ok(!ids.has('cancelada'), 'un nodo sin aristas no se dibuja');
});
