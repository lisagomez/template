'use client'

/**
 * Piezas comunes del bento de Soporte SAP. Formatean, no calculan: un valor del corte se pinta con su
 * unidad y su fuente, y «sin dato» cuando el corte no lo tiene.
 */
import type { ReactNode } from 'react'
import type { Tarjeta } from '../services/tipos'

/** Una celda del bento: `ancho` en columnas de 12 (en pantallas grandes). */
export function Celda({ titulo, ancho = 6, children, prueba, nota }: { titulo: string; ancho?: 3 | 4 | 5 | 6 | 7 | 8 | 12; children: ReactNode; prueba?: string; nota?: string }) {
  const span = { 3: 'lg:col-span-3', 4: 'lg:col-span-4', 5: 'lg:col-span-5', 6: 'lg:col-span-6', 7: 'lg:col-span-7', 8: 'lg:col-span-8', 12: 'lg:col-span-12' }[ancho]
  return (
    <section data-prueba={prueba} className={`col-span-12 ${span} rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900`}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{titulo}</h2>
      {nota ? <p className="mt-0.5 text-xs text-neutral-500">{nota}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  )
}

export function Pildora({ children, tono = 'neutro' }: { children: ReactNode; tono?: 'neutro' | 'bien' | 'aviso' | 'mal' | 'info' }) {
  const t = {
    neutro: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
    bien: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    aviso: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    mal: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    info: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  }[tono]
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${t}`}>{children}</span>
}

/** El valor tal como viene del corte, con su unidad. Sin aritmética: el formato lo pone el locale. */
export function valorConUnidad(valor: number | null, unidad: string | null): string {
  if (valor === null) return 'sin dato'
  if (unidad === 'proporcion') return valor.toLocaleString('es-MX', { style: 'percent', maximumFractionDigits: 1 })
  const n = valor.toLocaleString('es-MX', { maximumFractionDigits: 2 })
  return unidad === 'horas' ? `${n} h` : unidad === 'dias' ? `${n} días` : n
}

export const mxn = (v: number) => `$${v.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`

export function Metricas({ tarjetas, prueba }: { tarjetas: readonly Tarjeta[]; prueba?: string }) {
  return (
    <div data-prueba={prueba} className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
      {tarjetas.map((t) => (
        <div key={`${t.nombre}-${t.fuente}`} data-metrica={t.nombre} title={t.fuente} className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-800/60">
          <p className="text-xs text-neutral-500">{t.etiqueta}</p>
          <p className="text-xl font-bold tabular-nums">{valorConUnidad(t.valor, t.unidad)}</p>
          <p className="mt-1 truncate text-[10px] text-neutral-400">{t.fuente}</p>
          {t.supuestos && <p data-supuesto={t.nombre} className="mt-1 text-[10px] leading-snug text-amber-700 dark:text-amber-400">{t.definicion} Supuesto: {t.supuestos}.</p>}
        </div>
      ))}
    </div>
  )
}

export const hora = (iso: string) => new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Mexico_City' })
