/**
 * RECORRIDO con Playwright del laboratorio del calendario (la definicion de hecho de docs/goals/calendario.md):
 * cada paso hace la accion de verdad en /laboratorio-calendario, comprueba el resultado en el DOM, revisa la
 * consola y guarda su captura en docs/goals/calendario-capturas/. Sale con 1 si un paso falla.
 * Uso: node scripts/calendario/recorrido.ts [--base http://localhost:3001]
 */
import { mkdirSync } from 'node:fs';
import { chromium, type Page } from 'playwright';

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const BASE = arg('base') ?? 'http://localhost:3001';
const DIR = 'docs/goals/calendario-capturas';
mkdirSync(DIR, { recursive: true });

interface Paso { n: number; paso: string; ok: boolean; evidencia: string[]; capturas: string[] }
const pasos: Paso[] = [];
const errores: string[] = [];

const evento = (p: Page, dia: string, titulo: string) => p.locator(`[data-prueba=columna-dia][data-fecha="${dia}"] [data-prueba=evento][data-titulo="${titulo}"]`);
const horaDe = async (p: Page, dia: string, titulo: string) => ((await evento(p, dia, titulo).locator('small').textContent()) ?? '').trim();
const foto = async (p: Page, nombre: string, lista: string[], completa = false) => { const ruta = `${DIR}/${nombre}.png`; await p.screenshot({ path: ruta, fullPage: completa }); lista.push(ruta); };

async function paso(n: number, nombre: string, p: Page, f: (ev: string[], caps: string[]) => Promise<boolean>) {
  const ev: string[] = [];
  const caps: string[] = [];
  let ok = false;
  try { ok = await f(ev, caps); } catch (e) { ev.push(`EXCEPCION: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`); await foto(p, `${String(n).padStart(2, '0')}-fallo`, caps); }
  pasos.push({ n, paso: nombre, ok, evidencia: ev, capturas: caps });
  console.log(`${ok ? '✓' : '✗'} ${n}. ${nombre}\n${ev.map((e) => `    · ${e}`).join('\n')}\n${caps.map((c) => `    ▣ ${c}`).join('\n')}`);
}

const navegador = await chromium.launch();
const p = await (await navegador.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'es-MX', colorScheme: 'light' })).newPage();
p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text().split('\n')[0]!.slice(0, 200)); });
p.on('pageerror', (e) => errores.push(`pageerror: ${e.message.slice(0, 200)}`));
await p.goto(`${BASE}/laboratorio-calendario`);
await p.locator('[data-prueba=agenda]').waitFor();
await p.locator('[data-prueba=evento][data-titulo="Stand-up"]').first().waitFor();

await paso(1, 'semana con 2 calendarios y la salud del espejo', p, async (ev, caps) => {
  const salud = p.locator('[data-prueba=salud]');
  const estado = await salud.getAttribute('data-estado');
  const texto = (await salud.textContent()) ?? '';
  const trabajo = await p.locator('[data-prueba=evento][data-titulo="Revisión con proveedor"]').count();
  const personal = await p.locator('[data-prueba=evento][data-titulo="Dentista"]').count();
  const total = await p.locator('[data-prueba=agenda] [data-prueba=evento]').count();
  ev.push(`salud: ${estado} — «${texto}»`, `eventos pintados en la semana: ${total} (Trabajo: «Revisión con proveedor» ×${trabajo}; Personal: «Dentista» ×${personal})`);
  await foto(p, '01-semana-dos-calendarios-y-salud', caps);
  return estado === 'fresco' && texto.includes('Espejo al día') && trabajo === 1 && personal === 1 && total >= 15;
});

await paso(2, 'serie movida con «este y los siguientes» (antes / después)', p, async (ev, caps) => {
  const dias = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];
  const antes = await Promise.all(dias.map((d) => horaDe(p, d, 'Stand-up')));
  ev.push(`antes: ${dias.map((d, i) => `${d.slice(8)}→${antes[i]}`).join(' ')}`);
  await foto(p, '02-serie-antes', caps);
  await evento(p, '2026-10-21', 'Stand-up').click();
  await p.locator('[data-prueba=editor]').waitFor();
  await p.locator('[data-prueba=editor-inicio]').fill('11:00');
  await p.locator('[data-prueba=editor-fin]').fill('11:15');
  await p.locator('[data-prueba=alcance-siguientes]').check();
  await foto(p, '03-editor-alcance', caps);
  await p.locator('[data-prueba=editor-guardar]').click();
  await p.locator('[data-prueba=editor]').waitFor({ state: 'detached' });
  await p.waitForFunction(() => document.querySelector('[data-prueba=columna-dia][data-fecha="2026-10-23"] [data-titulo="Stand-up"] small')?.textContent?.startsWith('11:00'));
  const despues = await Promise.all(dias.map((d) => horaDe(p, d, 'Stand-up')));
  ev.push(`después: ${dias.map((d, i) => `${d.slice(8)}→${despues[i]}`).join(' ')}`)
  await foto(p, '04-serie-despues', caps);
  return antes.every((h) => h.startsWith('09:30')) && despues.slice(0, 2).every((h) => h.startsWith('09:30')) && despues.slice(2).every((h) => h.startsWith('11:00'));
});

