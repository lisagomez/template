/**
 * La tubería del estudio: une las herramientas de `@tu-scope/pymes-marketing` como las usaría el
 * proyecto de un cliente. Corre EN EL NAVEGADOR: los XML, CSV y reseñas del cliente no salen de su
 * computadora. El redactor es el de plantillas (el único aprobado por el laboratorio: el de LLM
 * sigue «no medido»).
 */
import { redactorDePlantillas, construyeVoz, decodificaTexto, lunesDe, sumaDias, type PerfilDeVoz } from '../../../../tools/pymes-marketing/dist/index.js';
import { type PerfilDeMarca } from '../../../../tools/pymes-marketing/dist/marca/index.js';
import { ventasDesdeCfdi, ventasDesdeCsv, juntaVentas, resumeVentas, type VentasNormalizadas } from '../../../../tools/pymes-marketing/dist/ventas/index.js';
import { estrategiaDe30Dias, calendarioDe30Dias, type EstrategiaDe30Dias, type FilaDeCalendario } from '../../../../tools/pymes-marketing/dist/contenido/index.js';
import { resenasPegadas, resenasDesdeCsv, analizaResenas, type AnalisisDeResenas } from '../../../../tools/pymes-marketing/dist/resenas/index.js';
import { auditaVisibilidad, type Auditoria } from '../../../../tools/pymes-marketing/dist/visibilidad/index.js';
import { leeAnuncios, campanas, recomendaciones, pulsoDeCrecimiento, pulsoParaElLunes, briefDelLunes, anunciosParaElLunes, competenciaParaElLunes, resenasParaElLunes, visibilidadParaElLunes, leeNotasDeCompetencia, type Campana, type BloqueDeCambio, type BriefDelLunes } from '../../../../tools/pymes-marketing/dist/pulso/index.js';
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

export async function resenas(texto: string, voz: PerfilDeVoz, negocio: string, contacto: string, ventas: VentasNormalizadas | null, hoy: string): Promise<AnalisisDeResenas> {
  const lectura = /^[^\n]*,[^\n]*\n/.test(texto) && /rese|review|coment|texto/i.test(texto.split('\n')[0] ?? '') ? resenasDesdeCsv(texto) : resenasPegadas(texto);
  return analizaResenas(lectura.resenas, redactor, { voz, negocio, contacto: contacto || undefined, hoy, ventas: ventas?.lineas });
}

export function auditoria(url: string, html: string, robots: string, llms: string): Auditoria {
  return auditaVisibilidad({ url, html: html.trim() || null, robots: robots.trim() || null, llms: llms.trim() || null, sitemap: null, anio: new Date().getFullYear() });
}

export function anuncios(csv: string): { campanas: Campana[]; bloques: BloqueDeCambio[]; moneda: string; faltan: readonly string[] } {
  const l = leeAnuncios(csv);
  const cs = campanas(l);
  return { campanas: cs, bloques: recomendaciones(cs, l.moneda), moneda: l.moneda, faltan: l.faltan };
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
