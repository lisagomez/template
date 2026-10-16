/**
 * Capturas del HUD en cada estado, con voz inyectada por el micrófono falso (nada de texto
 * tecleado salvo donde se dice): reposo, escuchando con la onda, pensando, hablando con karaoke,
 * interrupción antes y después, orden sin LLM, conversación con LLM, telemetría, palabra de
 * activación y vista de teléfono.
 *
 *   node scripts/centro-de-mando/capturas.ts [--base http://localhost:3011]
 *
 * Deja los PNG en `docs/goals/centro-de-mando-voz-capturas/`. Gasta centavos (tres preguntas al cerebro).
 */
import { mkdir } from 'node:fs/promises';
import type { Page } from 'playwright';
import { abreHud, di, enciende, esperaTurno, frase } from './banco-pagina.ts';
import { tokenDictado } from './voz-sintetica.ts';

const BASE = process.argv.find((_, i) => process.argv[i - 1] === '--base') ?? 'http://localhost:3011';
const DIR = 'docs/goals/centro-de-mando-voz-capturas';
const VOZ = 'es_MX-claude-high';
const OTRA = 'es_ES-davefx-medium';

const captura = (p: Page, nombre: string) => p.screenshot({ path: `${DIR}/${nombre}.png` });

/** Espera a que el HUD cumpla algo (lo evalúa la página), hasta `ms`. */
async function hasta(p: Page, que: string, ms = 20_000): Promise<boolean> {
  try {
    await p.waitForFunction(que, undefined, { timeout: ms, polling: 20 });
    return true;
  } catch {
    return false;
  }
}

const ESTADO = (e: string) => `document.querySelector('[data-prueba="centro-de-mando"]')?.getAttribute('data-estado') === '${e}'`;
const KARAOKE_A_MEDIAS = `[...document.querySelectorAll('[data-prueba="frase"]')].some((f) => { const x = Number(f.getAttribute('data-fraccion')); return x > 0.25 && x < 0.75; })`;

async function principal() {
  await mkdir(DIR, { recursive: true });
  const h = await abreHud(BASE, tokenDictado());
  const p = h.pagina;
  await p.waitForTimeout(1_000);
  await captura(p, '01-reposo');
  await enciende(p);

  const larga = await frase('Explícame paso a paso cómo armar un presupuesto mensual para una cafetería pequeña.', VOZ);
  const dicha = await di(p, larga);
  await p.waitForTimeout(Math.max(600, larga.msFinVoz - 1_500));
  await captura(p, '02-escuchando-con-la-onda');
  console.log('pensando:', await hasta(p, ESTADO('pensando')));
  await captura(p, '03-pensando');
  console.log('karaoke:', await hasta(p, `${ESTADO('hablando')} && ${KARAOKE_A_MEDIAS}`));
  await captura(p, '04-hablando-con-karaoke');
  await p.waitForTimeout(400);
  await captura(p, '05-interrupcion-antes');
  await di(p, await frase('Para.', OTRA));
  console.log('interrumpido:', await hasta(p, `document.querySelector('[data-prueba="entrada-maquina"] .text-red-300') !== null || ${ESTADO('escuchando')}`, 6_000));
  await p.waitForTimeout(1_200);
  await captura(p, '06-interrupcion-despues');
  void dicha;

  await p.waitForTimeout(800);
  const agenda = await di(p, await frase('¿Qué tengo hoy?', VOZ));
  await esperaTurno(p, agenda);
  await captura(p, '07-orden-sin-llm');

  const pregunta = await di(p, await frase('¿Qué diferencia hay entre utilidad y flujo de caja?', VOZ));
  await esperaTurno(p, pregunta);
  await captura(p, '08-conversacion-con-llm');

  for (const t of ['¿Qué hora es?', 'Más despacio.', '¿Qué tengo mañana?']) await esperaTurno(p, await di(p, await frase(t, OTRA)));
  await p.locator('[data-prueba="telemetria"]').screenshot({ path: `${DIR}/09-telemetria-por-etapa.png` });
  await captura(p, '10-telemetria-pantalla-completa');

  await p.locator('[data-prueba="modo-palabra"]').click();
  await p.locator('[data-prueba="parar"]').click();
  await p.waitForTimeout(500);
  const sinNombre = await di(p, await frase('¿Qué hora es?', VOZ));
  await p.waitForTimeout(sinNombre.dicho.msFinVoz + 1_500);
  const conNombre = await di(p, await frase('Oye, mando, ¿qué tengo mañana?', VOZ));
  await esperaTurno(p, conNombre);
  await captura(p, '11-palabra-de-activacion');
  await h.navegador.close();

  const movil = await abreHud(BASE, tokenDictado(), 390, 844);
  await movil.pagina.waitForTimeout(1_000);
  await movil.pagina.screenshot({ path: `${DIR}/12-telefono.png`, fullPage: true });
  await movil.navegador.close();
}

await principal();
