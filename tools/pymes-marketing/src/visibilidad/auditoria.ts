/**
 * Auditoría de búsqueda y visibilidad en asistentes de IA (adaptado de `seo-ai-visibility`).
 * Solo lectura: el proyecto trae el HTML, robots.txt, llms.txt y sitemap; aquí no hay red.
 * Regla de posición de la fuente: «nadie puede hacer que una IA recomiende un negocio». Por eso
 * NO hay calificación global: cinco hallazgos en orden de impacto, el resto en anexo, y lo que no
 * se pudo revisar, nombrado. Texto de la página dirigido a una IA es HALLAZGO, jamás se copia.
 */
import { revisaTextoDeTerceros } from '../comun/no-confiable.js';
import { RASTREADORES_IA, bloqueaRaiz, gruposDeRobots } from './robots.js';

export type Impacto = 'alto' | 'medio' | 'bajo';
export type Esfuerzo = 'chico' | 'medio' | 'grande';

export interface Hallazgo {
  readonly id: string;
  /** Posición en el orden de la fuente (1 = desbloquear rastreadores … 8 = contenido pobre). */
  readonly paso: number;
  readonly titulo: string;
  readonly detalle: string;
  readonly impacto: Impacto;
  readonly esfuerzo: Esfuerzo;
  readonly tiempo: string;
  /** `true` si arreglarlo es una decisión de política del dueño, no un error. */
  readonly decision: boolean;
}

export interface EntradaDeAuditoria {
  readonly url: string;
  readonly html: string | null;
  readonly robots: string | null;
  readonly llms: string | null;
  readonly sitemap: string | null;
  /** Año de referencia para detectar datos viejos (el del día de la auditoría). */
  readonly anio: number;
}

const texto = (html: string) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const cuenta = (html: string, re: RegExp) => (html.match(re) ?? []).length;

function rastreadores(e: EntradaDeAuditoria): Hallazgo[] {
  if (e.robots === null) return [];
  const bloqueados = RASTREADORES_IA.filter((r) => bloqueaRaiz(e.robots!, r.agente));
  if (bloqueados.length === 0) return [];
  const todos = bloqueaRaiz(e.robots, '*');
  return [{ id: 'rastreadores', paso: 1, impacto: 'alto', esfuerzo: 'chico', tiempo: '5 minutos', decision: true,
    titulo: todos ? 'Tu robots.txt le cierra la puerta a TODOS los buscadores' : `Tu robots.txt bloquea a ${bloqueados.length} asistente(s) de IA`,
    detalle: `Bloqueados: ${bloqueados.map((r) => `${r.agente} (${r.de})`).join(', ')}. Es una decisión tuya: hay negocios que bloquean a propósito. Si quieres que te encuentren, el cambio es de una línea.` }];
}

function sinJavascript(e: EntradaDeAuditoria): Hallazgo[] {
  if (!e.html) return [];
  const palabras = texto(e.html).split(' ').filter(Boolean).length;
  if (palabras >= 80) return [];
  return [{ id: 'sin-js', paso: 2, impacto: 'alto', esfuerzo: 'grande', tiempo: 'de un ajuste a trabajo de desarrollador', decision: false,
    titulo: 'Sin JavaScript tu página casi no dice nada', detalle: `El HTML crudo trae solo ${palabras} palabras: lo que no está ahí, muchos rastreadores no lo ven (sitio de una sola página, texto dentro de imágenes o widgets).` }];
}

