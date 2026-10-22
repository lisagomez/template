'use client'

/**
 * Validar conocimiento: los candidatos que salen de sapstack, para que el experto diga si son ciertos. Arriba, de dónde
 * salen y qué pasa con lo que diga; luego filtros (módulo, tipo, pendientes) y las tarjetas, de 12 en 12.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Candidato, CandidatosVista, ValidacionCandidato } from '../services/modelo-candidatos'
import { TarjetaCandidato, type Envia } from './candidato'
import { Celda, Chip, ENTRADA_CLASE } from './ui'

const API = '/api/mesa/soporte-sap'
const POR_PAGINA = 12
type Filtro = { modulo: string; tipo: 'todos' | 'tcode' | 'nota'; estado: 'pendientes' | 'validados' | 'todos'; busca: string; alcance: boolean }

/** Lo validado en esta visita se queda a la vista aunque el filtro sea «por validar»: el experto ve su confirmación. */
const pasa = (f: Filtro, mias: Readonly<Record<string, ValidacionCandidato>>, recientes: ReadonlySet<string>) => (c: Candidato) =>
  (f.modulo === 'todos' || c.modulos.includes(f.modulo)) && (f.tipo === 'todos' || c.tipo === f.tipo) && (!f.alcance || c.enAlcance)
  && (f.estado === 'todos' || recientes.has(c.id) || (f.estado === 'validados') === Boolean(mias[c.id]))
  && (!f.busca || `${c.clave} ${c.titulo}`.toLowerCase().includes(f.busca.toLowerCase()))

function Encabezado({ v, hechas }: { v: CandidatosVista; hechas: number }) {
  const total = v.candidatos.filter((c) => c.enAlcance).length
  return (
    <Celda prueba="candidatos-encabezado" titulo="Validar conocimiento" nota="Hipótesis de una fuente externa: dinos si son ciertas. Lo que digas es una propuesta para el laboratorio; el agente no cambia hasta que el laboratorio firme una regla con una fuente citable.">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Chip className="bg-neutral-900 text-white">{v.fuente.repo}@{v.fuente.sha.slice(0, 7)}</Chip>
        <Chip>{v.fuente.version} · {v.fuente.commitFecha}</Chip><Chip>{v.fuente.licencia} · {v.fuente.copyright}</Chip>
        <span className="ml-auto font-semibold text-violet-900" data-prueba="progreso">Validaste {hechas} de {total} en alcance</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100" aria-hidden><div className="h-full rounded-full bg-violet-600" style={{ width: `${total ? (100 * hechas) / total : 0}%` }} /></div>
    </Celda>
  )
}

function Filtros({ f, set, modulos }: { f: Filtro; set: (f: Filtro) => void; modulos: readonly string[] }) {
  const pastilla = (activa: boolean) => `rounded-full px-3 py-1 text-xs font-semibold ${activa ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50'}`
  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-neutral-200 bg-white p-4" data-prueba="filtros">
      <div className="flex flex-wrap gap-1.5">{['todos', ...modulos].map((m) => <button key={m} type="button" className={pastilla(f.modulo === m)} onClick={() => set({ ...f, modulo: m })} data-prueba={`modulo-${m}`}>{m === 'todos' ? 'Todos los módulos' : m}</button>)}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {(['pendientes', 'validados', 'todos'] as const).map((e) => <button key={e} type="button" className={pastilla(f.estado === e)} onClick={() => set({ ...f, estado: e })}>{e === 'pendientes' ? 'Por validar' : e === 'validados' ? 'Ya validados' : 'Todos'}</button>)}
        <span className="mx-1 h-4 w-px bg-neutral-200" aria-hidden />
        {(['todos', 'tcode', 'nota'] as const).map((t) => <button key={t} type="button" className={pastilla(f.tipo === t)} onClick={() => set({ ...f, tipo: t })}>{t === 'todos' ? 'T-codes y Notes' : t === 'tcode' ? 'T-codes' : 'SAP Notes'}</button>)}
        <label className="ml-1 inline-flex items-center gap-1.5 text-xs text-neutral-700"><input type="checkbox" checked={f.alcance} onChange={(e) => set({ ...f, alcance: e.target.checked })} />Solo módulos que atiende Soporte SAP</label>
        <input aria-label="Buscar un T-code o un título" placeholder="Buscar: MIRO, F110, pago…" className={`${ENTRADA_CLASE} sm:ml-auto sm:w-64`} value={f.busca} onChange={(e) => set({ ...f, busca: e.target.value })} data-prueba="busca" />
      </div>
    </div>
  )
}

export function Candidatos() {
  const [v, setV] = useState<CandidatosVista | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [f, setF] = useState<Filtro>({ modulo: 'todos', tipo: 'todos', estado: 'pendientes', busca: '', alcance: true })
  const [paginas, setPaginas] = useState(1)
  const [recientes, setRecientes] = useState<ReadonlySet<string>>(new Set())
  const carga = useCallback(() => {
    fetch(`${API}?vista=candidatos`, { cache: 'no-store' })
      .then(async (r) => { if (r.ok) setV((await r.json()) as CandidatosVista); else setError(`la mesa respondió ${r.status}`) })
      .catch(() => setError('no hay conexión con la mesa'))
  }, [])
  useEffect(() => { carga() }, [carga])
  const modulos = useMemo(() => [...new Set((v?.candidatos ?? []).filter((c) => !f.alcance || c.enAlcance).flatMap((c) => c.modulos))].sort(), [v, f.alcance])
  const envia: Envia = async (x) => {
    const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tipo: 'valida_candidato', ...x }) })
    const d = (await r.json().catch(() => ({}))) as { validacion?: ValidacionCandidato; error?: string }
    if (!r.ok || !d.validacion) return d.error ?? `la mesa respondió ${r.status}`
    const val = d.validacion
    setV((x0) => (x0 ? { ...x0, mias: { ...x0.mias, [val.candidato]: val } } : x0))
    setRecientes((r) => new Set([...r, val.candidato]))
    return null
  }
  if (error) return <Celda><p className="text-sm text-neutral-700">{error}</p></Celda>
  if (!v) return <p className="text-sm text-neutral-500">Leyendo los candidatos…</p>
  if (!v.fuente.integro) return <Celda prueba="catalogo-roto" titulo="Los candidatos no se cargaron"><p className="text-sm text-rose-800">{v.fuente.motivo}</p></Celda>
  const visibles = v.candidatos.filter(pasa(f, v.mias, recientes))
  return (
    <div className="space-y-4" data-prueba="candidatos">
      <Encabezado v={v} hechas={v.candidatos.filter((c) => c.enAlcance && v.mias[c.id]).length} />
      <Filtros f={f} set={(x) => { setF(x); setPaginas(1); setRecientes(new Set()) }} modulos={modulos} />
      <p className="px-1 text-xs text-neutral-500" data-prueba="conteo-candidatos">{visibles.length} candidato(s) con estos filtros</p>
      <ul className="grid gap-4 lg:grid-cols-2">
        {visibles.slice(0, paginas * POR_PAGINA).map((c) => <TarjetaCandidato key={c.id} c={c} fuente={v.fuente} previa={v.mias[c.id] ?? null} envia={envia} />)}
      </ul>
      {visibles.length > paginas * POR_PAGINA ? <div className="text-center"><button type="button" className="rounded-full bg-white px-4 py-2 text-sm font-semibold ring-1 ring-neutral-200 hover:bg-neutral-50" onClick={() => setPaginas(paginas + 1)}>Ver {Math.min(POR_PAGINA, visibles.length - paginas * POR_PAGINA)} más</button></div> : null}
    </div>
  )
}
