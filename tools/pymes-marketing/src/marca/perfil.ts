/**
 * Perfil de marca (adaptado de `brand-style`): se captura con una liga (el HTML del sitio) o con
 * una frase en palabras llanas. **Nunca se piden códigos hex, selectores ni archivos.** Omitirlo
 * es válido y da la marca neutra de la casa. Antes de usarse en todas las piezas se previsualiza
 * y el dueño dice «sí» (`confirmaMarca`): una marca equivocada en cada pieza sale cara.
 */
import { revisaTextoDeTerceros } from '../comun/no-confiable.js';
import { normaliza } from '../comun/texto.js';
import { COLORES_ES, ESTILOS_ES, aclara, asegurarContraste, contraste, esNeutro, leeHex, type Hex } from './colores.js';

export interface PerfilDeMarca {
  readonly nombre: string;
  readonly lema: string | null;
  readonly sitio: string | null;
  readonly logo: string | null;
  readonly colores: { readonly primario: Hex; readonly secundario: Hex; readonly fondo: Hex; readonly texto: Hex };
  readonly tipografia: { readonly titulos: string; readonly cuerpo: string };
  readonly origen: 'sitio' | 'descripcion' | 'por-defecto';
  /** `false` hasta que el dueño vio la vista previa y dijo que sí. */
  readonly confirmado: boolean;
  /** Lo que se dedujo con poca certeza o se corrigió (p. ej. contraste). Se le enseña al dueño. */
  readonly notas: readonly string[];
}

export const MARCA_POR_DEFECTO: PerfilDeMarca = {
  nombre: 'Mi negocio', lema: null, sitio: null, logo: null,
  colores: { primario: '#1f4d3a', secundario: '#b8913a', fondo: '#fbf8f2', texto: '#1f2328' },
  tipografia: { titulos: 'Georgia, serif', cuerpo: 'system-ui, sans-serif' },
  origen: 'por-defecto', confirmado: false, notas: ['marca neutra de la casa: el dueño no dio liga ni descripción'],
};

function conContraste(p: PerfilDeMarca): PerfilDeMarca {
  const notas = [...p.notas];
  const texto = asegurarContraste(p.colores.texto, p.colores.fondo, 4.5);
  const primario = asegurarContraste(p.colores.primario, p.colores.fondo, 3);
  if (texto !== p.colores.texto) notas.push('se oscureció el color del texto para que se lea bien (contraste AA)');
  if (primario !== p.colores.primario) notas.push('se ajustó el color principal para que destaque sobre el fondo');
  return { ...p, colores: { ...p.colores, texto, primario }, notas };
}

/** «Verde bosque y crema», «azul marino y gris cálido», «como un despacho moderno». */
export function capturaDeDescripcion(descripcion: string, nombre = MARCA_POR_DEFECTO.nombre): PerfilDeMarca {
  const n = normaliza(descripcion);
  // Los nombres largos se buscan primero («verde bosque» antes que «verde»), pero el ORDEN de los
  // colores es el de la frase: el primero que dice el dueño es el principal.
  const nombres = Object.keys(COLORES_ES).sort((a, b) => b.length - a.length);
  const encontrados: { indice: number; hex: Hex }[] = [];
  let resto = ` ${n} `;
  for (const c of nombres) {
    const i = resto.indexOf(` ${c} `);
    if (i < 0) continue;
    let hex = COLORES_ES[c]!;
    const despues = resto.slice(i + c.length + 2, i + c.length + 12);
    if (/^(oscuro|profundo)/.test(despues)) hex = aclara(hex, -0.3);
    if (/^(claro|suave|pastel)/.test(despues)) hex = aclara(hex, 0.35);
    encontrados.push({ indice: i, hex });
    resto = `${resto.slice(0, i)} ${'_'.repeat(c.length)} ${resto.slice(i + c.length + 2)}`;
  }
  const hallados = encontrados.sort((a, b) => a.indice - b.indice).map((x) => x.hex);
  const estilo = ESTILOS_ES.find(([re]) => re.test(n));
  const notas: string[] = [];
  if (hallados.length === 0 && !estilo) notas.push('no reconocí colores en la descripción: usé la marca neutra');
  const base = hallados.length ? hallados : estilo ? [...estilo[1]] : [MARCA_POR_DEFECTO.colores.primario, MARCA_POR_DEFECTO.colores.secundario];
  const primario = base[0]!;
  const claro = base.slice(1).find((c) => contraste(c, '#000000') > 12);
  const secundario = base.slice(1).find((c) => c !== claro) ?? aclara(primario, 0.45);
  return conContraste({
    ...MARCA_POR_DEFECTO, nombre, origen: 'descripcion', notas,
    colores: { primario, secundario, fondo: claro ?? '#fbf8f2', texto: '#1f2328' },
  });
}

const GENERICAS = new Set(['serif', 'sans-serif', 'monospace', 'system-ui', 'inherit', 'initial', 'cursive', '-apple-system', 'blinkmacsystemfont']);

