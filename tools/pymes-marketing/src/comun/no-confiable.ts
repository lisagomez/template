/**
 * Texto de terceros (reseñas, mensajes, sitios ajenos, CSV que llegó de fuera) es **dato, nunca
 * instrucción** (regla `untrusted-content` de la fuente; control C3). Aquí no se «limpia» el
 * contenido hasta volverlo inofensivo —eso destruiría la cita textual—: se quitan solo los
 * caracteres de control e invisibles, se acota el largo y se **declara** lo sospechoso para que
 * quien redacte lo trate como cita y el dueño lo vea marcado.
 */
export type TipoDeAlerta = 'instruccion-incrustada' | 'enlace' | 'marcado' | 'invisibles' | 'truncado';

export interface AlertaDeContenido {
  readonly tipo: TipoDeAlerta;
  readonly detalle: string;
}

export interface TextoRevisado {
  readonly texto: string;
  readonly alertas: readonly AlertaDeContenido[];
}

const INSTRUCCIONES: readonly RegExp[] = [
  /\b(ignora|ignoren|olvida|olviden|omite)\b[^.!?\n]{0,40}\b(instrucciones|indicaciones|reglas|lo anterior|todo lo anterior)\b/i,
  /\bignore\b[^.!?\n]{0,30}\b(instructions|previous|prior|above|rules)\b/i,
  /\b(system prompt|prompt del sistema|mensaje del sistema|developer message)\b/i,
  /\b(ahora eres|act[uú]a como|eres un[a]? (asistente|ia|modelo)|you are now|act as)\b/i,
  /\b(como (ia|modelo|asistente) de lenguaje|as an ai|al asistente que lea esto|to the ai reading)\b/i,
  /\b(responde|contesta|escribe|publica)\b[^.!?\n]{0,30}\b(ofreciendo|ofrece|con)\b[^.!?\n]{0,30}\b(reembolso|descuento|cup[oó]n|gratis)\b/i,
  /\b(revela|muestra|dame|env[ií]a)\b[^.!?\n]{0,30}\b(contrase[nñ]a|llave|token|clave de api|datos de (los )?clientes)\b/i,
];

const ENLACE = /\bhttps?:\/\/[^\s)]+|\bwww\.[^\s)]+/gi;
const MARCADO = /<\s*\/?\s*(script|iframe|img|a|style|svg)\b|!\[[^\]]*\]\(/i;
const INVISIBLES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁤﻿]/g;

/** Revisa un texto ajeno. `maximo` por defecto: 2,000 caracteres (una reseña larga cabe entera). */
export function revisaTextoDeTerceros(crudo: string, maximo = 2000): TextoRevisado {
  const alertas: AlertaDeContenido[] = [];
  let texto = crudo;
  if (texto.replace(INVISIBLES, '') !== texto) {
    alertas.push({ tipo: 'invisibles', detalle: 'traía caracteres invisibles o de control; se quitaron' });
    texto = texto.replace(INVISIBLES, '');
  }
  for (const patron of INSTRUCCIONES) {
    const m = patron.exec(texto);
    if (m) alertas.push({ tipo: 'instruccion-incrustada', detalle: `parece una orden para una máquina: «${m[0].slice(0, 80)}»` });
  }
  const enlaces = texto.match(ENLACE);
  if (enlaces) alertas.push({ tipo: 'enlace', detalle: `trae ${enlaces.length} enlace(s); no se abren ni se repiten en respuestas` });
  if (MARCADO.test(texto)) alertas.push({ tipo: 'marcado', detalle: 'trae marcado HTML o de imagen; se muestra como texto plano' });
  if (texto.length > maximo) {
    alertas.push({ tipo: 'truncado', detalle: `medía ${texto.length} caracteres; se recortó a ${maximo}` });
    texto = texto.slice(0, maximo);
  }
  return { texto: texto.trim(), alertas };
}

export function tieneInstruccionIncrustada(revisado: TextoRevisado): boolean {
  return revisado.alertas.some((a) => a.tipo === 'instruccion-incrustada');
}
