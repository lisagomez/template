/**
 * Los roadmaps del laboratorio (costos ficticios y conversaciones-plantilla): el papel es igual al
 * código, cada guion «probado» apunta a un caso o una prueba que existen, las cuentas cuadran, y
 * los supuestos «medido» no se quedan viejos respecto de lo que el laboratorio mide hoy.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASOS, GUIONES, PLANTILLAS_META, SUPUESTOS_LABORATORIO, mideOptimizacion, presupuestoLaboratorio, roadmapCostosMarkdown, roadmapConversacionesMarkdown, roadmapDeCostos } from '../dist/laboratorio/index.js';
import { PLANTILLAS } from '../dist/index.js';
import { FLOWS } from './_ayuda.ts';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

test('el papel es el código: piloto/ROADMAP-*.md = lo que generan las funciones', () => {
  assert.equal(readFileSync(join(raiz, 'piloto', 'ROADMAP-COSTOS.md'), 'utf8'), roadmapCostosMarkdown(), 'regenera con e2e/genera-roadmaps.mjs');
  assert.equal(readFileSync(join(raiz, 'piloto', 'ROADMAP-CONVERSACIONES.md'), 'utf8'), roadmapConversacionesMarkdown());
});

test('cada guion «probado» apunta a un caso que declara «pasa» o a una prueba que existe; las plantillas cuadran', () => {
  for (const g of GUIONES.filter((x) => x.estado === 'probada')) {
    const [tipo, ref] = g.evidencia.split(':');
    if (tipo === 'caso') assert.equal(CASOS.find((k) => k.id === ref)?.declara, 'pasa', `${g.id}: el caso ${ref} no existe o no declara «pasa»`);
    else assert.ok(tipo === 'prueba' && existsSync(join(raiz, 'pruebas', ref!)), `${g.id}: la prueba ${ref} no existe`);
  }
  for (const g of GUIONES) for (const p of g.plantillas) assert.ok(PLANTILLAS_META.some((m) => m.nombre === p.nombre && m.categoria === p.categoria), `${g.id}: plantilla ${p.nombre}`);
  for (const p of PLANTILLAS_META.filter((m) => m.registrada)) assert.equal(PLANTILLAS[p.nombre], p.categoria, `la plantilla ${p.nombre} está registrada con otra categoría`);
  assert.ok(GUIONES.filter((g) => g.estado === 'pendiente').every((g) => g.fase >= 4), 'lo pendiente es de las fases 4-5');
});

test('las cuentas del roadmap cuadran y nada es negativo', () => {
  const fx = SUPUESTOS_LABORATORIO.tipoDeCambio.valor;
  for (const m of roadmapDeCostos()) {
    const total = (m.metaUsd + m.iaUsd + m.infraUsd) * fx + m.soporteMxn;
    assert.ok(Math.abs(total - m.totalMxn) < 0.5, `mes ${m.mes}: ${total} ≠ ${m.totalMxn}`);
    assert.ok(Math.abs(m.porPymeMxn * m.pymes - m.totalMxn) <= m.pymes * 0.005 + 0.01, `mes ${m.mes}: el costo por pyme no cuadra con el total`);
    assert.ok(m.metaSinCupoUsd >= m.metaUsd && m.totalMxn > 0 && m.iaUsd >= 0);
    assert.ok(m.numerosIngresoMxn >= 0 && m.numerosCostoMxn >= 0 && m.bspMargenMxn >= 0 && m.pymesConNumero <= m.pymes);
    assert.equal(m.bspMargenMxn > 0, m.bspModalidad === 'solution_partner', `mes ${m.mes}: como Tech Provider no hay margen sobre Meta`);
  }
  const n = SUPUESTOS_LABORATORIO.numeros.valor;
  const ultimo = roadmapDeCostos().at(-1)!;
  const renta = Math.round(ultimo.pymesConNumero * n.fraccionRenta);
  assert.ok(ultimo.numerosCostoMxn >= Math.ceil(renta * (1 + n.colchonPool)) * n.costoRentaMxn, 'la renta paga el pool con su colchón');
  assert.ok(presupuestoLaboratorio().every((p) => p.montoMxn > 0 && p.naturaleza === 'ficticio'));
});

test('los supuestos «medido» siguen cerca de lo que el laboratorio mide hoy (±20 %)', async () => {
  const r = await mideOptimizacion({ flows: FLOWS });
  const cerca = (a: number, b: number) => Math.abs(a - b) / Math.max(b, 1e-9) <= 0.2;
  assert.ok(cerca(SUPUESTOS_LABORATORIO.mensajesPorConversacion.valor, r.despues.mensajesPorConversacion), `mensajes: supuesto ${SUPUESTOS_LABORATORIO.mensajesPorConversacion.valor}, medido ${r.despues.mensajesPorConversacion}`);
  assert.ok(cerca(SUPUESTOS_LABORATORIO.llamadasModeloPorConversacion.valor, r.despues.llamadasPorConversacion), `llamadas: supuesto ${SUPUESTOS_LABORATORIO.llamadasModeloPorConversacion.valor}, medido ${r.despues.llamadasPorConversacion}`);
  const tokensPorLlamada = r.despues.llamadasModelo ? (r.despues.tokensPorConversacion * r.despues.conversaciones) / r.despues.llamadasModelo : 0;
  assert.ok(cerca(SUPUESTOS_LABORATORIO.tokensPorLlamada.valor, tokensPorLlamada), `tokens por llamada: supuesto ${SUPUESTOS_LABORATORIO.tokensPorLlamada.valor}, medido ${tokensPorLlamada.toFixed(0)}`);
});
