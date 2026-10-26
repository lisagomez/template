/**
 * El botón «Modo conversación» de la capa, en secuencia y con evidencia, en una ruta del laboratorio que compone
 * `tools/calendario` (`/laboratorio-calendario`): Chromium con el micrófono falso (las pistas son clones, como las de
 * un micrófono de verdad) y la voz que llena la ranura, `src/shared/capa/modulos/voz.ts`.
 *
 *  01 apagado (y el micrófono sin pedir) · 02 escuchando, con el indicador · 03 un turno enviado al callar y respondido
 *  en voz · 04 una interrupción hablando encima (a: hablando; b: calló) · 05 lo irreversible: la tarjeta del freno,
 *  «sí, confírmalo» dicho que NO la mueve y el clic que sí · 06 apagado otra vez, con las pistas en `ended` · 07 y 08 con
 *  teclado (Tab + Enter/Espacio y Alt+C; `aria-pressed` cambia). Y aparte, el producto Recepción (`/recepcion`) con la
 *  ranura de voz dictando en el compositor: `docs/goals/capa-arbrain-capturas/producto/12-voz-dictando.png`.
 *
 * Lo que la app no pinta (lo que se OYÓ y se DIJO en voz, las pistas del micrófono) va en una franja con borde
 * discontinuo rotulada «Anotación de la prueba»: sale de la telemetría y del propio micrófono de la página, y se quita
 * después de cada captura. No es parte de la app.
 *
 *   DICTADO_MOVIL_TOKEN=… node scripts/centro-de-mando/capturas-capa-voz.ts [--base http://localhost:3011]
 *
 * Deja los PNG y `secuencia.json` en `docs/goals/capa-arbrain-capturas/voz/`. Sin LLM: la capa resuelve por intención.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import { di, frase, pasaPrimerArranque } from './banco-pagina.ts';
import { instalaMicrofonoFalso } from './microfono-falso.ts';
import { tokenDictado } from './voz-sintetica.ts';

const BASE = process.argv.find((_, i) => process.argv[i - 1] === '--base') ?? 'http://localhost:3011';
const RUTA = process.argv.find((_, i) => process.argv[i - 1] === '--ruta') ?? '/laboratorio-calendario';
const DIR = 'docs/goals/capa-arbrain-capturas/voz';
const DIR_PRODUCTO = 'docs/goals/capa-arbrain-capturas/producto';
const VOZ = 'es_MX-claude-high';
const OTRA = 'es_ES-davefx-medium';
const BOTON = '[data-capa-boton="modo-conversacion"]';

const pasos: Record<string, unknown>[] = [];

interface Estado {
  estado: string | null;
  ariaPressed: string | null;
  microfono: string | null;
  pistas: string[];
  pedidosMicro: number;
  mensajes: number;
}

/** Lo que dice la página de sí misma: el botón, el indicador accesible y las pistas REALES del micrófono. */
const estado = (p: Page): Promise<Estado> =>
  p.evaluate((sel) => {
    const b = document.querySelector(sel);
    const w = window as unknown as { __capaVoz?: { diagnostico(): { pistas: string[] } }; __pedidosMicro?: number };
    return {
      estado: b?.getAttribute('data-estado') ?? null,
      ariaPressed: b?.getAttribute('aria-pressed') ?? null,
      microfono: document.querySelector('[data-capa-microfono]')?.getAttribute('data-capa-microfono') ?? null,
      pistas: w.__capaVoz?.diagnostico().pistas ?? [],
      pedidosMicro: w.__pedidosMicro ?? 0,
      mensajes: document.querySelectorAll('[data-capa-mensaje], .capa-mensaje').length,
    };
  }, BOTON);

/** La franja «Anotación de la prueba»: lo que se oyó y se dijo, que la app no pinta. Se quita tras la captura. */
const anota = (p: Page, lineas: string[]) =>
  p.evaluate((ls) => {
    document.getElementById('anotacion-prueba')?.remove();
    if (!ls.length) return;
    const d = document.createElement('div');
    d.id = 'anotacion-prueba';
    d.setAttribute('style', 'position:fixed;left:240px;bottom:12px;max-width:760px;z-index:99999;background:#fffbeb;color:#1c1917;border:2px dashed #b45309;border-radius:8px;padding:8px 12px;font:13px/1.45 system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.15)');
    const t = document.createElement('div');
    t.textContent = 'Anotación de la prueba (no es parte de la app)';
    t.setAttribute('style', 'font-weight:700;color:#b45309;margin-bottom:2px');
    d.append(t, ...ls.map((l) => Object.assign(document.createElement('div'), { textContent: l })));
    document.body.append(d);
  }, lineas);

