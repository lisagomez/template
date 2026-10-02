/** El reel de punta a punta, en el servidor: del clip del celular al máster con su QA. Nada sale de la máquina. */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Consentimiento, Desenfoque, HallazgoPantalla, MarcaDeNegocio, Marca, Medidas, Observacion, PistaCara, ProductoDeCatalogo, Transcripcion } from '../tipos.js';
import { propone, duracionEditada, type Edl } from '../cortes.js';
import { cotejaPrecios } from '../precios.js';
import { archivoAss, rotulos as armaRotulos, rotulosFueraDeZona, type Rotulo } from '../subtitulos.js';
import { agrupaHallazgos, carasSinCubrir, cortesEnVozAjena, desenfoquesDeCaras, fusiona, pistasDeCaras, revisaPrivacidad, sujeto, type CorteEnVozAjena } from '../privacidad.js';
import { sonidoEnPausas } from '../audio.js';
import { argumentosDeMedicion, argumentosDelMaster, leeMedidaDeVolumen, type Master } from '../master.js';
import { hayBloqueo, revisaMaster } from '../qa.js';
import { aplicaCortes, aplicaTextos } from '../sala.js';
import { audio, corre, cuadros, hojaDeCuadros, huella, lufs, mide, normaliza } from './ffmpeg.js';
import { creaTranscriptorParakeet, type ModuloSherpa } from './transcriptor.js';
import { cuentaHablantes, type Diarizacion } from './hablantes.js';
import { detectaCaras, leePantalla } from './vision.js';

export interface Motores { sherpa: ModuloSherpa; ort: unknown; diarizacion: Diarizacion; parakeet: string; hablante: string; yunet: string; python?: string; tesseract?: string; umbralHablantes?: number }
/** `revisados`: claves de los cortes en voz ajena que el dueño confirmó en la sala (opcional: las decisiones
 *  anteriores al riesgo 5 no lo traen). */
export interface Decisiones { marcas: Marca[]; conConsentimiento: number[]; cubiertos: number[]; revisados?: string[] }
export interface EntradaDeProceso {
  bruto: string; carpeta: string; marca: MarcaDeNegocio; catalogo: ProductoDeCatalogo[];
  consentimientos: Consentimiento[]; hoy: string; diccionario?: Record<string, string>; decisiones?: Decisiones;
}
export interface MasterHecho { ruta: string; huella: string; medidas: Medidas; lufs: number | null; qa: Observacion[] }
export interface ResultadoDeProceso {
  estado: 'bloqueado' | 'borrador';
  bruto: { medidas: Medidas; ubicacion: string[] };
  ubicacionTrasIngesta: string[];
  transcripcion?: Transcripcion; edl?: Edl; rotulos?: Rotulo[]; pistas?: PistaCara[]; sujetoId?: number | null;
  hablantes?: number; musica?: { fraccion: number; segundos: number }; hallazgos?: HallazgoPantalla[];
  cortesEnVozAjena?: Array<CorteEnVozAjena & { revisado: boolean }>;
  observaciones: Observacion[]; master?: MasterHecho; ms: Record<string, number>;
}

const ES_UBICACION = /location|gps|©xyz|xyz|latitude|longitude/i;
const ubicacionEn = (etiquetas: Record<string, string>): string[] => Object.keys(etiquetas).filter((k) => ES_UBICACION.test(k));

async function cronometra<T>(ms: Record<string, number>, paso: string, f: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  try { return await f(); } finally { ms[paso] = Math.round(performance.now() - t0); }
}