await paso(3, 'un producto que agenda reserva; el 2º cliente, mismo hueco, es rechazado; confirmar crea la cita', p, async (ev, caps) => {
  await p.locator('[data-prueba=pedir-huecos]').click();
  const hueco = p.locator('[data-prueba=hueco]').first();
  await hueco.waitFor();
  ev.push(`huecos ofrecidos: ${await p.locator('[data-prueba=hueco]').count()}; elijo ${await hueco.getAttribute('data-inicio')}`);
  await hueco.click();
  await p.locator('[data-prueba=apartar]').click();
  const msj = p.locator('[data-prueba=mensaje-consumidor]');
  await msj.waitFor();
  const apartado = `${await msj.getAttribute('data-tono')} — ${await msj.textContent()}`;
  await p.locator('[data-prueba=otro-cliente]').click();
  await p.locator('[data-prueba=mensaje-consumidor][data-tono=no]').waitFor();
  const rechazo = (await msj.textContent()) ?? '';
  ev.push(`1º cliente: ${apartado}`, `2º cliente: ${rechazo}`);
  await foto(p, '05-segundo-cliente-rechazado', caps);
  await p.locator('[data-prueba=confirmar]').click();
  await p.locator('[data-prueba=mensaje-consumidor][data-tono=ok]').waitFor();
  const cita = p.locator('[data-prueba=agenda] [data-prueba=evento][data-titulo^="Cita (WhatsApp)"]');
  await cita.first().waitFor();
  const invitaciones = (await p.locator('[data-prueba=invitaciones]').textContent()) ?? '';
  ev.push(`confirmar: ${await msj.textContent()}`, `en la agenda: ${await cita.count()} cita · ${invitaciones}`);
  await foto(p, '06-cita-confirmada', caps);
  return apartado.startsWith('ok') && rechazo.includes('ocupado') && (await cita.count()) === 1 && invitaciones.endsWith(': 0');
});

await paso(4, 'capa de actividad programada (y la lente «solo actividad»)', p, async (ev, caps) => {
  await p.locator('[data-prueba=boton-actividad]').click();
  const bloques = p.locator('[data-prueba=agenda] [data-prueba=actividad]');
  await bloques.first().waitFor();
  const n = await bloques.count();
  const pausado = await p.locator('[data-prueba=actividad]', { hasText: 'Limpieza semanal' }).count();
  ev.push(`bloques de actividad pintados: ${n}; del trabajo pausado («Limpieza semanal»): ${pausado}`);
  await foto(p, '07-actividad-programada', caps);
  await p.locator('[data-prueba=boton-solo-actividad]').click();
  await p.waitForFunction(() => document.querySelectorAll('[data-prueba=agenda] [data-prueba=evento]').length === 0);
  ev.push('lente «solo actividad»: la rejilla muestra solo la actividad');
  await foto(p, '08-solo-actividad', caps);
  await p.locator('[data-prueba=boton-actividad]').click();
  return n > 10 && pausado === 0;
});

await paso(5, 'credencial caducada: se lee del espejo y la escritura se bloquea diciendo quién la destraba', p, async (ev, caps) => {
  await p.locator('[data-prueba=caducar-credencial]').click();
  await p.locator('[data-prueba=salud][data-estado=error]').waitFor();
  const salud = (await p.locator('[data-prueba=salud]').textContent()) ?? '';
  const visibles = await p.locator('[data-prueba=agenda] [data-prueba=evento]').count();
  await evento(p, '2026-10-20', 'Revisión con proveedor').click();
  await p.locator('[data-prueba=editor-titulo]').fill('Revisión (cambio sin credencial)');
  await p.locator('[data-prueba=editor-guardar]').click();
  const error = p.locator('[data-prueba=editor-error]');
  await error.waitFor();
  const texto = (await error.textContent()) ?? '';
  ev.push(`salud: «${salud}»`, `se siguen leyendo ${visibles} eventos del espejo`, `al guardar: «${texto}»`);
  await foto(p, '09-credencial-caducada', caps);
  await p.getByRole('button', { name: 'Cancelar' }).click();
  const noEscrito = await p.locator('[data-prueba=evento][data-titulo="Revisión (cambio sin credencial)"]').count();
  await p.locator('[data-prueba=reautenticar]').click();
  await p.locator('[data-prueba=salud][data-estado=fresco]').waitFor();
  ev.push(`el cambio no llegó a la agenda (${noEscrito}); tras reautenticar la salud vuelve a «fresco»`);
  return salud.includes('Credencial caducada') && visibles >= 15 && /credencial/i.test(texto) && /Lo destraba/.test(texto) && noEscrito === 0;
});

await navegador.close();
const fallidos = pasos.filter((x) => !x.ok).length;
console.log(`\nRecorrido: ${pasos.length - fallidos}/${pasos.length} pasos · errores de consola: ${errores.length}${errores.length ? `\n  ${errores.join('\n  ')}` : ''}`);
process.exitCode = fallidos || errores.length ? 1 : 0;
