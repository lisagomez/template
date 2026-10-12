/**
 * Las piezas bento de la vitrina (design system `bento-grid`): una cuadrícula de 6 columnas en escritorio, 1 en
 * teléfono, celdas redondeadas con tamaños variados. Cada nivel tiene su color, siempre el mismo.
 */
import type { ReactNode } from 'react'
import Link from 'next/link'
import type { Nivel } from '../contenido/journey'

export const TONO_NIVEL: Readonly<Record<Nivel, { readonly chip: string; readonly borde: string; readonly suave: string; readonly fuerte: string }>> = {
  N3: { chip: 'bg-sky-100 text-sky-800', borde: 'border-sky-200', suave: 'bg-sky-50', fuerte: 'bg-sky-600 text-white' },
  N2: { chip: 'bg-emerald-100 text-emerald-800', borde: 'border-emerald-200', suave: 'bg-emerald-50', fuerte: 'bg-emerald-600 text-white' },
  N1: { chip: 'bg-violet-100 text-violet-800', borde: 'border-violet-200', suave: 'bg-violet-50', fuerte: 'bg-violet-600 text-white' },
  agente: { chip: 'bg-amber-100 text-amber-800', borde: 'border-amber-200', suave: 'bg-amber-50', fuerte: 'bg-amber-500 text-white' },
}

export function EtiquetaNivel({ nivel, children }: { nivel: Nivel; children?: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONO_NIVEL[nivel].chip}`}>{children ?? (nivel === 'agente' ? 'Agente' : nivel)}</span>
}

export function Bento({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`grid grid-cols-1 gap-4 md:grid-cols-4 lg:grid-cols-6 ${className}`}>{children}</div>
}

const ANCHO = { 1: '', 2: 'md:col-span-2', 3: 'md:col-span-2 lg:col-span-3', 4: 'md:col-span-4 lg:col-span-4', 6: 'md:col-span-4 lg:col-span-6' } as const
const ALTO = { 1: '', 2: 'md:row-span-2' } as const

/** Una celda: `ancho` en columnas de 6 (en escritorio), `alto` en filas, y un tono de fondo. */
export function Caja({ children, ancho = 2, alto = 1, tono = 'blanco', className = '', prueba }: {
  children: ReactNode; ancho?: keyof typeof ANCHO; alto?: keyof typeof ALTO; tono?: 'blanco' | 'oscuro' | 'gris' | Nivel; className?: string; prueba?: string
}) {
  const fondo = tono === 'blanco' ? 'border border-neutral-200 bg-white' : tono === 'oscuro' ? 'bg-neutral-900 text-white' : tono === 'gris' ? 'bg-neutral-100' : `border ${TONO_NIVEL[tono].borde} ${TONO_NIVEL[tono].suave}`
  return <section data-prueba={prueba} className={`rounded-3xl p-6 ${fondo} ${ANCHO[ancho]} ${ALTO[alto]} ${className}`}>{children}</section>
}

export function Enlace({ href, children, claro = false }: { href: string; children: ReactNode; claro?: boolean }) {
  return (
    <Link href={href} className={`mt-4 inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold ${claro ? 'bg-white text-neutral-900 hover:bg-neutral-100' : 'bg-neutral-900 text-white hover:bg-neutral-700'}`}>
      {children} <span aria-hidden>→</span>
    </Link>
  )
}

export function Titular({ antetitulo, titulo, bajada }: { antetitulo: string; titulo: string; bajada?: string }) {
  return (
    <header className="mb-8 max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">{antetitulo}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-900 md:text-4xl">{titulo}</h1>
      {bajada ? <p className="mt-3 text-lg text-neutral-600">{bajada}</p> : null}
    </header>
  )
}
