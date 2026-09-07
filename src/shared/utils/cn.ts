import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Une clases de Tailwind resolviendo los conflictos: la ultima gana.
 *
 * `clsx` aplana condicionales (`cn('p-2', activo && 'p-4')`) y `tailwind-merge` deshace
 * los choques que el navegador NO resuelve por ti — en CSS gana la regla mas especifica
 * o la que este mas abajo en la hoja, no la que escribiste al final del `className`.
 * Sin esto, `cn('p-2', 'p-4')` deja las dos y el padding que sale es loteria.
 *
 * `tailwind-merge` va en 2.x a proposito: la 3.x es para Tailwind v4 y aqui el golden
 * path es Tailwind 3.4 (la misma trampa v3/v4 que documenta `globals.css`).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
