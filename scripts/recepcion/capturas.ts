/**
 * Las capturas de Recepción (punto 6 del HECHO de `docs/goals/capa-arbrain.md`), con Playwright y datos sintéticos.
 * Cada paso COMPRUEBA lo que enseña y el guion sale con 1 si algo no se ve: una captura que no prueba nada no cuenta.
 *
 *   01-02  el primer arranque, en un navegador limpio (sin nada guardado)
 *   03-04  una petición por intención resuelta por un módulo (calendario y el propio mostrador)
 *   05     la ranura de plan llenada por tools/calendario
 *   06-07  la memoria del producto: «recuerda que…», recargar, «¿qué recuerdas?»
 *   08-10  el freno: pide la cita y el clic; ni el texto ni el teclado lo mueven; el clic sí
 *   11     apartar una cita: pregunta antes (cuánto pregunta) y la ranura de plan cambia
 *
 * Con `--recomposicion antes|despues` corre solo la recomposición (punto 7): el explorador lleva el módulo de
 * crecimiento de ese lado y no el otro, la pregunta del módulo que no está la contesta «no lo sé», y la del que está
 * abre su pantalla por intención. Escribe `recomposicion-<lado>.json`.
 *
 * Uso: node scripts/recepcion/capturas.ts --base http://localhost:3011 [--capturas <dir>] [--frase-reserva "<texto>"]
 *        [--recomposicion antes|despues]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, type BrowserContext, type Page } from 'playwright';

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const BASE = arg('base') ?? 'http://localhost:3011';
const DIR = arg('capturas') ?? 'docs/goals/capa-arbrain-capturas/producto';
const RESERVA = arg('frase-reserva') ?? 'aparta una cita mañana a las 10';
const LADO = arg('recomposicion');
const PREFIJO = 'capa:recepcion:capa/recepcion/alameda/capa/';
const VISTO = JSON.stringify({ version: 1, terminado: true, paso: 4, nivel: 'lo-importante', voz: false });
/** Las pantallas de los módulos de crecimiento viven en `(main)`: su ventana es la del laboratorio, con su guía vista. */
const VISTO_LABORATORIO = 'capa:laboratorio:capa/laboratorio/laboratorio/capa/primer-arranque';

/** El intercambio de la recomposición: el módulo de crecimiento de cada lado, lo que se le pide y a dónde lleva. */
const LADOS = {
  antes: { modulo: 'crecimiento-demostrado', pregunta: '¿de dónde salió el crecimiento del trimestre?', destino: '/crecimiento' },
  despues: { modulo: 'estudio-pymes', pregunta: '¿qué pongo en mis redes este mes?', destino: '/estudio' },
} as const;
mkdirSync(DIR, { recursive: true });

interface Paso { captura: string; que: string; comprobado: string }
const pasos: Paso[] = [];
const errores: string[] = [];

const navegador = await chromium.launch();
async function contexto(primerArranqueVisto: boolean): Promise<BrowserContext> {
  const c = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-MX', colorScheme: 'light' });
  const pares = primerArranqueVisto ? [[`${PREFIJO}primer-arranque`, VISTO], [VISTO_LABORATORIO, VISTO]] : [];
  await c.addInitScript((xs: string[][]) => { try { for (const [k, v] of xs) localStorage.setItem(k!, v!); } catch { /* sin almacenamiento */ } }, pares);
  return c;
}
async function abre(c: BrowserContext): Promise<Page> {
  const p = await c.newPage();
  p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text().split('\n')[0]!.slice(0, 200)); });
  p.on('pageerror', (e) => errores.push(`pageerror: ${e.message.split('\n')[0]!.slice(0, 200)}`));
  await p.goto(`${BASE}/recepcion`, { waitUntil: 'networkidle' });
  await p.locator('[data-capa-ventana="recepcion"]').waitFor();
  await p.locator('[data-capa-calendario="tools/calendario"] [data-recepcion-dia]').first().waitFor();
  return p;
}
const exige = (ok: boolean, que: string) => { if (!ok) throw new Error(`no se cumplió: ${que}`); };
async function foto(p: Page, nombre: string, que: string, comprobado: string) {
  await p.waitForTimeout(250);
  await p.screenshot({ path: `${DIR}/${nombre}.png` });
  pasos.push({ captura: `${DIR}/${nombre}.png`, que, comprobado });
  console.log(`✓ ${nombre}: ${comprobado}`);
}
/** Escribe en la conversación y espera la respuesta del asistente que case con `espera`. */
async function pide(p: Page, texto: string, espera: RegExp): Promise<string> {
  await p.locator('[data-capa-entrada]').fill(texto);
  await p.locator('[data-capa-boton="enviar"]').click();
  const r = p.locator('[data-capa-mensaje][data-de="asistente"]', { hasText: espera }).last();
  await r.waitFor({ timeout: 15_000 });
  return (await r.innerText()).split('\n')[0]!;
}
/** Qué intención resolvió cada respuesta del asistente: lo que guardó la memoria del producto. */
async function intenciones(p: Page): Promise<string[]> {
  const crudo = await p.evaluate((k) => localStorage.getItem(k), `${PREFIJO}conversacion`);
  const lista = JSON.parse(crudo ?? '[]') as Array<{ de: string; intencion?: string; texto: string }>;
  return lista.filter((m) => m.de === 'asistente' && m.intencion).map((m) => m.intencion!);
}
const enPlan = (p: Page, cita: string) => p.locator(`[data-capa-ranura="plan"][data-capa-llena="calendario"] [data-recepcion-cita="${cita}"]`).count();

