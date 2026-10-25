/**
 * La medición de punta a punta del centro de mando, en Chromium con micrófono falso:
 *
 *  1. órdenes locales (sin LLM) y 2. conversación con el cerebro: latencia del FIN REAL del habla
 *     (verdad de terreno del audio inyectado) al PRIMER AUDIO QUE SUENA (toma de salida), p50/p95;
 *     y la misma cifra según la telemetría del HUD, para ver si el HUD se mide honesto. Con el ACUSE
 *     inmediato (desde el 25/10), la conversación da dos cifras: el primer sonido (el acuse) y el primer
 *     sonido de la RESPUESTA (atribuido por turno y frase con los eventos del reproductor);
 *  3. interrupción: la persona dice «Para.» mientras la máquina habla, encima de la RESPUESTA (como el 16/10)
 *     y encima del ACUSE; reacción = de su primera muestra de voz a que la salida calla; y que nada del
 *     turno viejo suene después;
 *  4. auto-interrupción: con eco residual a −20 dB (sin cancelación de eco), ¿se calla sola?
 *  5. preguntas con pausa: una pregunta completa, una pausa de `--pausa` ms y más habla. Cuenta las que el
 *     cierre por sentido parte en dos (el precio de cerrar una pregunta antes que el VAD).
 *
 *   node scripts/centro-de-mando/mide.ts [--base http://localhost:3011] [--rondas 2] [--llm 12] [--salida <ruta.json>]
 *   node scripts/centro-de-mando/mide.ts --detector energia --cierre vad --acuse 0   # comparar sin cierre por pregunta ni acuse
 *   node scripts/centro-de-mando/mide.ts --solo-corte --interrupciones 16 --nota "…"   # repite 3 y 4 y conserva 1 y 2
 *   node scripts/centro-de-mando/mide.ts --detector silero --ruido PCAFETER --snr 10 --llm 0 --salida <ruta.json>
 *
 * SIN LLM REAL: la conversación se mide contra el cerebro SIMULADO del servidor (`CEREBRO_SIMULADO_MS`); si el
 * servidor no lo tiene, o si un turno de conversación no viene marcado «simulado», la medición se corta.
 * Con `--ruido` el ruido suena en bucle desde ANTES de encender, a `--snr` dB bajo la voz (voz a −26 dBFS).
 * `--detector` abre el HUD con `?detector=`; si corre otro, la medición se corta: no mide lo pedido.
 * Anota la carga de la máquina (loadavg) al empezar y en cada fase: otros procesos (Playwright de otros
 * agentes) meten ruido, y una cifra sin su carga no se puede comparar.
 *
 * Escribe `--salida` (por defecto `docs/goals/centro-de-mando-voz-medicion/latencias.json`, la del 16/10: no la pises).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, freemem, loadavg, totalmem } from 'node:os';
import { dirname } from 'node:path';
import { aPcm16, latencia, latenciaRespuesta, percentil, type RegistroTurno } from '../../tools/bucle-voz/dist/index.js';
import { abreHud, di, enciende, esperaTurno, frase, primeraSubida, toma, turnos, ultimosEventos, type Dicha, type Hud } from './banco-pagina.ts';
import { tokenDictado } from './voz-sintetica.ts';
import { ORDENES, PAUSAS, VOCES } from './corpus.ts';
import { aseguraBanco, rutasFleurs } from './banco-ruido.ts';
import { HZ, leeMono, potenciaActiva, ruidoDe } from './ruidos.ts';
import type { Dicho } from './voz-sintetica.ts';
import type { EventoToma } from './microfono-falso.ts';

const arg = (n: string, d: string) => process.argv.find((_, i) => process.argv[i - 1] === n) ?? d;
const BASE = arg('--base', 'http://localhost:3011');
const RONDAS = Number(arg('--rondas', '2'));
const N_LLM = Number(arg('--llm', '12'));
const N_INTERRUPCION = Number(arg('--interrupciones', '16'));
const N_CORTE_ACUSE = Number(arg('--cortes-acuse', '8'));
const N_PAUSAS = Number(arg('--pausas', String(PAUSAS.length)));
const PAUSA_MS = Number(arg('--pausa', '400'));
const SOLO_CORTE = process.argv.includes('--solo-corte');
const SALIDA = arg('--salida', 'docs/goals/centro-de-mando-voz-medicion/latencias.json');
const DETECTOR = arg('--detector', '');
const CIERRE = arg('--cierre', '');
const ACUSE = arg('--acuse', '');
const RUIDO = arg('--ruido', '');
const SNR = Number(arg('--snr', '10'));
const NIVEL_VOZ_DB = -26;
const PREGUNTAS = [
  '¿Qué es un balance general?', '¿Para qué sirve el flujo de caja?', '¿Cómo calculo el margen bruto?', 'Dame una idea para vender más esta semana.',
  '¿Qué diferencia hay entre utilidad y flujo?', '¿Qué es el capital de trabajo?', '¿Cómo le hago para cobrar a tiempo?', '¿Qué es un CFDI?',
  '¿Conviene rentar o comprar el local?', '¿Cómo motivo a mi equipo?', '¿Qué significa punto de equilibrio?', '¿Qué es la depreciación?',
];
const LARGA = 'Explícame paso a paso cómo armar un presupuesto mensual para una cafetería pequeña.';
/** Para cortar el ACUSE: una pregunta (sus acuses son los más largos, ~1,3-1,8 s). */
const LARGA_PREGUNTA = '¿Cómo armo un presupuesto mensual para una cafetería pequeña?';

