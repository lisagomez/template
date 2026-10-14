/**
 * La tubería del estudio: une las herramientas de `@tu-scope/pymes-marketing` como las usaría el
 * proyecto de un cliente. Corre EN EL NAVEGADOR: los XML, CSV y reseñas del cliente no salen de su
 * computadora. El redactor es el de plantillas (el único aprobado por el laboratorio: el de LLM
 * sigue «no medido»).
 */
import { redactorDePlantillas, construyeVoz, decodificaTexto, leeCsv, lunesDe, sumaDias, type PerfilDeVoz } from '../../../../tools/pymes-marketing/dist/index.js';
import { type PerfilDeMarca } from '../../../../tools/pymes-marketing/dist/marca/index.js';
import { ventasDesdeCfdi, ventasDesdeCsv, juntaVentas, resumeVentas, type VentasNormalizadas } from '../../../../tools/pymes-marketing/dist/ventas/index.js';
import { estrategiaDe30Dias, calendarioDe30Dias, type EstrategiaDe30Dias, type FilaDeCalendario } from '../../../../tools/pymes-marketing/dist/contenido/index.js';
import { resenasPegadas, resenasDesdeCsv, analizaResenas, type AnalisisDeResenas, type LecturaDeResenas } from '../../../../tools/pymes-marketing/dist/resenas/index.js';
import { auditaVisibilidad, type Auditoria } from '../../../../tools/pymes-marketing/dist/visibilidad/index.js';
import { leeAnuncios, campanas, recomendaciones, pulsoDeCrecimiento, pulsoParaElLunes, briefDelLunes, anunciosParaElLunes, competenciaParaElLunes, resenasParaElLunes, visibilidadParaElLunes, leeNotasDeCompetencia, type Campana, type BloqueDeCambio, type BriefDelLunes, type LecturaDeAnuncios } from '../../../../tools/pymes-marketing/dist/pulso/index.js';
import { leeCfdi40, registroDeEsquemas, lectorDeTimbre11 } from '../../../../tools/extractor-documental/dist/xml/index.js';

export const redactor = redactorDePlantillas();
const registro = registroDeEsquemas([lectorDeTimbre11]);

/** Lee archivos del cliente: XML como CFDI, CSV como ventas de caja. Todo local. */
export async function ventasDeArchivos(archivos: readonly File[], rfcPropio: string | undefined): Promise<{ ventas: VentasNormalizadas; resumen: string }> {
  const xml: string[] = [], csv: VentasNormalizadas[] = [];
  const codificaciones: string[] = [];
  for (const a of archivos) {
    const { texto, codificacion } = decodificaTexto(new Uint8Array(await a.arrayBuffer()));
    if (/\.xml$/i.test(a.name)) xml.push(texto);
    else { csv.push(ventasDesdeCsv(texto)); if (codificacion !== 'utf-8') codificaciones.push(`${a.name} venía en ${codificacion}`); }
  }
  const deXml = ventasDesdeCfdi(xml.map((x) => leeCfdi40(x, registro)), rfcPropio ? { rfcPropio } : {});
  const ventas = juntaVentas(deXml, ...csv);
  return { ventas: { ...ventas, avisos: [...ventas.avisos, ...codificaciones] }, resumen: `${xml.length} XML y ${csv.length} CSV leídos en tu navegador` };
}

export function ventasDeXmls(xmls: readonly string[], rfcPropio?: string): VentasNormalizadas {
  return ventasDesdeCfdi(xmls.map((x) => leeCfdi40(x, registro)), rfcPropio ? { rfcPropio } : {});
}

/** El brief arranca el lunes siguiente al último día con ventas (o al de hoy si no hay). */
export function inicioDelBrief(ventas: VentasNormalizadas | null, hoy: string): string {
  const dias = ventas?.lineas.map((l) => l.dia).sort() ?? [];
  const ultimo = dias[dias.length - 1] ?? hoy;
  return sumaDias(lunesDe(ultimo), 7);
}

export function brief(ventas: VentasNormalizadas | null, hoy: string): EstrategiaDe30Dias {
  return estrategiaDe30Dias(ventas ? resumeVentas(ventas) : { estado: 'sin-datos', motivo: 'no hay ventas cargadas' }, inicioDelBrief(ventas, hoy));
}

export async function calendario(e: EstrategiaDe30Dias, marca: PerfilDeMarca, voz: PerfilDeVoz, precios: Readonly<Record<string, number>>): Promise<FilaDeCalendario[]> {
  return calendarioDe30Dias(e, marca, redactor, { voz, precios });
}

/** Cinco motivos a la vista y el resto contado: el dueño necesita saber que hay más, no la lista entera. */
function enumera(n: number, que: string, detalle: readonly string[]): string {
  return `No pude leer ${n} ${que}: ${detalle.slice(0, 5).join('; ')}${n > 5 ? ` y ${n - 5} más` : ''}`;
}

