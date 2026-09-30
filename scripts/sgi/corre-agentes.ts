/**
 * CORRIDAS REALES de los agentes del laboratorio (PRP-008 fase 8): cada caso de casos-llm.ts contra el modelo pineado
 * por routing, con datos SINTÉTICOS. Graba cada corrida en public/laboratorio-sgi/corridas.json (se versiona: son
 * datos sintéticos, sin secretos) y se detiene ANTES de pasar el tope de gasto del goal.
 *
 * La llave: OPENROUTER_API_KEY del entorno, o la del `.env.local` del checkout principal (este worktree comparte el
 * repo). Nunca se imprime: solo presente/ausente, largo y prefijo de 4.
 *
 * Uso: npm run sgi:agentes [-- --solo dia-1,doc-3] [-- --rehace] [-- --tope 15] [-- --paralelo 4]
 *   por omisión solo corre los casos sin corrida aceptada (retoma donde se quedó).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AGENTES, ejecutaAgente } from '../../tools/sistema-integrado/dist/agentes/index.js';
import { costeUsd, modeloPara, type ClaseDeTarea } from '../../src/lib/ai/routing.ts';
import { estadoPresupuesto } from '../../src/lib/ai/contabilidad.ts';
import { modeloDe } from '../../src/features/sgi/services/llm.ts';
import { CASOS_LLM, type CorridaGrabada } from '../../src/features/laboratorio-sgi/services/casos-llm.ts';

const RUTA = 'public/laboratorio-sgi/corridas.json';
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const TOPE = Number(arg('tope') ?? 15);
const PARALELO = Math.max(1, Number(arg('paralelo') ?? 4));

function llave(): string | undefined {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const comun = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
  for (const f of ['.env.local', join(comun, '..', '.env.local')]) {
    if (!existsSync(f)) continue;
    const m = /^OPENROUTER_API_KEY=(.+)$/m.exec(readFileSync(f, 'utf8'));
    if (m?.[1]) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return undefined;
}

const k = llave();
console.log(`OPENROUTER_API_KEY: ${k ? `presente, largo ${k.length}, prefijo ${k.slice(0, 4)}` : 'AUSENTE'}`);
if (!k) { console.error('Sin llave no corre ningún agente (y no se inventa ninguna respuesta). El laboratorio la guarda con `read -rsp` en una terminal aparte.'); process.exit(2); }

const archivo = existsSync(RUTA) ? JSON.parse(readFileSync(RUTA, 'utf8')) as { corridas: CorridaGrabada[] } : { corridas: [] };
const grabadas = new Map(archivo.corridas.map((c) => [c.id, c]));
const gastado = () => [...grabadas.values()].reduce((s, c) => s + (c.costoUsd ?? 0), 0);
const solo = arg('solo')?.split(',');
const pendientes = CASOS_LLM.filter((c) => (solo ? solo.includes(c.id) : process.argv.includes('--rehace') || !grabadas.get(c.id)?.ok));
console.log(`${pendientes.length} caso(s) por correr · gastado antes: US$${gastado().toFixed(4)} · tope US$${TOPE} · modelos: redacción ${modeloPara('agente-sgi-redaccion').modelo}, evaluación ${modeloPara('agente-sgi-evaluacion').modelo}`);

function guarda() {
  const corridas = CASOS_LLM.map((c) => grabadas.get(c.id)).filter((c): c is CorridaGrabada => Boolean(c));
  writeFileSync(RUTA, `${JSON.stringify({
    _comentario: 'Corridas REALES de los agentes con datos sintéticos (scripts/sgi/corre-agentes.ts). Se verifican en el laboratorio con reglas fijas.',
    cuando: new Date().toISOString(),
    modelos: { 'agente-sgi-redaccion': modeloPara('agente-sgi-redaccion').modelo, 'agente-sgi-evaluacion': modeloPara('agente-sgi-evaluacion').modelo },
    gastoTotalUsd: Number(gastado().toFixed(6)), corridas,
  }, null, 1)}\n`);
}

let detenido = false;
async function corre(caso: typeof CASOS_LLM[number]) {
  const pres = estadoPresupuesto(gastado(), TOPE);
  if (pres.nivel === 'excedido' || gastado() + 0.3 > TOPE) { detenido = true; return; }
  if (pres.nivel === 'aviso') console.log(`⚠ ${pres.mensaje}`);
  const clase = AGENTES[caso.agente].clase as ClaseDeTarea;
  const modelo = modeloDe(clase as 'agente-sgi-redaccion' | 'agente-sgi-evaluacion', k)!;
  const t0 = Date.now();
  try {
    const r = await ejecutaAgente(caso.agente, caso.entrada, { modelo });
    const costo = r.traza.uso ? costeUsd(clase, r.traza.uso) : null;
    grabadas.set(caso.id, { id: caso.id, agente: caso.agente, ok: r.ok, errores: r.ok ? [] : r.errores, salida: r.ok ? r.salida : null, traza: r.traza, costoUsd: costo, cuando: new Date().toISOString() });
    guarda();
    console.log(`${r.ok ? '✓' : '✗'} ${caso.id.padEnd(6)} ${caso.agente.padEnd(12)} ${((Date.now() - t0) / 1000).toFixed(0).padStart(3)} s · ${r.traza.intentos} intento(s) · ${costo === null ? 'costo null' : `US$${costo.toFixed(4)}`} · ${r.ok ? `${r.traza.requisitosCitados.length} IDs` : r.errores.join('; ').slice(0, 160)}`);
  } catch (e) {
    console.log(`✗ ${caso.id} ${caso.agente}: ${(e as Error).message.replaceAll(k!, '‹llave›').slice(0, 300)}`);
  }
}

const cola = [...pendientes];
await Promise.all(Array.from({ length: PARALELO }, async () => { while (cola.length && !detenido) await corre(cola.shift()!); }));
guarda();
const ok = CASOS_LLM.filter((c) => grabadas.get(c.id)?.ok).length;
console.log(`\n${detenido ? 'DETENIDO por el tope de gasto. ' : ''}${ok}/${CASOS_LLM.length} casos con corrida aceptada · gasto total US$${gastado().toFixed(4)} de US$${TOPE} (${estadoPresupuesto(gastado(), TOPE).mensaje})`);
process.exit(detenido ? 3 : 0);