async function primerArranque() {
  const p = await abre(await contexto(false));
  const guia = p.locator('[data-capa-ranura="primer-arranque"] [role="dialog"]');
  exige((await guia.getAttribute('data-capa-paso')) === 'bienvenida', 'el primer arranque empieza en la bienvenida');
  exige((await guia.innerText()).includes('Hola, soy Nora'), 'la guía lleva el asistente del producto');
  await foto(p, '01-primer-arranque', 'el primer arranque en un navegador limpio', 'la guía abre en la bienvenida con el asistente del producto (Nora) y su marca');
  for (let i = 0; i < 6 && (await guia.getAttribute('data-capa-paso')) !== 'pregunta'; i++) await p.locator('[data-capa-boton="primer-arranque-sigue"]').click();
  exige((await guia.getAttribute('data-capa-paso')) === 'pregunta', 'la guía llega a «¿Cuánto te pregunto?»');
  await foto(p, '02-primer-arranque-cuanto-pregunta', 'el paso de cuánto pregunta', 'un paso, una decisión: lo irreversible pide el clic en los tres niveles');
  while (await guia.count()) await p.locator('[data-capa-boton="primer-arranque-sigue"]').click();
  return p;
}

async function intencionYPlan(p: Page) {
  const hoy = await pide(p, '¿qué tengo hoy?', /^Hoy tienes/);
  exige((await intenciones(p)).at(-1) === 'calendario.consulta-hoy', 'la respuesta la dio el módulo calendario');
  await foto(p, '03-intencion-calendario', '«¿qué tengo hoy?» resuelta por el módulo calendario (tools/calendario)', `calendario.consulta-hoy → «${hoy}»`);
  const precio = await pide(p, '¿cuánto cuesta un corte?', /^Corte:/);
  exige((await intenciones(p)).at(-1) === 'recepcion.servicios', 'la respuesta la dio el módulo recepcion');
  await foto(p, '04-intencion-mostrador', '«¿cuánto cuesta un corte?» resuelta por el módulo del mostrador', `recepcion.servicios → «${precio}»`);
  exige((await enPlan(p, 'Corte · Mario R.')) === 1 && (await enPlan(p, 'Corte · Daniela M.')) === 1, 'la ranura de plan muestra hoy y mañana desde tools/calendario');
  await p.locator('section[aria-label="Panel"]').screenshot({ path: `${DIR}/05-ranura-plan-calendario.png` });
  pasos.push({ captura: `${DIR}/05-ranura-plan-calendario.png`, que: 'la ranura de plan llenada por tools/calendario', comprobado: 'data-capa-llena="calendario": las citas de hoy y de mañana leídas del espejo del calendario' });
  console.log('✓ 05-ranura-plan-calendario');
}

async function memoria(p: Page) {
  const dicho = await pide(p, 'recuerda que los martes llega el proveedor de navajas', /^Lo recuerdo/);
  await foto(p, '06-memoria-recuerda', '«recuerda que…» guardado en la memoria del producto (inquilino alameda)', dicho);
  await p.reload({ waitUntil: 'networkidle' });
  await p.locator('[data-capa-ventana="recepcion"]').waitFor();
  const r = await pide(p, '¿qué recuerdas?', /^Me pediste recordar/);
  exige(r.includes('los martes llega el proveedor de navajas'), 'tras recargar, recuerda lo que se le pidió');
  const claves = await p.evaluate((pre) => Object.keys(localStorage).filter((k) => k.startsWith(pre)), PREFIJO);
  await foto(p, '07-memoria-tras-recargar', 'tras recargar la página, «¿qué recuerdas?»', `${r} · claves: ${claves.map((k) => k.slice(PREFIJO.length)).join(', ')}`);
}

