'use client'

/**
 * Lo que dijo el experto, para el laboratorio: el agregado (veredictos, qué encontró el agente, en qué paso falla más) y
 * cada caso con su retro. Lo de prueba se ve aparte. Cada número viene contado del almacén por el servidor.
 */
import { useCallback, useEffect, useState } from 'react'
import type { CasoMesa, LaboratorioVista, Veredicto } from '../services/modelo'
import { Celda, Chip, fechaCorta } from './ui'

const API = '/api/mesa/soporte-sap?vista=laboratorio'
const VEREDICTO: Readonly<Record<Veredicto | 'sin_veredicto', string>> = { resuelto: 'Lo resolvió', parcial: 'En parte', incorrecto: 'Se equivocó', debio_no_lo_se: 'Debió decir «no lo sé»', sin_veredicto: 'Sin veredicto' }

function Numero({ valor, etiqueta, prueba }: { valor: number; etiqueta: string; prueba?: string }) {
  return <div className="rounded-2xl bg-neutral-50 p-4" data-prueba={prueba}><p className="text-3xl font-bold tabular-nums text-neutral-900">{valor}</p><p className="text-xs text-neutral-600">{etiqueta}</p></div>
}

function Caso({ c, borra }: { c: CasoMesa; borra: (id: string) => void }) {
  const marcados = c.pasos.filter((p) => c.retro.pasos[p.clave])
  return (
    <li className="rounded-2xl border border-neutral-200 bg-white p-4" data-prueba={`lab-caso-${c.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip className="bg-neutral-900 text-white">{c.entrada.sistema}</Chip><Chip>{c.entrada.modulo}</Chip>
        {c.entrada.transaccion ? <Chip className="font-mono">{c.entrada.transaccion}</Chip> : null}
        <Chip className={c.retro.veredicto ? 'bg-violet-100 text-violet-900' : 'bg-neutral-100 text-neutral-500'}>{VEREDICTO[c.retro.veredicto?.valor ?? 'sin_veredicto']}</Chip>
        {c.sandbox?.veredicto === 'cuarentena' ? <Chip className="bg-amber-100 text-amber-900">cuarentena</Chip> : null}
        {c.por.prueba ? <Chip className="bg-amber-100 text-amber-900">de prueba</Chip> : null}
        <span className="ml-auto text-xs text-neutral-500">{c.por.correo} · {fechaCorta(c.creado)}</span>
      </div>
      <p className="mt-2 text-sm text-neutral-900">{c.entrada.sintoma}</p>
      <p className="mt-1 text-xs text-neutral-600">El agente: {c.resultado.tipo === 'sin_solucion' ? '«no lo sé»' : `${c.resultado.titulo} (${c.resultado.regla})`}</p>
      {c.retro.veredicto?.solucion ? <p className="mt-2 rounded-xl bg-violet-50 p-2 text-sm text-violet-900"><b>Solución correcta, según el experto:</b> {c.retro.veredicto.solucion}</p> : null}
      {c.retro.veredicto?.nota ? <p className="mt-1 text-xs text-neutral-700">Nota: {c.retro.veredicto.nota}</p> : null}
      {marcados.length ? (
        <ul className="mt-2 space-y-1 text-xs">{marcados.map((p) => { const r = c.retro.pasos[p.clave]!; return <li key={p.clave} className={r.gesto === 'mal' ? 'text-rose-700' : 'text-emerald-700'}>{r.gesto === 'mal' ? '👎' : '👍'} {p.titulo}{r.esperaba ? ` — esperaba: ${r.esperaba}` : ''}</li> })}</ul>
      ) : null}
      {c.propuestas.map((p, k) => <p key={k} className="mt-1 text-xs text-violet-800">Propuesta de {p.tipo === 'cli' ? 'CLI' : 'regla'} ({p.estado}): {p.detalle}</p>)}
      <button type="button" onClick={() => borra(c.id)} className="mt-3 text-xs text-rose-700 underline" data-prueba="borrar">Borrar este caso</button>
    </li>
  )
}

export function Laboratorio() {
  const [v, setV] = useState<LaboratorioVista | null>(null)
  const [error, setError] = useState<string | null>(null)
  // El estado lo escribe la promesa: el efecto solo consulta (react-hooks/set-state-in-effect).
  const carga = useCallback(() => {
    fetch(API, { cache: 'no-store' })
      .then(async (r) => { if (r.ok) setV((await r.json()) as LaboratorioVista); else setError(`la mesa respondió ${r.status}`) })
      .catch(() => setError('no hay conexión con la mesa'))
  }, [])
  useEffect(() => { carga() }, [carga])
  const borra = async (caso: string) => {
    if (!window.confirm('¿Borrar este caso y su retroalimentación? No se puede deshacer.')) return
    await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tipo: 'borra', caso }) })
    carga()
  }
  if (error) return <Celda><p className="text-sm text-neutral-700">{error}</p></Celda>
  if (!v) return <p className="text-sm text-neutral-500">Leyendo lo que dijo el experto…</p>
  const a = v.agregado
  return (
    <div className="space-y-4" data-prueba="laboratorio">
      <Celda titulo="Lo que dijo el experto" nota={`Contado de los casos guardados en ${v.almacen}. Lo de prueba (la automatización) se cuenta aparte.`}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Numero valor={a.deExpertos} etiqueta="casos de expertos" prueba="lab-casos" />
          <Numero valor={a.porResultado.sin_solucion} etiqueta="veces dijo «no lo sé»" />
          <Numero valor={a.ensenanzasPorFirmar} etiqueta="enseñanzas esperan tu firma" />
          <Numero valor={a.dePrueba} etiqueta="casos de prueba" />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm font-bold">Veredictos</p>
            <ul className="mt-2 space-y-1 text-sm">{(Object.keys(VEREDICTO) as Array<keyof typeof VEREDICTO>).map((k) => <li key={k} className="flex justify-between"><span>{VEREDICTO[k]}</span><span className="tabular-nums font-semibold">{a.porVeredicto[k]}</span></li>)}</ul>
          </div>
          <div>
            <p className="text-sm font-bold">En qué paso falla más el agente</p>
            {a.pasosMal.length ? <ul className="mt-2 space-y-1 text-sm" data-prueba="pasos-mal">{a.pasosMal.map((p) => <li key={p.etapa} className="flex justify-between"><span>{p.titulo}</span><span className="tabular-nums"><span className="text-rose-700">👎 {p.mal}</span> · <span className="text-emerald-700">👍 {p.bien}</span></span></li>)}</ul> : <p className="mt-2 text-sm text-neutral-500">Todavía nadie marcó un paso.</p>}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={`${API}&export=md`} className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white" data-prueba="export-md">Exportar para un PRP (Markdown)</a>
          <a href={`${API}&export=json`} className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold" data-prueba="export-json">Exportar todo (JSON)</a>
        </div>
      </Celda>
      <Celda titulo="Caso por caso">{v.casos.length ? <ul className="space-y-3">{v.casos.map((c) => <Caso key={c.id} c={c} borra={(id) => void borra(id)} />)}</ul> : <p className="text-sm text-neutral-500">Todavía no hay casos.</p>}</Celda>
    </div>
  )
}
