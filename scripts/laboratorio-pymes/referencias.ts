/**
 * Regenera las REFERENCIAS del laboratorio visual: la huella de cada pieza (SVG) y del sonido en
 * src/features/laboratorio-pymes/datos/referencias.json, y su imagen PNG (Chromium sin ventana y sin
 * red) en public/laboratorio-pymes/referencias/. Correrlo ES aprobar el aspecto actual: se hace a
 * propósito, con el diff de las imágenes a la vista, nunca para que una prueba pase.
 * Uso: node scripts/laboratorio-pymes/referencias.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { piezasDeReferencia, sonidoDeReferencia, sha256 } from '../../src/features/laboratorio-pymes/services/referencias-visuales.ts';

const raiz = process.cwd();
const dirPng = join(raiz, 'public/laboratorio-pymes/referencias');
await mkdir(dirPng, { recursive: true });
const piezas = piezasDeReferencia();
const huellas: Record<string, string> = {};
// Con prefijo `sha256:`: un hex de 64 suelto tiene forma de credencial para la auditoría de secretos.
for (const p of piezas) huellas[p.id] = `sha256:${await sha256(p.svg)}`;
huellas['video-sonido'] = `sha256:${await sha256(sonidoDeReferencia())}`;

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ deviceScaleFactor: 1 });
await pagina.route('**/*', (r) => (r.request().url().startsWith('data:') ? r.continue() : r.abort()));
for (const p of piezas) {
  const [, w, h] = /viewBox="0 0 (\d+) (\d+)"/.exec(p.svg)!;
  await pagina.setViewportSize({ width: Number(w), height: Number(h) });
  await pagina.setContent(`<!doctype html><body style="margin:0">${p.svg}</body>`);
  await pagina.screenshot({ path: join(dirPng, `${p.id}.png`), clip: { x: 0, y: 0, width: Number(w), height: Number(h) } });
}
await navegador.close();
await writeFile(join(raiz, 'src/features/laboratorio-pymes/datos/referencias.json'), `${JSON.stringify({ _comentario: 'Huellas SHA-256 de las piezas de referencia. Se regeneran A PROPÓSITO con npm run contenido:referencias.', generadas: new Date().toISOString().slice(0, 10), huellas }, null, 2)}\n`);
console.log(`${piezas.length} piezas + sonido: huellas y PNG de referencia escritos`);
for (const [id, h] of Object.entries(huellas)) console.log(`  ${id.padEnd(22)} ${h.slice(0, 23)}…`);
