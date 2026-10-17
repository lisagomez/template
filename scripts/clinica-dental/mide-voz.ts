/**
 * LA MEDICIÓN DE VOZ del portal, en Chromium con micrófono falso (la verdad de terreno del fin del habla es el audio
 * inyectado; «suena» es la primera subida de lo que sale por los `<audio>` de la página, medida desde fuera):
 *
 *  1. la GUÍA del registro (local, sin LLM): los turnos que dejó el recorrido (recorrido.json);
 *  2. el CHATBOT por voz, órdenes locales (horario, ubicación, mis citas: sin LLM);
 *  3. el CHATBOT por voz con el CEREBRO (LLM real por la ruta del servidor);
 *  4. la INTERRUPCIÓN: «Para.» dicho encima de una respuesta larga: reacción y que nada vuelva a sonar.
 *
 *   node scripts/clinica-dental/mide-voz.ts [--llm 12] [--interrupciones 8]
 * Escribe docs/goals/clinica-dental-medicion/voz.json. Gasta centavos del tope del asistente.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { percentil } from '../../tools/bucle-voz/dist/index.js';
import { cierra, contexto } from './navegador.ts';
import { BASE } from './servidor.ts';
import { esperaVoz, habla, interrumpe, type MedidaTurno } from './voz.ts';

const arg = (n: string, d: string) => process.argv.find((_, i) => process.argv[i - 1] === n) ?? d;
const N_LLM = Number(arg('--llm', '12'));
const N_CORTE = Number(arg('--interrupciones', '8'));
const MEDICION = join(process.cwd(), 'docs/goals/clinica-dental-medicion');
const ORDENES = ['¿A qué hora abren?', '¿Dónde están?', '¿Cuál es su horario?', '¿Cómo llego?', 'Quiero agendar.', '¿Qué horario tienen?'];
const PREGUNTAS = [
  '¿Cuánto cuesta una limpieza dental?', '¿En qué consiste la valoración de ortodoncia?', '¿Tengo que ir en ayunas?', '¿Qué promociones tienen?', '¿Aceptan tarjeta?',
  '¿Cuánto dura un tratamiento de conductos?', '¿Tienen estacionamiento?', '¿Qué llevo a mi primera cita?', '¿Atienden a niños?', '¿Hasta cuándo puedo cancelar?',
  '¿Cuánto cuesta la resina?', '¿Qué es la profilaxis?',
];
const LARGA = 'Explícame en qué consiste cada servicio de la clínica y cuánto cuesta.';

function resume(xs: MedidaTurno[]) {
  const v = xs.map((x) => x.msExterna).filter((x): x is number => typeof x === 'number');
  const h = xs.map((x) => x.msHud).filter((x): x is number => typeof x === 'number');
  return { n: xs.length, conMedida: v.length, p50: percentil(v, 50) ?? null, p95: percentil(v, 95) ?? null, min: v.length ? Math.min(...v) : null, max: v.length ? Math.max(...v) : null, segunLaPagina: { p50: percentil(h, 50) ?? null, p95: percentil(h, 95) ?? null } };
}

async function principal() {
  const ctx = await contexto('escritorio', { voz: true });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/clinica/maguey`, { waitUntil: 'networkidle' });
  await p.getByRole('region', { name: 'Preferencias de analítica' }).getByRole('button', { name: 'Rechazar' }).click();
  await p.getByRole('button', { name: /Voz: no/ }).click();
  await p.getByRole('button', { name: /Chatbot: no/ }).click();
  await p.getByRole('button', { name: 'Hablar con el asistente' }).click();
  await esperaVoz(p);
  const ordenes: MedidaTurno[] = [];
  for (let r = 0; r < 2; r++) for (const t of ORDENES) {
    const m = await habla(p, t);
    ordenes.push(m);
    console.log(`  · orden  «${t}» → ${m.ruta ?? '—'} ${m.msExterna ?? '—'} ms (página ${m.msHud ?? '—'}) oyó ${JSON.stringify(m.oido)}`);
  }
  const cerebro: MedidaTurno[] = [];
  for (const t of PREGUNTAS.slice(0, N_LLM)) {
    const m = await habla(p, t);
    cerebro.push(m);
    console.log(`  · LLM    «${t}» → ${m.ruta ?? '—'} ${m.msExterna ?? '—'} ms (página ${m.msHud ?? '—'}) oyó ${JSON.stringify(m.oido)}`);
  }
  const cortes = [];
  for (let i = 0; i < N_CORTE; i++) {
    const c = await interrumpe(p, LARGA);
    cortes.push(c);
    console.log(`  · corte ${i + 1}: ${c.callo ? `calló en ${c.msReaccion} ms` : c.sonabaAlDecirPara ? `NO calló (siguió ${c.msHastaQueSeCallo ?? '?'} ms; oyó ${JSON.stringify(c.oidoTrasPara)})` : 'en silencio al decir «para» y no calló nada'}${c.sonoDespues ? ' · VOLVIÓ A SONAR' : ''}`);
  }
  await ctx.close();
  await cierra();
  const recorrido = JSON.parse(readFileSync(join(MEDICION, 'recorrido.json'), 'utf8')) as { latenciasGuia?: MedidaTurno[] };
  const guia = (recorrido.latenciasGuia ?? []).map((m) => ({ ...m, ruta: m.ruta === 'llm' ? 'guia-local' : m.ruta }));
  const reaccion = cortes.map((c) => c.msReaccion).filter((x): x is number => typeof x === 'number');
  const salida = {
    cuando: new Date().toISOString(), base: BASE, maquina: 'WSL2, sin GPU; ASR Parakeet y TTS Piper locales (demonio de dictado); Chromium headless con micrófono falso',
    // Cada grupo cuenta SOLO los turnos que de verdad fueron por su ruta; los que el ASR desvió se cuentan aparte.
    guia: resume(guia), ordenesLocales: resume(ordenes.filter((m) => m.ruta === 'orden')), cerebro: resume(cerebro.filter((m) => m.ruta === 'llm')),
    desviados: { ordenesQueFueronAlLlm: ordenes.filter((m) => m.ruta !== 'orden').length, preguntasQueNoFueronAlLlm: cerebro.filter((m) => m.ruta !== 'llm').length },
    interrupcion: {
      n: cortes.length, sonabanAlDecirPara: cortes.filter((c) => c.sonabaAlDecirPara).length, callaron: cortes.filter((c) => c.callo).length,
      siguieronHablando: cortes.filter((c) => c.sonabaAlDecirPara && !c.callo).length, // En silencio = entre dos frases O ya terminada: el 16/10 uno así igual calló la frase siguiente.
      enSilencioAlDecirPara: cortes.filter((c) => !c.sonabaAlDecirPara).length,
      volvioASonar: cortes.filter((c) => c.sonoDespues).length, reaccionP50: percentil(reaccion, 50) ?? null, reaccionP95: percentil(reaccion, 95) ?? null,
    },
    referencia: 'centro de mando (PR #268): orden local p50 644 ms · p95 802 ms; con cerebro p50 1895 ms · p95 2644 ms; interrupción p50 208 ms',
    muestras: { ordenes, cerebro, cortes },
  };
  writeFileSync(join(MEDICION, 'voz.json'), `${JSON.stringify(salida, null, 1)}\n`);
  console.log(JSON.stringify({ guia: salida.guia, ordenesLocales: salida.ordenesLocales, cerebro: salida.cerebro, desviados: salida.desviados, interrupcion: salida.interrupcion }, null, 1));
}

principal().catch(async (e) => {
  console.error(`✗ ${e instanceof Error ? e.stack : String(e)}`);
  await cierra();
  process.exit(1);
});
