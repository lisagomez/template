/**
 * Las piezas visuales de la mesa, del mismo lenguaje que la vitrina (bento-grid): celdas redondeadas, el violeta del
 * laboratorio (N1) para el experto, ámbar para los agentes, celeste para el cliente (N3) y verde para la consultora (N2).
 */
import type { ReactNode } from 'react'
import type { Quien } from '../services/modelo'

export const TONO_QUIEN: Readonly<Record<Quien, { readonly punto: string; readonly chip: string; readonly nombre: string }>> = {
  agente: { punto: 'bg-amber-400 ring-amber-100', chip: 'bg-amber-100 text-amber-900', nombre: 'Agente' },
  supervisor: { punto: 'bg-orange-500 ring-orange-100', chip: 'bg-orange-100 text-orange-900', nombre: 'Supervisor' },
  tu: { punto: 'bg-violet-600 ring-violet-100', chip: 'bg-violet-100 text-violet-900', nombre: 'Tú' },
  n3: { punto: 'bg-sky-500 ring-sky-100', chip: 'bg-sky-100 text-sky-900', nombre: 'Cliente (N3)' },
  n2: { punto: 'bg-emerald-500 ring-emerald-100', chip: 'bg-emerald-100 text-emerald-900', nombre: 'Consultora (N2)' },
  sistema: { punto: 'bg-neutral-400 ring-neutral-100', chip: 'bg-neutral-100 text-neutral-800', nombre: 'Sistema' },
}

export const TONO: Readonly<Record<'bien' | 'aviso' | 'mal' | 'neutro', string>> = {
  bien: 'border-emerald-200 bg-emerald-50', aviso: 'border-amber-200 bg-amber-50', mal: 'border-rose-200 bg-rose-50', neutro: 'border-neutral-200 bg-white',
}

export function Chip({ children, className = 'bg-neutral-100 text-neutral-800' }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>{children}</span>
}

export function Celda({ children, className = '', prueba, titulo, nota }: { children: ReactNode; className?: string; prueba?: string; titulo?: ReactNode; nota?: ReactNode }) {
  return (
    <section data-prueba={prueba} className={`rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm md:p-6 ${className}`}>
      {titulo ? <h2 className="text-lg font-bold tracking-tight text-neutral-900">{titulo}</h2> : null}
      {nota ? <p className="mt-1 text-sm text-neutral-500">{nota}</p> : null}
      <div className={titulo || nota ? 'mt-4' : ''}>{children}</div>
    </section>
  )
}

type Variante = 'primario' | 'secundario' | 'bien' | 'mal' | 'fantasma'
const VARIANTE: Readonly<Record<Variante, string>> = {
  primario: 'bg-violet-700 text-white hover:bg-violet-800 disabled:bg-violet-300',
  secundario: 'border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50 disabled:text-neutral-400',
  bien: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300',
  mal: 'border border-rose-300 bg-white text-rose-700 hover:bg-rose-50 disabled:text-rose-300',
  fantasma: 'text-neutral-600 hover:bg-neutral-100',
}

export function Boton({ children, onClick, variante = 'primario', disabled = false, prueba, tipo = 'button', className = '', etiqueta }: {
  children: ReactNode; onClick?: () => void; variante?: Variante; disabled?: boolean; prueba?: string; tipo?: 'button' | 'submit'; className?: string; etiqueta?: string
}) {
  return (
    <button type={tipo} onClick={onClick} disabled={disabled} data-prueba={prueba} aria-label={etiqueta}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed ${VARIANTE[variante]} ${className}`}>
      {children}
    </button>
  )
}

/** Un campo con su etiqueta, su ayuda y su error al lado (el patrón de GOV.UK: el error dice qué pasó y cómo arreglarlo). */
export function Campo({ id, etiqueta, ayuda, error, children }: { id: string; etiqueta: string; ayuda?: string; error?: string | null; children: ReactNode }) {
  return (
    <div className={`space-y-1 ${error ? 'border-l-4 border-rose-600 pl-3' : ''}`}>
      <label htmlFor={id} className="block text-sm font-semibold text-neutral-900">{etiqueta}</label>
      {ayuda ? <p id={`${id}-ayuda`} className="text-xs text-neutral-500">{ayuda}</p> : null}
      {error ? <p id={`${id}-error`} className="text-xs font-semibold text-rose-700" data-prueba={`error-${id}`}>{error}</p> : null}
      {children}
    </div>
  )
}

export const ENTRADA_CLASE = 'w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200'

export const milisegundos = (ms: number): string => (ms < 1 ? '<1 ms' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`)
export const fechaCorta = (iso: string): string => new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