async function captura(p: Page, nombre: string, nota: string, extra: Record<string, unknown> = {}, lineas: string[] = [], dir = DIR) {
  await anota(p, lineas);
  await p.screenshot({ path: `${dir}/${nombre}.png` });
  await anota(p, []);
  const e = await estado(p);
  pasos.push({ captura: `${dir}/${nombre}.png`, nota, ...e, ...extra, ...(lineas.length ? { anotacion: lineas } : {}) });
  console.log(`${nombre}: ${nota} · ${JSON.stringify(e)}${Object.keys(extra).length ? ` · ${JSON.stringify(extra)}` : ''}`);
}

async function hasta(p: Page, que: string, ms = 20_000): Promise<boolean> {
  try {
    await p.waitForFunction(que, undefined, { timeout: ms, polling: 25 });
    return true;
  } catch {
    return false;
  }
}

const ESTADO = (e: string) => `document.querySelector('${BOTON}')?.getAttribute('data-estado') === '${e}'`;
const decir = async (p: Page, texto: string, voz = VOZ) => di(p, await frase(texto, voz));

interface Turno { id: number; estado: string; oyo?: string; ruta?: string; acuse?: string }
/** Lo último que el bucle de la capa oyó (de su telemetría). */
const ultimoTurno = (p: Page): Promise<Turno | null> =>
  p.evaluate(() => {
    const w = window as unknown as { __capaVoz?: { diagnostico(): { bucle?: { telemetria: { turnos(): { id: number; estado: string; texto?: string; ruta?: string; acuse?: string }[] } } } } };
    const t = w.__capaVoz?.diagnostico().bucle?.telemetria.turnos().filter((x) => x.estado !== 'descartado').at(-1);
    return t ? { id: t.id, estado: t.estado, oyo: t.texto, ruta: t.ruta, acuse: t.acuse } : null;
  });
/** Lo último que el control avisó que se RESPONDIÓ en voz (lo escucha la prueba desde que se enciende). */
const ultimaRespuesta = (p: Page): Promise<string | null> =>
  p.evaluate(() => ((window as unknown as { __avisosVoz?: { respuesta?: string }[] }).__avisosVoz ?? []).filter((a) => a.respuesta).at(-1)?.respuesta ?? null);
const escuchaAvisos = (p: Page) =>
  p.evaluate(() => {
    const w = window as unknown as { __avisosVoz: unknown[]; __capaVoz?: { suscribe(f: (a: unknown) => void): () => void } };
    w.__avisosVoz = [];
    w.__capaVoz?.suscribe((a) => w.__avisosVoz.push(a));
  });
const citasDeManana = (p: Page) => p.evaluate(() => [...document.querySelectorAll('[data-capa-calendario] [data-capa-cita]')].map((x) => x.getAttribute('data-capa-cita')));
const corta = (t: string | null | undefined, n = 150) => (t ? (t.length > n ? `${t.slice(0, n)}…` : t) : '—');

async function abre() {
  const navegador = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream'] });
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'] });
  await contexto.addInitScript(instalaMicrofonoFalso);
  // Cuenta cada vez que la página pide el micrófono: la prueba de que se pide al PRIMER CLIC y no al cargar.
  await contexto.addInitScript(() => {
    const w = window as unknown as { __pedidosMicro: number };
    w.__pedidosMicro = 0;
    const pide = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (c?: MediaStreamConstraints) => ((w.__pedidosMicro += 1), pide(c));
  });
  const p = await contexto.newPage();
  const errores: string[] = [];
  p.on('console', (m) => m.type() === 'error' && errores.push(m.text().slice(0, 200)));
  await p.goto(`${BASE}${RUTA}?medicion=1#t=${encodeURIComponent(tokenDictado())}`);
  await p.locator(BOTON).waitFor({ timeout: 60_000 });
  await pasaPrimerArranque(p);
  return { navegador, contexto, p, errores };
}

async function turnoRespondido(p: Page) {
  const e = await estado(p);
  await captura(p, '02-escuchando', 'encendido con un clic: pidió el micrófono (una vez) y escucha; el indicador dice «abierto»', {}, [
    `getUserMedia pedido ${e.pedidosMicro} vez (al clic) · pistas del micrófono: ${e.pistas.join(', ') || '—'} · aria-pressed=${e.ariaPressed}`,
  ]);
  await decir(p, '¿Qué tengo hoy en la agenda?');
  const hablo = await hasta(p, ESTADO('hablando'));
  await p.waitForTimeout(900);
  const t = await ultimoTurno(p);
  await captura(p, '03-turno-respondido-en-voz', 'calló, el turno se envió solo y la respuesta suena (la capa resolvió por intención: calendario.consulta-hoy)', { hablo, turno: t }, [
    `oyó (Parakeet, local): «${corta(t?.oyo)}» · el turno se cerró solo al callar`,
    `suena (Piper, local): «${corta(await ultimaRespuesta(p))}»`,
  ]);
  await hasta(p, ESTADO('escuchando'), 30_000);
}

