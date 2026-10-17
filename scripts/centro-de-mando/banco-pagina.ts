/**
 * Abrir el HUD en Chromium con el micrófono falso, emparejado y encendido, y las operaciones que
 * comparten la medición y las capturas: decir algo, esperar a que el turno acabe y leer lo que
 * sonó. La librería `playwright` del repo con el Chromium de `~/.cache/ms-playwright`.
 */
import { chromium, type Browser, type Page } from 'playwright';
import type { RegistroTurno } from '../../tools/bucle-voz/dist/index.js';
import { aPcm16 } from '../../tools/bucle-voz/dist/index.js';
import { instalaMicrofonoFalso, type EventoToma } from './microfono-falso.ts';
import { dice, type Dicho } from './voz-sintetica.ts';

export interface Hud {
  navegador: Browser;
  pagina: Page;
}

/** `consulta`: lo que va tras `?medicion=1` (p. ej. `detector=silero`). */
export async function abreHud(base: string, token: string, ancho = 1440, alto = 900, consulta = ''): Promise<Hud> {
  const navegador = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream'] });
  const contexto = await navegador.newContext({ viewport: { width: ancho, height: alto }, permissions: ['microphone'], reducedMotion: 'no-preference' });
  await contexto.addInitScript(instalaMicrofonoFalso);
  const pagina = await contexto.newPage();
  await pagina.goto(`${base}/centro-de-mando?medicion=1${consulta ? `&${consulta}` : ''}#t=${encodeURIComponent(token)}`);
  await pagina.locator('[data-prueba="estado-servidor"]').waitFor({ timeout: 60_000 });
  return { navegador, pagina };
}

/** Enciende y devuelve el detector que de verdad corre (el HUD lo dice al encender). */
export async function enciende(p: Page): Promise<string> {
  await p.locator('[data-prueba="microfono"]').click();
  await p.waitForFunction(() => document.querySelector('[data-prueba="centro-de-mando"]')?.getAttribute('data-estado') === 'escuchando', undefined, { timeout: 30_000 });
  await p.waitForTimeout(800); // calibración del detector por energía (~300 ms) con margen
  // Registro de eventos del bucle (sin karaoke), para volcarlo si un turno se queda colgado.
  await p.evaluate(() => {
    const w = window as unknown as { __centroDeMando: { bucle: { suscribe(f: (e: { tipo: string }) => void): void } }; __eventos: string[] };
    w.__eventos = [];
    w.__centroDeMando.bucle.suscribe((e) => {
      if (e.tipo === 'karaoke') return;
      w.__eventos.push(`${Math.round(performance.now())} ${JSON.stringify(e).slice(0, 160)}`);
      if (w.__eventos.length > 400) w.__eventos.splice(0, 200);
    });
  });
  const detector = p.locator('[data-prueba="detector"]');
  await detector.waitFor({ timeout: 10_000 });
  return (await detector.getAttribute('data-activo')) ?? '';
}

export const ultimosEventos = (p: Page, n = 25): Promise<string[]> => p.evaluate((k) => (window as unknown as { __eventos?: string[] }).__eventos?.slice(-k) ?? [], n);

const cache = new Map<string, Dicho>();

export async function frase(texto: string, voz: string): Promise<Dicho> {
  const clave = `${voz}|${texto}`;
  const hecho = cache.get(clave) ?? (await dice(texto, voz));
  cache.set(clave, hecho);
  return hecho;
}

export interface Dicha {
  dicho: Dicho;
  /** Verdad de terreno, en el reloj de la página. */
  iniVoz: number;
  finVoz: number;
}

/** Inyecta la frase en el micrófono falso. */
export async function di(p: Page, d: Dicho): Promise<Dicha> {
  const b64 = Buffer.from(aPcm16(d.muestras).buffer).toString('base64');
  const t0 = await p.evaluate(([b, hz]) => (window as unknown as { __microfono: { dice(b: string, hz: number): Promise<number> } }).__microfono.dice(b, hz), [b64, d.hz] as const);
  return { dicho: d, iniVoz: t0 + d.msInicioVoz, finVoz: t0 + d.msFinVoz };
}

export const turnos = (p: Page): Promise<RegistroTurno[]> => p.evaluate(() => (window as unknown as { __centroDeMando: { bucle: { telemetria: { turnos(): RegistroTurno[] } } } }).__centroDeMando.bucle.telemetria.turnos().map((t) => JSON.parse(JSON.stringify(t)) as RegistroTurno));
export const toma = (p: Page): Promise<EventoToma[]> => p.evaluate(() => (window as unknown as { __microfono: { eventos: EventoToma[] } }).__microfono.eventos.slice());
export const estado = (p: Page): Promise<string> => p.evaluate(() => document.querySelector('[data-prueba="centro-de-mando"]')?.getAttribute('data-estado') ?? '');

/** Espera el turno que nació de esa voz y a que deje de sonar. `undefined` si nunca llegó. */
export async function esperaTurno(p: Page, dicha: Dicha, maxMs = 60_000): Promise<RegistroTurno | undefined> {
  const limite = Date.now() + maxMs;
  let visto: RegistroTurno | undefined;
  while (Date.now() < limite) {
    await p.waitForTimeout(100);
    const todos = await turnos(p);
    visto = todos.filter((t) => t.estado !== 'descartado' && (t.marcas.finReal ?? 0) >= dicha.iniVoz - 150).at(-1);
    if (visto && visto.estado !== 'en-curso') {
      const quieto = await p.evaluate(() => !(window as unknown as { __microfono: { sonando(): boolean } }).__microfono.sonando());
      if (quieto) {
        await p.waitForTimeout(500);
        return (await turnos(p)).find((t) => t.id === visto?.id);
      }
    }
  }
  return visto;
}

/** Primer «sube» de la toma después de `desde` (el primer audio que SUENA). */
export const primeraSubida = (eventos: EventoToma[], desde: number) => eventos.find((e) => e.tipo === 'sube' && e.t > desde)?.t;
export const primeraBajada = (eventos: EventoToma[], desde: number) => eventos.find((e) => e.tipo === 'baja' && e.t > desde)?.t;
