/**
 * La medición de punta a punta del centro de mando, en Chromium con micrófono falso:
 *
 *  1. órdenes locales (sin LLM) y 2. conversación con el cerebro: latencia del FIN REAL del habla
 *     (verdad de terreno del audio inyectado) al PRIMER AUDIO QUE SUENA (toma de salida), p50/p95;
 *     y la misma cifra según la telemetría del HUD, para ver si el HUD se mide honesto;
 *  3. interrupción: la persona dice «Para.» mientras la máquina habla; reacción = de su primera
 *     muestra de voz a que la salida calla; y que nada del turno viejo suene después;
 *  4. auto-interrupción: con eco residual a −20 dB (sin cancelación de eco), ¿se calla sola?
 *
 *   node scripts/centro-de-mando/mide.ts [--base http://localhost:3011] [--rondas 2] [--llm 12]
 *   node scripts/centro-de-mando/mide.ts --solo-corte --interrupciones 16 --nota "…"   # repite 3 y 4 y conserva 1 y 2
 *   node scripts/centro-de-mando/mide.ts --detector silero --ruido PCAFETER --snr 10 --llm 0 --salida <ruta.json>
 *
 * Con `--ruido` (los de `ruidos.ts` o una sala de DEMAND, `banco-ruido.ts`) el ruido suena en bucle desde ANTES de
 * encender, a `--snr` dB por debajo de la voz, y la voz se lleva a −26 dBFS de nivel activo (como `mide-detector.ts`).
 * `--detector` abre el HUD con `?detector=`; si corre otro (Silero no cargó), la medición se corta: no mide lo pedido.
 *
 * Escribe `docs/goals/centro-de-mando-voz-medicion/latencias.json`. Gasta centavos de OpenRouter:
 * el saldo se mira antes y después con `saldo.ts`.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { aPcm16, latencia, percentil, type RegistroTurno } from '../../tools/bucle-voz/dist/index.js';
import { abreHud, di, enciende, esperaTurno, frase, primeraSubida, toma, ultimosEventos, type Hud } from './banco-pagina.ts';
import { tokenDictado } from './voz-sintetica.ts';
import { ORDENES, VOCES } from './corpus.ts';
import { aseguraBanco, rutasFleurs } from './banco-ruido.ts';
import { HZ, leeMono, potenciaActiva, ruidoDe } from './ruidos.ts';
import type { Dicho } from './voz-sintetica.ts';

const arg = (n: string, d: string) => process.argv.find((_, i) => process.argv[i - 1] === n) ?? d;
const BASE = arg('--base', 'http://localhost:3011');
const RONDAS = Number(arg('--rondas', '2'));
const N_LLM = Number(arg('--llm', '12'));
const N_INTERRUPCION = Number(arg('--interrupciones', '8'));
const SOLO_CORTE = process.argv.includes('--solo-corte');
const SALIDA = arg('--salida', 'docs/goals/centro-de-mando-voz-medicion/latencias.json');
const DETECTOR = arg('--detector', '');
const RUIDO = arg('--ruido', '');
const SNR = Number(arg('--snr', '10'));
const NIVEL_VOZ_DB = -26;
const PREGUNTAS = [
  '¿Qué es un balance general?', '¿Para qué sirve el flujo de caja?', '¿Cómo calculo el margen bruto?', 'Dame una idea para vender más esta semana.',
  '¿Qué diferencia hay entre utilidad y flujo?', '¿Qué es el capital de trabajo?', '¿Cómo le hago para cobrar a tiempo?', '¿Qué es un CFDI?',
  '¿Conviene rentar o comprar el local?', '¿Cómo motivo a mi equipo?', '¿Qué significa punto de equilibrio?', '¿Qué es la depreciación?',
];
const LARGA = 'Explícame paso a paso cómo armar un presupuesto mensual para una cafetería pequeña.';

interface Muestra {
  texto: string;
  voz: string;
  ruta?: string;
  orden?: string;
  oido?: string;
  /** Verdad: fin real (audio inyectado) → primera subida de la toma. */
  msExterna?: number;
  /** Lo que dice la telemetría del HUD. */
  msHud?: number;
  /** finReal del HUD − verdad (honestidad del reloj de audio). */
  desvioFinReal?: number;
  especulativo?: boolean;
  cierreAnticipado?: boolean;
  estado?: string;
  tramos?: Record<string, number>;
}

