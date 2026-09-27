/**
 * Temas de lo que dicen los clientes (adaptado de `review-reputation`): 3 a 5, con conteo y 2–3
 * citas TEXTUALES etiquetadas por fuente, ordenados por conteo. El léxico es de español de México
 * y amplio a propósito: incluir de más es barato porque el conteo filtra el ruido.
 */
import { normaliza } from '../comun/texto.js';
import { fechaCorta } from '../comun/fechas.js';
import type { Resena } from './tipos.js';

export type Tono = 'positiva' | 'negativa' | 'mixta';
export type IdTema = 'calidad' | 'atencion' | 'espera' | 'precio' | 'limpieza' | 'entrega' | 'ambiente' | 'salud';

export const TEMAS: Readonly<Record<IdTema, { readonly etiqueta: string; readonly palabras: readonly string[] }>> = {
  calidad: { etiqueta: 'Sabor y calidad', palabras: ['sabor', 'rico', 'delicios', 'fresc', 'duro', 'quemad', 'crudo', 'calidad', 'frio', 'seco', 'sabros', 'bueno', 'buenisim', 'horrible', 'feo'] },
  atencion: { etiqueta: 'Trato y atención', palabras: ['atencion', 'amable', 'grosero', 'grosera', 'trato', 'atendi', 'servicio', 'cajer', 'mesero', 'empleado', 'personal', 'sonrisa', 'mala cara'] },
  espera: { etiqueta: 'Tiempo de espera', palabras: ['tarda', 'tardaron', 'espera', 'esper', 'lento', 'rapido', 'fila', 'hora', 'minutos', 'nunca llego', 'tardo'] },
  precio: { etiqueta: 'Precio', palabras: ['caro', 'precio', 'barato', 'cobran', 'cobraron', 'costo', 'vale la pena', 'economico', 'carisim'] },
  limpieza: { etiqueta: 'Limpieza', palabras: ['limpi', 'sucio', 'sucia', 'bano', 'higiene', 'mosca', 'cabello', 'pelo'] },
  entrega: { etiqueta: 'Pedidos y entregas', palabras: ['envio', 'entrega', 'pedido', 'nunca llego', 'llego tarde', 'repartidor', 'incompleto', 'equivocad', 'faltaba', 'domicilio'] },
  ambiente: { etiqueta: 'Lugar y ambiente', palabras: ['lugar', 'ambiente', 'musica', 'estacionamiento', 'ruido', 'bonito', 'acogedor', 'mesas'] },
  salud: { etiqueta: 'Salud', palabras: ['intoxic', 'me enferme', 'diarrea', 'vomit', 'alergi', 'hospital', 'infeccion'] },
};

const POSITIVAS = ['excelente', 'delicios', 'rico', 'recomiendo', 'gracias', 'super', 'buenisim', 'amable', 'encanto', 'me gusto', 'volvere', 'salvaron', 'perfecto', 'bonito'];
const NEGATIVAS = ['pesim', 'malo', 'mala', 'horrible', 'nunca', 'jamas', 'no vuelvo', 'tarde', 'tardaron', 'grosero', 'queja', 'sucio', 'caro', 'reembolso', 'devolucion', 'decepcion', 'molest', 'problema', 'falla', 'equivocad', 'incompleto', 'frio'];

export function tonoDe(r: Resena): Tono {
  if (r.estrellas !== null) return r.estrellas >= 4 ? 'positiva' : r.estrellas <= 2 ? 'negativa' : 'mixta';
  const n = normaliza(r.texto);
  const pos = POSITIVAS.filter((p) => menciona(n, p)).length, neg = NEGATIVAS.filter((p) => menciona(n, p)).length;
  return pos > 0 && neg > 0 ? 'mixta' : neg > 0 ? 'negativa' : 'positiva';
}

export function temasDe(r: Resena): IdTema[] {
  const n = normaliza(r.texto);
  return (Object.keys(TEMAS) as IdTema[]).filter((t) => TEMAS[t].palabras.some((p) => menciona(n, p)));
}

/** Lo específico antes que lo genérico: «tardaron en atendernos» es espera antes que atención. */
const PRIORIDAD: readonly IdTema[] = ['salud', 'espera', 'entrega', 'limpieza', 'calidad', 'atencion', 'precio', 'ambiente'];

/** ¿Aparece la palabra (o una que empiece así) en el texto normalizado? Por inicio de palabra, no por pedazo. */
export function menciona(normalizado: string, palabra: string): boolean {
  return ` ${normalizado}`.includes(` ${palabra}`);
}

/**
 * Qué temas son QUEJA y cuáles ELOGIO dentro de la misma reseña, por cláusulas («rico el café,
 * pero tardaron»): una mixta no se disculpa por lo que el cliente elogió.
 */
export function temasPorTono(r: Resena): { readonly quejas: IdTema[]; readonly elogios: IdTema[] } {
  const quejas = new Set<IdTema>(), elogios = new Set<IdTema>();
  const general = tonoDe(r);
  for (const clausula of r.texto.split(/\bpero\b|\baunque\b|\bsin embargo\b|[.;!?\n]/i)) {
    const n = normaliza(clausula);
    if (!n) continue;
    const temas = (Object.keys(TEMAS) as IdTema[]).filter((id) => TEMAS[id].palabras.some((p) => menciona(n, p)));
    const pos = POSITIVAS.filter((p) => menciona(n, p)).length, neg = NEGATIVAS.filter((p) => menciona(n, p)).length;
    const esQueja = neg > pos || (neg === pos && general === 'negativa');
    for (const id of temas) (esQueja ? quejas : elogios).add(id);
  }
  const orden = (s: Set<IdTema>) => PRIORIDAD.filter((id) => s.has(id));
  return { quejas: orden(quejas), elogios: orden(elogios).filter((id) => !quejas.has(id)) };
}

export interface Tema {
  readonly id: IdTema;
  readonly etiqueta: string;
  readonly conteo: number;
  readonly quejas: number;
  readonly elogios: number;
  readonly citas: readonly string[];
}

/** «"Esperé nueve días una pieza." [Google Maps, ★1, 12 jul]» — la cita va entera y textual. */
export function cita(r: Resena): string {
  const texto = r.texto.length > 220 ? `${r.texto.slice(0, 220).trimEnd()}…` : r.texto;
  return `«${texto}» [${r.plataforma}${r.estrellas !== null ? `, ★${r.estrellas}` : ''}${r.dia ? `, ${fechaCorta(r.dia)}` : ''}]`;
}

export function agrupaTemas(resenas: readonly Resena[]): Tema[] {
  const temas = (Object.keys(TEMAS) as IdTema[]).map((id) => {
    const suyas = resenas.filter((r) => temasDe(r).includes(id));
    const quejas = suyas.filter((r) => temasPorTono(r).quejas.includes(id));
    const ordenadas = [...quejas, ...suyas.filter((r) => !quejas.includes(r))];
    return { id, etiqueta: TEMAS[id].etiqueta, conteo: suyas.length, quejas: quejas.length, elogios: suyas.length - quejas.length, citas: ordenadas.slice(0, 3).map(cita) };
  });
  return temas.filter((t) => t.conteo > 0).sort((a, b) => b.conteo - a.conteo || b.quejas - a.quejas).slice(0, 5);
}
