/**
 * Fotos del lado del servidor: normalizar (sharp: orientar, quitar EXIF y GPS, reducir), guardar
 * por huella en ETIQUETAS_DATOS/fotos, recortar la guia de encuadre y leer la fecha con el motor
 * LOCAL (RapidOCR por proceso) si esta instalado. Nada sale de la maquina.
 *
 * ETIQUETAS_MOTOR_PYTHON: el Python del entorno que deja `tools/etiquetas-gs1/motores/instala-rapidocr.sh`.
 * Sin el, no hay propuesta: la persona teclea la fecha y la foto queda igual como evidencia.
 */
import { resolve, join } from 'node:path';
import sharp from 'sharp';
import { fotosEnCarpeta } from '../../../../../tools/etiquetas-gs1/dist/almacenes/fotos.js';
import { preparaImagenes, type FabricaImagen } from '../../../../../tools/etiquetas-gs1/dist/imagenes.js';
import { motorPorProceso } from '../../../../../tools/etiquetas-gs1/dist/motores/proceso.js';
import { huellaDeBytes, metadatosDeJpeg, rechazoDeImagen, tipoDeImagen, type AlmacenFotos, type MotorFechas } from '../nucleo.ts';

let almacen: AlmacenFotos | undefined;
let motor: MotorFechas | null | undefined;

export const imagenes = preparaImagenes(sharp as unknown as FabricaImagen);

export function fotosDelServidor(): AlmacenFotos {
  // turbopackIgnore: la carpeta se decide en tiempo de ejecucion (aprendizaje del 2026-09-20).
  if (!almacen) almacen = fotosEnCarpeta(join(/*turbopackIgnore: true*/ resolve(/*turbopackIgnore: true*/ process.env['ETIQUETAS_DATOS'] || '.datos/etiquetas'), 'fotos'));
  return almacen;
}

/** El motor local, o `null` si no esta instalado (se dice en pantalla; no es un error). */
export function motorDelServidor(): MotorFechas | null {
  if (motor !== undefined) return motor;
  const python = process.env['ETIQUETAS_MOTOR_PYTHON'];
  const script = process.env['ETIQUETAS_MOTOR_SCRIPT'] || resolve(/*turbopackIgnore: true*/ process.cwd(), 'tools/etiquetas-gs1/motores/rapidocr-json.py');
  motor = python ? motorPorProceso({ comando: python, argumentos: [script] }) : null;
  return motor;
}

export interface FotoSubida {
  readonly huella: string;
  readonly miniatura: string;
  readonly ancho: number;
  readonly alto: number;
  /** Lo que traia el archivo y se le quito: se ensena para que se vea que se hizo. */
  readonly exifQuitado: boolean;
  readonly gpsQuitado: boolean;
}

/** Normaliza y guarda. El archivo original (con su EXIF) nunca toca el disco. */
export async function subeFoto(bytes: Uint8Array): Promise<FotoSubida | { error: string }> {
  const rechazo = rechazoDeImagen(bytes);
  if (rechazo) return { error: `la foto ${rechazo}` };
  const antes = metadatosDeJpeg(bytes);
  const n = await imagenes.normaliza(bytes);
  const fotos = fotosDelServidor();
  const [huella, miniatura] = await Promise.all([fotos.guarda(n.jpeg, 'jpeg'), fotos.guarda(n.miniatura, 'jpeg')]);
  return { huella, miniatura, ancho: n.ancho, alto: n.alto, exifQuitado: antes.exif && !metadatosDeJpeg(n.jpeg).exif, gpsQuitado: antes.gps && !metadatosDeJpeg(n.jpeg).gps };
}

/** Lee una foto guardada y sus dimensiones. */
export async function fotoGuardada(huella: string): Promise<{ bytes: Uint8Array; ancho: number; alto: number } | undefined> {
  const f = await fotosDelServidor().lee(huella);
  if (!f) return undefined;
  const m = await sharp(f.bytes).metadata();
  return { bytes: f.bytes, ancho: m.width ?? 0, alto: m.height ?? 0 };
}

export const esImagen = (b: Uint8Array): boolean => tipoDeImagen(b) !== undefined;
export { huellaDeBytes };