/** La frase de Piper; con ruido, a −26 dBFS de nivel activo para que la SNR sea la de `mide-detector.ts`. */
async function voz(texto: string, quien: string): Promise<Dicho> {
  const d = await frase(texto, quien);
  if (!RUIDO) return d;
  const g = Math.sqrt(10 ** (NIVEL_VOZ_DB / 10) / potenciaActiva(d.muestras));
  return { ...d, muestras: d.muestras.map((v) => Math.max(-1, Math.min(1, v * g))) };
}

/** 30 s del ruido pedido, en bucle en el micrófono falso, a `SNR` dB bajo la voz. Antes de encender. */
async function ponRuido(h: Hud): Promise<void> {
  const banco = aseguraBanco([RUIDO].filter((r) => /^[A-Z]+$/.test(r)));
  const n = HZ * 30;
  const x = ruidoDe(RUIDO, n, () => rutasFleurs().slice(100).map(leeMono), banco.salas).map((v) => v * 0.1);
  const b64 = Buffer.from(aPcm16(x).buffer).toString('base64');
  await h.pagina.evaluate(([b, hz, db]) => (window as unknown as { __microfono: { ruido(b: string, hz: number, db: number): Promise<void> } }).__microfono.ruido(b, hz, db), [b64, HZ, NIVEL_VOZ_DB - SNR] as const);
}

const redondea = (v: number | undefined) => (v === undefined ? undefined : Math.round(v));

async function mideTurno(h: Hud, texto: string, quien: string): Promise<Muestra> {
  const d = await voz(texto, quien);
  const antes = (await toma(h.pagina)).length;
  const dicha = await di(h.pagina, d);
  const r = await esperaTurno(h.pagina, dicha);
  const eventos = (await toma(h.pagina)).slice(antes);
  const sube = primeraSubida(eventos, dicha.finVoz);
  if (!r || r.estado === 'en-curso') for (const e of await ultimosEventos(h.pagina)) console.log(`      ${e}`);
  console.log(`  · ${quien.slice(0, 9)} «${texto}» → ${r?.ruta ?? '—'} ${r?.orden ?? ''} ${r?.estado ?? 'sin turno'} · externa ${sube === undefined ? '—' : Math.round(sube - dicha.finVoz)} ms · HUD ${r ? latencia(r) ?? '—' : '—'} ms · oyó ${JSON.stringify(r?.texto ?? '')}`);
  return {
    texto, voz: quien, ruta: r?.ruta, orden: r?.orden, oido: r?.texto, estado: r?.estado, especulativo: r?.especulativo, cierreAnticipado: r?.cierreAnticipado,
    msExterna: redondea(sube === undefined ? undefined : sube - dicha.finVoz),
    msHud: redondea(r ? latencia(r) : undefined),
    desvioFinReal: redondea(r?.marcas.finReal === undefined ? undefined : r.marcas.finReal - dicha.finVoz),
    tramos: r ? etapas(r) : undefined,
  };
}

function etapas(r: RegistroTurno): Record<string, number> {
  const f = r.marcas.finReal ?? 0;
  return Object.fromEntries(Object.entries(r.marcas).filter(([k]) => k !== 'finReal').map(([k, v]) => [k, Math.round((v ?? 0) - f)]));
}

const resumen = (xs: (number | undefined)[]) => {
  const v = xs.filter((x): x is number => x !== undefined);
  return { n: v.length, p50: percentil(v, 50), p95: percentil(v, 95), min: v.length ? Math.min(...v) : undefined, max: v.length ? Math.max(...v) : undefined };
};

interface Suena {
  turno: number;
  t: number;
}

