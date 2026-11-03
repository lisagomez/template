#!/usr/bin/env node
/**
 * Capturas de marca: toma cada ruta en claro y en oscuro, mide qué parte de la pantalla es naranja
 * y apunta toda petición de red que salga de localhost.
 *
 * POR QUÉ EXISTE. La guía de Turno 25 dice que el naranja ocupa menos del 10 % de una pantalla. Una
 * regla así, sin medir, es una opinión: aquí se mide sobre la captura real, en el navegador, píxel a
 * píxel. Y «cero salida de datos» solo se cree si el log de red lo enseña.
 *
 * QUÉ CUENTA COMO NARANJA. Un píxel con tono entre 10° y 40°, saturación ≥ 0,45 y luminosidad entre
 * 0,30 y 0,80 (HSL). Cubre toda la escala `--orange-300…800` y también el ámbar de los avisos: cuenta
 * de más, nunca de menos. La pantalla es el viewport (1280×800), no la página entera: la regla habla
 * de lo que ves.
 *
 * Uso: node scripts/marca/capturas.mjs --base http://localhost:3017 --salida <dir> --rutas /a,/b
 *      [--temas claro,oscuro] [--movimiento-reducido] [--json <archivo>]
 * Exit: 0 si todo se capturó y nada salió de localhost · 1 si alguna ruta falló o hubo red externa.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (nombre, defecto) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? defecto : process.argv[i + 1];
};
const base = arg('base', 'http://localhost:3000');
const salida = arg('salida', 'capturas');
const rutas = arg('rutas', '/').split(',').filter(Boolean);
const temas = arg('temas', 'claro,oscuro').split(',');
const reducido = process.argv.includes('--movimiento-reducido');
const archivoJson = arg('json', null);
const LOCAL = /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/|data:|blob:|about:)/;
const GUIA_VISTA = [
  'capa:laboratorio:capa/laboratorio/laboratorio/capa/primer-arranque',
  JSON.stringify({ version: 1, terminado: true, paso: 4, nivel: 'lo-importante', voz: false }),
];

/** Corre en el navegador: dibuja la captura en un canvas y cuenta los píxeles naranjas. */
async function proporcionNaranja(pagina, png) {
  return pagina.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let naranjas = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
      if (d === 0 || l < 0.3 || l > 0.8) continue;
      const s = d / (1 - Math.abs(2 * l - 1));
      let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
      if (s >= 0.45 && h >= 10 && h <= 40) naranjas++;
    }
    return naranjas / (data.length / 4);
  }, png.toString('base64'));
}

async function capturaUna(navegador, ruta, tema) {
  const contexto = await navegador.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: tema === 'oscuro' ? 'dark' : 'light',
    ...(reducido ? { reducedMotion: 'reduce' } : {}),
  });
  // La guía de primer arranque de la capa tapa la pantalla: se marca como vista, igual que hace
  // `recorrido-mesa.mjs` (clave = prefijo del almacén + memoria `capa/<producto>/<inquilino>/capa/`).
  await contexto.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } }, GUIA_VISTA);
  const pagina = await contexto.newPage();
  const externas = [];
  pagina.on('request', (p) => { if (!LOCAL.test(p.url())) externas.push(p.url()); });
  const errores = [];
  pagina.on('pageerror', (e) => errores.push(String(e.message).slice(0, 160)));
  pagina.on('console', (m) => { if (m.type() === 'error') errores.push(`consola: ${m.text().slice(0, 200)}`); });
  const respuesta = await pagina.goto(base + ruta, { waitUntil: 'networkidle', timeout: 120_000 });
  if (tema === 'oscuro') await pagina.evaluate(() => document.documentElement.classList.add('dark'));
  await pagina.waitForTimeout(400);
  const png = await pagina.screenshot();
  const nombre = `${ruta.replace(/^\/|\/$/g, '').replace(/[^a-z0-9-]+/gi, '_') || 'inicio'}-${tema}${reducido ? '-reducido' : ''}.png`;
  writeFileSync(join(salida, nombre), png);
  const naranja = await proporcionNaranja(pagina, png);
  await contexto.close();
  return { ruta, tema, estado: respuesta?.status() ?? 0, naranja, externas, errores, archivo: nombre };
}

mkdirSync(salida, { recursive: true });
const navegador = await chromium.launch();
const filas = [];
for (const ruta of rutas) for (const tema of temas) filas.push(await capturaUna(navegador, ruta, tema));
await navegador.close();

console.log('| ruta | tema | HTTP | % naranja | < 10 % | red fuera de localhost | errores de página |');
console.log('|---|---|---|---|---|---|---|');
for (const f of filas) {
  const pct = (f.naranja * 100).toFixed(2);
  console.log(`| ${f.ruta} | ${f.tema} | ${f.estado} | ${pct} % | ${f.naranja < 0.1 ? 'sí' : 'NO'} | ${f.externas.length} | ${f.errores.length} |`);
}
if (archivoJson) writeFileSync(archivoJson, JSON.stringify(filas, null, 2));
const mal = filas.filter((f) => f.estado >= 400 || f.estado === 0 || f.externas.length > 0);
for (const f of filas) for (const e of f.errores) console.log(`  · ${f.ruta} (${f.tema}): ${e}`);
for (const f of mal) console.log(`✗ ${f.ruta} (${f.tema}): HTTP ${f.estado}; externas: ${f.externas.slice(0, 3).join(', ') || '—'}`);
process.exit(mal.length ? 1 : 0);
