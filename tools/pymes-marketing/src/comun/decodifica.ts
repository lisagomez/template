/**
 * Bytes de un archivo a texto. Los CSV que Excel guarda en Windows en español llegan muchas veces
 * en Windows-1252 y no en UTF-8: se intenta UTF-8 estricto y, si falla, 1252, y se DICE cuál fue.
 */
export function decodificaTexto(bytes: Uint8Array): { readonly texto: string; readonly codificacion: 'utf-8' | 'windows-1252' } {
  try {
    return { texto: new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, ''), codificacion: 'utf-8' };
  } catch {
    return { texto: new TextDecoder('windows-1252').decode(bytes), codificacion: 'windows-1252' };
  }
}
