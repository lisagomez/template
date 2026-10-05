/**
 * Recorrido de la SALA del reel con Playwright (Chromium, celular emulado): consentimientos (#202), riesgo 5 (#201),
 * transcripción conservada (#203), retiro y borrar. Clip SINTÉTICO de dos voces (Piper es_MX; nadie grabó a nadie).
 * Primera corrida completa: 2026-10-05, 15/15 y 0 errores de consola.
 *
 * Crea una cuenta @example.com con contraseña aleatoria que no se imprime, en el Supabase de la app: queda creada
 * (borrarla exige la llave de administrador). El proyecto y sus archivos se borran al final.
 *
 * Necesita la app corriendo con los motores locales (ver `src/features/reel/README.md`, «Probar la sala»):
 *   URL=http://localhost:3007 node scripts/reel/captura-sala.mjs
 * Si falta el clip de dos voces lo genera con `sinteticos.ts` (NO con `reel:laboratorio`, que reescribe la medición
 * versionada). Capturas y resultados van a una carpeta temporal (o a `OUT`); sale con 1 si algo falla.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:3000';
const OUT = process.env.OUT ?? join(tmpdir(), `reel-captura-sala-${new Date().toISOString().slice(0, 10)}`);
mkdirSync(OUT, { recursive: true });
const LAB = process.env.REEL_LABORATORIO ?? join(homedir(), '.reel', 'laboratorio');
const CLIP = join(LAB, 'dos-hablantes', 'bruto.mp4');
if (!existsSync(CLIP)) {
  const { generaCaso } = await import('./sinteticos.ts');
  generaCaso('dos-hablantes', join(LAB, 'dos-hablantes'));
}
const DATOS = process.env.REEL_DATOS ?? join(homedir(), '.reel', 'datos');
const DOC = join(OUT, 'consentimiento-sintetico.pdf');
writeFileSync(DOC, '%PDF-1.4\n% Consentimiento SINTETICO para una prueba local: no es de nadie.\n');
const correo = `reel-prueba-${Date.now()}@example.com`, clave = randomBytes(15).toString('base64url');
const r = { pasos: [], erroresDeConsola: [], fallos: [] };

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on('console', (m) => { if (m.type() === 'error') r.erroresDeConsola.push(`${new globalThis.URL(p.url()).pathname} :: ${m.text().replace(/\s+/g, ' ').slice(0, 600)}`); });
p.on('dialog', (d) => d.accept());
const foto = async (n) => { await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(800); await p.screenshot({ path: join(OUT, `${n}.png`), fullPage: true }); };
const paso = (que, dato) => { r.pasos.push({ que, ...dato }); console.log(que, JSON.stringify(dato)); };
const comprueba = (que, cond) => { if (!cond) r.fallos.push(que); console.log(`${cond ? '✓' : '✗'} ${que}`); };
const texto = async (sel) => (await p.$(sel)) ? (await p.textContent(sel)) ?? '' : '';
const version = async () => Number(/Versión (\d+)/.exec(await texto('[data-prueba=version]'))?.[1] ?? 0);
const esperaVersion = async (n) => p.waitForFunction((k) => new RegExp(`Versión ${k}\\b`).test(document.querySelector('[data-prueba=version]')?.textContent ?? ''), n, { timeout: 300000 });
const carpeta = (id) => { const d = readdirSync(DATOS).find((x) => existsSync(join(DATOS, x, id))); return d ? join(DATOS, d, id) : null; };
const consentimientos = (id) => { const c = carpeta(id); try { return c ? readdirSync(join(c, 'consentimientos')).sort() : []; } catch { return []; } };

try {
  await p.goto(`${URL}/signup?siguiente=/reel`);
  await p.fill('input[name=nombre]', 'Lupita (prueba)'); await p.fill('input[name=correo]', correo); await p.fill('input[name=contrasena]', clave);
  await p.click('[data-prueba=enviar-crear]'); await p.waitForURL(/\/reel$/, { timeout: 60000 });
  paso('alta de la cuenta sintética', { termina: '/reel' });

  await p.setInputFiles('[data-prueba=archivo]', CLIP);
  const t0 = Date.now(); await p.click('[data-prueba=enviar-clip]');
  await p.waitForURL(/\/reel\/[0-9a-f-]{36}$/, { timeout: 300000 }); await p.waitForSelector('[data-prueba=video]');
  const id = p.url().split('/').pop();
  const b1 = await texto('[data-prueba=bloqueos]');
  paso('subida y proceso del clip de dos voces', { segundos: Math.round((Date.now() - t0) / 1000), version: await version(), bloqueos: b1.slice(0, 200) });
  comprueba('sin consentimiento, la segunda voz bloquea', /voces/.test(b1));
  comprueba('aprobar está deshabilitado con bloqueos', await p.isDisabled('[data-prueba=aprobar]'));
  await foto('1-sala-bloqueada-por-otra-voz');

  const f = '[data-prueba=alta-consentimiento]';
  await p.fill(`${f} input[name=alias]`, 'Clienta 1'); await p.selectOption(`${f} select[name=rol]`, 'cliente');
  await p.fill(`${f} input[name=alcance]`, 'Testimonio del pan de muerto, Instagram y Facebook'); await p.fill(`${f} input[name=vigenteHasta]`, '2027-01-01');
  await p.setInputFiles(`${f} input[name=documento]`, DOC);
  await p.click(`${f} button[type=submit]`); await esperaVersion(2);
  const b2 = await texto('[data-prueba=bloqueos]');
  paso('registrar el consentimiento', { version: await version(), lista: (await texto('[data-prueba=consentimientos] ul')).slice(0, 120), archivos: consentimientos(id) });
  comprueba('con consentimiento, la segunda voz ya no bloquea', !/voces/.test(b2));
  comprueba('el documento y su vigencia están en el servidor', consentimientos(id).filter((x) => /\.(bin|vigencia\.json)$/.test(x)).length === 2);
  await foto('2-consentimiento-registrado');

  await p.$eval('[data-prueba=video]', (v) => { v.currentTime = 17.5; }); await p.waitForTimeout(500);
  await p.click('[data-prueba=marcar-corte]'); await esperaVersion(3);
  const b3 = await texto('[data-prueba=bloqueos]');
  paso('cortar 1,5 s dentro de lo que dice la clienta (s 17,5)', { version: await version(), bloqueos: b3.slice(0, 220), botones: await p.locator('[data-prueba=revisar-corte]').count() });
  comprueba('riesgo 5: el corte en su voz bloquea', /otra persona/.test(b3));
  comprueba('riesgo 5: la sala ofrece revisarlo', (await p.locator('[data-prueba=revisar-corte]').count()) >= 1);
  await foto('3-riesgo-5-bloquea');

  const n = await version();
  while ((await p.locator('[data-prueba=revisar-corte]').count()) > 0) {
    await p.locator('[data-prueba=revisar-corte]').first().click(); await esperaVersion((await version()) + 1);
  }
  const b4 = await texto('[data-prueba=bloqueos]');
  paso('revisar el corte (confirmación explícita)', { version: await version(), revisiones: (await version()) - n, bloqueos: b4.slice(0, 200) || '(ninguno)' });
  comprueba('revisado, el corte ya no bloquea', !/otra persona/.test(b4));
  comprueba('aprobar queda habilitado', !(await p.isDisabled('[data-prueba=aprobar]')));
  await foto('4-corte-revisado');

  await p.click('[data-prueba=aprobar]');
  await p.waitForFunction(() => /Aprobada por/.test(document.querySelector('[data-prueba=registro]')?.textContent ?? ''), null, { timeout: 60000 });
  paso('aprobar', { archivos: consentimientos(id) });
  comprueba('al aprobar, la transcripción íntegra se guarda con el consentimiento', consentimientos(id).includes('transcripcion-integra.json'));
  await foto('5-aprobado-con-transcripcion');

  const v5 = await version();
  await p.click('[data-prueba=retirar-consentimiento]');
  await p.waitForSelector('[data-prueba=aviso-consentimiento]', { timeout: 300000 }); await esperaVersion(v5 + 1);
  const aviso = await texto('[data-prueba=aviso-consentimiento]'), b6 = await texto('[data-prueba=bloqueos]'), reg = await texto('[data-prueba=registro]');
  paso('retirar el consentimiento', { version: await version(), aviso: aviso.slice(0, 260), archivos: consentimientos(id), bloqueos: b6.slice(0, 160) });
  comprueba('el aviso dice que lo publicado no se recupera y que sigue en el clip original', /no se puede recuperar/.test(aviso) && /clip original/.test(aviso));
  comprueba('se borraron el documento, su vigencia y la transcripción conservada', consentimientos(id).length === 0);
  comprueba('lo aprobado quedó revocado', /revocada/.test(reg));
  comprueba('la segunda voz vuelve a bloquear', /voces/.test(b6));
  comprueba('la lista lo marca retirado', /retirado/.test(await texto('[data-prueba=consentimientos] ul')));
  await foto('6-consentimiento-retirado');

  const c = carpeta(id);
  await p.click('[data-prueba=borrar]'); await p.waitForURL(/\/reel$/, { timeout: 60000 });
  paso('borrar el proyecto', { carpeta: c && existsSync(c) ? 'sigue' : 'borrada' });
  comprueba('borrar el proyecto borra la carpeta del servidor', !(c && existsSync(c)));
  await foto('7-proyecto-borrado');
} catch (e) {
  r.fallos.push(`excepción: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
  await foto('x-fallo').catch(() => {});
}
writeFileSync(join(OUT, 'resultados.json'), JSON.stringify(r, null, 1));
await nav.close();
console.log(`errores de consola: ${r.erroresDeConsola.length} · fallos: ${r.fallos.length} · capturas en ${OUT}`);
process.exit(r.fallos.length ? 1 : 0);