/** Cada frase que empieza a sonar, con su turno (del reproductor del HUD): atribuye el audio a su turno. */
const instalaRegistroSuena = (h: Hud) =>
  h.pagina.evaluate(() => {
    const w = window as unknown as { __suenas?: { turno: number; t: number }[]; __centroDeMando: { reproductor: { alEvento(f: (e: { tipo: string; turno: number; t?: number }) => void): void } } };
    if (w.__suenas) return;
    w.__suenas = [];
    w.__centroDeMando.reproductor.alEvento((e) => e.tipo === 'suena' && w.__suenas?.push({ turno: e.turno, t: e.t ?? performance.now() }));
  });
const suenas = (h: Hud): Promise<Suena[]> => h.pagina.evaluate(() => (window as unknown as { __suenas: { turno: number; t: number }[] }).__suenas.slice());

async function interrupcion(h: Hud, i: number) {
  await instalaRegistroSuena(h);
  const larga = await voz(LARGA, VOCES[i % 2] ?? 'es_MX-claude-high');
  const antes = (await toma(h.pagina)).length;
  const dicha = await di(h.pagina, larga);
  // espera a que la máquina hable de verdad
  const limite = Date.now() + 15_000;
  let sube: number | undefined;
  while (Date.now() < limite && sube === undefined) {
    await h.pagina.waitForTimeout(50);
    sube = primeraSubida((await toma(h.pagina)).slice(antes), dicha.finVoz);
  }
  if (sube === undefined) {
    for (const e of await ultimosEventos(h.pagina, 30)) console.log(`      ${e}`);
    return { ok: false, motivo: 'la máquina no llegó a hablar' };
  }
  await h.pagina.waitForTimeout(700);
  const para = await di(h.pagina, await voz('Para.', VOCES[(i + 1) % 2] ?? 'es_ES-davefx-medium'));
  await h.pagina.waitForTimeout(3_000);
  const eventos = (await toma(h.pagina)).slice(antes);
  // La toma oye también la voz «Para.»? No: la toma solo oye lo que sale por los `<audio>` del HUD.
  // «Calla» = la primera bajada tras la que no vuelve a sonar nada en 400 ms (una pausa entre palabras no cuenta).
  const calla = eventos.filter((e) => e.tipo === 'baja' && e.t > para.iniVoz).map((e) => e.t).find((t) => !eventos.some((x) => x.tipo === 'sube' && x.t > t && x.t < t + 400));
  // Fuga = una frase del turno INTERRUMPIDO que empieza a sonar después de callar. Lo que suena de un turno nuevo
  // (la persona dijo algo que no era «para») no es fuga: se cuenta aparte.
  const registro = await suenas(h);
  const turnoViejo = registro.filter((x) => x.t < para.iniVoz).at(-1)?.turno;
  const fugas = calla === undefined ? 0 : registro.filter((x) => x.turno === turnoViejo && x.t > calla).length;
  const vuelveAHablar = calla === undefined ? 0 : registro.filter((x) => x.turno !== turnoViejo && x.t > calla).length;
  const ultimos = (await (await import('./banco-pagina.ts')).turnos(h.pagina)).slice(-3);
  const relativo = (t: number) => Math.round(t - para.iniVoz);
  const detalle = { toma: eventos.filter((e) => e.t > para.iniVoz - 1500 && e.t < para.iniVoz + 3000).map((e) => `${e.tipo}${relativo(e.t)}`).join(' '), suenas: registro.filter((x) => x.t > para.iniVoz - 3000).map((x) => `t${x.turno}@${relativo(x.t)}`).join(' ') };
  return { ok: calla !== undefined, msReaccion: redondea(calla === undefined ? undefined : calla - para.iniVoz), fugas, vuelveAHablar, detalle, estados: ultimos.map((t) => `${t.id}:${t.estado}:${t.orden ?? t.ruta ?? ''}:${t.texto ?? ''}`) };
}

