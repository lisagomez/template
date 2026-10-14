/**
 * Recomendaciones de anuncios con su efecto en DINERO MENSUAL absoluto y el bloque «cómo hacerlo
 * tú» (`ad-manager/reference/change_playbook.md`, modo CSV). Un cambio, un bloque. Nunca se pausa
 * la única campaña que produce sin decirlo; subir, máximo 20 % por paso. Las 3 variantes de texto
 * prueban UNA cosa cada una (oferta · ángulo · formato) y no inventan precio ni promesa.
 */
import { formatoDinero } from '../comun/dinero.js';
import type { PerfilDeVoz } from '../comun/voz.js';
import type { Redactor } from '../comun/redactor.js';
import type { Campana } from './anuncios.js';

export interface BloqueDeCambio {
  readonly cambio: string;
  readonly cuestaHoy: string;
  readonly despues: string;
  readonly neto: string;
  readonly reversible: string;
  readonly comoHacerlo: readonly string[];
  readonly vigilar: string;
  /** Centavos por mes: negativo = ahorra. `null` si no hay base para estimarlo. */
  readonly impactoMensual: number | null;
  /** La de la exportación: el impacto se dice en ella, nunca se convierte. */
  readonly moneda: string;
}

const mensual = (c: Campana) => (c.dias > 0 ? Math.round((c.gasto / c.dias) * 30) : c.gasto);
const dinero = (centavos: number, moneda: string) => `${formatoDinero(centavos, moneda)} ${moneda}`;

export function recomendaciones(cs: readonly Campana[], moneda = 'MXN'): BloqueDeCambio[] {
  const productoras = cs.filter((c) => (c.resultados ?? 0) > 0);
  const bloques: Omit<BloqueDeCambio, 'moneda'>[] = [];
  if (cs.some((c) => c.resultados === null)) {
    bloques.push({ cambio: 'Primero, mide los resultados', cuestaHoy: '—', despues: '—', neto: 'sin cambio de gasto', reversible: 'Sí', impactoMensual: null,
      comoHacerlo: ['Administrador de anuncios → Columnas → Personalizar', 'Agrega «Resultados», «Tipo de resultado» y «Costo por resultado»', 'Exporta de nuevo los últimos 90 días por día'], vigilar: 'que la siguiente exportación traiga resultados' });
  }
  for (const c of cs) {
    const m = mensual(c);
    if (c.veredicto === 'problema' && c.diasSinResultados >= 14) {
      const unica = productoras.length === 1 && productoras[0] === c;
      bloques.push({ cambio: `Pausar «${c.nombre}»`, cuestaHoy: `${dinero(m, moneda)} al mes`, despues: `${dinero(0, moneda)} al mes`, neto: `ahorra ${dinero(m, moneda)} al mes${unica ? ' — OJO: es tu única campaña con resultados' : ''}; lo que se pierde: su alcance`, reversible: 'Sí: reanudar la vuelve a poner en aprendizaje varios días', impactoMensual: -m,
        comoHacerlo: ['Administrador de anuncios → Campañas', `Busca «${c.nombre}»`, 'Apaga el interruptor', 'Confirma'], vigilar: 'que el resto de las campañas no suba su costo por resultado' });
    } else if (c.veredicto === 'problema') {
      const baja = Math.round(m * 0.25);
      bloques.push({ cambio: `Bajar 25 % el presupuesto de «${c.nombre}»`, cuestaHoy: `${dinero(m, moneda)} al mes`, despues: `${dinero(m - baja, moneda)} al mes`, neto: `ahorra ${dinero(baja, moneda)} al mes; se pierden algunos resultados caros`, reversible: 'Sí', impactoMensual: -baja,
        comoHacerlo: ['Administrador de anuncios → Campañas', `«${c.nombre}» → Editar`, `Presupuesto → ${dinero(Math.round((m - baja) / 30), moneda)} al día`, 'Publicar'], vigilar: 'el costo por resultado en dos semanas, con la siguiente exportación' });
    } else if (c.veredicto === 'vigilar' && c.frecuencia !== null && c.frecuencia > 3) {
      bloques.push({ cambio: `Creativo nuevo para «${c.nombre}» (no más dinero)`, cuestaHoy: `${dinero(m, moneda)} al mes`, despues: `${dinero(m, moneda)} al mes`, neto: 'mismo gasto; la audiencia está cansada del anuncio', reversible: 'Sí', impactoMensual: null,
        comoHacerlo: ['Usa una de las 3 variantes de abajo', `«${c.nombre}» → Anuncios → Duplicar`, 'Cambia imagen y texto', 'Publicar'], vigilar: 'que la frecuencia baje y el CTR suba' });
    } else if (c.veredicto === 'funciona' && c.dias >= 30 && (c.frecuencia ?? 0) < 3) {
      const sube = Math.round(m * 0.2);
      bloques.push({ cambio: `Subir 20 % «${c.nombre}»`, cuestaHoy: `${dinero(m, moneda)} al mes`, despues: `${dinero(m + sube, moneda)} al mes`, neto: `${dinero(sube, moneda)} más al mes; saltos mayores reinician el aprendizaje`, reversible: 'Sí', impactoMensual: sube,
        comoHacerlo: ['Administrador de anuncios → Campañas', `«${c.nombre}» → Editar`, `Presupuesto → ${dinero(Math.round((m + sube) / 30), moneda)} al día`, 'Publicar'], vigilar: 'que el costo por resultado no suba más de 15 %' });
    }
  }
  return bloques.map((b) => ({ ...b, moneda }));
}

