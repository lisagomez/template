'use client'

/**
 * Los tres niveles, congelados: se elige un momento del journey y se ve lo que el producto le mostraba a cada rol en ese
 * instante, con su mismo componente y de solo lectura. Cada momento se baja aparte (`public/vitrina/.../momentos`).
 */
import { useEffect, useState } from 'react'
import { SoporteSap } from '../../components/soporte-sap'
import type { Rol, Vista } from '../../services/tipos'
import { RAIZ_DE_LA_VITRINA as R } from '../contenido/capturas'

export interface Momento { readonly id: string; readonly titulo: string; readonly resumen: string }
type Vistas = Readonly<Record<Rol, Vista>>

export function Niveles({ momentos, momentoInicial, rolInicial }: { momentos: readonly Momento[]; momentoInicial: string; rolInicial: Rol }) {
  const [elegido, setElegido] = useState(momentoInicial)
  const [cargado, setCargado] = useState<{ id: string; vistas: Vistas } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    fetch(`${R}/momentos/${elegido}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Vistas>) : Promise.reject(new Error(`no se pudo cargar el momento (${r.status})`))))
      .then((vistas) => { if (vigente) { setCargado({ id: elegido, vistas }); setError(null) } })
      .catch((e: Error) => { if (vigente) setError(e.message) })
    return () => { vigente = false }
  }, [elegido])

  const indice = momentos.findIndex((m) => m.id === elegido)
  const actual = momentos[indice]
  return (
    <div>
      <ol className="flex gap-2 overflow-x-auto pb-2" data-prueba="momentos" aria-label="Momentos del journey">
        {momentos.map((m, k) => (
          <li key={m.id} className="shrink-0">
            <button type="button" onClick={() => setElegido(m.id)} aria-current={m.id === elegido ? 'step' : undefined} data-prueba={`momento-${m.id}`}
              className={`flex w-44 flex-col rounded-2xl border p-3 text-left text-xs transition ${m.id === elegido ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white hover:border-neutral-400'}`}>
              <span className="font-semibold opacity-70">Momento {k + 1}</span>
              <span className="mt-1 font-semibold leading-snug">{m.titulo}</span>
            </button>
          </li>
        ))}
      </ol>
      {actual ? <p className="mt-3 max-w-3xl text-neutral-700" data-prueba="momento-resumen"><strong>{actual.titulo}.</strong> {actual.resumen}</p> : null}
      <div className="mt-4 flex gap-2">
        <button type="button" disabled={indice <= 0} onClick={() => setElegido(momentos[indice - 1]!.id)} className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm disabled:opacity-40">← Momento anterior</button>
        <button type="button" disabled={indice >= momentos.length - 1} onClick={() => setElegido(momentos[indice + 1]!.id)} className="rounded-full bg-neutral-900 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">Siguiente momento →</button>
      </div>
      {error ? <p className="mt-6 rounded-2xl bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
      <div className="-mx-4 mt-2">
        {cargado ? <SoporteSap inicial={cargado.vistas[rolInicial]} fuente={{ modo: 'vitrina', vistas: cargado.vistas }} />
          : error ? null : <p className="px-4 py-10 text-neutral-500">Cargando el momento…</p>}
      </div>
    </div>
  )
}
