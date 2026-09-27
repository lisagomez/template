/** El catálogo completo del laboratorio y cómo se corre. Una sola fuente para la página, la app y la suite. */
import { CASOS_CONTENIDO, CASOS_RESENAS } from './casos-contenido-resenas.ts';
import { CASOS_MARCA, CASOS_VENTAS } from './casos-marca-ventas.ts';
import { CASOS_REDACTOR } from './casos-redactor.ts';
import { CASOS_PULSO, CASOS_VISIBILIDAD } from './casos-visibilidad-pulso.ts';
import type { Caso, CasoCorrido, ContextoDeLaboratorio, Herramienta, IdHerramienta } from './tipos.ts';

export const HERRAMIENTAS: readonly Herramienta[] = [
  { id: 'marca', nombre: 'Marca y voz', subpath: '@tu-scope/pymes-marketing/marca', fuente: 'brand-style + voice-profile', queHace: 'Captura la marca con una liga o una frase y aprende cómo escribe el dueño.' },
  { id: 'ventas', nombre: 'Ventas', subpath: '@tu-scope/pymes-marketing/ventas', fuente: 'núcleo de content-strategy y growth-pulse', queHace: 'Lee facturas CFDI y el CSV de la caja; dice qué se vende y qué se frena.' },
  { id: 'contenido', nombre: 'Contenido', subpath: '@tu-scope/pymes-marketing/contenido', fuente: 'content-strategy + social-content-engine + canva-creator', queHace: 'Brief de 30 días, calendario vivo y piezas con imagen, en borrador.' },
  { id: 'resenas', nombre: 'Reseñas', subpath: '@tu-scope/pymes-marketing/resenas', fuente: 'review-reputation', queHace: 'Temas con citas, respuestas para aprobar una por una, clientes que se callaron.' },
  { id: 'visibilidad', nombre: 'Visibilidad', subpath: '@tu-scope/pymes-marketing/visibilidad', fuente: 'seo-ai-visibility', queHace: 'Si te encuentran buscadores y asistentes de IA, y los arreglos como archivos.' },
  { id: 'pulso', nombre: 'Pulso y lunes', subpath: '@tu-scope/pymes-marketing/pulso', fuente: 'ad-manager + growth-pulse + marketing-monday', queHace: 'Anuncios, pulso de crecimiento y el brief de cada lunes.' },
  { id: 'redactor-llm', nombre: 'Redactor con LLM', subpath: '@tu-scope/pymes-marketing/redactor-openai-compat', fuente: '—', queHace: 'Redacción con un modelo pineado y su costo en la contabilidad. Opcional.' },
];

export const CASOS: readonly Caso[] = [...CASOS_MARCA, ...CASOS_VENTAS, ...CASOS_CONTENIDO, ...CASOS_RESENAS, ...CASOS_VISIBILIDAD, ...CASOS_PULSO, ...CASOS_REDACTOR];

export async function correCaso(caso: Caso, ctx: ContextoDeLaboratorio): Promise<CasoCorrido> {
  const t0 = performance.now();
  let resultado;
  try {
    resultado = await caso.corre(ctx);
  } catch (e) {
    resultado = { estado: 'falla' as const, evidencia: [`error: ${e instanceof Error ? e.message : String(e)}`], veredicto: 'El caso reventó: eso es una falla.' };
  }
  const { corre: _corre, ...datos } = caso;
  void _corre;
  return { caso: datos, resultado, coincide: resultado.estado === caso.esperado, ms: Math.round(performance.now() - t0) };
}

export async function correLaboratorio(ctx: ContextoDeLaboratorio): Promise<CasoCorrido[]> {
  const salida: CasoCorrido[] = [];
  for (const c of CASOS) salida.push(await correCaso(c, ctx));
  return salida;
}

/** Una herramienta está APROBADA solo si todos sus casos pasan (un «no medido» no aprueba). */
export function aprobadas(corridos: readonly CasoCorrido[]): IdHerramienta[] {
  return HERRAMIENTAS.map((h) => h.id).filter((id) => {
    const suyos = corridos.filter((c) => c.caso.herramienta === id);
    return suyos.length > 0 && suyos.every((c) => c.resultado.estado === 'pasa');
  });
}
