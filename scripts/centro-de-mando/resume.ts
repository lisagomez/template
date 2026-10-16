/**
 * Junta la medición del centro de mando en un resumen legible y siembra el bloque MEDICION del README
 * de `tools/bucle-voz` (entre marcadores, como `voz` y `dictado`: el bloque lo escribe la medición).
 *
 *   node scripts/centro-de-mando/resume.ts [--antes saldo-antes.json] [--despues saldo-despues.json]
 *
 * Lee `docs/goals/centro-de-mando-voz-medicion/{latencias,enrutador}.json`; escribe `resumen.md` al lado.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DIR = 'docs/goals/centro-de-mando-voz-medicion';
const arg = (n: string) => process.argv.find((_, i) => process.argv[i - 1] === n);

interface R { n: number; p50?: number; p95?: number; min?: number; max?: number }
interface Saldo { llave: { usage: number; limit_remaining: number }; cuenta: { saldo: number }; cuando: string }

const ms = (v: number | undefined) => (v === undefined ? '—' : `${Math.round(v)} ms`);
const fila = (nombre: string, r: R, extra = '') => `| ${nombre} | ${r.n} | **${ms(r.p50)}** | **${ms(r.p95)}** | ${ms(r.min)} – ${ms(r.max)} | ${extra} |`;

const lat = JSON.parse(await readFile(`${DIR}/latencias.json`, 'utf8'));
const enr = JSON.parse(await readFile(`${DIR}/enrutador.json`, 'utf8'));
const leeSaldo = async (r: string | undefined): Promise<Saldo | undefined> => (r ? (JSON.parse(await readFile(r, 'utf8')) as Saldo) : undefined);
const antes = await leeSaldo(arg('--antes'));
const despues = await leeSaldo(arg('--despues'));
const gasto = antes && despues ? despues.llave.usage - antes.llave.usage : undefined;
/** El libro del HUD, llamada por llamada con el coste que informa el proveedor (las abortadas, con `null`). */
const libro = (await readFile(join(homedir(), '.centro-de-mando', 'gasto.jsonl'), 'utf8').catch(() => ''))
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l) as { costoUsd: number | null });
const sumaLibro = libro.reduce((s, r) => s + (r.costoUsd ?? 0), 0);
const sinCoste = libro.filter((r) => r.costoUsd === null).length;