interface Muestra {
  texto: string;
  voz: string;
  ruta?: string;
  orden?: string;
  oido?: string;
  /** Verdad: fin real (audio inyectado) → primera subida de la toma (el acuse, si lo hubo). */
  msExterna?: number;
  /** Verdad: fin real → primera subida de la RESPUESTA (sin el acuse). */
  msRespuestaExterna?: number;
  /** Lo que dice la telemetría del HUD. */
  msHud?: number;
  msRespuestaHud?: number;
  acuse?: string;
  cerebro?: string;
  /** finReal del HUD − verdad (honestidad del reloj de audio). */
  desvioFinReal?: number;
  especulativo?: boolean;
  cierreAnticipado?: boolean;
  estado?: string;
  tramos?: Record<string, number>;
}

interface EventoRep {
  tipo: string;
  turno: number;
  indice: number;
  t: number;
}

const carga: Record<string, { loadavg1: number; loadavg5: number; libreMb: number }> = {};
const anotaCarga = (fase: string) => {
  const [l1 = 0, l5 = 0] = loadavg();
  carga[fase] = { loadavg1: Math.round(l1 * 100) / 100, loadavg5: Math.round(l5 * 100) / 100, libreMb: Math.round(freemem() / 2 ** 20) };
  console.log(`  [carga ${fase}] loadavg ${carga[fase]?.loadavg1} · ${carga[fase]?.libreMb} MB libres`);
};

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

/** Cada evento del reproductor del HUD (suena/termina), con su turno y su frase: atribuye el audio a su turno. */
const instalaRegistro = (h: Hud) =>
  h.pagina.evaluate(() => {
    const w = window as unknown as { __rep?: EventoRep[]; __centroDeMando: { reproductor: { alEvento(f: (e: { tipo: string; turno: number; indice: number; t?: number }) => void): void } } };
    if (w.__rep) return;
    w.__rep = [];
    w.__centroDeMando.reproductor.alEvento((e) => (e.tipo === 'suena' || e.tipo === 'termina') && w.__rep?.push({ tipo: e.tipo, turno: e.turno, indice: e.indice, t: e.t ?? performance.now() }));
  });
const registro = (h: Hud): Promise<EventoRep[]> => h.pagina.evaluate(() => (window as unknown as { __rep: EventoRep[] }).__rep.slice());

/** Primer instante en que suena la RESPUESTA del turno (la frase 0 es el acuse si lo hubo), en el reloj de la página. */
function suenaRespuesta(rep: EventoRep[], r: RegistroTurno): { suena?: number; finAcuse?: number } {
  const primera = r.acuse ? 1 : 0;
  const suena = rep.find((e) => e.turno === r.id && e.tipo === 'suena' && e.indice >= primera)?.t;
  const finAcuse = r.acuse ? rep.find((e) => e.turno === r.id && e.tipo === 'termina' && e.indice === 0)?.t : undefined;
  return { suena, finAcuse };
}

