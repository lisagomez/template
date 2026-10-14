/**
 * La suite del laboratorio del sistema integrado (`npm run prueba:laboratorio-sgi`): corre TODOS los casos de verdad
 * y exige que cada pieza tenga ≥5 casos, que las 10 trampas del spec estén cubiertas y que ningún caso falle.
 * Los casos con LLM sin corrida grabada salen «no medido» y se dicen; con SGI_EXIGE_CORRIDAS=1 cuentan como falla.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aprobadas, correLaboratorio, PIEZAS, TRAMPAS } from '../services/laboratorio.ts';

const resultados = await correLaboratorio();

test('cada pieza tiene al menos 5 casos y las 10 trampas del spec están cubiertas', () => {
  for (const p of PIEZAS) assert.ok(resultados.filter((r) => r.pieza === p).length >= 5, `${p}: menos de 5 casos`);
  const cubiertas = new Set(resultados.filter((r) => r.trampa).map((r) => r.trampa));
  for (const t of Object.keys(TRAMPAS).map(Number)) assert.ok(cubiertas.has(t), `trampa ${t} (${TRAMPAS[t]}) sin caso`);
  assert.equal(new Set(resultados.map((r) => r.id)).size, resultados.length, 'ids únicos');
});

test('ningún caso falla (corrido de verdad)', () => {
  const tabla = resultados.map((r) => `${r.estado === 'pasa' ? '✓' : r.estado === 'no_medido' ? '·' : '✗'} ${r.id.padEnd(7)} ${r.pieza.padEnd(13)} ${r.estado.padEnd(9)} ${r.trampa ? `[T${r.trampa} ${TRAMPAS[r.trampa]}] ` : ''}${r.titulo}${r.costoUsd !== null ? ` · US$${r.costoUsd.toFixed(4)}` : ''}`);
  console.log(tabla.join('\n'));
  const fallan = resultados.filter((r) => r.estado === 'falla');
  assert.equal(fallan.length, 0, fallan.map((f) => `${f.id}: ${f.evidencia.filter((e) => e.startsWith('✗')).join('; ')}`).join('\n'));
});

test('lo no medido se declara (y, si se exige, cuenta como falla)', () => {
  const noMedidos = resultados.filter((r) => r.estado === 'no_medido');
  console.log(`no medidos: ${noMedidos.length} de ${resultados.length}`);
  if (process.env.SGI_EXIGE_CORRIDAS === '1') assert.equal(noMedidos.length, 0, noMedidos.map((r) => r.id).join(', '));
  const piezas = aprobadas(resultados);
  console.log(piezas.map((p) => `${p.aprobada ? '✓' : '·'} ${p.pieza.padEnd(13)} ${p.pasan}/${p.casos}${p.noMedidos ? ` (${p.noMedidos} no medidos)` : ''}`).join('\n'));
});

test('L8: ningún texto de la app, sus guías ni su aviso promete certificación', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { promesasDeCertificacion } = await import('../../../../tools/sistema-integrado/dist/agentes/index.js');
  const archivos: string[] = [];
  const recorre = (d: string) => { for (const n of readdirSync(d)) { const r = join(d, n); if (statSync(r).isDirectory()) recorre(r); else if (/\.(tsx?|md)$/.test(n)) archivos.push(r); } };
  for (const d of ['src/features/sgi', 'src/app/(main)/sgi']) recorre(d);
  archivos.push('docs/GUIA-PYME-SGI.md', 'docs/GUIA-CONSULTOR-SGI.md', 'docs/AVISO-PRIVACIDAD-SGI.md', 'tools/sistema-integrado/README.md');
  const con = archivos.map((a) => [a, promesasDeCertificacion(readFileSync(a, 'utf8'))] as const).filter(([, p]) => p.length);
  console.log(`L8: ${archivos.length} archivos revisados, ${con.length} con promesas`);
  assert.deepEqual(con, []);
});

test('el espejo SQL del catálogo (migración generada) no tiene deriva', async () => {
  const { readFileSync } = await import('node:fs');
  const { sqlDelCatalogo, RUTA } = await import('../../../../scripts/sgi/catalogo-sql.ts');
  assert.equal(readFileSync(RUTA, 'utf8'), sqlDelCatalogo(), `${RUTA} no coincide con el catálogo: node scripts/sgi/catalogo-sql.ts`);
});