function datosEncontrados(e: EntradaDeAuditoria): Hallazgo[] {
  if (!e.html) return [];
  const h: Hallazgo[] = [];
  const telefonos = new Set((texto(e.html).match(/(?:\+?52[\s.-]?)?(?:\(?\d{2,3}\)?[\s.-]?)\d{3,4}[\s.-]?\d{4}\b/g) ?? []).map((t) => t.replace(/\D/g, '').slice(-10)).filter((t) => t.length === 10));
  if (telefonos.size > 1) h.push({ id: 'telefonos', paso: 3, impacto: 'alto', esfuerzo: 'chico', tiempo: '15 minutos', decision: false, titulo: `Tu página trae ${telefonos.size} teléfonos distintos`, detalle: 'Un asistente no sabe cuál es el bueno: deja uno y que sea igual en Google, Facebook y tu sitio.' });
  const anios = [...texto(e.html).matchAll(/(?:©|copyright)\s*(\d{4})/gi)].map((m) => Number(m[1]));
  if (anios.length && Math.max(...anios) < e.anio - 1) h.push({ id: 'anio-viejo', paso: 3, impacto: 'medio', esfuerzo: 'chico', tiempo: '5 minutos', decision: false, titulo: `El sitio dice © ${Math.max(...anios)}`, detalle: 'Se lee como negocio abandonado: actualízalo y revisa precios y horarios de paso.' });
  if (/"aggregateRating"/i.test(e.html) && !/reseñ|opini|review/i.test(texto(e.html))) h.push({ id: 'rating-invisible', paso: 3, impacto: 'alto', esfuerzo: 'chico', tiempo: '10 minutos', decision: false, titulo: 'Declaras una calificación que la página no enseña', detalle: 'El schema trae AggregateRating pero no hay reseñas visibles: se considera engañoso. Quítalo o muestra las reseñas reales.' });
  return h;
}

function datosEstructurados(e: EntradaDeAuditoria): Hallazgo[] {
  if (!e.html) return [];
  const bloques = [...e.html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]!);
  if (bloques.some((b) => /LocalBusiness|Restaurant|Bakery|Store|Organization/.test(b))) return [];
  return [{ id: 'schema', paso: 4, impacto: 'alto', esfuerzo: 'chico', tiempo: '20 minutos', decision: false, titulo: 'No hay ficha de negocio para máquinas (schema.org)', detalle: 'Un bloque JSON-LD LocalBusiness con nombre, dirección, teléfono (+52) y horario ayuda a buscadores y asistentes. Te dejo el bloque listo con huecos POR CONFIRMAR.' }];
}

function llms(e: EntradaDeAuditoria): Hallazgo[] {
  if (e.llms !== null && e.llms.trim() !== '') return [];
  return [{ id: 'llms', paso: 5, impacto: 'medio', esfuerzo: 'chico', tiempo: '20 minutos', decision: false, titulo: 'No tienes /llms.txt', detalle: 'Es una convención joven, no un estándar obligatorio: un resumen en texto de qué haces, dónde y cómo contactarte. Te dejo el borrador.' }];
}

