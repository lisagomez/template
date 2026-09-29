/**
 * Recorrido de la app del reel con Playwright (Chromium local): cuentas, ruta protegida, rutas existentes,
 * subida del clip sintético, sala en el celular (marcar, aprobar con huella, revocar al editar) y borrar.
 * Cuenta sintética @example.com con contraseña aleatoria que no se imprime. Uso: node scripts/reel/captura-app.mjs
 */
import { randomBytes } from 'node:crypto';
import { readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:3000';
const OUT = '.claude/goals/reel-pymes/capturas';
const CLIP = join(homedir(), '.reel', 'laboratorio', 'limpio', 'bruto.mp4');
const correo = `reel-captura-${Date.now()}@example.com`, clave = randomBytes(15).toString('base64url');
const r = { rutasExistentes: {}, pasos: [], peticionesAlAprobar: [], erroresDeConsola: [], almacen: {} };
const lista = (d) => { try { return readdirSync(d, { recursive: true }).map(String).sort(); } catch { return []; } };

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on('console', (m) => { if (m.type() === 'error') r.erroresDeConsola.push(`${new globalThis.URL(p.url()).pathname} :: ${m.text().replace(/\s+/g, ' ').slice(0, 1400)}`); });
p.on('dialog', (d) => d.type() === 'prompt' ? d.accept('Pan de muerto de la casa') : d.accept());
// Esperar a que la página hidrate ANTES de la captura: en celular emulado, la captura de página completa redimensiona
// el viewport y, si cae en plena hidratación, React avisa de atributos distintos (medido: 0 sin captura, 2 con ella).
const foto = async (n) => { await p.waitForLoadState('networkidle'); await p.waitForTimeout(800); await p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }); };
const paso = (que, dato) => { r.pasos.push({ que, ...dato }); console.log(que, JSON.stringify(dato)); };

await p.goto(`${URL}/reel`); await p.waitForURL(/\/login/);
paso('ruta protegida sin sesión', { url: new globalThis.URL(p.url()).pathname + new globalThis.URL(p.url()).search }); await foto('1-ruta-protegida');
for (const ruta of ['/dictar', '/laboratorio-pymes', '/estudio', '/historial']) {
  const resp = await p.goto(`${URL}${ruta}`); r.rutasExistentes[ruta] = { estado: resp?.status(), terminaEn: new globalThis.URL(p.url()).pathname };
}
paso('rutas existentes sin sesión', r.rutasExistentes); await p.goto(`${URL}/estudio`); await foto('2-ruta-existente-estudio');

await p.goto(`${URL}/signup?siguiente=/reel`);
await p.fill('input[name=nombre]', 'Lupita (prueba)'); await p.fill('input[name=correo]', correo); await p.fill('input[name=contrasena]', clave);
await foto('3-alta'); await p.click('[data-prueba=enviar-crear]'); await p.waitForURL(/\/reel$/, { timeout: 30000 });
paso('alta', { termina: '/reel', cuenta: (await p.textContent('[data-prueba=cuenta]'))?.replace(/^[^@]+/, '…') }); await foto('4-reel-tras-alta');
await p.click('[data-prueba=salir]'); await p.waitForURL(/\/login/); paso('salida', { termina: '/login' }); await foto('5-salida');
await p.fill('input[name=correo]', correo); await p.fill('input[name=contrasena]', clave); await p.click('[data-prueba=enviar-entrar]');
await p.waitForURL(/\/reel$/, { timeout: 30000 }); paso('entrada', { termina: '/reel' }); await foto('6-entrada');

await p.setInputFiles('[data-prueba=archivo]', CLIP);
const t0 = Date.now(); await p.click('[data-prueba=enviar-clip]');
await p.waitForURL(/\/reel\/[0-9a-f-]{36}$/, { timeout: 240000 }); await p.waitForSelector('[data-prueba=video]');
const id = p.url().split('/').pop();
paso('subida y proceso', { segundos: Math.round((Date.now() - t0) / 1000), version: await p.textContent('[data-prueba=version]') });
await p.waitForTimeout(1500); await foto('7-sala');

await p.$eval('[data-prueba=video]', (v) => { v.currentTime = 5; }); await p.waitForTimeout(500);
await p.click('[data-prueba=marcar-corte]');
await p.waitForFunction(() => /Versión 2/.test(document.querySelector('[data-prueba=version]')?.textContent ?? ''), null, { timeout: 240000 });
paso('marca de corte en el segundo 5', { version: await p.textContent('[data-prueba=version]') }); await foto('8-sala-version-2');

const peticiones = [];
const oye = (q) => peticiones.push({ metodo: q.method(), host: new globalThis.URL(q.url()).host, ruta: new globalThis.URL(q.url()).pathname });
p.on('request', oye);
await p.click('[data-prueba=aprobar]');
await p.waitForFunction(() => /Aprobada por/.test(document.querySelector('[data-prueba=registro]')?.textContent ?? ''), null, { timeout: 60000 });
p.off('request', oye);
r.peticionesAlAprobar = peticiones;
paso('aprobar', { registro: (await p.textContent('[data-prueba=registro]'))?.replace(/reel-captura-\d+/, '…').slice(0, 220), hostsTocados: [...new Set(peticiones.map((x) => x.host))] });
await foto('9-aprobado');

await p.click('[data-prueba=cambiar-texto]');
await p.waitForFunction(() => /Versión 3/.test(document.querySelector('[data-prueba=version]')?.textContent ?? ''), null, { timeout: 240000 });
paso('editar revoca', { version: await p.textContent('[data-prueba=version]'), registro: (await p.textContent('[data-prueba=registro]'))?.replace(/reel-captura-\d+/, '…').slice(0, 260) });
await foto('10-editar-revoca');

const dueno = readdirSync(join(homedir(), '.reel', 'datos')).find((d) => lista(join(homedir(), '.reel', 'datos', d)).some((f) => f.startsWith(id)));
const carpeta = join(homedir(), '.reel', 'datos', dueno ?? '', id);
r.almacen.antes = lista(carpeta).filter((f) => !f.includes('/')).join(', ');
await p.click('[data-prueba=borrar]'); await p.waitForURL(/\/reel$/, { timeout: 30000 });
r.almacen.despues = lista(carpeta).length ? lista(carpeta).join(', ') : '(carpeta borrada)';
paso('borrar proyecto', r.almacen); await foto('11-borrado');
writeFileSync(`${OUT}/resultados.json`, JSON.stringify(r, null, 1));
await nav.close();
console.log('errores de consola:', r.erroresDeConsola.length);