function meta(html: string, nombre: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${nombre}["'][^>]*>`, 'i');
  const etiqueta = re.exec(html)?.[0];
  return etiqueta ? (/content=["']([^"']*)["']/i.exec(etiqueta)?.[1] ?? null) : null;
}

function coloresDelCss(html: string): Hex[] {
  const variables = [...html.matchAll(/--[\w-]*(?:primary|brand|marca|principal|accent|acento|main)[\w-]*\s*:\s*(#[0-9a-fA-F]{3,6})\b/g)].map((m) => leeHex(m[1]!));
  const cuenta = new Map<Hex, number>();
  for (const m of html.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
    const h = leeHex(m[0]);
    if (h && !esNeutro(h)) cuenta.set(h, (cuenta.get(h) ?? 0) + 1);
  }
  const frecuentes = [...cuenta].sort((a, b) => b[1] - a[1]).map(([h]) => h);
  return [...new Set([...variables.filter((h): h is Hex => h !== null && !esNeutro(h)), ...frecuentes])];
}

function tipografia(html: string): string | null {
  for (const m of html.matchAll(/font-family\s*:\s*([^;}"]+)/gi)) {
    const primera = m[1]!.split(',')[0]!.replace(/["']/g, '').trim();
    if (primera && !GENERICAS.has(primera.toLowerCase()) && !primera.startsWith('var(')) return primera;
  }
  return /fonts\.googleapis\.com\/css2?\?family=([^:&"']+)/i.exec(html)?.[1]?.replace(/\+/g, ' ') ?? null;
}

function logoDe(html: string, url: string | null): string | null {
  const crudo = meta(html, 'og:image') ?? /<img[^>]+(?:src)=["']([^"']*logo[^"']*)["']/i.exec(html)?.[1]
    ?? /<link[^>]+rel=["'](?:apple-touch-icon|icon)["'][^>]+href=["']([^"']+)["']/i.exec(html)?.[1] ?? null;
  if (!crudo) return null;
  try { return url ? new URL(crudo, url).toString() : crudo; } catch { return crudo; }
}

/** Desde el HTML de su sitio (el proyecto lo descarga; aquí no hay red). Todo texto del sitio es ajeno. */
export function capturaDeSitio(html: string, url: string | null = null): PerfilDeMarca {
  const titulo = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? '';
  const crudoNombre = meta(html, 'og:site_name') ?? titulo.split(/[|\-–—·]/)[0] ?? '';
  const revisadoNombre = revisaTextoDeTerceros(crudoNombre, 60);
  const nombre = revisadoNombre.texto || MARCA_POR_DEFECTO.nombre;
  const lemaCrudo = meta(html, 'description') ?? meta(html, 'og:description');
  const revisadoLema = lemaCrudo ? revisaTextoDeTerceros(lemaCrudo, 140) : null;
  const lema = revisadoLema?.texto ?? null;
  const tema = leeHex(meta(html, 'theme-color') ?? '');
  const css = coloresDelCss(html);
  const candidatos = [...new Set([...(tema && !esNeutro(tema) ? [tema] : []), ...css])];
  const notas: string[] = [];
  if (candidatos.length === 0) notas.push('el sitio no trae colores de marca legibles en su HTML: usé la marca neutra; puedes describirlos con palabras');
  if ([...revisadoNombre.alertas, ...(revisadoLema?.alertas ?? [])].some((a) => a.tipo === 'instruccion-incrustada')) {
    notas.push('el título o la descripción del sitio traen una orden dirigida a una máquina: se tomó como texto, no se obedeció; revísalo antes de usarlo como lema');
  }
  const fuente = tipografia(html);
  const primario = candidatos[0] ?? MARCA_POR_DEFECTO.colores.primario;
  return conContraste({
    nombre, lema, sitio: url, logo: logoDe(html, url), origen: 'sitio', confirmado: false, notas,
    colores: { primario, secundario: candidatos[1] ?? aclara(primario, 0.45), fondo: '#fbf8f2', texto: '#1f2328' },
    tipografia: fuente ? { titulos: `${fuente}, ${MARCA_POR_DEFECTO.tipografia.titulos}`, cuerpo: MARCA_POR_DEFECTO.tipografia.cuerpo } : MARCA_POR_DEFECTO.tipografia,
  });
}

/** «Más oscuro» / «más claro», el ajuste que el dueño pide viendo la vista previa. */
export function ajustaMarca(p: PerfilDeMarca, ajuste: 'mas-oscuro' | 'mas-claro'): PerfilDeMarca {
  const primario = aclara(p.colores.primario, ajuste === 'mas-oscuro' ? -0.18 : 0.18);
  return conContraste({ ...p, confirmado: false, colores: { ...p.colores, primario } });
}

/** El «sí» del dueño tras ver la vista previa. Sin esto, la marca no se aplica a las piezas. */
export function confirmaMarca(p: PerfilDeMarca): PerfilDeMarca {
  return { ...p, confirmado: true };
}

/** Variables CSS para aplicar la marca a cualquier página o pieza. */
export function cssDeMarca(p: PerfilDeMarca): string {
  const c = p.colores;
  return `--marca-primario:${c.primario};--marca-secundario:${c.secundario};--marca-fondo:${c.fondo};--marca-texto:${c.texto};--marca-titulos:${p.tipografia.titulos};--marca-cuerpo:${p.tipografia.cuerpo};`;
}
