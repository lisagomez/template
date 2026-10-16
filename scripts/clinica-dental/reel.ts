/**
 * El reel DUMMY de cada clinica sintetica: un MP4 vertical 1080×1920 con su promocion y sus servicios, sin red
 * (Chromium con toda la red bloqueada + ffmpeg determinista: el render de la casa, `render-video.ts`). Se renderiza
 * DOS veces para demostrar que sale el mismo archivo. Deja el MP4 donde lo lee el portal (`CLINICA_DATOS/reel`)
 * y la medicion (ffprobe, huellas, hoja de cuadros) en docs/goals/clinica-dental-medicion/.
 * Uso: node scripts/clinica-dental/reel.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CLINICAS } from '../../tools/clinica-dental/dist/index.js';
import { escenaDePromo } from '../../tools/pymes-marketing/dist/video/index.js';
import { capturaDeSitio, confirmaMarca } from '../../tools/pymes-marketing/dist/marca/index.js';
import { renderizaVideo, hojaDeCuadrosPng, ffprobeJson } from '../../src/features/estudio-pymes/services/servidor/render-video.ts';
import { DIR_REEL } from './rutas.ts';

const MEDICION = join(process.cwd(), 'docs/goals/clinica-dental-medicion');
await mkdir(DIR_REEL, { recursive: true });
await mkdir(MEDICION, { recursive: true });

/** Titular corto por promocion (el texto completo no cabe en tres lineas del formato historia). */
const TITULAR: Record<string, { titular: string; precio?: string }> = {
  'limpieza-noviembre': { titular: 'Limpieza dental: 20 % menos en noviembre' },
  'primera-visita': { titular: 'Tu primera valoración', precio: '$300' },
};

const resultados = [];
for (const c of CLINICAS) {
  const sitio = `<html><head><title>${c.nombre}</title><meta name="description" content="${c.lema}"><meta name="theme-color" content="${c.marca.primario}"><style>:root{--acento:${c.marca.acento}}</style></head></html>`;
  const marca = confirmaMarca(capturaDeSitio(sitio, `https://${c.dominio}`));
  const promo = c.promociones[0]!;
  const t = TITULAR[promo.id] ?? { titular: promo.texto.slice(0, 40) };
  const escena = escenaDePromo(marca, {
    titular: t.titular,
    apoyo: 'Ortodoncia · endodoncia · implantes',
    ...(t.precio ? { precio: t.precio } : {}),
    etiqueta: 'Clínica sintética · laboratorio',
    semilla: `reel-${c.id}`,
  });
  const a = await renderizaVideo(escena);
  const b = await renderizaVideo(escena);
  await writeFile(join(DIR_REEL, `${c.id}.mp4`), a.mp4);
  await writeFile(join(MEDICION, `reel-${c.id}.hoja.png`), await hojaDeCuadrosPng(a.mp4, escena.duracion));
  resultados.push({ clinica: c.id, bytes: a.mp4.length, cuadros: a.cuadros, duracion: escena.duracion, ffprobe: await ffprobeJson(a.mp4), huellas: [a.huella, b.huella].map((h) => `sha256:${h}`), iguales: a.huella === b.huella, msRender: [a.ms, b.ms] });
}
const medicion = { cuando: new Date().toISOString(), red: 'bloqueada (Chromium con route abort, ffmpeg local)', resultados };
await writeFile(join(MEDICION, 'reel.json'), `${JSON.stringify(medicion, null, 2)}\n`);
console.log(JSON.stringify(medicion, null, 2));
if (!resultados.every((r) => r.iguales && r.bytes < 50 * 1024 * 1024)) process.exit(1);
