'use client'

/**
 * La línea de tiempo del caso: cada paso es un evento real de la cadena, con quién lo hizo, qué entró, qué salió, por
 * qué y cuánto tardó. En cada paso, el experto dice «bien» o «mal» y, si quiere, qué esperaba. Al correr un caso, los
 * pasos aparecen uno tras otro (el orden y los tiempos son los de la cadena; la animación solo los presenta).
 */
import { useEffect, useState } from 'react'
import type { PasoMesa, RetroPaso } from '../services/modelo'
import { Chip, ENTRADA_CLASE, TONO, TONO_QUIEN, milisegundos } from './ui'

function Gestos({ paso, retro, guarda }: { paso: PasoMesa; retro: RetroPaso | undefined; guarda: (gesto: 'bien' | 'mal', esperaba?: string) => Promise<void> }) {
  const [abierto, setAbierto] = useState(false)
  const [esperaba, setEsperaba] = useState(retro?.esperaba ?? '')
  const boton = (g: 'bien' | 'mal', icono: string, texto: string) => (
    <button type="button" aria-pressed={retro?.gesto === g} aria-label={`${texto}: ${paso.titulo}`} data-prueba={`gesto-${g}`}
      onClick={() => { if (g === 'mal') setAbierto(true); void guarda(g, g === 'mal' ? esperaba : undefined) }}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${retro?.gesto === g ? (g === 'bien' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-rose-600 bg-rose-600 text-white') : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'}`}>
      <span aria-hidden>{icono}</span>{texto}
    </button>
  )
  return (
    <div className="mt-3 border-t border-neutral-200/70 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-neutral-500">¿Este paso estuvo bien?</span>
        {boton('bien', '👍', 'Bien')}{boton('mal', '👎', 'Mal')}
        {retro ? <span className="text-xs text-emerald-700" data-prueba="retro-guardada">Guardado</span> : null}
      </div>
      {abierto || retro?.gesto === 'mal' ? (
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); void guarda('mal', esperaba) }}>
          <input value={esperaba} onChange={(e) => setEsperaba(e.target.value)} placeholder="¿Qué esperabas que hiciera aquí?" className={ENTRADA_CLASE} data-prueba="esperaba" aria-label="Qué esperabas" />
          <button type="submit" className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-semibold text-white" data-prueba="guarda-esperaba">Guardar</button>
        </form>
      ) : null}
    </div>
  )
}

const NOMBRE_ETAPA: Readonly<Record<PasoMesa['etapa'], string>> = {
  recibe: 'Recibe', evidencia: 'Evidencia', entiende: 'Entiende', busca: 'Busca', plan: 'Plan', sala: 'Sala', decide: 'Decides', aplica: 'Simulador',
  protege: 'Protege', aprende: 'Aprende', atiende: 'Atiende', presupuesto: 'Presupuesto',
}
const CON_REGLA: ReadonlyArray<PasoMesa['etapa']> = ['recibe', 'evidencia', 'entiende', 'busca', 'plan', 'sala', 'decide', 'aplica']
const SIN_REGLA: ReadonlyArray<PasoMesa['etapa']> = ['recibe', 'evidencia', 'entiende', 'busca', 'protege', 'aprende']
const PUNTO: Readonly<Record<PasoMesa['tono'], string>> = { bien: 'bg-emerald-500', aviso: 'bg-amber-500', mal: 'bg-rose-500', neutro: 'bg-violet-500' }

/** El mapa del recorrido: lo que ya pasó, en color; lo que falta, punteado. De un vistazo, dónde va el caso. */
function Etapas({ pasos }: { pasos: readonly PasoMesa[] }) {
  const hay = new Set(pasos.map((p) => p.etapa))
  const camino = (hay.has('protege') || hay.has('aprende') ? SIN_REGLA : CON_REGLA).filter((e) => e !== 'evidencia' || hay.has('evidencia'))
  return (
    <ol className="mb-5 flex flex-wrap items-center gap-1.5" data-prueba="etapas" aria-label="Las etapas del caso">
      {camino.map((e, k) => {
        const ultimo = [...pasos].reverse().find((p) => p.etapa === e)
        return (
          <li key={e} className="flex items-center gap-1.5">
            <a href={ultimo ? `#paso-${e}` : undefined} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${ultimo ? 'bg-white text-neutral-900 ring-1 ring-neutral-200 hover:ring-violet-300' : 'border border-dashed border-neutral-300 text-neutral-400'}`}>
              <span className={`h-2 w-2 rounded-full ${ultimo ? PUNTO[ultimo.tono] : 'bg-neutral-300'}`} aria-hidden />{NOMBRE_ETAPA[e]}{ultimo ? '' : ' · pendiente'}
            </a>
            {k < camino.length - 1 ? <span className="text-neutral-300" aria-hidden>→</span> : null}
          </li>
        )
      })}
    </ol>
  )
}

