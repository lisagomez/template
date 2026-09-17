/**
 * ¿Este texto parece de OTRO idioma que el pedido? Heurística de palabras funcionales, sin modelos.
 *
 * Existe porque Parakeet TDT v3 detecta el idioma solo, no lo declara en la salida de sherpa-onnx y
 * con audio corto o flojo toma el espanol por ingles («Probably.», «No you can only gorda», vivo
 * el 2026-09-16). El motor no da ninguna senal; el texto si: las palabras funcionales de un idioma
 * casi nunca aparecen en el otro. Se cuenta cuantas de cada lado hay y gana la mayoria; en empate
 * (o sin palabras funcionales) se asume que el idioma es el pedido, para no repetir por nada.
 */
import { tokeniza } from './normaliza.js';

const FUNCIONALES: Record<string, ReadonlySet<string>> = {
  es: new Set(['el', 'la', 'los', 'las', 'de', 'del', 'que', 'qué', 'y', 'en', 'un', 'una', 'es', 'no', 'con', 'por', 'para', 'se', 'me', 'te', 'lo', 'le', 'su', 'mi', 'tu', 'al', 'como', 'cómo', 'pero', 'si', 'sí', 'ya', 'muy', 'más', 'esto', 'eso', 'aquí', 'ahí', 'bien', 'también', 'porque', 'cuando', 'cuándo', 'donde', 'dónde', 'hay', 'está', 'están', 'era', 'son', 'fue', 'ser', 'hacer', 'puedo', 'puedes', 'quiero', 'tengo', 'aún', 'nada', 'algo', 'todo', 'vamos', 'ahora']),
  en: new Set(['the', 'and', 'you', 'that', 'this', 'with', 'for', 'not', 'but', 'are', 'was', 'were', 'have', 'has', 'can', 'only', 'just', 'yeah', 'yes', 'okay', 'probably', 'what', 'when', 'where', 'why', 'how', 'your', 'our', 'they', 'them', 'there', 'here', 'then', 'than', 'would', 'could', 'should', 'will', 'did', 'does', 'want', 'know', 'think', 'like', 'about', 'into', 'from', 'some', 'very', 'really', 'now']),
};

/** `true` si el texto tiene más palabras funcionales de otro idioma conocido que del pedido. */
export function pareceOtroIdioma(texto: string, idiomaPedido: string): boolean {
  const propias = FUNCIONALES[idiomaPedido];
  if (!propias) return false;
  const palabras = tokeniza(texto);
  const cuenta = (conjunto: ReadonlySet<string>) => palabras.filter((p) => conjunto.has(p)).length;
  const mias = cuenta(propias);
  for (const [idioma, conjunto] of Object.entries(FUNCIONALES)) {
    if (idioma === idiomaPedido) continue;
    if (cuenta(conjunto) > mias) return true;
  }
  return false;
}