async function freno(p: Page) {
  await pide(p, 'cancela la cita de mañana', /no tiene vuelta atrás/);
  const tarjeta = p.locator('[data-capa-freno]').last();
  await tarjeta.waitFor();
  exige((await tarjeta.innerText()).includes('cancela la cita de mañana'), 'la tarjeta enseña la cita textual de quien lo pidió');
  await foto(p, '08-freno-pide', 'el freno: cancelar es irreversible, pide la cita textual y un clic', 'tarjeta con la cita «cancela la cita de mañana» y el botón Confirmar');
  await pide(p, 'sí, confírmalo', /todavía no lo sé hacer/);
  await tarjeta.locator('[data-capa-boton="confirmar-freno"]').focus();
  await p.keyboard.press('Enter');
  await p.locator('[data-capa-mensaje][data-de="asistente"]', { hasText: /Sigue en pausa: el teclado no confirma/ }).last().waitFor();
  exige((await enPlan(p, 'Corte · Daniela M.')) === 1, 'sin el clic, la cita de mañana sigue en la agenda');
  await foto(p, '09-freno-bloquea', 'ni escribirlo ni el Enter confirman: la cita sigue', '«sí, confírmalo» no confirma; el Enter sobre Confirmar → «Sigue en pausa»; la ranura de plan aún tiene Corte · Daniela M.');
  await tarjeta.locator('[data-capa-boton="confirmar-freno"]').click();
  const hecho = p.locator('[data-capa-mensaje][data-de="asistente"]', { hasText: /^Cancelada «Corte · Daniela M\.»/ }).last();
  await hecho.waitFor();
  exige((await enPlan(p, 'Corte · Daniela M.')) === 0, 'con el clic, la cita sale de la agenda');
  await foto(p, '10-freno-avanza', 'con el clic humano el freno avanza', (await hecho.innerText()).split('\n')[0]!);
}

async function reserva(p: Page) {
  await pide(p, RESERVA, /^¿Lo hago\?/);
  await p.locator('[data-capa-mensaje][data-de="asistente"]').last().locator('.capa-chip', { hasText: /^Sí$/ }).click();
  const r = p.locator('[data-capa-mensaje][data-de="asistente"]', { hasText: /^Listo: apartada/ }).last();
  await r.waitFor();
  exige((await enPlan(p, 'Cita (mostrador)')) === 1, 'la cita apartada aparece en la ranura de plan');
  await foto(p, '11-reserva', `«${RESERVA}»: pregunta antes (lo importante) y la aparta sin doble reserva`, (await r.innerText()).split('\n')[0]!);
}

/** Un lado de la recomposición, en una ventana con la guía ya vista (lo que cambia es el módulo, no la guía). */
async function recomposicion(lado: keyof typeof LADOS) {
  const l = LADOS[lado];
  const otro = LADOS[lado === 'antes' ? 'despues' : 'antes'];
  const p = await abre(await contexto(true));
  const cejas = p.locator('nav[aria-label="Explorador"] .capa-ceja');
  const grupos = await cejas.evaluateAll((xs) => xs.map((x) => x.getAttribute('data-capa-modulo') ?? ''));
  exige(grupos.includes(l.modulo), `el explorador lleva ${l.modulo}`);
  exige(!grupos.includes(otro.modulo), `el explorador no lleva ${otro.modulo}`);
  await pide(p, otro.pregunta, /todavía no lo sé hacer/);
  await foto(p, `2${lado === 'antes' ? 0 : 2}-recomposicion-${lado}`, `Recepción ${lado} del intercambio: lleva ${l.modulo}`,
    `explorador: ${grupos.join(', ')} · «${otro.pregunta}» → «Eso todavía no lo sé hacer…» (${otro.modulo} no está)`);
  await pide(p, l.pregunta, /^Te llevo a/);
  await p.waitForURL((u) => u.pathname === l.destino, { timeout: 30_000 });
  await p.locator('[data-capa-ventana]').waitFor();
  await foto(p, `2${lado === 'antes' ? 1 : 3}-recomposicion-${lado}-modulo`, `«${l.pregunta}» abre ${l.modulo} por intención`,
    `${l.pregunta} → ${l.destino} (pantalla de ${l.modulo}, en la ventana de (main))`);
  writeFileSync(`${DIR}/recomposicion-${lado}.json`, `${JSON.stringify({ base: BASE, fecha: new Date().toISOString(), lado, modulo: l.modulo, pasos, erroresDeConsola: errores }, null, 2)}\n`);
}

try {
  if (LADO === 'antes' || LADO === 'despues') {
    await recomposicion(LADO);
  } else if (LADO) {
    throw new Error(`--recomposicion ${LADO}: es «antes» o «despues»`);
  } else {
    const p = await primerArranque();
    await intencionYPlan(p);
    await memoria(p);
    await freno(p);
    await reserva(p);
    const resumen = await (await fetch(`${BASE}/api/recepcion/resumen`)).json();
    writeFileSync(`${DIR}/resumen.json`, `${JSON.stringify({ base: BASE, fecha: new Date().toISOString(), pasos, intenciones: await intenciones(p), lecturaDeConteos: resumen, erroresDeConsola: errores }, null, 2)}\n`);
  }
} catch (e) {
  errores.push(`FALLA: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
} finally {
  await navegador.close();
}
console.log(errores.length ? `\n✗ ${errores.length} error(es): ${errores.join(' | ')}` : `\nCapturas de Recepción en verde: ${pasos.length} pasos comprobados, 0 errores de consola · ${DIR}`);
process.exit(errores.length ? 1 : 0);