function Paso({ paso, retro, guarda, ultimo }: { paso: PasoMesa; retro: RetroPaso | undefined; guarda: (clave: string, gesto: 'bien' | 'mal', esperaba?: string) => Promise<void>; ultimo: boolean }) {
  const q = TONO_QUIEN[paso.quien]
  return (
    <li className="relative scroll-mt-24 pl-10" data-prueba={`paso-${paso.etapa}`} id={`paso-${paso.etapa}`}>
      {!ultimo ? <span className="absolute left-[13px] top-7 h-full w-0.5 bg-neutral-200" aria-hidden /> : null}
      <span className={`absolute left-1.5 top-4 h-4 w-4 rounded-full ring-4 ${q.punto}`} aria-hidden />
      <article className={`rounded-2xl border p-4 ${TONO[paso.tono]}`}>
        <header className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-neutral-900">{paso.titulo}</h3>
          <Chip className={q.chip}>{paso.quienDice}</Chip>
          <span className="ml-auto text-xs tabular-nums text-neutral-500" title="desde el paso anterior, con las fechas de la cadena">+{milisegundos(paso.ms)}</span>
        </header>
        {paso.entra ? <p className="mt-2 text-sm text-neutral-600"><span className="font-semibold text-neutral-500">Entra:</span> {paso.entra}</p> : null}
        <p className="mt-1 text-sm text-neutral-900"><span className="font-semibold text-neutral-500">{paso.entra ? 'Sale:' : 'Hace:'}</span> {paso.sale}</p>
        {paso.porque ? <p className="mt-1 text-xs text-neutral-600"><span className="font-semibold">Por qué:</span> {paso.porque}</p> : null}
        {paso.detalle.length ? (
          <details className="mt-2 text-xs text-neutral-600">
            <summary className="cursor-pointer font-semibold">Ver el detalle ({paso.detalle.length})</summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 font-mono">{paso.detalle.map((d) => <li key={d}>{d}</li>)}</ul>
          </details>
        ) : null}
        <Gestos paso={paso} retro={retro} guarda={(g, e) => guarda(paso.clave, g, e)} />
      </article>
    </li>
  )
}

export function LineaDeTiempo({ pasos, retro, guarda, revela }: { pasos: readonly PasoMesa[]; retro: Readonly<Record<string, RetroPaso>>; guarda: (clave: string, gesto: 'bien' | 'mal', esperaba?: string) => Promise<void>; revela: boolean }) {
  const [vistos, setVistos] = useState(revela ? 0 : pasos.length)
  useEffect(() => {
    const quieto = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!revela || quieto) { const t = setTimeout(() => setVistos(pasos.length), 0); return () => clearTimeout(t) }
    const t = setInterval(() => setVistos((n) => (n >= pasos.length ? n : n + 1)), 280)
    return () => clearInterval(t)
  }, [revela, pasos.length])
  const trabajando = vistos < pasos.length
  return (
    <div data-prueba="linea-de-tiempo">
      <Etapas pasos={pasos.slice(0, vistos)} />
      <ol className="space-y-3" aria-live="polite">
        {pasos.slice(0, vistos).map((p, k) => <Paso key={p.clave} paso={p} retro={retro[p.clave]} guarda={guarda} ultimo={k === pasos.length - 1} />)}
      </ol>
      {trabajando ? <p className="mt-3 pl-10 text-sm text-amber-700" data-prueba="trabajando">El agente está trabajando… ({vistos} de {pasos.length} pasos)</p> : null}
    </div>
  )
}