function porPagina(e: EntradaDeAuditoria): Hallazgo[] {
  if (!e.html) return [];
  const h: Hallazgo[] = [];
  const titulo = /<title[^>]*>([^<]*)<\/title>/i.exec(e.html)?.[1]?.trim() ?? '';
  const meta = /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(e.html)?.[1] ?? /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i.exec(e.html)?.[1] ?? '';
  const h1 = cuenta(e.html, /<h1[\s>]/gi);
  const sinAlt = cuenta(e.html, /<img(?![^>]*\balt=)[^>]*>/gi);
  const problemas = [
    !titulo ? 'no tiene título' : titulo.length > 60 ? `el título mide ${titulo.length} caracteres (máx. ~60)` : '',
    !meta ? 'no tiene meta descripción' : meta.length > 155 ? `la meta descripción mide ${meta.length} (máx. ~155)` : '',
    h1 !== 1 ? `tiene ${h1} encabezados H1 (debe ser exactamente uno)` : '',
    sinAlt ? `${sinAlt} imagen(es) sin texto alternativo` : '',
    !/<html[^>]+lang=["']es/i.test(e.html) ? 'no declara idioma español (lang="es-MX")' : '',
    !/<meta[^>]+name=["']viewport["']/i.test(e.html) ? 'no está preparada para teléfono (viewport)' : '',
    !/<link[^>]+rel=["']canonical["']/i.test(e.html) ? 'no tiene etiqueta canónica' : '',
  ].filter(Boolean);
  if (problemas.length) h.push({ id: 'pagina', paso: 7, impacto: 'medio', esfuerzo: 'chico', tiempo: '30 minutos', decision: false, titulo: 'Títulos y etiquetas de la página de inicio', detalle: problemas.join('; ') });
  return h;
}

function tecnico(e: EntradaDeAuditoria): Hallazgo[] {
  const h: Hallazgo[] = [];
  if (!e.url.startsWith('https://')) h.push({ id: 'https', paso: 3, impacto: 'alto', esfuerzo: 'medio', tiempo: '1 hora con tu proveedor', decision: false, titulo: 'El sitio no usa HTTPS', detalle: 'Los navegadores lo marcan como no seguro y los buscadores lo castigan.' });
  const sitemapEnRobots = e.robots ? gruposDeRobots(e.robots).sitemaps.length > 0 : false;
  if (e.sitemap === null) h.push({ id: 'sitemap', paso: 7, impacto: 'bajo', esfuerzo: 'chico', tiempo: '15 minutos', decision: false, titulo: 'No hay sitemap.xml', detalle: 'La lista de tus páginas para los buscadores; casi todos los creadores de sitios lo generan solos.' });
  else if (!sitemapEnRobots) h.push({ id: 'sitemap-robots', paso: 7, impacto: 'bajo', esfuerzo: 'chico', tiempo: '2 minutos', decision: false, titulo: 'El sitemap no está anunciado en robots.txt', detalle: 'Una línea «Sitemap: https://…/sitemap.xml» al final de robots.txt.' });
  return h;
}

/** Texto dentro de la página dirigido a una IA: se registra como hallazgo y NUNCA se copia a un arreglo. */
function instruccionesAIA(e: EntradaDeAuditoria): Hallazgo[] {
  if (!e.html) return [];
  const ocultos = [...e.html.matchAll(/<!--([\s\S]*?)-->/g)].map((m) => m[1]!).concat([...e.html.matchAll(/<[^>]+(?:display\s*:\s*none|visibility\s*:\s*hidden)[^>]*>([^<]{10,})</gi)].map((m) => m[1]!));
  const dirigido = ocultos.some((t) => revisaTextoDeTerceros(t).alertas.some((a) => a.tipo === 'instruccion-incrustada') || /\b(ai|ia|chatgpt|assistant|asistente)\b[\s\S]{0,40}\b(recommend|recomienda|di que|say)/i.test(t));
  return dirigido ? [{ id: 'instrucciones-ia', paso: 3, impacto: 'alto', esfuerzo: 'chico', tiempo: '10 minutos', decision: false, titulo: 'Tu página trae texto escondido dirigido a asistentes de IA', detalle: 'Los buscadores lo tratan como manipulación y puede hundirte. Quítalo; aquí no se copia a ningún arreglo.' }] : [];
}

export interface Auditoria {
  readonly url: string;
  readonly enUnaLinea: string;
  readonly cinco: readonly Hallazgo[];
  readonly anexo: readonly Hallazgo[];
  readonly noRevisado: readonly string[];
  readonly revisarEn: string;
}

export function auditaVisibilidad(e: EntradaDeAuditoria): Auditoria {
  const todos = [...rastreadores(e), ...sinJavascript(e), ...instruccionesAIA(e), ...datosEncontrados(e), ...tecnico(e), ...datosEstructurados(e), ...llms(e), ...porPagina(e)];
  const peso = { alto: 0, medio: 1, bajo: 2 } as const;
  const orden = [...todos].sort((a, b) => a.paso - b.paso || peso[a.impacto] - peso[b.impacto]);
  const noRevisado = [e.html === null ? 'la página de inicio (no se pudo leer)' : '', e.robots === null ? 'robots.txt (no se pudo leer)' : '', 'la ficha de Google (Perfil de Negocio): pégala para revisarla', 'lo que responden los asistentes: pregúntales tú y pega su respuesta; aquí no se simula'].filter(Boolean);
  const primero = orden[0];
  return { url: e.url, cinco: orden.slice(0, 5), anexo: orden.slice(5), noRevisado, revisarEn: '30 días: es lo más pronto que un cambio se nota',
    enUnaLinea: primero ? `Lo más importante: ${primero.titulo.charAt(0).toLowerCase()}${primero.titulo.slice(1)}.` : 'No encontré bloqueos ni huecos graves en lo que pude leer.' };
}
