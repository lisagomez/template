#!/usr/bin/env node
/**
 * Recorrido del banco de motores en un navegador real: cada paso usa la pantalla como la usaría alguien
 * (elige función, carga un ejemplo sintético, corre) y deja su captura. Apunta toda petición de red que salga
 * de localhost: el banco promete CERO.
 *
 * Uso: node scripts/banco/recorrido.mjs --base http://localhost:3017 --salida <dir> [--tema claro|oscuro] [--movimiento-reducido]
 * Exit: 0 si todos los pasos dieron lo esperado y no hubo red externa · 1 si no.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const base = arg('base', 'http://localhost:3000');
const salida = arg('salida', 'capturas-banco');
const tema = arg('tema', 'claro');
const reducido = process.argv.includes('--movimiento-reducido');
const LOCAL = /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/|data:|blob:|about:)/;
const GUIA = ['capa:laboratorio:capa/laboratorio/laboratorio/capa/primer-arranque', JSON.stringify({ version: 1, terminado: true, paso: 4, nivel: 'lo-importante', voz: false })];

/** Cada paso: qué función, qué ejemplo (o qué escribir) y qué debe aparecer. */
const PASOS = [
  { nombre: 'ocr-factura', funcion: 'ocr-tesseract', ejemplo: 'factura-sintetica', espera: '[data-prueba="salida-texto"]' },
  { nombre: 'gs1-digital-link', funcion: 'codigo-gs1', ejemplo: 'digital-link', espera: '[data-prueba="salida-elementos"]' },
  { nombre: 'peor-caso-nombres', funcion: 'peor-caso', ejemplo: 'nombres', espera: '[data-prueba="salida-datos"]' },
  { nombre: 'peor-caso-textos', funcion: 'peor-caso', ejemplo: 'nombres', selecciona: { campo: 'familia', valor: 'textos' }, espera: '[data-prueba="salida-datos"]' },
  { nombre: 'peor-caso-etiquetas', funcion: 'peor-caso', ejemplo: 'nombres', selecciona: { campo: 'familia', valor: 'etiquetas' }, espera: '[data-prueba="salida-datos"]' },
  { nombre: 'entrada-invalida', funcion: 'peor-caso', ejemplo: 'cifras', escribe: { campo: 'semilla', valor: '-3' }, espera: '[data-prueba="fallo"][data-etapa="entrada"]' },
];

async function correPaso(pagina, p) {
  await pagina.click(`[data-prueba="funcion-${p.funcion}"]`);
  await pagina.click(`[data-prueba="ejemplo-${p.ejemplo}"]`);
  if (p.selecciona) await pagina.selectOption(`#banco-${p.selecciona.campo}`, p.selecciona.valor);
  if (p.escribe) await pagina.fill(`#banco-${p.escribe.campo}`, p.escribe.valor);
  await pagina.waitForTimeout(300);
  await pagina.click('[data-prueba="correr"]');
  await pagina.waitForSelector(p.espera, { timeout: 120_000 });
  await pagina.waitForTimeout(250);
  const archivo = `${p.nombre}-${tema}${reducido ? '-reducido' : ''}.png`;
  await pagina.screenshot({ path: join(salida, archivo), fullPage: true });
  const nota = await pagina.locator('[data-prueba="salida"]').innerText();
  // ¿Algo se sale de su caja? Un bloque cuyo contenido es más ancho que el bloque es un desborde.
  // Cuenta también lo que se esconde tras un scroll horizontal DENTRO del bloque (una tabla en overflow-x-auto).
  // No cuentan los recortes A PROPÓSITO: la etiqueta con elipsis y lo que solo existe para lectores de pantalla.
  const desbordes = await pagina.locator('[data-bloque], [data-bloque] *').evaluateAll((els) => els
    .filter((e) => e.clientWidth > 2 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow !== 'ellipsis')
    .map((e) => `${e.tagName.toLowerCase()}${e.closest('[data-prueba]') ? `@${e.closest('[data-prueba]').getAttribute('data-prueba')}` : ''}`));
  if (desbordes.length) return { paso: p.nombre, ok: false, archivo: archivo, nota: `desbordados: ${[...new Set(desbordes)].join(', ')}` };
  return { paso: p.nombre, ok: true, archivo, nota: nota.replace(/\s+/g, ' ').slice(0, 140) };
}

mkdirSync(salida, { recursive: true });
const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: tema === 'oscuro' ? 'dark' : 'light', ...(reducido ? { reducedMotion: 'reduce' } : {}) });
await contexto.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } }, GUIA);
const pagina = await contexto.newPage();
const externas = [];
const peticiones = [];
pagina.on('request', (r) => { peticiones.push(r.url()); if (!LOCAL.test(r.url())) externas.push(r.url()); });
await pagina.goto(`${base}/laboratorio-banco`, { waitUntil: 'networkidle', timeout: 120_000 });
if (tema === 'oscuro') await pagina.evaluate(() => document.documentElement.classList.add('dark'));
const filas = [];
for (const p of PASOS) {
  try { filas.push(await correPaso(pagina, p)); } catch (e) { filas.push({ paso: p.nombre, ok: false, archivo: '—', nota: String(e.message).slice(0, 140) }); }
}
await navegador.close();

console.log(`| paso (${tema}${reducido ? ', movimiento reducido' : ''}) | ¿dio lo esperado? | captura | lo que mostró la salida |`);
console.log('|---|---|---|---|');
for (const f of filas) console.log(`| ${f.paso} | ${f.ok ? 'sí' : 'NO'} | ${f.archivo} | ${f.nota} |`);
const hosts = [...new Set(peticiones.map((u) => { try { return new URL(u).host; } catch { return u.slice(0, 20); } }))];
console.log(`\nRed: ${peticiones.length} peticiones a ${hosts.join(', ')} · fuera de localhost: ${externas.length}`);
for (const u of externas.slice(0, 5)) console.log(`✗ externa: ${u}`);
process.exit(filas.every((f) => f.ok) && externas.length === 0 ? 0 : 1);
