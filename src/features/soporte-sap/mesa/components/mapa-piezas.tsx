'use client'

/**
 * Las piezas del mapa del laboratorio, con el lenguaje del Overview de un Worker en Cloudflare: nodos con su conteo que
 * se despliegan, flechas de izquierda a derecha, tarjetas de métricas con su serie y «sin datos» cuando no hay.
 */
import { useState, type ReactNode } from 'react'
import type { Metrica } from '../services/modelo-candidatos'

/** El conteo de un nodo, en su cuadrito gris (Cloudflare pone así Domains 1, Workers 0). */
export function Cuenta({ n, tono = 'bg-neutral-600 text-white' }: { n: number | string; tono?: string }) {
  return <span className={`inline-flex min-w-6 items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${tono}`}>{n}</span>
}

/** Un nodo de fuente: se despliega para ver de qué está hecho su conteo; el nombre abre su detalle abajo. */
export function NodoFuente({ nombre, cuenta, aviso, abre, prueba, children }: { nombre: string; cuenta: number; aviso?: string | null; abre: () => void; prueba: string; children: ReactNode }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div className="rounded-2xl border border-neutral-300 bg-white shadow-sm ring-4 ring-neutral-100" data-prueba={prueba}>
      <div className="flex items-center gap-2 px-4 py-3">
        <button type="button" onClick={abre} className="font-semibold text-neutral-900 hover:underline" data-prueba={`${prueba}-abre`}>{nombre}</button>
        <Cuenta n={cuenta} />
        {aviso ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">{aviso}</span> : null}
        <button type="button" onClick={() => setAbierto(!abierto)} aria-expanded={abierto} aria-label={`${abierto ? 'Cerrar' : 'Desplegar'} ${nombre}`} className="ml-auto rounded-full p-1 text-neutral-500 hover:bg-neutral-100">
          <svg viewBox="0 0 20 20" className={`h-4 w-4 transition ${abierto ? 'rotate-180' : ''}`} aria-hidden><path d="M5 7l5 6 5-6" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
        </button>
      </div>
      {abierto ? <div className="border-t border-neutral-200 px-4 py-3 text-sm text-neutral-700">{children}</div> : null}
    </div>
  )
}

/** Una fila clave → valor dentro de un nodo, con la línea punteada de Cloudflare entre las dos. */
export function Fila({ clave, valor, onClick, prueba }: { clave: string; valor: ReactNode; onClick?: () => void; prueba?: string }) {
  const contenido = <><span className="text-neutral-700">{clave}</span><span className="mx-2 h-px flex-1 border-t border-dashed border-neutral-300" aria-hidden /><span className="text-right">{valor}</span></>
  return onClick
    ? <button type="button" onClick={onClick} data-prueba={prueba} className="flex w-full items-center rounded-lg px-1 py-1.5 text-left text-sm hover:bg-neutral-50">{contenido}</button>
    : <div className="flex items-center px-1 py-1.5 text-sm" data-prueba={prueba}>{contenido}</div>
}

/** Las flechas entre columnas. `salidas` son las alturas (en %) de donde salen, y todas llegan a `llega`. */
export function Conector({ salidas, llega = 50 }: { salidas: readonly number[]; llega?: number }) {
  return (
    <svg className="hidden h-full w-16 lg:block" viewBox="0 0 64 100" preserveAspectRatio="none" aria-hidden>
      {salidas.map((y, i) => <path key={i} d={`M0 ${y} H22 C34 ${y} 30 ${llega} 42 ${llega} H60`} fill="none" stroke="#a3a3a3" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />)}
      <path d={`M55 ${llega - 3} L61 ${llega} L55 ${llega + 3}`} fill="none" stroke="#737373" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** La serie de una métrica, como la línea fina de Cloudflare. Sin datos, lo dice. */
export function Serie({ m }: { m: Metrica }) {
  if (!m.serie.length || m.serie.every((p) => p.n === 0)) return <p className="mt-3 inline-block rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500">{m.valor === null ? 'sin datos' : 'sin movimiento en 14 días'}</p>
  const max = Math.max(...m.serie.map((p) => p.n), 1)
  const puntos = m.serie.map((p, i) => `${(i / (m.serie.length - 1)) * 100},${28 - (p.n / max) * 26}`).join(' ')
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="mt-3 h-8 w-full" role="img" aria-label={`Serie de 14 días: ${m.serie.map((p) => p.n).join(', ')}`}>
      <polyline points={puntos} fill="none" stroke="#2563eb" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** Una tarjeta de métrica: el número (o «sin datos»), qué es y su serie de 14 días. */
export function TarjetaMetrica({ etiqueta, m, sufijo = '', prueba }: { etiqueta: string; m: Metrica; sufijo?: string; prueba: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4" data-prueba={prueba} title={m.nota}>
      <p className="text-xs font-medium text-neutral-500">{etiqueta}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-neutral-900">{m.valor === null ? <span className="text-base font-semibold text-neutral-400">sin datos</span> : `${m.valor}${sufijo}`}</p>
      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-neutral-500">{m.nota}</p>
      <Serie m={m} />
    </div>
  )
}
