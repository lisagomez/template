'use client'

/** El marco de la vitrina: la marca, la navegación entre sus secciones y el aviso de que todo es sintético. */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { RAIZ_DE_LA_VITRINA as R } from '../contenido/capturas'

const SECCIONES = [
  { href: R, nombre: 'Inicio' },
  { href: `${R}/niveles`, nombre: 'Los tres niveles' },
  { href: `${R}/journey`, nombre: 'Journey' },
  { href: `${R}/deck`, nombre: 'Deck' },
  { href: `${R}/manual`, nombre: 'Manual' },
  { href: `${R}/en-vivo`, nombre: 'En vivo' },
] as const

export function Marco({ children }: { children: ReactNode }) {
  const ruta = usePathname()
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 print:bg-white">
      <div className="bg-neutral-900 px-4 py-2 text-center text-xs text-neutral-200 print:hidden" data-prueba="aviso-sintetico">
        Vitrina de laboratorio · todos los datos son sintéticos · no hay SAP real ni modelo de lenguaje · no escribas datos reales
      </div>
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href={R} className="flex items-center gap-2 font-bold tracking-tight">
            <span className="grid h-7 w-7 grid-cols-2 gap-0.5" aria-hidden>
              <span className="rounded-sm bg-sky-500" /><span className="rounded-sm bg-emerald-500" /><span className="rounded-sm bg-violet-500" /><span className="rounded-sm bg-amber-400" />
            </span>
            Soporte SAP
          </Link>
          <nav className="flex flex-wrap gap-1 text-sm" data-prueba="navegacion">
            {SECCIONES.map((s) => {
              const activa = s.href === R ? ruta === R : ruta?.startsWith(s.href)
              return <Link key={s.href} href={s.href} aria-current={activa ? 'page' : undefined}
                className={`rounded-full px-3 py-1.5 font-medium ${activa ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}>{s.nombre}</Link>
            })}
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-8 print:max-w-none print:p-0">{children}</div>
    </div>
  )
}
