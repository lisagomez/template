/**
 * Render del video de referencia del laboratorio: la promo de Día de Muertos del negocio de ejemplo,
 * DOS veces, para demostrar que sale el mismo archivo. Deja en public/laboratorio-pymes/video/ el MP4,
 * la hoja de cuadros y medicion.json (ffprobe, huellas, tiempos). Datos sintéticos.
 * Uso: node scripts/laboratorio-pymes/video.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { escenaDePromo } from '../../tools/pymes-marketing/dist/video/index.js';
import { capturaDeSitio, confirmaMarca } from '../../tools/pymes-marketing/dist/marca/index.js';
import { SITIO_DEMO, NEGOCIO_DEMO } from '../../src/features/laboratorio-pymes/datos/demo.ts';
import { renderizaVideo, hojaDeCuadrosPng, ffprobeJson } from '../../src/features/estudio-pymes/services/servidor/render-video.ts';

const SALIDA = join(process.cwd(), 'public/laboratorio-pymes/video');
await mkdir(SALIDA, { recursive: true });
const marca = confirmaMarca(capturaDeSitio(SITIO_DEMO, NEGOCIO_DEMO.sitio));
const escena = escenaDePromo(marca, { titular: 'Día de Muertos', apoyo: 'Pan de muerto', precio: '$45.00', etiqueta: 'Temporada', semilla: 'promo-dia-de-muertos' });
const a = await renderizaVideo(escena);
const b = await renderizaVideo(escena);
await writeFile(join(SALIDA, 'promo-dia-de-muertos.mp4'), a.mp4);
await writeFile(join(SALIDA, 'promo-dia-de-muertos.hoja.png'), await hojaDeCuadrosPng(a.mp4, escena.duracion));
const medicion = {
  cuando: new Date().toISOString(), escena: { duracion: escena.duracion, fps: escena.fps, capas: escena.capas.length },
  ffprobe: await ffprobeJson(a.mp4), huellas: [a.huella, b.huella].map((h) => `sha256:${h}`), iguales: a.huella === b.huella,
  bytes: a.mp4.length, cuadros: a.cuadros, msRender: [a.ms, b.ms],
};
await writeFile(join(SALIDA, 'medicion.json'), JSON.stringify(medicion, null, 2));
console.log(JSON.stringify(medicion, null, 2));
if (!medicion.iguales) process.exit(1);