async function interrupcion(p: Page) {
  await decir(p, 'Cuéntame todo lo que puede hacer esta fábrica por mí.');
  await hasta(p, ESTADO('hablando'));
  await p.waitForTimeout(800);
  await captura(p, '04a-hablando', 'contesta en voz una respuesta larga', { turno: await ultimoTurno(p) }, [`suena: «${corta(await ultimaRespuesta(p), 110)}»`, 'ahora le hablo encima: «Para.» (otra voz)']);
  const t0 = Date.now();
  await decir(p, 'Para.', OTRA);
  const callo = await hasta(p, ESTADO('escuchando'), 6_000);
  const ms = Date.now() - t0;
  await p.waitForTimeout(300);
  const t = await ultimoTurno(p);
  await captura(p, '04b-interrupcion', 'le hablé encima («Para.») mientras hablaba: se calló y volvió a escuchar', { callo, msHastaEscuchar: ms, turno: t }, [
    `«Para.» dicho encima → calló y volvió a escuchar (${ms} ms desde que empezó a sonar «Para.» en el micrófono, frase incluida)`,
    `el turno quedó «${t?.estado ?? '—'}»: el resto de la respuesta no sonó`,
  ]);
  await p.waitForTimeout(1_500);
}

async function freno(p: Page) {
  const antes = await citasDeManana(p);
  await decir(p, 'Cancela la cita de mañana.');
  const tarjeta = await hasta(p, `document.querySelector('[data-capa-boton="confirmar-freno"]') !== null`, 20_000);
  await hasta(p, ESTADO('escuchando'), 30_000);
  await captura(p, '05a-freno-pide-su-clic', 'lo irreversible, en modo conversación: la tarjeta del freno con su cita, y dicho en voz que el clic es de la persona', { tarjeta, citas: antes, turno: await ultimoTurno(p) }, [
    `dicho en voz: «${corta(await ultimaRespuesta(p), 200)}»`,
  ]);
  await p.waitForTimeout(500);
  await decir(p, 'Sí, confírmalo.');
  await hasta(p, ESTADO('hablando'));
  await p.waitForTimeout(400);
  const sigue = await p.locator('[data-capa-boton="confirmar-freno"]').count();
  const t = await ultimoTurno(p);
  const citas = await citasDeManana(p);
  await captura(p, '05b-decirlo-no-basta', '«Sí, confírmalo» en voz: la tarjeta sigue ahí y nada se canceló', { tarjetasPendientes: sigue, citas, turno: t }, [
    `oyó: «${corta(t?.oyo)}» → contesta en voz, sin mandarlo a la conversación: «${corta(await ultimaRespuesta(p), 200)}»`,
    `tarjetas del freno pendientes: ${sigue} · citas: ${citas.join(', ')}`,
  ]);
  await hasta(p, ESTADO('escuchando'), 30_000);
  await p.locator('[data-capa-boton="confirmar-freno"]').first().click();
  await hasta(p, `document.querySelector('[data-capa-boton="confirmar-freno"]') === null`, 10_000);
  await p.waitForTimeout(800);
  await captura(p, '05c-el-clic-si', 'el clic de la persona: ahora sí se canceló', { tarjetasPendientes: await p.locator('[data-capa-boton="confirmar-freno"]').count(), citas: await citasDeManana(p) });
}

