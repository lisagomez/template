#!/usr/bin/env node
/**
 * Capturas de la app con Playwright, en escritorio y celular, contra una app YA levantada:
 *
 *   node tools/crecimiento-demostrado/e2e/capturas.mjs [http://localhost:3017] [carpeta]
 *
 * Recorre: una respuesta demostrada con su árbol y su cascada; evidencia insuficiente; una
 * hipótesis causal con su experimento; la cascada de la tienda (también en tema oscuro); el replay;
 * y el laboratorio con sus estados. Falla si un estado no es el esperado o si la consola registra
 * un error. Datos sintéticos: nada sale de la máquina.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:3017';
const SALIDA = resolve(process.argv[3] ?? '.datos/capturas-crecimiento');
mkdirSync(SALIDA, { recursive: true });

const pregunta = (pyme, q, extra = '') => `${BASE}/crecimiento?pyme=${pyme}&q=${encodeURIComponent(q)}${extra}`;
const RECORRIDO = [
  { id: '01-demostrada-puente', url: pregunta('distribuidora', '¿De dónde salió el crecimiento del trimestre?'), estado: 'demostrada', ver: ['[data-prueba="arbol"]', '[data-prueba="cascada"]'] },
  { id: '02-evidencia-insuficiente', url: pregunta('distribuidora', '¿La caída de frecuencia de los mayoristas es real?'), estado: 'evidencia_insuficiente', ver: ['[data-prueba="no-afirma"]'] },
  { id: '03-hipotesis-causal', url: pregunta('distribuidora', '¿Debo subir precios 5 %?'), estado: 'hipotesis', ver: ['[data-prueba="propuesta"]'] },
  { id: '04-cascada-tienda', url: pregunta('tienda', '¿De dónde salió el crecimiento del trimestre?'), estado: 'demostrada', ver: ['[data-prueba="cascada"]'], oscuro: true },
  { id: '05-replay', url: pregunta('distribuidora', '¿El 70 % del crecimiento viene de la expansión?', '&replay=1'), estado: 'demostrada', ver: ['[data-prueba="replay"]'] },
  { id: '06-laboratorio', url: `${BASE}/laboratorio-crecimiento`, estado: null, ver: ['[data-prueba="trampas"]', '[data-prueba="sucios"]'] },
];
const DISPOSITIVOS = [{ nombre: 'escritorio', viewport: { width: 1280, height: 900 } }, { nombre: 'celular', viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 }];

const navegador = await chromium.launch();
const informe = [];
let fallas = 0;
for (const d of DISPOSITIVOS) {
  const contexto = await navegador.newContext({ viewport: d.viewport, isMobile: d.isMobile ?? false, deviceScaleFactor: d.deviceScaleFactor ?? 1, locale: 'es-MX' });
  for (const paso of RECORRIDO) {
    const pagina = await contexto.newPage();
    const errores = [];
    pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
    pagina.on('pageerror', (e) => errores.push(e.message));
    await pagina.goto(paso.url, { waitUntil: 'networkidle', timeout: 120_000 });
    if (paso.oscuro && d.nombre === 'escritorio') await pagina.evaluate(() => document.documentElement.classList.add('dark'));
    const estado = paso.estado ? await pagina.getAttribute('[data-prueba="respuesta"]', 'data-estado') : null;
    const visibles = await Promise.all(paso.ver.map((s) => pagina.locator(s).first().isVisible()));
    const archivo = join(SALIDA, `${paso.id}-${d.nombre}.png`);
    await pagina.screenshot({ path: archivo, fullPage: true });
    const ok = (paso.estado === null || estado === paso.estado) && visibles.every(Boolean) && errores.length === 0;
    if (!ok) fallas++;
    informe.push({ captura: `${paso.id}-${d.nombre}.png`, estado, esperado: paso.estado, visibles: paso.ver.filter((_, i) => visibles[i]), errores, ok });
    console.log(`${ok ? '✓' : '✕'} ${d.nombre.padEnd(10)} ${paso.id.padEnd(26)} estado=${estado ?? '—'} ${errores.length ? `errores=${errores.length}` : ''}`);
    await pagina.close();
  }
  await contexto.close();
}
await navegador.close();
writeFileSync(join(SALIDA, 'informe.json'), JSON.stringify(informe, null, 2));
console.log(`${informe.length - fallas}/${informe.length} capturas en ${SALIDA}`);
process.exit(fallas ? 1 : 0);
