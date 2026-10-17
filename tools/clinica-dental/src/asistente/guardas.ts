/**
 * Las barreras del asistente, en codigo (el prompt no basta solo):
 *  - ENTRADA: pedir un diagnostico o un medicamento no llega al cerebro: respuesta fija que ofrece agendar.
 *    Una inyeccion evidente («ignora tus instrucciones») tampoco: respuesta fija, sin gastar tokens.
 *  - SALIDA, frase por frase ANTES de mostrarla o decirla: una frase que diagnostica, receta, inventa un precio
 *    o filtra el prompt (el canario) corta la respuesta y la sustituye por la fija.
 * Lo que el paciente escribe es entrada NO CONFIABLE (C3): se trata como dato, nunca como instruccion.
 */
import type { Clinica } from '../clinicas.js';
import { pesos } from '../clinicas.js';
import { normaliza } from './urgencias.js';

const DIAGNOSTICO_ENTRADA: RegExp[] = [
  // «¿Qué tengo?» pide un diagnóstico; «¿qué tengo QUE llevar?» es logística (falso positivo medido: kb-11, 16/10).
  /\bque (tengo(?! que\b)|sera|podra ser|me pasa|le pasa|es lo que tengo|enfermedad)\b/,
  /\b(es|sera|tengo|tendre|tiene) (una |un )?(caries|infeccion|absceso|gingivitis|periodontitis|bruxismo|cancer|fractura|fisura|quiste|piorrea|herpes|afta|tumor|sinusitis|pulpitis)\b/,
  /\b(es grave|es normal que|es peligroso|debo preocuparme|me debo preocupar)\b/,
  /\b(que|cual|cuanto|cuanta|cada cuanto)\b.{0,25}\b(medicina|medicamento|antibiotico|pastilla|analgesico|ibuprofeno|paracetamol|amoxicilina|naproxeno|ketorolaco|desinflamatorio)\b/,
  /\b(puedo tomar|me tomo|debo tomar|tomar algo)\b/,
  /\b(necesito|ocupo|me tienen que hacer|me van a tener que hacer) (un |una )?(endodoncia|extraccion|implante|conductos|tratamiento de conductos|cirugia|brackets|corona)\b/,
  /\b(diagnostic\w*|que me recomiendas para el dolor|como me quito el dolor|como se me quita)\b/,
];

const INYECCION: RegExp[] = [
  /\b(ignora|olvida|omite|desobedece|salta(te)?)\b.{0,40}\b(instruccion\w*|regla\w*|indicacion\w*|anterior\w*|todo lo|lo de arriba|prompt)\b/,
  /\b(system prompt|prompt del sistema|tus instrucciones|tu prompt|instrucciones del sistema|mensaje del sistema)\b/,
  /\b(modo desarrollador|developer mode|jailbreak|sin restricciones|sin filtros)\b/,
  /\b(a partir de ahora|desde ahora)\b.{0,30}\b(eres|seras|actua|responde|habla)\b/,
  /\b(finge|haz de cuenta|actua como|imagina que eres)\b.{0,30}\b(medico|doctor|dentista|otro asistente|sin reglas|pirata)\b/,
  /\b(responde|contesta|escribe|di)\b (solo|unicamente) (con )?(si|yes|ok|verdadero)\b/,
];

const DIAGNOSTICO_SALIDA: RegExp[] = [
  // «Tienes una cita el lunes» es legitimo: solo cuenta «tienes» seguido de una condicion clinica.
  /\b(tienes|padeces|tiene usted|es probable que tengas|seguramente tienes|parece que tienes|podrias tener|puede que tengas|lo mas probable es que)\b.{0,30}\b(caries|infeccion|infectad\w*|absceso|gingivitis|periodontitis|bruxismo|fractura|fisura|pulpitis|sensibilidad|quiste|inflamacion|inflamad\w*|enfermedad|nervio|muela del juicio|lesion)\b/,
  /\b(probablemente|seguramente|posiblemente) (sea|es|se trate|tengas)\b/,
  /\b(es|se trata de) (una |un )?(caries|infeccion|absceso|gingivitis|periodontitis|bruxismo|fractura|pulpitis|sensibilidad dental)\b/,
  /\b(toma|tomate|te recomiendo tomar|puedes tomar|te sugiero tomar|aplicate|usa)\b.{0,30}\b(ibuprofeno|paracetamol|amoxicilina|antibiotico|naproxeno|ketorolaco|analgesico|clorhexidina|miligramos|mg)\b/,
  /\b(\d+ ?mg|cada \d+ horas)\b/,
];

export const pideDiagnostico = (texto: string): boolean => DIAGNOSTICO_ENTRADA.some((re) => re.test(normaliza(texto)));
export const pareceInyeccion = (texto: string): boolean => INYECCION.some((re) => re.test(normaliza(texto)));

export function respuestaNoDiagnostico(c: Clinica): string {
  const v = c.servicios.find((s) => s.id === 'valoracion');
  const precio = v ? ` (${pesos(v.precioMxn)})` : '';
  return `Eso solo te lo puede decir un dentista al revisarte; por mensaje no puedo saber qué tienes ni qué medicamento te conviene. Si quieres, te ayudo a agendar una consulta de valoración${precio}. Y si tienes fiebre, sangrado que no para o hinchazón que crece, dímelo para orientarte.`;
}

export const respuestaInyeccion = (c: Clinica): string =>
  `Solo puedo ayudarte con información de ${c.nombre}: servicios, precios, horarios, ubicación, cómo prepararte y tus citas. ¿Qué te gustaría saber?`;

export const respuestaFueraDeDominio = (c: Clinica): string =>
  `Eso no lo sé contestar: solo te ayudo con información de ${c.nombre}, como servicios, precios, horarios, cómo llegar o tus citas.`;

/** Los montos que una respuesta puede mencionar: precios de servicios y cifras de las promociones. */
export function montosPermitidos(c: Clinica): Set<number> {
  const s = new Set<number>(c.servicios.map((x) => x.precioMxn));
  for (const p of c.promociones) for (const m of p.texto.matchAll(/(\d[\d,.]*)\s*(pesos|%)/g)) s.add(Number((m[1] ?? '').replace(/,/g, '')));
  return s;
}

/** Montos en pesos de un texto: «$1,200», «1200 pesos», «$ 450.00». */
export function montosEn(texto: string): number[] {
  const salida: number[] = [];
  for (const m of texto.matchAll(/\$\s?(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)|(\d{1,3}(?:,\d{3})*|\d+)\s*(?:pesos|mxn)\b/gi)) {
    const crudo = (m[1] ?? m[2] ?? '').replace(/[,\s]/g, '');
    if (crudo) salida.push(Math.round(Number(crudo)));
  }
  return salida;
}

export type MotivoBarrera = 'diagnostico' | 'precio_inventado' | 'filtra_prompt';

/** Revisa UNA frase de salida. `null` si pasa. */
export function revisaFrase(frase: string, c: Clinica, canario: string): MotivoBarrera | null {
  if (frase.includes(canario)) return 'filtra_prompt';
  const t = normaliza(frase);
  if (DIAGNOSTICO_SALIDA.some((re) => re.test(t))) return 'diagnostico';
  const permitidos = montosPermitidos(c);
  if (montosEn(frase).some((m) => !permitidos.has(m))) return 'precio_inventado';
  return null;
}