export async function procesa(e: EntradaDeProceso, motores: Motores): Promise<ResultadoDeProceso> {
  const ms: Record<string, number> = {};
  await mkdir(e.carpeta, { recursive: true });
  const d = e.decisiones ?? { marcas: [], conConsentimiento: [], cubiertos: [] };
  const b = await mide(e.bruto);
  const bruto = { medidas: b.medidas, ubicacion: ubicacionEn(b.etiquetas) };
  if (b.medidas.ancho > b.medidas.alto) {
    const obs = revisaPrivacidad({ medidas: b.medidas, pistas: [], sujetoId: null, hablantes: 0, consentimientos: [], hoy: e.hoy, hallazgos: [], musica: { fraccion: 0, segundos: 0 } });
    return { estado: 'bloqueado', bruto, ubicacionTrasIngesta: bruto.ubicacion, observaciones: obs, ms };
  }
  const norm = join(e.carpeta, 'normalizado.mov');
  await cronometra(ms, 'ingesta', () => normaliza(e.bruto, norm));
  const n = await mide(norm);
  const voz = await audio(norm, 16_000);
  const tr = await cronometra(ms, 'transcripcion', () => creaTranscriptorParakeet({ sherpa: motores.sherpa, carpeta: motores.parakeet }).transcribe(voz, 16_000));
  await writeFile(join(e.carpeta, 'transcripcion.json'), JSON.stringify(tr, null, 1));
  const edl = aplicaCortes(propone(tr.palabras, n.medidas.duracion), d.marcas);
  const rs = aplicaTextos(armaRotulos(tr.palabras, edl, e.diccionario), d.marcas);
  const h = await cronometra(ms, 'hablantes', () => cuentaHablantes({ diarizacion: motores.diarizacion, ort: motores.ort, modelo: motores.hablante, ...(motores.umbralHablantes !== undefined ? { umbral: motores.umbralHablantes } : {}) }, voz, tr.palabras));
  const cortesVoz = cortesEnVozAjena(h.turnos, edl, h.hablantes);
  const revisados = new Set(d.revisados ?? []);
  const musica = sonidoEnPausas(voz, 16_000, tr.palabras);
  const muestrasCaras = await cuadros(norm, join(e.carpeta, 'cuadros', 'caras'), 0.5);
  const caras = await cronometra(ms, 'caras', () => detectaCaras({ modelo: motores.yunet, ...(motores.python ? { python: motores.python } : {}) }, muestrasCaras, 2));
  const muestrasTexto = await cuadros(norm, join(e.carpeta, 'cuadros', 'texto'), 1, 1080);
  const hallazgos = await cronometra(ms, 'pantalla', () => leePantalla({ ...(motores.tesseract ? { tesseract: motores.tesseract } : {}) }, muestrasTexto, 1));
  const pistas = pistasDeCaras(caras, muestrasCaras.length);
  const suj = sujeto(pistas);
  const observaciones = [
    ...revisaPrivacidad({ medidas: n.medidas, pistas, sujetoId: suj?.id ?? null, hablantes: h.hablantes, consentimientos: e.consentimientos, hoy: e.hoy, hallazgos, cubiertos: new Set(d.cubiertos), musica, cortesEnVozAjena: cortesVoz, revisados }),
    ...cotejaPrecios(tr.palabras, e.catalogo),
  ];
  const coberturas: Desenfoque[] = agrupaHallazgos(hallazgos).filter((_, i) => d.cubiertos.includes(i)).map((g) => ({ inicio: Math.max(0, g.desde - 1), fin: g.hasta + 1, caja: g.caja, motivo: 'pantalla' }));
  const master: Master = { version: 1, edl, desenfoques: fusiona([...desenfoquesDeCaras(pistas, suj?.id ?? null, new Set(d.conConsentimiento)), ...coberturas]), rotulos: rs, marca: e.marca, lufs: -14 };
  const hecho = await cronometra(ms, 'master', () => componeMaster(master, norm, e.carpeta, suj?.detecciones ?? [], motores));
  await writeFile(join(e.carpeta, 'master.json'), JSON.stringify({ master, decisiones: d }, null, 1));
  const base = { bruto, ubicacionTrasIngesta: ubicacionEn(n.etiquetas), transcripcion: tr, edl, rotulos: rs, pistas, sujetoId: suj?.id ?? null, hablantes: h.hablantes, musica, hallazgos, cortesEnVozAjena: cortesVoz.map((c) => ({ ...c, revisado: revisados.has(c.clave) })), master: hecho, ms };
  return { ...base, estado: hayBloqueo([...observaciones, ...hecho.qa]) ? 'bloqueado' : 'borrador', observaciones };
}

/** Compone el máster (dos pasos de volumen), lo revisa con los mismos motores y deja su hoja de cuadros. */
export async function componeMaster(m: Master, entrada: string, carpeta: string, sujetoCajas: ReadonlyArray<{ x: number; y: number; ancho: number; alto: number }>, motores: Motores): Promise<MasterHecho> {
  await writeFile(join(carpeta, 'rotulos.ass'), archivoAss(m.rotulos, m.marca));
  const medida = leeMedidaDeVolumen((await corre('ffmpeg', argumentosDeMedicion(m, entrada))).stderr);
  if (!medida) throw new Error('no se pudo medir el volumen del audio cortado');
  const salida = join(carpeta, 'master.mp4');
  const s = await corre('ffmpeg', argumentosDelMaster(m, { entrada, ass: 'rotulos.ass', salida }, medida), carpeta);
  if (s.codigo !== 0) throw new Error(`no se pudo componer el máster: ${s.stderr.slice(-600)}`);
  const med = (await mide(salida)).medidas;
  const vol = await lufs(salida);
  const c = await cuadros(salida, join(carpeta, 'cuadros', 'master'), 0.5);
  const quedan = carasSinCubrir(await detectaCaras({ modelo: motores.yunet, ...(motores.python ? { python: motores.python } : {}) }, c, 2), sujetoCajas);
  const t = await cuadros(salida, join(carpeta, 'cuadros', 'master-texto'), 1, 1080);
  const datos = await leePantalla({ ...(motores.tesseract ? { tesseract: motores.tesseract } : {}) }, t, 1);
  await hojaDeCuadros(salida, join(carpeta, 'hoja.png'), med.duracion);
  const qa = revisaMaster({ medidas: med, lufs: vol, carasSinCubrir: quedan.length, datosEnPantalla: datos.length, rotulosFueraDeZona: rotulosFueraDeZona(m.rotulos).length });
  return { ruta: salida, huella: await huella(salida), medidas: { ...med, duracion: Math.round(med.duracion * 1000) / 1000 }, lufs: vol, qa };
}

export const duracionDelReel = (edl: Edl): number => Math.round(duracionEditada(edl) * 100) / 100;
