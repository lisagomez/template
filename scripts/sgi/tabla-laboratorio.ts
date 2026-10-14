/**
 * Tabla del laboratorio en texto: los 79 casos (deterministas + con LLM) con su estado REAL, por pieza, y las trampas.
 * Sale de correLaboratorio(): la misma fuente que la página /laboratorio-sgi. Uso: node scripts/sgi/tabla-laboratorio.ts
 */
import { correLaboratorio, infoCorridas, TRAMPAS } from '../../src/features/laboratorio-sgi/services/laboratorio.ts';

const r = await correLaboratorio();
const piezas = [...new Set(r.map((x) => x.pieza))];
console.log('| Pieza | Casos | Pasa | Falla | No medido | Costo grabado |\n|---|---|---|---|---|---|');
for (const p of piezas) {
  const de = r.filter((x) => x.pieza === p);
  const n = (e: string) => de.filter((x) => x.estado === e).length;
  const costo = de.reduce((s, x) => s + (x.costoUsd ?? 0), 0);
  console.log(`| ${p} | ${de.length} | ${n('pasa')} | ${n('falla')} | ${de.length - n('pasa') - n('falla')} | ${costo ? `US$${costo.toFixed(4)}` : '—'} |`);
}
console.log('\nTrampas:');
for (const [t, nombre] of Object.entries(TRAMPAS)) {
  const de = r.filter((x) => x.trampa === Number(t));
  console.log(`  ${t}. ${nombre}: ${de.map((x) => `${x.id} ${x.estado}`).join(' · ') || 'SIN CASO'}`);
}
console.log('\nCasos con LLM grabados:');
for (const x of r.filter((y) => y.llm && y.estado !== 'no_medido')) console.log(`  ${x.estado === 'pasa' ? '✓' : '✗'} ${x.id.padEnd(6)} ${x.titulo.slice(0, 60).padEnd(60)} ${x.evidencia.filter((e) => e.startsWith('✗')).join(' ') || ''}`);
const i = infoCorridas();
console.log(`\nGasto grabado de los agentes: US$${(i.gastoTotalUsd ?? 0).toFixed(4)} · ${i.cuando ?? ''}`);