function etapas(r: RegistroTurno): Record<string, number> {
  const f = r.marcas.finReal ?? 0;
  return Object.fromEntries(Object.entries(r.marcas).filter(([k]) => k !== 'finReal').map(([k, v]) => [k, Math.round((v ?? 0) - f)]));
}

async function mideTurno(h: Hud, texto: string, quien: string): Promise<Muestra> {
  const d = await voz(texto, quien);
  const antes = (await toma(h.pagina)).length;
  const dicha = await di(h.pagina, d);
  const r = await esperaTurno(h.pagina, dicha);
  const eventos = (await toma(h.pagina)).slice(antes);
  const sube = primeraSubida(eventos, dicha.finVoz);
  const { finAcuse } = r ? suenaRespuesta(await registro(h), r) : {};
  // Con acuse, la respuesta es la primera subida de la toma DESPUÉS de que el acuse terminó de sonar.
  const subeRespuesta = r?.acuse ? (finAcuse === undefined ? undefined : primeraSubida(eventos, finAcuse - 10)) : sube;
  if (!r || r.estado === 'en-curso') for (const e of await ultimosEventos(h.pagina)) console.log(`      ${e}`);
  const m: Muestra = {
    texto, voz: quien, ruta: r?.ruta, orden: r?.orden, oido: r?.texto, estado: r?.estado, especulativo: r?.especulativo, cierreAnticipado: r?.cierreAnticipado, acuse: r?.acuse, cerebro: r?.cerebro,
    msExterna: redondea(sube === undefined ? undefined : sube - dicha.finVoz),
    msRespuestaExterna: redondea(subeRespuesta === undefined ? undefined : subeRespuesta - dicha.finVoz),
    msHud: redondea(r ? latencia(r) : undefined),
    msRespuestaHud: redondea(r ? latenciaRespuesta(r) : undefined),
    desvioFinReal: redondea(r?.marcas.finReal === undefined ? undefined : r.marcas.finReal - dicha.finVoz),
    tramos: r ? etapas(r) : undefined,
  };
  console.log(`  · ${quien.slice(0, 9)} «${texto}» → ${m.ruta ?? '—'} ${m.orden ?? ''} ${m.estado ?? 'sin turno'}${m.acuse ? ` · acuse «${m.acuse}»` : ''}${m.cierreAnticipado ? ' · cierre por sentido' : ''} · externa ${m.msExterna ?? '—'} ms${m.acuse ? ` (respuesta ${m.msRespuestaExterna ?? '—'})` : ''} · HUD ${m.msHud ?? '—'} ms · oyó ${JSON.stringify(m.oido ?? '')}`);
  return m;
}

const resumen = (xs: (number | undefined)[]) => {
  const v = xs.filter((x): x is number => x !== undefined);
  return { n: v.length, p50: percentil(v, 50), p95: percentil(v, 95), min: v.length ? Math.min(...v) : undefined, max: v.length ? Math.max(...v) : undefined };
};

/** Espera el turno nacido de `dicha` y lo devuelve en cuanto cumple `cond` (lo evalúa Node con el registro). */
async function esperaA(h: Hud, dicha: Dicha, cond: (r: RegistroTurno, rep: EventoRep[], tomaEv: EventoToma[]) => number | undefined, maxMs = 15_000) {
  const limite = Date.now() + maxMs;
  while (Date.now() < limite) {
    await h.pagina.waitForTimeout(40);
    const r = (await turnos(h.pagina)).filter((t) => t.estado !== 'descartado' && (t.marcas.finReal ?? 0) >= dicha.iniVoz - 150).at(-1);
    if (!r) continue;
    const t = cond(r, await registro(h), await toma(h.pagina));
    if (t !== undefined) return { r, t };
  }
  return undefined;
}