/** Lo que la lectura de reseñas no pudo leer o leyó a medias, dicho al dueño: si no, una columna que
 *  no se reconoce deja el análisis en cero reseñas sin que nadie lo note. */
export function avisosDeResenas(l: LecturaDeResenas): string[] {
  const soloEstrellas = l.resenas.filter((r) => r.texto.trim() === '').length;
  return [
    ...l.avisos,
    ...(l.rechazadas.length ? [enumera(l.rechazadas.length, 'fila(s) de reseñas', l.rechazadas.map((r) => `${r.referencia}: ${r.motivo}`))] : []),
    ...(soloEstrellas ? [`${soloEstrellas} reseña(s) solo con estrellas: cuentan para tu calificación, pero no tienen tema ni respuesta`] : []),
  ];
}

export async function resenas(texto: string, voz: PerfilDeVoz, negocio: string, contacto: string, ventas: VentasNormalizadas | null, hoy: string): Promise<{ analisis: AnalisisDeResenas; avisos: string[] }> {
  const lectura = /^[^\n]*,[^\n]*\n/.test(texto) && /rese|review|coment|texto/i.test(texto.split('\n')[0] ?? '') ? resenasDesdeCsv(texto) : resenasPegadas(texto);
  const analisis = await analizaResenas(lectura.resenas, redactor, { voz, negocio, contacto: contacto || undefined, hoy, ventas: ventas?.lineas });
  return { analisis, avisos: avisosDeResenas(lectura) };
}

export function auditoria(url: string, html: string, robots: string, llms: string): Auditoria {
  return auditaVisibilidad({ url, html: html.trim() || null, robots: robots.trim() || null, llms: llms.trim() || null, sitemap: null, anio: new Date().getFullYear() });
}

const COLUMNAS: Readonly<Record<string, string>> = {
  campana: 'el nombre de la campaña', gasto: 'el gasto', impresiones: 'las impresiones', clics: 'los clics',
  resultados: 'los resultados', frecuencia: 'la frecuencia', dia: 'el día',
};

/** Lo que la lectura de anuncios no pudo leer, dicho al dueño: una columna o una fila perdida cambia el
 *  veredicto en silencio. Los encabezados del archivo van completos: son lo que se coteja (piloto, §6). */
export function avisosDeAnuncios(csv: string, l: LecturaDeAnuncios): string[] {
  const avisos: string[] = [];
  if (l.faltan.length) avisos.push(`No reconocí la columna de ${l.faltan.map((k) => COLUMNAS[k] ?? k).join(', ')}. Tu archivo trae: ${leeCsv(csv).encabezados.join(' | ')}`);
  if (l.faltan.includes('campana') || l.faltan.includes('gasto')) avisos.push('Sin el nombre de la campaña y el gasto no puedo juzgar ninguna campaña.');
  if (l.rechazadas.length) avisos.push(`${enumera(l.rechazadas.length, 'fila(s)', l.rechazadas.map((r) => `línea ${r.linea}: ${r.motivo}`))}. Su gasto no está en las cifras.`);
  if (l.moneda !== 'MXN') avisos.push(`Tu exportación está en ${l.moneda === 'USD' ? 'dólares' : l.moneda}: los montos van en esa moneda, sin convertir a pesos.`);
  return avisos;
}

export function anuncios(csv: string): { campanas: Campana[]; bloques: BloqueDeCambio[]; moneda: string; avisos: string[] } {
  const l = leeAnuncios(csv);
  const cs = campanas(l);
  return { campanas: cs, bloques: recomendaciones(cs, l.moneda), moneda: l.moneda, avisos: avisosDeAnuncios(csv, l) };
}

export interface FuentesDelLunes {
  readonly ventas: VentasNormalizadas | null;
  readonly analisis: AnalisisDeResenas | null;
  readonly auditoria: Auditoria | null;
  readonly campanas: readonly Campana[] | null;
  readonly bloques: readonly BloqueDeCambio[];
  readonly notasCompetencia: string;
  readonly semana: string;
}

export function lunes(f: FuentesDelLunes): BriefDelLunes {
  const resumen = f.ventas ? resumeVentas(f.ventas) : { estado: 'sin-datos' as const, motivo: 'no hay ventas cargadas' };
  const pulso = pulsoDeCrecimiento({ ventas: f.ventas, resumen, anuncios: f.campanas, resenas: f.analisis });
  const notas = f.notasCompetencia.trim() ? leeNotasDeCompetencia(f.notasCompetencia).notas : null;
  const cola = f.analisis?.borradores.filter((b) => b.estado === 'borrador').length ?? 0;
  return briefDelLunes([pulsoParaElLunes(pulso), resenasParaElLunes(f.analisis), competenciaParaElLunes(notas), anunciosParaElLunes(f.campanas, f.bloques), visibilidadParaElLunes(f.auditoria)], { semana: f.semana, colaDeRespuestas: cola });
}

export { construyeVoz };
