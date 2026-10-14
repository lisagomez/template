'use client'

/**
 * El journey de experiencia: un mapa de carriles (quién actúa en cada paso) y, debajo, cada paso con lo que la persona
 * hace, ve y necesita, quién decide, qué se mide y qué se protege, su captura del producto y el enlace a ese momento de
 * la vitrina. El filtro por nivel deja ver el recorrido de una sola persona.
 */
import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { FASES, JOURNEY, NIVELES, type Nivel, type PasoJourney } from '../contenido/journey'
import { captura, RAIZ_DE_LA_VITRINA as R } from '../contenido/capturas'
import { EtiquetaNivel, TONO_NIVEL } from './bento'

const CARRILES: readonly Nivel[] = ['N3', 'N2', 'N1', 'agente']

function Mapa({ filtro }: { filtro: Nivel | null }) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-neutral-200 bg-white p-4" data-prueba="mapa-journey">
      <table className="w-full min-w-[900px] border-separate border-spacing-x-1 border-spacing-y-2 text-xs">
        <thead><tr><th className="w-40" />{JOURNEY.map((p, k) => <th key={p.id} className="font-semibold text-neutral-400">{k + 1}</th>)}</tr></thead>
        <tbody>
          {CARRILES.map((c) => (
            <tr key={c} className={filtro && filtro !== c ? 'opacity-30' : ''}>
              <th className="pr-2 text-left font-semibold text-neutral-700">{NIVELES[c].nombre}</th>
              {JOURNEY.map((p, k) => (
                <td key={p.id} className="text-center">
                  {p.nivel === c ? <a href={`#${p.id}`} title={`${k + 1}. ${p.titulo}`} className={`mx-auto block h-6 w-6 rounded-full ${TONO_NIVEL[c].fuerte}`} aria-label={`${k + 1}. ${p.titulo}`} /> : <span className="mx-auto block h-px w-full bg-neutral-200" />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const FILAS: ReadonlyArray<[keyof PasoJourney, string]> = [['ve', 'Ve'], ['necesita', 'Necesita'], ['decide', 'Decide'], ['mide', 'Se mide'], ['protege', 'Se protege']]

function Paso({ p, n }: { p: PasoJourney; n: number }) {
  return (
    <article id={p.id} className={`grid scroll-mt-24 gap-6 rounded-3xl border bg-white p-6 lg:grid-cols-5 ${TONO_NIVEL[p.nivel].borde}`} data-prueba={`paso-${p.id}`}>
      <div className="lg:col-span-3">
        <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold text-neutral-400">{n}</span><EtiquetaNivel nivel={p.nivel} /><span className="text-sm text-neutral-500">{p.quien}</span></div>
        <h3 className="mt-2 text-xl font-bold">{p.titulo}</h3>
        <p className="mt-2 text-neutral-700">{p.hace}</p>
        <dl className="mt-4 grid gap-2 text-sm">
          {FILAS.filter(([k]) => p[k]).map(([k, t]) => (
            <div key={k} className="grid grid-cols-[6.5rem_1fr] gap-2"><dt className="font-semibold text-neutral-500">{t}</dt><dd className="text-neutral-800">{p[k] as string}</dd></div>
          ))}
        </dl>
        <Link href={`${R}/niveles?momento=${p.momento}&rol=${p.rol}`} className="mt-4 inline-flex rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Verlo en la vitrina →</Link>
      </div>
      <a href={captura(p.captura)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 lg:col-span-2" title="Abrir la captura entera">
        <Image src={captura(p.captura)} alt={`Captura del producto: ${p.titulo}`} width={1440} height={900} unoptimized loading={n === 1 ? "eager" : "lazy"} className="h-72 w-full object-cover object-top" />
      </a>
    </article>
  )
}

export function Journey() {
  const [filtro, setFiltro] = useState<Nivel | null>(null)
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" data-prueba="filtro-nivel">
        <button type="button" onClick={() => setFiltro(null)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${filtro === null ? 'bg-neutral-900 text-white' : 'border border-neutral-300'}`}>Todos</button>
        {CARRILES.map((c) => <button key={c} type="button" onClick={() => setFiltro(c)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${filtro === c ? TONO_NIVEL[c].fuerte : 'border border-neutral-300'}`}>{NIVELES[c].nombre}</button>)}
      </div>
      <Mapa filtro={filtro} />
      {JOURNEY.map((p, k) => {
        // En orden del recorrido: la fase se anuncia cada vez que cambia, aunque vuelva (la decisión vuelve tras aprender).
        const fase = k === 0 || JOURNEY[k - 1]!.fase !== p.fase ? FASES.find((f) => f.id === p.fase)! : null
        return (
          <div key={p.id} className="space-y-4">
            {fase ? <header className="rounded-3xl bg-neutral-900 p-6 text-white"><h2 className="text-2xl font-bold">{fase.titulo}</h2><p className="mt-1 text-neutral-300">{fase.idea}</p></header> : null}
            {filtro && p.nivel !== filtro ? null : <Paso p={p} n={k + 1} />}
          </div>
        )
      })}
    </div>
  )
}
