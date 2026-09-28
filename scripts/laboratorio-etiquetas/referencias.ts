/**
 * Regenera las REFERENCIAS del laboratorio de etiquetas: la huella del SVG y del ZPL de cada pieza
 * (caja, tarima, ubicación) en src/features/laboratorio-etiquetas/datos/referencias.json, y el SVG en
 * public/laboratorio-etiquetas/referencias/. Correrlo ES aprobar el aspecto actual: se hace a
 * propósito, con el diff de los SVG y del ZPL a la vista, nunca para que una prueba pase.
 * Uso: npm run etiquetas:referencias
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { piezasDeReferencia, sha256 } from '../../src/features/laboratorio-etiquetas/services/referencias.ts';

const raiz = process.cwd();
const dirSvg = join(raiz, 'public/laboratorio-etiquetas/referencias');
await mkdir(dirSvg, { recursive: true });
const huellas: Record<string, string> = {};
for (const p of piezasDeReferencia()) {
  // Con prefijo `sha256:`: un hex de 64 suelto tiene forma de credencial para la auditoría de secretos.
  huellas[`${p.id}-svg`] = `sha256:${await sha256(p.svg)}`;
  huellas[`${p.id}-zpl`] = `sha256:${await sha256(p.zpl)}`;
  await writeFile(join(dirSvg, `${p.id}.svg`), p.svg);
  await writeFile(join(dirSvg, `${p.id}.zpl`), p.zpl);
}
const salida = { _comentario: 'Huellas SHA-256 del SVG y del ZPL de las piezas de referencia. Se regeneran A PROPÓSITO con npm run etiquetas:referencias.', generadas: new Date().toISOString().slice(0, 10), huellas };
await writeFile(join(raiz, 'src/features/laboratorio-etiquetas/datos/referencias.json'), `${JSON.stringify(salida, null, 2)}\n`);
console.log(Object.entries(huellas).map(([k, v]) => `${k.padEnd(14)} ${v.slice(0, 23)}…`).join('\n'));