/** «Para.» encima de la RESPUESTA (`donde = 'respuesta'`, como el 16/10) o encima del ACUSE. */
async function interrupcion(h: Hud, i: number, donde: 'respuesta' | 'acuse') {
  const larga = await voz(donde === 'acuse' ? LARGA_PREGUNTA : LARGA, VOCES[i % 2] ?? 'es_MX-claude-high');
  const antes = (await toma(h.pagina)).length;
  const dicha = await di(h.pagina, larga);
  // El instante en que la toma oye la parte pedida: la primera subida tras la primera frase de la respuesta, o del acuse.
  const listo = await esperaA(h, dicha, (r, rep, ev) => {
    if (donde === 'acuse') return r.acuse ? primeraSubida(ev.slice(antes), dicha.finVoz) : undefined;
    const { suena } = suenaRespuesta(rep, r);
    return suena === undefined ? undefined : primeraSubida(ev.slice(antes), suena - 60);
  });
  if (!listo) {
    for (const e of await ultimosEventos(h.pagina, 30)) console.log(`      ${e}`);
    return { ok: false, donde, motivo: `la máquina no llegó a decir ${donde === 'acuse' ? 'el acuse' : 'la respuesta'}` };
  }
  // Encima de la respuesta, a los 700 ms de oírla (como el 16/10). Encima del acuse, en cuanto se oye: la toma ya va
  // 100-250 ms detrás de lo que suena, y el acuse dura poco más de un segundo.
  if (donde === 'respuesta') await h.pagina.waitForTimeout(700);
  const para = await di(h.pagina, await voz('Para.', VOCES[(i + 1) % 2] ?? 'es_ES-davefx-medium'));
  await h.pagina.waitForTimeout(3_000);
  const eventos = (await toma(h.pagina)).slice(antes);
  // «Calla» = la primera bajada tras la que no vuelve a sonar nada en 400 ms (una pausa entre palabras no cuenta).
  const calla = eventos.filter((e) => e.tipo === 'baja' && e.t > para.iniVoz).map((e) => e.t).find((t) => !eventos.some((x) => x.tipo === 'sube' && x.t > t && x.t < t + 400));
  // Fuga = una frase del turno INTERRUMPIDO que empieza a sonar después de callar. Lo de un turno nuevo se cuenta aparte.
  const rep = (await registro(h)).filter((x) => x.tipo === 'suena');
  const turnoViejo = listo.r.id;
  const fugas = calla === undefined ? 0 : rep.filter((x) => x.turno === turnoViejo && x.t > calla).length;
  const vuelveAHablar = calla === undefined ? 0 : rep.filter((x) => x.turno !== turnoViejo && x.t > calla).length;
  const estadoViejo = (await turnos(h.pagina)).find((t) => t.id === turnoViejo)?.estado;
  const msReaccion = redondea(calla === undefined ? undefined : calla - para.iniVoz);
  console.log(`  · «Para.» encima ${donde === 'acuse' ? 'del acuse' : 'de la respuesta'} → ${calla === undefined ? 'NO calló' : `calló a los ${msReaccion} ms`} · turno ${turnoViejo} ${estadoViejo} · fugas ${fugas} · turno nuevo ${vuelveAHablar}`);
  return { ok: calla !== undefined, donde, msReaccion, fugas, vuelveAHablar, estadoViejo, acuse: listo.r.acuse };
}

const resumeCortes = (cortes: Awaited<ReturnType<typeof interrupcion>>[]) => ({
  resumen: resumen(cortes.map((c) => c.msReaccion)),
  callaron: cortes.filter((c) => c.ok).length,
  n: cortes.length,
  fugas: cortes.reduce((s, c) => s + (c.fugas ?? 0), 0),
  vuelveAHablar: cortes.reduce((s, c) => s + (c.vuelveAHablar ?? 0), 0),
  cortes,
});

/** Una pregunta completa, `PAUSA_MS` de silencio y más habla: ¿la máquina la parte en dos? */
async function pausa(h: Hud, i: number) {
  const [a, b] = PAUSAS[i % PAUSAS.length] ?? ['', ''];
  const quien = VOCES[i % 2] ?? 'es_MX-claude-high';
  const [da, db] = [await voz(a, quien), await voz(b, quien)];
  const corteA = Math.round((da.msFinVoz / 1000) * HZ);
  const inicioB = Math.max(0, Math.round((db.msInicioVoz / 1000) * HZ));
  const muestras = new Float32Array(corteA + Math.round((PAUSA_MS / 1000) * HZ) + (db.muestras.length - inicioB));
  muestras.set(da.muestras.subarray(0, corteA), 0);
  muestras.set(db.muestras.subarray(inicioB), corteA + Math.round((PAUSA_MS / 1000) * HZ));
  const msFin = da.msFinVoz + PAUSA_MS + (db.msFinVoz - db.msInicioVoz);
  const dicha = await di(h.pagina, { texto: `${a} … ${b}`, voz: quien, muestras, hz: 16_000, msInicioVoz: da.msInicioVoz, msFinVoz: msFin });
  await esperaTurno(h.pagina, dicha);
  await h.pagina.waitForTimeout(400);
  const deEsta = (await turnos(h.pagina)).filter((t) => t.estado !== 'descartado' && (t.marcas.finReal ?? 0) >= dicha.iniVoz - 150);
  const partida = deEsta.length > 1 || deEsta[0]?.estado === 'interrumpido';
  console.log(`  · «${a}» +${PAUSA_MS} ms + «${b}» → ${deEsta.length} turno(s) ${partida ? 'PARTIDA' : 'entera'} · ${deEsta.map((t) => `${t.estado}${t.cierreAnticipado ? '/sentido' : ''} ${JSON.stringify(t.texto ?? '')}`).join(' | ')}`);
  return { a, b, pausaMs: PAUSA_MS, turnos: deEsta.length, partida, oido: deEsta.map((t) => t.texto ?? ''), estados: deEsta.map((t) => t.estado) };
}

