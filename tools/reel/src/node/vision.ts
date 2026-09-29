/** Caras (YuNet por OpenCV, auxiliar en Python) y lectura de pantalla (Tesseract). Local; solo DÓNDE, nunca QUIÉN. */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DeteccionCara, HallazgoPantalla } from '../tipos.js';
import { datosEnTexto } from '../privacidad.js';
import { corre } from './ffmpeg.js';

const AUXILIAR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'python', 'caras.py');

/** `escala`: los cuadros se muestrean reducidos; las cajas se devuelven en píxeles del cuadro 1080×1920. */
export async function detectaCaras(o: { modelo: string; python?: string; umbral?: number }, cuadros: ReadonlyArray<{ ruta: string; t: number }>, escala: number): Promise<DeteccionCara[]> {
  if (!cuadros.length) return [];
  const s = await corre(o.python ?? 'python3', [AUXILIAR, o.modelo, String(o.umbral ?? 0.6), ...cuadros.map((c) => c.ruta)]);
  if (s.codigo !== 0) throw new Error(`detección de caras falló: ${s.stderr.slice(-400)}`);
  const lista = JSON.parse(s.stdout.toString()) as Array<{ archivo: string; caras: Array<{ x: number; y: number; ancho: number; alto: number; confianza: number }> }>;
  return lista.flatMap((l, i) => (l.caras).map((c) => ({
    t: cuadros[i]?.t ?? 0, confianza: c.confianza,
    x: Math.round(c.x * escala), y: Math.round(c.y * escala), ancho: Math.round(c.ancho * escala), alto: Math.round(c.alto * escala),
  })));
}

/** Líneas de texto con su caja, desde el TSV de Tesseract. */
export function lineasDeTsv(tsv: string): Array<{ texto: string; x: number; y: number; ancho: number; alto: number }> {
  const grupos = new Map<string, { palabras: string[]; x0: number; y0: number; x1: number; y1: number }>();
  for (const fila of tsv.split('\n').slice(1)) {
    const c = fila.split('\t');
    if (c.length < 12 || c[0] !== '5' || !(c[11] ?? '').trim() || Number(c[10]) < 30) continue;
    const clave = `${c[2]}-${c[3]}-${c[4]}`;
    const [x, y, w, h] = [Number(c[6]), Number(c[7]), Number(c[8]), Number(c[9])];
    const g = grupos.get(clave) ?? { palabras: [], x0: x, y0: y, x1: x + w, y1: y + h };
    g.palabras.push((c[11] ?? '').trim()); g.x0 = Math.min(g.x0, x); g.y0 = Math.min(g.y0, y); g.x1 = Math.max(g.x1, x + w); g.y1 = Math.max(g.y1, y + h);
    grupos.set(clave, g);
  }
  return [...grupos.values()].map((g) => ({ texto: g.palabras.join(' '), x: g.x0, y: g.y0, ancho: g.x1 - g.x0, alto: g.y1 - g.y0 }));
}

export async function leePantalla(o: { tesseract?: string; idioma?: string }, cuadros: ReadonlyArray<{ ruta: string; t: number }>, escala: number): Promise<HallazgoPantalla[]> {
  const salida: HallazgoPantalla[] = [];
  for (const c of cuadros) {
    const s = await corre(o.tesseract ?? 'tesseract', [c.ruta, 'stdout', '-l', o.idioma ?? 'spa', '--psm', '11', 'tsv']);
    if (s.codigo !== 0) throw new Error(`lectura de pantalla falló: ${s.stderr.slice(-300)}`);
    for (const l of lineasDeTsv(s.stdout.toString())) {
      for (const d of datosEnTexto(l.texto)) {
        salida.push({ t: c.t, tipo: d.tipo, muestra: d.muestra, caja: { x: Math.round(l.x * escala), y: Math.round(l.y * escala), ancho: Math.round(l.ancho * escala), alto: Math.round(l.alto * escala) } });
      }
    }
  }
  return salida;
}