const a = enr.audio?.activacion;
const tabla = [
  `**Medido el ${lat.fecha.slice(0, 10)}** (${lat.maquina}). ${lat.corridas?.nota ?? ''} Verdad de terreno: el fin de la voz inyectada en el micrófono falso; «suena»: la primera subida por encima de −45 dBFS de lo que sale por los \`<audio>\` del HUD, tomada por \`captureStream\` (cota conservadora: esa tubería añade unos 100-150 ms). «HUD» es lo que dice su propia telemetría (evento \`playing\` + silencio inicial).`,
  '',
  '| Del fin real del habla al primer audio que suena | n | p50 | p95 | rango | según el HUD (p50 · p95) |',
  '|---|---|---|---|---|---|',
  fila('Orden local, sin LLM', lat.ordenes.resumen, `${ms(lat.ordenes.hud.p50)} · ${ms(lat.ordenes.hud.p95)}`),
  fila('Conversación con el cerebro', lat.cerebro.resumen, `${ms(lat.cerebro.hud.p50)} · ${ms(lat.cerebro.hud.p95)}`),
  '',
  '| Interrupción | Medido |',
  '|---|---|',
  `| «Para.» dicho encima: cortes que callaron la salida | **${lat.interrupcion.resumen.n} de ${lat.interrupcion.cortes.length}** |`,
  `| Reacción (primera muestra de «Para.» → la salida calla) | p50 **${ms(lat.interrupcion.resumen.p50)}** · p95 ${ms(lat.interrupcion.resumen.p95)} |`,
  `| Frases del turno INTERRUMPIDO que empezaron a sonar después de callar (atribuidas por turno) | **${lat.interrupcion.fugas}** |`,
  `| Respuestas nuevas tras un «para» mal oído («But», «Lara.»): la regla «interrupción corta que no se entiende = para» | **${lat.interrupcion.vuelveAHablar ?? '—'}** |`,
  `| Auto-interrupciones con eco residual a ${lat.eco.db} dB y SIN cancelación de eco | **${lat.eco.autoInterrupciones} de ${lat.eco.n}** respuestas |`,
  `| Desvío del fin real según el HUD contra la verdad (p50 · p95) | ${ms(lat.desvioFinReal.p50)} · ${ms(lat.desvioFinReal.p95)} |`,
  '',
  '| Enrutador (`' + enr.enrutador + '`) | Acierto | Órdenes equivocadas | Conversación tomada por orden | Escrituras perdidas |',
  '|---|---|---|---|---|',
  `| Texto, corpus A (${enr.texto.total}) | ${enr.texto.acierto} % | ${enr.texto.ordenesEquivocadas} | ${enr.texto.conversacionComoOrden} | ${enr.texto.escriturasPerdidas} |`,
  ...Object.entries(enr.textoOtros as Record<string, { total: number; acierto: number; ordenesEquivocadas: number; conversacionComoOrden: number; escriturasPerdidas: number }>).map(([k, r]) => `| Texto, corpus ${k} (${r.total})${k === 'C' ? ', **nunca visto al ajustar**' : ', visto al ajustar la 0.3'} | ${r.acierto} % | ${r.ordenesEquivocadas} | ${r.conversacionComoOrden} | ${r.escriturasPerdidas} |`),
  enr.audio?.medido ? `| Audio (voz Piper → motor local → enrutador), corpus A, 2 voces (${enr.audio.enrutador.total}) | ${enr.audio.enrutador.acierto} % | ${enr.audio.enrutador.ordenesEquivocadas} | ${enr.audio.enrutador.conversacionComoOrden} | ${enr.audio.enrutador.escriturasPerdidas} |` : '',
  '',
  a ? `Palabra de activación «oye mando» por audio (3 voces Piper, motor local, umbral 0,8): **${a.positivas}/${a.nPos} detectadas** y **${a.falsas}/${a.nNeg} falsas** en ${Math.round(a.segundosNegativas)} s de habla sin la frase. Barrido del umbral (detectadas · falsas): ${a.barrido.map((b: { umbral: number; detectadas: number; falsas: number }) => `${b.umbral} → ${b.detectadas} · ${b.falsas}`).join('; ')}. Falsos disparos por hora en una sala real: **no medido** (no hay horas de audio de fondo).` : '',
  '',
  gasto !== undefined
    ? `Gasto de OpenRouter de todo el goal: **US$${Math.max(gasto, sumaLibro).toFixed(4)}** de un tope de US$1 (el mayor de dos cuentas). Libro del HUD, ${libro.length} llamadas con el coste que informa el proveedor: US$${sumaLibro.toFixed(4)} (${sinCoste} abortada${sinCoste === 1 ? '' : 's'} con coste \`null\`, no cero). Contador de la llave, antes → después: US$${antes?.llave.usage.toFixed(4)} → US$${despues?.llave.usage.toFixed(4)} = US$${gasto.toFixed(4)} (va por detrás del libro; por eso la cifra es el mayor). Saldo de la cuenta US$${antes?.cuenta.saldo.toFixed(2)} → US$${despues?.cuenta.saldo.toFixed(2)}.`
    : '',
].join('\n');

await writeFile(`${DIR}/resumen.md`, `# Medición del centro de mando por voz\n\n${tabla}\n`);
const ruta = 'tools/bucle-voz/README.md';
const readme = await readFile(ruta, 'utf8');
await writeFile(ruta, readme.replace(/<!-- MEDICION -->[\s\S]*<!-- \/MEDICION -->/, `<!-- MEDICION -->\n${tabla}\n<!-- /MEDICION -->`));
console.log(tabla);
