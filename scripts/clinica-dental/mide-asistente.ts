/**
 * LA MEDICIÓN DEL ASISTENTE CON EL LLM REAL (OpenRouter, modelo pineado de `asistente-paciente`): el corpus
 * declarado (tools/clinica-dental/laboratorio/corpus-asistente.json) por la ruta HTTP de la app, con la SESIÓN de un
 * paciente de cada clínica, y la conducta comparada con la esperada. Además:
 *  - «0 acciones sin confirmar»: el estado del portal (citas, consentimientos, avisos, tokens) y el calendario,
 *    antes y después del corpus, tienen que ser IGUALES (el asistente no tiene manos; si las tuviera, se vería aquí);
 *  - el gasto: el libro de gasto de la app y el saldo de la llave antes y después.
 *
 *   node scripts/clinica-dental/mide-asistente.ts   (con la app y el laboratorio arriba, tras el recorrido)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CORPUS, evalua, frasesARevisar, mediana, type Pregunta, type Resultado } from './evaluador.ts';
import { cierra, contexto } from './navegador.ts';
import { entra, paciente } from './flujos.ts';
import { DATOS } from './rutas.ts';
import { BASE } from './servidor.ts';

const SALIDA = join(process.cwd(), 'docs/goals/clinica-dental-medicion/asistente.json');

function estado() {
  const p = JSON.parse(readFileSync(join(DATOS, 'portal.json'), 'utf8')) as Record<string, unknown[]>;
  const cal = JSON.parse(readFileSync(join(DATOS, 'calendario.json'), 'utf8')) as { eventos?: unknown[]; reservas?: unknown[] };
  return { citas: p['citas']?.length, consentimientos: p['consentimientos']?.length, avisos: p['avisos']?.length, tokens: p['tokens']?.length, eventosCalendario: cal.eventos?.length, reservas: cal.reservas?.length };
}

async function pregunta(post: (cuerpo: unknown) => Promise<string>, p: Pregunta, n: number): Promise<Resultado> {
  const t0 = performance.now();
  const crudo = await post({ clinica: p.clinica, candidatos: [p.texto], historial: [], modo: 'texto', conversacion: `cnv_${(0xa0000 + n).toString(16).padStart(20, '0')}`, visitante: null });
  const fin = crudo.split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>).find((l) => l['t'] === 'fin') ?? {};
  const base = { id: p.id, categoria: p.categoria, clinica: p.clinica, ruta: String(fin['ruta'] ?? 'error'), intencion: String(fin['intencion'] ?? ''), barrera: (fin['barrera'] as string | null) ?? null, urgencia: (fin['urgencia'] as Resultado['urgencia']) ?? null, accion: fin['accion'] ?? null, ms: Math.round(performance.now() - t0), costoUsd: (fin['costoUsd'] as number | null) ?? null, texto: String(fin['texto'] ?? '') };
  return { ...base, fallas: evalua(p, base) };
}

async function principal() {
  const antes = estado();
  const sesiones: Record<string, (c: unknown) => Promise<string>> = {};
  for (const [c, id] of [['maguey', 'adulto-convenio'], ['colibri', 'sin-consentimiento-salud']] as const) {
    const ctx = await contexto('escritorio');
    const pg = await ctx.newPage();
    await entra(pg, paciente(id));
    sesiones[c] = async (cuerpo) => (await ctx.request.post(`${BASE}/api/clinica-dental/asistente`, { data: cuerpo, headers: { origin: BASE } })).text();
  }
  const resultados: Resultado[] = [];
  for (const [i, p] of CORPUS.preguntas.entries()) {
    const r = await pregunta(sesiones[p.clinica]!, p, i);
    resultados.push(r);
    console.log(`  ${r.fallas.length ? '✗' : '✓'} ${p.id.padEnd(7)} ${p.categoria.padEnd(16)} ${r.ruta.padEnd(9)} ${String(r.ms).padStart(5)} ms  ${r.texto.slice(0, 90).replace(/\n/g, ' ')}${r.fallas.length ? `  ← ${r.fallas.join('; ')}` : ''}`);
  }
  const despues = estado();
  await cierra();
  const resumen = resume(resultados, antes, despues);
  writeFileSync(SALIDA, `${JSON.stringify({ cuando: new Date().toISOString(), resumen, resultados }, null, 1)}\n`);
  console.log(`\n${JSON.stringify({ ...resumen, fallas: resumen.fallas.length, estadoAntes: undefined, estadoDespues: undefined }, null, 1)}`);
}

function resume(resultados: Resultado[], antes: unknown, despues: unknown) {
  const cat = (c: string) => resultados.filter((r) => r.categoria === c);
  const ok = (rs: Resultado[]) => `${rs.filter((r) => !r.fallas.length).length}/${rs.length}`;
  const conLlm = resultados.filter((r) => r.ruta === 'cerebro' || r.costoUsd !== null);
  return {
    corpus: CORPUS.version, preguntas: resultados.length,
    diagnosticos: resultados.filter((r) => r.fallas.includes('diagnosticó')).length,
    revisionIndependiente: resultados.flatMap((r) => frasesARevisar(r.texto).map((frase) => ({ id: r.id, frase }))),
    urgenciasPorRegla: `${cat('urgencia').filter((r) => r.ruta === 'urgencia' && !r.fallas.length).length}/${cat('urgencia').length}`,
    noUrgencias: ok(cat('no_urgencia')), enDominio: ok(cat('en_dominio')), fueraDeDominioRechazado: ok(cat('fuera_de_dominio')),
    diagnosticoPedido: ok(cat('diagnostico')), inyeccionesSinEfecto: ok(cat('inyeccion')), acciones: ok(cat('accion')),
    accionesSinConfirmar: JSON.stringify(antes) === JSON.stringify(despues) ? 0 : 'EL ESTADO CAMBIÓ', estadoAntes: antes, estadoDespues: despues,
    llamadasAlLlm: conLlm.length, costoReportadoUsd: Math.round(conLlm.reduce((s, r) => s + (r.costoUsd ?? 0), 0) * 1e6) / 1e6,
    latenciaServidorP50Ms: mediana(resultados.map((r) => r.ms)), latenciaLlmP50Ms: mediana(conLlm.map((r) => r.ms)),
    fallas: resultados.filter((r) => r.fallas.length).map((r) => ({ id: r.id, fallas: r.fallas, texto: r.texto })),
  };
}

/**
 * `--recalifica`: vuelve a calificar las MISMAS respuestas guardadas con el evaluador actual, sin llamar al LLM. Se
 * usa cuando el evaluador se corrige tras leer una respuesta (un rechazo correcto que la regex no reconocía): la
 * calificación original se conserva al lado, no se pisa.
 */
function recalifica(): void {
  const previo = JSON.parse(readFileSync(SALIDA, 'utf8')) as { cuando: string; resumen: ReturnType<typeof resume>; resultados: Resultado[] };
  const resultados = previo.resultados.map((r) => ({ ...r, fallas: evalua(CORPUS.preguntas.find((p) => p.id === r.id)!, r) }));
  const resumenRecalificado = resume(resultados, previo.resumen.estadoAntes, previo.resumen.estadoDespues);
  writeFileSync(SALIDA, `${JSON.stringify({ ...previo, resumenOriginal: previo.resumen, resumen: resumenRecalificado, recalificado: new Date().toISOString(), resultados }, null, 1)}\n`);
  console.log(JSON.stringify({ original: previo.resumen.fallas.map((f) => f.id), recalificado: { ...resumenRecalificado, estadoAntes: undefined, estadoDespues: undefined } }, null, 1));
}

(process.argv.includes('--recalifica') ? Promise.resolve(recalifica()) : principal()).catch(async (e) => {
  console.error(`✗ ${e instanceof Error ? e.stack : String(e)}`);
  await cierra();
  process.exit(1);
});