/** Sin LLM real: el servidor tiene que tener el cerebro simulado. */
async function exigeCerebroSimulado(token: string): Promise<string> {
  const r = await fetch(`${BASE}/api/centro-de-mando/estado`, { headers: { authorization: `Bearer ${token}` } });
  const e = (await r.json()) as { modelo?: string };
  if (!r.ok || !e.modelo?.startsWith('simulado/')) throw new Error(`el servidor no tiene el cerebro simulado (CEREBRO_SIMULADO_MS): ${e.modelo ?? r.status}. Sin eso la medición llamaría a un LLM real.`);
  return e.modelo;
}

async function abre(token: string): Promise<{ h: Hud; detector: string }> {
  const consulta = [DETECTOR && `detector=${DETECTOR}`, CIERRE && `cierre=${CIERRE}`, ACUSE && `acuse=${ACUSE}`].filter(Boolean).join('&');
  const h = await abreHud(BASE, token, 1440, 900, consulta);
  if (RUIDO) await ponRuido(h);
  const detector = await enciende(h.pagina);
  console.log(`detector: ${detector} · cierre ${CIERRE || 'por defecto'} · acuse ${ACUSE === '0' ? 'apagado' : 'encendido'}${RUIDO ? ` · ruido ${RUIDO} a ${SNR} dB de SNR` : ''}`);
  if (DETECTOR && detector !== DETECTOR) throw new Error(`se pidió ${DETECTOR} y corre ${detector}: no se mide lo pedido`);
  await instalaRegistro(h);
  return { h, detector };
}

async function fasesDeLatencia(h: Hud) {
  const ordenes: Muestra[] = [];
  const llm: Muestra[] = [];
  anotaCarga('ordenes');
  for (let r = 0; r < RONDAS; r++) for (const v of VOCES) for (const t of ORDENES) ordenes.push(await mideTurno(h, t, v));
  console.log('órdenes:', JSON.stringify(resumen(ordenes.map((m) => m.msExterna))));
  anotaCarga('conversacion');
  for (let i = 0; i < N_LLM; i++) llm.push(await mideTurno(h, PREGUNTAS[i % PREGUNTAS.length] ?? '', VOCES[i % 2] ?? ''));
  const reales = llm.filter((m) => m.ruta === 'llm' && m.cerebro !== 'simulado');
  if (reales.length) throw new Error(`${reales.length} turno(s) de conversación sin la marca «cerebro simulado»: la medición no es sin LLM`);
  console.log('conversación, primer sonido:', JSON.stringify(resumen(llm.map((m) => m.msExterna))), '· respuesta:', JSON.stringify(resumen(llm.map((m) => m.msRespuestaExterna))));
  return { ordenes, llm };
}