async function principal() {
  const token = tokenDictado();
  const h = await abreHud(BASE, token, 1440, 900, DETECTOR ? `detector=${DETECTOR}` : '');
  if (RUIDO) await ponRuido(h);
  const detector = await enciende(h.pagina);
  console.log(`detector: ${detector}${RUIDO ? ` · ruido ${RUIDO} a ${SNR} dB de SNR` : ''}`);
  if (DETECTOR && detector !== DETECTOR) throw new Error(`se pidió ${DETECTOR} y corre ${detector}: no se mide lo pedido`);
  for (const t of ['¿Qué hora es?', '¿Qué tengo hoy?']) await mideTurno(h, t, VOCES[0] ?? ''); // calentar (no cuenta)
  const ordenes: Muestra[] = [];
  const llm: Muestra[] = [];
  if (!SOLO_CORTE) {
    for (let r = 0; r < RONDAS; r++) for (const voz of VOCES) for (const t of ORDENES) ordenes.push(await mideTurno(h, t, voz));
    console.log('órdenes:', JSON.stringify(resumen(ordenes.map((m) => m.msExterna))));
    for (let i = 0; i < N_LLM; i++) llm.push(await mideTurno(h, PREGUNTAS[i % PREGUNTAS.length] ?? '', VOCES[i % 2] ?? ''));
    console.log('cerebro:', JSON.stringify(resumen(llm.map((m) => m.msExterna))));
  }
  const cortes = [];
  for (let i = 0; i < N_INTERRUPCION; i++) cortes.push(await interrupcion(h, i));
  console.log('interrupción:', JSON.stringify(resumen(cortes.map((c) => c.msReaccion))), 'fugas del turno viejo', cortes.reduce((s, c) => s + (c.fugas ?? 0), 0), '· frases de un turno NUEVO tras callar', cortes.reduce((s, c) => s + (c.vuelveAHablar ?? 0), 0));
  await h.pagina.evaluate(() => (window as unknown as { __microfono: { eco(db: number): void } }).__microfono.eco(-20));
  const conEco: Muestra[] = [];
  for (let i = 0; i < 6; i++) conEco.push(await mideTurno(h, PREGUNTAS[(i + 3) % PREGUNTAS.length] ?? '', VOCES[i % 2] ?? ''));
  const autoInterrupciones = conEco.filter((m) => m.estado === 'interrumpido').length;
  console.log('con eco −20 dB: auto-interrupciones', autoInterrupciones, 'de', conEco.length);
  await h.navegador.close();
  const corte = {
    interrupcion: { resumen: resumen(cortes.map((c) => c.msReaccion)), fallidos: cortes.filter((c) => !c.ok).length, fugas: cortes.reduce((s, c) => s + (c.fugas ?? 0), 0), vuelveAHablar: cortes.reduce((s, c) => s + (c.vuelveAHablar ?? 0), 0), cortes },
    eco: { db: -20, autoInterrupciones, n: conEco.length, muestras: conEco },
  };
  if (SOLO_CORTE) return guardaSoloCorte(corte);
  const datos = {
    fecha: new Date().toISOString(),
    maquina: 'WSL2, Ryzen 7 5700G, sin GPU; Chromium headless 1243 con micrófono falso',
    detector,
    ruido: RUIDO ? { nombre: RUIDO, snrDb: SNR, nivelVozDb: NIVEL_VOZ_DB } : null,
    ordenes: { resumen: resumen(ordenes.map((m) => m.msExterna)), hud: resumen(ordenes.map((m) => m.msHud)), muestras: ordenes },
    cerebro: { resumen: resumen(llm.map((m) => m.msExterna)), hud: resumen(llm.map((m) => m.msHud)), muestras: llm },
    ...corte,
    desvioFinReal: resumen([...ordenes, ...llm].map((m) => m.desvioFinReal)),
  };
  await mkdir('docs/goals/centro-de-mando-voz-medicion', { recursive: true });
  await writeFile(SALIDA, `${JSON.stringify(datos, null, 2)}\n`);
}

/** Repite solo interrupción y eco: lo demás del archivo se conserva y la corrida queda declarada con su nota. */
async function guardaSoloCorte(corte: Record<string, unknown>) {
  const previo = JSON.parse(await readFile(SALIDA, 'utf8')) as Record<string, unknown> & { corridas?: Record<string, unknown> };
  const ahora = new Date().toISOString();
  const corridas = { ...previo.corridas, interrupcionYEco: ahora, nota: arg('--nota', String(previo.corridas?.nota ?? '')) };
  await writeFile(SALIDA, `${JSON.stringify({ ...previo, fecha: ahora, corridas, ...corte }, null, 2)}\n`);
}

await principal();