async function teclado(p: Page) {
  const pasosTeclado: { tecla: string; ariaPressed: string | null; estado: string | null; pistas: string[] }[] = [];
  await p.locator('body').click({ position: { x: 5, y: 5 } });
  let enfocado = false;
  let tabs = 0;
  for (; tabs < 60 && !enfocado; tabs++) {
    await p.keyboard.press('Tab');
    enfocado = await p.evaluate((sel) => document.activeElement === document.querySelector(sel), BOTON);
  }
  const registra = async (tecla: string) => {
    await p.waitForTimeout(tecla.startsWith('Alt') ? 1_500 : 1_200);
    const e = await estado(p);
    pasosTeclado.push({ tecla, ariaPressed: e.ariaPressed, estado: e.estado, pistas: e.pistas });
  };
  const linea = (x: (typeof pasosTeclado)[number]) => `${x.tecla} → aria-pressed=${x.ariaPressed} · ${x.estado} · pistas: ${x.pistas.join(', ') || '—'}`;
  await p.keyboard.press('Enter');
  await registra('Enter');
  await captura(p, '07-teclado-enter', 'con teclado: Tab hasta el botón y Enter lo enciende (aria-pressed=true)', { enfocado, tabs }, [`${tabs} Tab desde el principio de la página → foco en el botón (anillo visible)`, linea(pasosTeclado[0]!)]);
  await p.keyboard.press('Space');
  await registra('Space');
  await p.keyboard.press('Alt+KeyC');
  await registra('Alt+C');
  await p.keyboard.press('Alt+KeyC');
  await registra('Alt+C');
  await captura(p, '08-teclado-espacio-y-alt-c', 'Espacio lo apaga; Alt+C lo enciende y lo apaga desde cualquier parte', { enfocado, tabs }, pasosTeclado.map(linea));
  return { enfocado, tabs, pasosTeclado };
}

/** Recepción, el producto nuevo: la ranura de voz dictando en el compositor de la capa (Parakeet local). */
async function recepcion(p: Page) {
  await p.goto(`${BASE}/recepcion?medicion=1`);
  await p.locator('[data-capa-boton="dictar"]').waitFor({ timeout: 60_000 });
  await pasaPrimerArranque(p);
  const dictar = p.locator('[data-capa-boton="dictar"]');
  await dictar.click();
  await p.waitForTimeout(1_200); // la calibración del detector por energía, con el micrófono en silencio
  const dicho = 'Apunta que la señora Pérez llega diez minutos tarde.';
  await decir(p, dicho);
  await p.waitForTimeout(600);
  await captura(p, '09-recepcion-grabando', 'Recepción: la ranura de voz grabando una toma desde el compositor («■ Parar»)', { grabando: await dictar.getAttribute('aria-pressed') }, [`se dice al micrófono: «${dicho}»`]);
  const llego = await hasta(p, `(document.querySelector('[data-capa-entrada]')?.value ?? '').length > 0`, 30_000);
  const texto = await p.locator('[data-capa-entrada]').inputValue();
  await p.waitForTimeout(300);
  await captura(p, '12-voz-dictando', 'Recepción: lo dictado, transcrito en local, queda en el compositor para revisarlo y enviarlo', { llego, texto, grabando: await dictar.getAttribute('aria-pressed') }, [
    `dicho: «${dicho}»`,
    `transcrito (Parakeet, local, por el demonio de tools/dictado): «${texto}»`,
    'nada se envía solo: el texto espera en el compositor',
  ], DIR_PRODUCTO);
  return { dicho, texto, llego };
}

async function principal() {
  await mkdir(DIR, { recursive: true });
  const { navegador, p, errores } = await abre();
  await p.waitForTimeout(800);
  const e0 = await estado(p);
  await captura(p, '01-apagado', 'apagado: el botón a la vista, aria-pressed=false y el micrófono sin pedir', {}, [`getUserMedia pedido ${e0.pedidosMicro} veces al cargar · aria-pressed=${e0.ariaPressed} · micrófono ${e0.microfono}`]);
  await p.locator(BOTON).click();
  await hasta(p, ESTADO('escuchando'));
  await escuchaAvisos(p);
  await p.waitForTimeout(1_200); // la calibración del detector por energía
  await turnoRespondido(p);
  await interrupcion(p);
  await freno(p);
  await p.locator(BOTON).click();
  const pistas = (await estado(p)).pistas;
  await p.waitForTimeout(300);
  await captura(p, '06-apagado-otra-vez', 'apagado otra vez: el micrófono se cerró al instante (pistas en «ended»)', { pistasAlVolverDelClic: pistas }, [`pistas del micrófono justo al volver del clic: ${pistas.join(', ') || '—'} · aria-pressed=false`]);
  const kb = await teclado(p);
  const rec = await recepcion(p);
  await writeFile(`${DIR}/secuencia.json`, `${JSON.stringify({ fecha: new Date().toISOString(), base: BASE, ruta: RUTA, pasos, teclado: kb, recepcion: rec, erroresDeConsola: errores }, null, 2)}\n`);
  console.log(`teclado: ${JSON.stringify(kb)}`);
  console.log(`recepción: ${JSON.stringify(rec)}`);
  console.log(`errores de consola: ${errores.length}${errores.length ? `\n  ${errores.join('\n  ')}` : ''}`);
  await navegador.close();
}

await principal();