async function fasesDeCorte(h: Hud) {
  anotaCarga('interrupcion');
  const cortes = [];
  for (let i = 0; i < N_INTERRUPCION; i++) cortes.push(await interrupcion(h, i, 'respuesta'));
  const cortesAcuse = [];
  for (let i = 0; i < N_CORTE_ACUSE; i++) cortesAcuse.push(await interrupcion(h, i, 'acuse'));
  anotaCarga('eco');
  await h.pagina.evaluate(() => (window as unknown as { __microfono: { eco(db: number): void } }).__microfono.eco(-20));
  const conEco: Muestra[] = [];
  for (let i = 0; i < 6; i++) conEco.push(await mideTurno(h, PREGUNTAS[(i + 3) % PREGUNTAS.length] ?? '', VOCES[i % 2] ?? ''));
  await h.pagina.evaluate(() => (window as unknown as { __microfono: { eco(db: number | null): void } }).__microfono.eco(null));
  const autoInterrupciones = conEco.filter((m) => m.estado === 'interrumpido').length;
  console.log('«para» encima de la respuesta:', JSON.stringify(resumeCortes(cortes).resumen), '· encima del acuse:', JSON.stringify(resumeCortes(cortesAcuse).resumen), '· con eco −20 dB: auto-interrupciones', autoInterrupciones, 'de', conEco.length);
  return {
    interrupcion: resumeCortes(cortes),
    interrupcionAcuse: resumeCortes(cortesAcuse),
    eco: { db: -20, autoInterrupciones, n: conEco.length, muestras: conEco },
  };
}

async function principal() {
  const token = tokenDictado();
  const cerebro = await exigeCerebroSimulado(token);
  anotaCarga('inicio');
  const { h, detector } = await abre(token);
  for (const t of ['¿Qué hora es?', '¿Qué tengo hoy?', '¿Qué es un balance general?']) await mideTurno(h, t, VOCES[0] ?? ''); // calentar (no cuenta)
  const latencias = SOLO_CORTE ? undefined : await fasesDeLatencia(h);
  const corte = await fasesDeCorte(h);
  anotaCarga('pausas');
  const pausas = [];
  for (let i = 0; i < N_PAUSAS; i++) pausas.push(await pausa(h, i));
  anotaCarga('fin');
  await h.navegador.close();
  const extra = { pausas: { pausaMs: PAUSA_MS, partidas: pausas.filter((p) => p.partida).length, n: pausas.length, muestras: pausas }, carga };
  if (SOLO_CORTE || !latencias) return guardaSoloCorte({ ...corte, ...extra });
  const { ordenes, llm } = latencias;
  const datos = {
    fecha: new Date().toISOString(),
    maquina: `WSL2, ${cpus()[0]?.model ?? 'CPU'} (${cpus().length} hilos), ${Math.round(totalmem() / 2 ** 30)} GB, sin GPU; Chromium headless 1243 con micrófono falso`,
    configuracion: { detector, cierre: CIERRE || 'pregunta (defecto)', acuse: ACUSE === '0' ? 'apagado' : 'encendido', cerebro },
    ruido: RUIDO ? { nombre: RUIDO, snrDb: SNR, nivelVozDb: NIVEL_VOZ_DB } : null,
    ordenes: { resumen: resumen(ordenes.map((m) => m.msExterna)), hud: resumen(ordenes.map((m) => m.msHud)), muestras: ordenes },
    conversacion: {
      primerSonido: resumen(llm.map((m) => m.msExterna)),
      respuesta: resumen(llm.map((m) => m.msRespuestaExterna)),
      hud: { primerSonido: resumen(llm.map((m) => m.msHud)), respuesta: resumen(llm.map((m) => m.msRespuestaHud)) },
      conAcuse: llm.filter((m) => m.acuse).length,
      cierrePorSentido: llm.filter((m) => m.cierreAnticipado).length,
      muestras: llm,
    },
    ...corte,
    ...extra,
    desvioFinReal: resumen([...ordenes, ...llm].map((m) => m.desvioFinReal)),
  };
  await mkdir(dirname(SALIDA), { recursive: true });
  await writeFile(SALIDA, `${JSON.stringify(datos, null, 2)}\n`);
  console.log(`escrito ${SALIDA}`);
}

/** Repite solo interrupción, eco y pausas: lo demás del archivo se conserva y la corrida queda declarada con su nota. */
async function guardaSoloCorte(corte: Record<string, unknown>) {
  const previo = JSON.parse(await readFile(SALIDA, 'utf8')) as Record<string, unknown> & { corridas?: Record<string, unknown> };
  const ahora = new Date().toISOString();
  const corridas = { ...previo.corridas, interrupcionYEco: ahora, nota: arg('--nota', String(previo.corridas?.nota ?? '')) };
  await writeFile(SALIDA, `${JSON.stringify({ ...previo, fecha: ahora, corridas, ...corte }, null, 2)}\n`);
}

await principal();