export interface SenalDeCuenta { readonly senal: string; readonly detalle: string }

export function senales(cs: readonly Campana[]): SenalDeCuenta[] {
  const total = cs.reduce((s, c) => s + (c.resultados ?? 0), 0);
  const s: SenalDeCuenta[] = [];
  const dominante = cs.find((c) => total > 0 && (c.resultados ?? 0) / total > 0.7);
  if (dominante && cs.length > 1) s.push({ senal: 'cuenta frágil', detalle: `«${dominante.nombre}» trae más del 70 % de los resultados: si falla, se cae todo` });
  const ctrs = cs.filter((c) => c.impresiones && c.clics !== null).map((c) => ({ c, ctr: c.clics! / c.impresiones!, conv: c.clics ? (c.resultados ?? 0) / c.clics : 0 }));
  for (const x of ctrs) if (x.ctr >= 0.02 && x.conv < 0.01 && x.c.resultados !== null) s.push({ senal: 'el problema no es el anuncio', detalle: `«${x.c.nombre}»: mucha gente da clic (${(x.ctr * 100).toFixed(1)} %) y casi nadie concreta: revisa la página, el WhatsApp o la oferta` });
  return s;
}

export interface VarianteDeAnuncio { readonly prueba: 'oferta' | 'angulo' | 'formato'; readonly texto: string; readonly avisos: readonly string[] }

/** 3 variantes, cada una prueba UNA cosa. Cuerpo < 40 palabras. Nada que el dueño no haya dicho. */
export async function variantes(redactor: Redactor, voz: PerfilDeVoz, h: { producto: string; negocio: string; beneficio?: string; oferta?: string; zona?: string }): Promise<VarianteDeAnuncio[]> {
  const base: Record<string, string> = { producto: h.producto, negocio: h.negocio };
  if (h.zona) base['zona'] = h.zona;
  const pruebas: ['oferta' | 'angulo' | 'formato', Record<string, string>][] = [
    ['oferta', { ...base, ...(h.oferta ? { oferta: h.oferta } : {}) }],
    ['angulo', { ...base, ...(h.beneficio ? { beneficio: h.beneficio } : {}) }],
    ['formato', { ...base, producto: `¿Ya probaste ${h.producto}?` }],
  ];
  const salida: VarianteDeAnuncio[] = [];
  for (const [prueba, hechos] of pruebas) {
    const r = await redactor.redacta({ tarea: 'copy-anuncio', voz, hechos });
    const cuerpo = r.texto.split('\n')[1] ?? '';
    salida.push({ prueba, texto: r.texto, avisos: [...r.avisos, ...(cuerpo.split(/\s+/).length >= 40 ? ['el cuerpo pasa de 40 palabras'] : []), ...(prueba === 'oferta' && !h.oferta ? ['no diste una oferta: esta variante va sin ella (no se inventa)'] : [])] });
  }
  return salida;
}

export interface BriefCreativo {
  readonly mensaje: string; readonly formato: string; readonly visual: string; readonly textoEnLaPieza: string;
  readonly secundario: string; readonly marca: string; readonly evitar: string; readonly entregables: string;
}

export function briefCreativo(producto: string, negocio: string): BriefCreativo {
  return {
    mensaje: `${producto}, de ${negocio}`, formato: 'imagen fija o video corto', visual: 'el producto real, de cerca, con luz natural',
    textoEnLaPieza: 'máximo 5 palabras', secundario: 'precio total con impuestos solo si lo confirmas', marca: 'tus colores y tu logo, pequeño',
    evitar: 'promesas que no cumples, «el mejor de México», fotos de banco, precios sin confirmar',
    entregables: 'cuadrado 1080×1080 y vertical 1080×1350; historia 1080×1920 si corre en historias',
  };
}
