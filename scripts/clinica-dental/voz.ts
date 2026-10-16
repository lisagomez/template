/**
 * Hablarle al portal con el micrófono falso: la frase se sintetiza con la voz LOCAL (Piper, por el demonio de
 * dictado), se inyecta en el micrófono de la página y se espera a que el turno del bucle termine y deje de sonar.
 * La verdad de terreno del fin del habla es el audio inyectado; «suena» es la toma de salida de los `<audio>`.
 */
import type { Page } from 'playwright';
import { aPcm16, type RegistroTurno } from '../../tools/bucle-voz/dist/index.js';
import { primeraBajada, primeraSubida } from '../centro-de-mando/banco-pagina.ts';
import type { EventoToma } from '../centro-de-mando/microfono-falso.ts';
import { dice, type Dicho } from '../centro-de-mando/voz-sintetica.ts';

const cache = new Map<string, Dicho>();
export async function frase(texto: string, voz = 'es_MX-claude-high'): Promise<Dicho> {
  const k = `${voz}|${texto}`;
  const d = cache.get(k) ?? (await dice(texto, voz));
  cache.set(k, d);
  return d;
}

export interface Dicha { iniVoz: number; finVoz: number }
export async function inyecta(p: Page, d: Dicho): Promise<Dicha> {
  const b64 = Buffer.from(aPcm16(d.muestras).buffer).toString('base64');
  const t0 = await p.evaluate(([b, hz]) => (window as unknown as { __microfono: { dice(b: string, hz: number): Promise<number> } }).__microfono.dice(b, hz), [b64, d.hz] as const);
  return { iniVoz: t0 + d.msInicioVoz, finVoz: t0 + d.msFinVoz };
}

export const turnos = (p: Page): Promise<RegistroTurno[]> => p.evaluate(() => (window.__clinicaVoz?.bucle.telemetria.turnos() ?? []).map((t) => JSON.parse(JSON.stringify(t)) as RegistroTurno));
export const toma = (p: Page): Promise<EventoToma[]> => p.evaluate(() => (window as unknown as { __microfono: { eventos: EventoToma[] } }).__microfono.eventos.slice());
const sonando = (p: Page) => p.evaluate(() => (window as unknown as { __microfono: { sonando(): boolean } }).__microfono.sonando());

/** Espera a que la página tenga la sesión de voz encendida y calibrada. */
export async function esperaVoz(p: Page): Promise<void> {
  await p.waitForFunction(() => window.__clinicaVoz?.bucle.estado === 'escuchando' || window.__clinicaVoz?.bucle.estado === 'hablando', undefined, { timeout: 20_000 });
  await p.waitForTimeout(900);
}

/** Espera a que la máquina deje de hablar (y no vuelva a empezar en 600 ms). */
export async function esperaSilencio(p: Page, maxMs = 75_000): Promise<void> {
  const limite = Date.now() + maxMs;
  let quieto = 0;
  while (Date.now() < limite && quieto < 6) {
    await p.waitForTimeout(100);
    const s = await p.evaluate(() => window.__clinicaVoz?.bucle.estado ?? 'apagada');
    quieto = s !== 'hablando' && s !== 'pensando' && s !== 'transcribiendo' && !(await sonando(p)) ? quieto + 1 : 0;
  }
}

export interface MedidaTurno { texto: string; ruta?: string; oido?: string; estado?: string; msExterna?: number; msHud?: number }

/** Dice una frase y mide del fin real del habla a la primera muestra que suena. */
export async function habla(p: Page, texto: string, voz?: string): Promise<MedidaTurno> {
  const d = await frase(texto, voz);
  const antes = (await toma(p)).length;
  const n0 = (await turnos(p)).length;
  const dicha = await inyecta(p, d);
  const limite = Date.now() + 45_000;
  let t: RegistroTurno | undefined;
  while (Date.now() < limite) {
    await p.waitForTimeout(120);
    t = (await turnos(p)).slice(n0).filter((x) => x.estado !== 'descartado' && (x.marcas.finReal ?? 0) >= dicha.iniVoz - 150).at(-1);
    if (t && t.estado !== 'en-curso' && !(await sonando(p))) break;
  }
  await esperaSilencio(p);
  const eventos = (await toma(p)).slice(antes);
  const sube = primeraSubida(eventos, dicha.finVoz);
  const hud = t?.marcas.suena !== undefined && t?.marcas.finReal !== undefined ? t.marcas.suena - t.marcas.finReal : undefined;
  return { texto, ruta: t?.ruta, oido: t?.texto, estado: t?.estado, msExterna: sube === undefined ? undefined : Math.round(sube - dicha.finVoz), msHud: hud === undefined ? undefined : Math.round(hud) };
}

/** Interrumpe: espera a que la máquina suene, dice «Para.» encima y mide de su primera muestra a que la salida calla. */
export interface Corte { msReaccion?: number; callo: boolean; sonoDespues: boolean; sonabaAlDecirPara: boolean; msHastaQueSeCallo?: number; oidoTrasPara: string[] }

/**
 * «Para.» encima de una respuesta larga. Distingue lo que antes se mezclaba en «no calló» (16/10, corte 5 de 8): que
 * la máquina SIGUIERA hablando (falla real: se mide cuándo calló al fin y qué oyó el ASR) de que ya no sonara nada al
 * decir «para» (artefacto: no había qué interrumpir).
 */
export async function interrumpe(p: Page, pregunta: string): Promise<Corte> {
  const d = await frase(pregunta);
  const para = await frase('Para.');
  const antes = (await toma(p)).length;
  const turnosAntes = (await turnos(p)).length;
  await inyecta(p, d);
  const limite = Date.now() + 20_000;
  while (Date.now() < limite && !(await sonando(p))) await p.waitForTimeout(50);
  await p.waitForTimeout(500);
  const sonabaAlDecirPara = await sonando(p);
  const dicha = await inyecta(p, para);
  await p.waitForTimeout(2_500);
  const baja = primeraBajada((await toma(p)).slice(antes), dicha.iniVoz);
  await esperaSilencio(p);
  const eventos = (await toma(p)).slice(antes);
  const bajaFinal = baja ?? primeraBajada(eventos, dicha.iniVoz);
  const subeDespues = eventos.some((e) => e.tipo === 'sube' && baja !== undefined && e.t > baja + 300);
  const oidoTrasPara = (await turnos(p)).slice(turnosAntes + 1).map((t) => String((t as { texto?: string }).texto ?? ''));
  return {
    ...(baja === undefined ? {} : { msReaccion: Math.round(baja - dicha.iniVoz) }), callo: baja !== undefined, sonoDespues: subeDespues, sonabaAlDecirPara,
    ...(baja === undefined && bajaFinal !== undefined ? { msHastaQueSeCallo: Math.round(bajaFinal - dicha.iniVoz) } : {}), oidoTrasPara,
  };
}
