/**
 * Nucleo de la herramienta: TypeScript puro, CERO dependencias.
 *
 * Esa es la regla que hace que una herramienta se pueda integrar en cualquier proyecto:
 * si el nucleo importa React, Next o Supabase, deja de ser una herramienta y pasa a ser un
 * trozo de una app concreta. Lo que necesite React vive en `./react`, detras de un
 * peerDependency OPCIONAL.
 */

export interface ResultadoSlug {
  slug: string;
  /** true si hubo que recortar por `maxLongitud`. */
  recortado: boolean;
}

/**
 * Convierte un texto en un slug estable para URLs.
 *
 * Se normaliza a NFD y se quitan los diacriticos: sin eso, "camion" y "camión" producen
 * slugs distintos y el dia que alguien renombra algo se rompen los enlaces.
 */
export function aSlug(texto: string, maxLongitud = 80): ResultadoSlug {
  const base = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const recortado = base.length > maxLongitud;
  return {
    slug: recortado ? base.slice(0, maxLongitud).replace(/-+$/, '') : base,
    recortado,
  };
}
