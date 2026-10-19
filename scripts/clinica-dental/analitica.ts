/**
 * Del corte semántico (MetricFlow) al UNIT ECONOMICS por clínica y canal y al GRAFO DE ATENCIÓN, con el origen de
 * cada cifra. El periodo es lo que duró la corrida en el reloj del laboratorio (primer y último evento del libro).
 *
 *   node scripts/clinica-dental/analitica.ts [--medicion <dir>] [--grafo <json>]
 * Escribe <medicion>/unit-economics.json y el grafo (por defecto docs/goals/clinica-dental-medicion/ y
 * docs/grafos/clinica-dental-atencion.json).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLINICAS, grafoDeAtencion, unitEconomics, type CorteSemantico } from '../../tools/clinica-dental/dist/index.js';
import { DIR_LIBRO } from './rutas.ts';

const arg = (n: string, d: string) => process.argv.find((_, i) => process.argv[i - 1] === n) ?? d;
const MEDICION = join(process.cwd(), arg('--medicion', 'docs/goals/clinica-dental-medicion'));
const GRAFO = join(process.cwd(), arg('--grafo', 'docs/grafos/clinica-dental-atencion.json'));
const corte = JSON.parse(readFileSync(join(MEDICION, 'corte-semantico.json'), 'utf8')) as CorteSemantico & { version: string; generado: string };
const instantes = CLINICAS.flatMap((c) => readFileSync(join(DIR_LIBRO, `${c.id}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => Date.parse((JSON.parse(l) as { evento: { en: string } }).evento.en)));
const periodoDias = Math.max(1, Math.round(((Math.max(...instantes) - Math.min(...instantes)) / 86_400_000) * 10) / 10);

const ue = CLINICAS.map((c) => unitEconomics(corte, c, periodoDias));
writeFileSync(join(MEDICION, 'unit-economics.json'), `${JSON.stringify({ generado: new Date().toISOString(), corte: corte.version, periodoDias, clinicas: ue }, null, 1)}\n`);
const grafo = grafoDeAtencion(corte);
writeFileSync(GRAFO, `${JSON.stringify({ ...grafo, corte: corte.version }, null, 2)}\n`);

for (const u of ue) {
  console.log(`\n  ${u.clinica} · periodo ${u.periodoDias} días`);
  for (const [k, c] of Object.entries(u.cifras)) console.log(`    ${k.padEnd(34)} ${String(c.valor).padStart(12)} ${c.unidad.padEnd(10)} [${c.origen}] ${c.fuente.slice(0, 70)}`);
  for (const k of u.porCanal) console.log(`    canal ${k.canal.padEnd(10)} gasto ${String(k.gastoPeriodoMxn.valor).padStart(9)} MXN [supuesta] · registrados ${k.registrados.valor} · CAC ${k.cac.valor ?? '—'} [compuesta]`);
  for (const a of u.avisosPorCanal ?? []) console.log(`    avisos por ${a.canal.padEnd(9)} entregados ${String(a.entregados.valor).padStart(3)} · leídos ${a.leidos.valor ?? '—'} · costo por aviso ${a.costoPorAviso.valor ?? '—'} MXN [supuesta]`);
  for (const [k, c] of Object.entries(u.whatsapp ?? {})) console.log(`    whatsapp ${k.padEnd(25)} ${String(c.valor).padStart(12)} ${c.unidad.padEnd(10)} [${c.origen}]`);
}
console.log(`\n  grafo de atención: ${grafo.nodos.length} nodos, ${grafo.aristas.length} aristas`);
for (const a of grafo.aristas) console.log(`    ${a.from.padEnd(16)} → ${a.to.padEnd(14)} n ${String(a.n).padStart(3)} · p50 ${a.p50_s ?? '—'} s`);
