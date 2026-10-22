/**
 * El marco de la mesa: quién eres (lo que verificó Access), el aviso permanente de lo que es y lo que no es, y la
 * navegación entre la mesa, la validación de candidatos, el kit y, solo para el laboratorio, el mapa y lo que dijo el
 * experto. Las pestañas van por `?pestana=`: la puerta solo deja pasar las rutas que ya conoce.
 */
import Link from 'next/link'
import type { ReactNode } from 'react'
import type { IdentidadMesa } from '../services/acceso'

export const RAIZ_DE_LA_MESA = '/mesa/soporte-sap'

export type SeccionDeLaMesa = 'mesa' | 'candidatos' | 'kit' | 'mapa' | 'laboratorio'

export function MarcoDeLaMesa({ identidad, activa, children }: { identidad: Pick<IdentidadMesa, 'correo' | 'rol' | 'prueba'>; activa: SeccionDeLaMesa; children: ReactNode }) {
  const secciones = [
    { href: RAIZ_DE_LA_MESA, nombre: 'Mesa de pruebas', clave: 'mesa' },
    { href: `${RAIZ_DE_LA_MESA}?pestana=candidatos`, nombre: 'Validar conocimiento', clave: 'candidatos' },
    { href: `${RAIZ_DE_LA_MESA}/kit`, nombre: 'Cómo se usa', clave: 'kit' },
    ...(identidad.rol === 'laboratorio' ? [
      { href: `${RAIZ_DE_LA_MESA}/laboratorio`, nombre: 'Mapa', clave: 'mapa' },
      { href: `${RAIZ_DE_LA_MESA}/laboratorio?pestana=casos`, nombre: 'Lo que dijo el experto', clave: 'laboratorio' },
    ] : []),
  ]
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="bg-neutral-900 px-4 py-2 text-center text-xs text-neutral-200" data-prueba="aviso-sintetico">
        Laboratorio con datos sintéticos · escribe el caso sin nombres de clientes ni de personas · no se conecta a ningún SAP · nada se aplica sin una persona · el agente no usa un modelo de IA
      </div>
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href={RAIZ_DE_LA_MESA} className="flex items-center gap-2 font-bold tracking-tight">
            <span className="grid h-7 w-7 grid-cols-2 gap-0.5" aria-hidden>
              <span className="rounded-sm bg-sky-500" /><span className="rounded-sm bg-emerald-500" /><span className="rounded-sm bg-violet-500" /><span className="rounded-sm bg-amber-400" />
            </span>
            Soporte SAP · mesa del experto
          </Link>
          <nav className="flex flex-wrap gap-1 text-sm" data-prueba="navegacion">
            {secciones.map((s) => (
              <Link key={s.href} href={s.href} aria-current={activa === s.clave ? 'page' : undefined}
                className={`rounded-full px-3 py-1.5 font-medium ${activa === s.clave ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}>{s.nombre}</Link>
            ))}
          </nav>
          <span className="ml-auto inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-900" data-prueba="identidad">
            <span className="h-2 w-2 rounded-full bg-violet-600" aria-hidden />{identidad.rol === 'laboratorio' ? 'Laboratorio' : 'Experto'} · {identidad.correo}{identidad.prueba ? ' (prueba)' : ''}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] px-4 py-6 md:py-8">{children}</main>
    </div>
  )
}
