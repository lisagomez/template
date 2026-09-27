/**
 * Lectura de reseñas EXPORTADAS (CSV) o PEGADAS (bloques separados por una línea en blanco). Todo
 * su texto es de terceros: pasa por la revisión de contenido no confiable (C3) y por la
 * minimización de datos personales (C4) ANTES de guardarse. La cita queda textual; solo se tapan
 * los datos personales y se dice cuántos.
 */
import { columna, leeCsv } from '../comun/csv.js';
import { minimizaDatosPersonales, nombreCorto } from '../comun/datos-personales.js';
import { leeDia } from '../comun/fechas.js';
import { revisaTextoDeTerceros } from '../comun/no-confiable.js';
import { huella, normaliza } from '../comun/texto.js';
import type { LecturaDeResenas, Plataforma, Resena } from './tipos.js';

const PLATAFORMAS: readonly [RegExp, Plataforma][] = [
  [/google|maps/, 'Google Maps'], [/facebook|fb|meta/, 'Facebook'], [/tripadvisor/, 'TripAdvisor'],
  [/mercado libre|mercadolibre/, 'Mercado Libre'], [/rappi|uber eats|didi/, 'App de comida'], [/whatsapp|mensaje|messenger|instagram|correo/, 'Mensaje'],
];

export function plataformaDe(texto: string): Plataforma {
  const n = normaliza(texto);
  return PLATAFORMAS.find(([re]) => re.test(n))?.[1] ?? 'Otra';
}

function estrellasDe(texto: string): number | null {
  const llenas = (texto.match(/★/g) ?? []).length;
  if (llenas > 0 && llenas <= 5) return llenas;
  const m = /\b([1-5])(?:[.,]0)?\s*(?:\/\s*5|estrellas?|★|stars?)\b/i.exec(texto) ?? /^\s*([1-5])\s*$/.exec(texto);
  return m ? Number(m[1]) : null;
}

function construye(p: { plataforma: Plataforma; estrellas: number | null; dia: string | null; autor: string; texto: string; respondida: boolean }): Resena {
  const revisado = revisaTextoDeTerceros(p.texto);
  const minimo = minimizaDatosPersonales(revisado.texto);
  const tapados = Object.values(minimo.encontrados).reduce<number>((s, n) => s + (n ?? 0), 0);
  return {
    id: huella(`${p.plataforma}|${p.autor}|${p.dia}|${p.texto}`), plataforma: p.plataforma, estrellas: p.estrellas,
    dia: p.dia ? leeDia(p.dia) : null, autor: nombreCorto(p.autor), texto: minimo.texto, alertas: revisado.alertas,
    yaRespondida: p.respondida, datosPersonalesTapados: tapados,
  };
}

/** CSV exportado (Google, Facebook, una hoja propia). Columnas por sinónimos. */
export function resenasDesdeCsv(texto: string, plataformaPorDefecto: Plataforma = 'Google Maps'): LecturaDeResenas {
  const t = leeCsv(texto);
  const col = (s: string[]) => columna(t.encabezados, s);
  const c = { texto: col(['texto', 'resena', 'comentario', 'review', 'opinion']), estrellas: col(['estrellas', 'calificacion', 'rating', 'puntuacion']), fecha: col(['fecha', 'date']), autor: col(['autor', 'nombre', 'cliente', 'reviewer', 'usuario']), plataforma: col(['plataforma', 'fuente', 'source']), respuesta: col(['respuesta', 'respuesta del propietario', 'reply', 'owner response']) };
  if (c.texto < 0) return { resenas: [], rechazadas: [], avisos: [`no encontré la columna del texto de la reseña; encabezados: ${t.encabezados.join(' | ')}`] };
  const resenas: Resena[] = [];
  const rechazadas = t.rechazadas.map((r) => ({ referencia: `línea ${r.linea}`, motivo: r.motivo }));
  for (const f of t.filas) {
    const cuerpo = f.celdas[c.texto] ?? '';
    if (!cuerpo.trim()) { rechazadas.push({ referencia: `línea ${f.linea}`, motivo: 'reseña sin texto (solo calificación): cuenta para el promedio, no para temas' }); continue; }
    resenas.push(construye({
      plataforma: c.plataforma >= 0 ? plataformaDe(f.celdas[c.plataforma] ?? '') : plataformaPorDefecto,
      estrellas: c.estrellas >= 0 ? estrellasDe(f.celdas[c.estrellas] ?? '') : null, dia: c.fecha >= 0 ? f.celdas[c.fecha] ?? null : null,
      autor: c.autor >= 0 ? f.celdas[c.autor] ?? '' : '', texto: cuerpo, respondida: c.respuesta >= 0 && (f.celdas[c.respuesta] ?? '').trim() !== '',
    }));
  }
  return { resenas, rechazadas, avisos: [] };
}

/**
 * Texto pegado: una reseña por bloque. La primera línea puede traer los datos separados por «·»,
 * «|» o «-»: `María López · ★★☆☆☆ · 12/09/2026 · Google`. Lo que no se reconoce, no se inventa.
 */
export function resenasPegadas(texto: string, plataformaPorDefecto: Plataforma = 'Google Maps'): LecturaDeResenas {
  const bloques = texto.replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const resenas = bloques.map((b) => {
    const [primera, ...resto] = b.split('\n');
    const partes = (primera ?? '').split(/\s[·|]\s|\s-\s/).map((x) => x.trim());
    const esCabecera = resto.length > 0 && partes.length >= 2;
    const dia = partes.find((x) => leeDia(x)) ?? null;
    const plat = partes.find((x) => plataformaDe(x) !== 'Otra');
    // La respuesta del negocio NO es palabra del cliente: se separa antes de citar o contar temas.
    const cuerpo = (esCabecera ? resto.join('\n') : b).split(/respuesta del (?:propietario|dueño)\s*:?/i);
    return construye({
      plataforma: plat ? plataformaDe(plat) : plataformaPorDefecto, estrellas: estrellasDe(esCabecera ? primera! : b), dia,
      autor: esCabecera ? partes[0] ?? '' : '', texto: cuerpo[0]!.trim(), respondida: cuerpo.length > 1,
    });
  });
  return { resenas, rechazadas: [], avisos: bloques.length ? ['reseñas pegadas: la lectura es parcial (solo lo que pegaste)'] : [] };
}
