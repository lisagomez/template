/**
 * Corre el reel de punta a punta sobre los clips sintéticos (una trampa firmada por caso) y deja la
 * medición para el laboratorio: public/laboratorio-pymes/reel/medicion.json + hojas de cuadros.
 * Uso: node scripts/reel/laboratorio.ts [caso…]   (sin casos: todos, y el limpio dos veces)
 */
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { procesa, type ResultadoDeProceso } from '../../tools/reel/dist/node/index.js';
import { motores } from './motores.ts';
import { CASOS, generaCaso, type Caso } from './sinteticos.ts';

const RAIZ = process.env['REEL_LABORATORIO'] ?? join(homedir(), '.reel', 'laboratorio');
const PUBLICO = join(process.cwd(), 'public', 'laboratorio-pymes', 'reel');
export const MARCA = { nombre: 'Panadería La Espiga', colores: { primario: '#7a4a1e', texto: '#ffffff' }, tipografia: 'sans' as const };
/** El diccionario del negocio corrige nombres antes de ponerlos en pantalla (el transcriptor oyó «Spica»). */
export const DICCIONARIO = { spica: 'Espiga' };
export const CATALOGO = [{ nombre: 'pan de muerto', precio: 45 }, { nombre: 'concha', precio: 12 }];

function resumen(caso: string, r: ResultadoDeProceso) {
  return {
    caso, estado: r.estado,
    bruto: { ancho: r.bruto.medidas.ancho, alto: r.bruto.medidas.alto, duracion: r.bruto.medidas.duracion, ubicacion: r.bruto.ubicacion },
    ubicacionTrasIngesta: r.ubicacionTrasIngesta,
    texto: r.transcripcion?.texto ?? null, palabras: r.transcripcion?.palabras.length ?? 0,
    descartes: r.edl?.descartes ?? [], hablantes: r.hablantes ?? null, musica: r.musica ?? null,
    pistas: r.pistas?.map((p) => ({ id: p.id, presencia: Number(p.presencia.toFixed(2)), area: Math.round(p.areaMedia), esSujeto: p.id === r.sujetoId })) ?? [],
    hallazgos: r.hallazgos?.map((h) => ({ t: h.t, tipo: h.tipo, muestra: h.muestra })) ?? [],
    observaciones: r.observaciones,
    master: r.master ? { huella: r.master.huella, medidas: r.master.medidas, lufs: r.master.lufs, qa: r.master.qa } : null,
    ms: r.ms,
  };
}

const pedidos = (process.argv.slice(2) as Caso[]).filter((c) => CASOS.includes(c));
const casos = pedidos.length ? pedidos : [...CASOS];
const salida: Record<string, ReturnType<typeof resumen>> = {};
for (const caso of [...casos, ...(pedidos.length ? [] : ['limpio-2' as const])]) {
  const base = caso === 'limpio-2' ? 'limpio' : caso;
  const carpeta = join(RAIZ, caso);
  const t0 = performance.now();
  const { bruto } = generaCaso(base, carpeta);
  const r = await procesa({ bruto, carpeta, marca: MARCA, catalogo: CATALOGO, consentimientos: [], hoy: '2026-09-27', diccionario: DICCIONARIO }, motores());
  salida[caso] = resumen(caso, r);
  console.log(`${caso}: ${r.estado} · ${r.observaciones.filter((o) => o.nivel === 'bloquea').map((o) => o.regla).join(', ') || 'sin bloqueos'} · ${(performance.now() - t0) / 1000 | 0} s`);
}
mkdirSync(PUBLICO, { recursive: true });
const previo = (() => { try { return JSON.parse(readFileSync(join(PUBLICO, 'medicion.json'), 'utf8')) as { casos: Record<string, unknown> }; } catch { return { casos: {} }; } })();
const casosTodos = { ...previo.casos, ...salida } as Record<string, ReturnType<typeof resumen>>;
const a = casosTodos['limpio']?.master?.huella, b = casosTodos['limpio-2']?.master?.huella;
writeFileSync(join(PUBLICO, 'medicion.json'), JSON.stringify({ cuando: new Date().toISOString(), deterministico: a && b ? a === b : null, casos: casosTodos }, null, 1));
for (const c of ['limpio', 'cliente-al-fondo', 'ticket-telefono']) {
  try { copyFileSync(join(RAIZ, c, 'hoja.png'), join(PUBLICO, `${c}.hoja.png`)); } catch { /* ese caso no llegó a máster */ }
}
if (statSync(join(RAIZ, 'limpio', 'master.mp4'), { throwIfNoEntry: false })?.size ?? Infinity < 6_000_000) copyFileSync(join(RAIZ, 'limpio', 'master.mp4'), join(PUBLICO, 'limpio.mp4'));
console.log('determinista:', a && b ? a === b : 'sin doble render');
