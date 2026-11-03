/**
 * Campos que un `string` no describe solo: imagen, audio y archivo viajan como data URL y llevan en su
 * metadata qué bloque los pinta. La validación es la barrera: tipo MIME en lista cerrada y tope de tamaño.
 */
import { z } from 'zod';

const BASE64 = '[A-Za-z0-9+/]+={0,2}';

function campoDataUrl(bloque: 'imagen' | 'audio' | 'archivo', mimes: readonly string[], etiqueta: string, maxBytes: number) {
  const patron = new RegExp(`^data:(${mimes.map((m) => m.replace('/', '\\/').replace('+', '\\+')).join('|')});base64,${BASE64}$`);
  const maxCaracteres = Math.ceil((maxBytes * 4) / 3) + 64;
  return z
    .string()
    .max(maxCaracteres, `pasa de ${Math.round(maxBytes / 1024)} KB`)
    .regex(patron, `se espera ${bloque} en data URL (${mimes.join(', ')})`)
    .meta({ bloque, title: etiqueta });
}

export const campoImagen = (etiqueta: string, maxBytes = 4 * 1024 * 1024) =>
  campoDataUrl('imagen', ['image/png', 'image/jpeg', 'image/webp'], etiqueta, maxBytes);

export const campoAudio = (etiqueta: string, maxBytes = 8 * 1024 * 1024) =>
  campoDataUrl('audio', ['audio/wav', 'audio/webm', 'audio/ogg', 'audio/mpeg'], etiqueta, maxBytes);

export const campoArchivo = (etiqueta: string, mimes: readonly string[], maxBytes = 4 * 1024 * 1024) =>
  campoDataUrl('archivo', mimes, etiqueta, maxBytes);

/** Los bytes de un data URL ya validado por uno de los campos de arriba. */
export function bytesDeDataUrl(dataUrl: string): Uint8Array {
  const coma = dataUrl.indexOf(',');
  const binario = atob(dataUrl.slice(coma + 1));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}
