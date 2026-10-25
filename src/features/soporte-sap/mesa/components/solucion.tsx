'use client'

/**
 * Lo que el agente propone y lo que decide el experto. Con regla: la solución con su fuente, el plan, la revisión del
 * supervisor y la sala (aprobar, rechazar o a revisión, con su motivo); al aprobar, el antes y el después del simulador.
 * Sin regla: «no lo sé», dicho con honestidad, y la enseñanza. En cuarentena: por qué nadie lo aprende y qué sigue igual.
 */
import { useState } from 'react'
import type { CasoVista, PlanMesa } from '../services/modelo'
import { Boton, Celda, Chip, ENTRADA_CLASE } from './ui'

function Sala({ plan, vivo, decide }: { plan: PlanMesa; vivo: boolean; decide: (accion: 'aprobar' | 'rechazar' | 'a_revision', motivo: string) => Promise<void> }) {
  const [motivo, setMotivo] = useState('')
  if (plan.decision) {
    const dice = { aprobar: 'Lo aprobaste', rechazar: 'Lo rechazaste', a_revision: 'Lo mandaste a revisión' }[plan.decision.accion] ?? plan.decision.accion
    return <p className="mt-3 text-sm font-semibold text-violet-800" data-prueba="decision">{dice}{plan.decision.motivo ? `: «${plan.decision.motivo}»` : ''}</p>
  }
  if (!plan.mensaje) return <p className="mt-3 text-sm text-neutral-600">Este plan no llegó a la sala: {plan.supervisor.resultado === 'a_la_sala' ? 'la consultora no lo escaló' : 'el supervisor no lo dejó pasar'}.</p>
  if (!vivo) return <p className="mt-3 text-sm text-neutral-600">El laboratorio se reinició: para decidir, vuelve a correr el caso.</p>
  return (
    <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4" data-prueba="sala">
      <p className="text-sm font-bold text-violet-900">Decides tú, en la sala</p>
      <p className="text-xs text-violet-800">Nada se aplica sin que una persona lo apruebe con su sesión. Se aplica en el simulador, no en ningún SAP.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Boton variante="bien" onClick={() => void decide('aprobar', '')} prueba="aprobar">Aprobar</Boton>
        <Boton variante="mal" onClick={() => void decide('rechazar', '')} prueba="rechazar">Rechazar</Boton>
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void decide('a_revision', motivo) }}>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Qué debe corregir el agente" className={ENTRADA_CLASE} data-prueba="motivo" aria-label="Motivo para revisión" />
        <Boton variante="secundario" tipo="submit" disabled={motivo.trim().length < 3} prueba="a-revision" className="shrink-0 whitespace-nowrap">A revisión</Boton>
      </form>
    </div>
  )
}

function Plan({ plan, vivo, decide }: { plan: PlanMesa; vivo: boolean; decide: (accion: 'aprobar' | 'rechazar' | 'a_revision', motivo: string) => Promise<void> }) {
  return (
    <div className="mt-4" data-prueba={`plan-v${plan.version}`}>
      <p className="text-sm font-bold text-neutral-900">El plan{plan.version > 1 ? ` · versión ${plan.version}` : ''}</p>
      <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-neutral-800">{plan.pasos.map((p) => <li key={p}>{p}</li>)}</ol>
      <p className="mt-2 text-xs text-neutral-600">Otro agente lo revisó: {plan.supervisor.verdes} de {plan.supervisor.total} comprobaciones en verde.</p>
      {plan.supervisor.fallan.length ? <ul className="mt-1 list-disc pl-5 text-xs text-rose-700">{plan.supervisor.fallan.map((f) => <li key={f}>{f}</li>)}</ul> : null}
      {plan.aplicado ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2" data-prueba="antes-despues">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-rose-700">Antes</p><p className="mt-1 text-sm text-neutral-900">{plan.aplicado.antes}</p><p className="mt-1 text-xs text-rose-700">{plan.aplicado.errorAntes ? 'el síntoma se reproduce' : 'sin síntoma'}</p></div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Después</p><p className="mt-1 text-sm text-neutral-900">{plan.aplicado.despues}</p><p className="mt-1 text-xs text-emerald-700">{plan.aplicado.errorDespues ? 'el síntoma sigue' : 'el síntoma ya no se reproduce'}</p></div>
          <p className="text-xs text-neutral-500 sm:col-span-2">Es el simulador del laboratorio, no tu SAP: llevarlo a un SAP real lo hace una persona, con su acceso y su control de cambios (D6).</p>
        </div>
      ) : <Sala plan={plan} vivo={vivo} decide={decide} />}
    </div>
  )
}

function Ensenanza({ caso, ensena }: { caso: CasoVista; ensena: (texto: string) => Promise<string | null> }) {
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const manda = async () => { const e = await ensena(texto); setError(e); if (!e) setTexto('') }
  return (
    <div className="mt-4 rounded-2xl border border-violet-200 bg-white p-4" data-prueba="ensenanza">
      <p className="text-sm font-bold text-violet-900">Enséñale cómo se resuelve</p>
      <p className="text-xs text-neutral-600">Lo que le enseñes queda como <b>propuesta</b>, a medida de la consultora del caso y anonimizada. No es una regla: la firma el laboratorio (D2).</p>
      <ul className="mt-3 space-y-2" data-prueba="conversacion">
        {caso.ensenanza.map((t, k) => (
          <li key={k} className={t.autor === 'tu' ? 'text-right' : ''}>
            <span className={`inline-block max-w-[90%] rounded-2xl px-3 py-2 text-left text-sm ${t.autor === 'tu' ? 'bg-violet-700 text-white' : 'bg-neutral-100 text-neutral-900'}`}>{t.texto}</span>
          </li>
        ))}
      </ul>
      {caso.vivo ? (
        <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); void manda() }}>
          <textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Por ejemplo: hay que limpiar la caché del launchpad con /UI2/INVALIDATE_GLOBAL_CACHES y volver a entrar" className={ENTRADA_CLASE} data-prueba="texto-ensenanza" aria-label="Lo que le enseñas al agente" />
          {error ? <p className="text-xs font-semibold text-rose-700" role="alert" data-prueba="error-ensenanza">{error}</p> : null}
          <Boton tipo="submit" disabled={texto.trim().length < 10} prueba="ensenar">Enseñar</Boton>
        </form>
      ) : <p className="mt-3 text-xs text-neutral-600">El laboratorio se reinició: para seguir enseñándole, vuelve a correr el caso.</p>}
      {caso.propuestas.length ? (
        <div className="mt-4 space-y-2" data-prueba="propuestas">
          {caso.propuestas.map((p, k) => (
            <div key={k} className="rounded-2xl border border-dashed border-violet-300 bg-violet-50 p-3">
              <div className="flex flex-wrap items-center gap-2"><Chip className="bg-violet-200 text-violet-900">{p.tipo === 'cli' ? 'Propuesta de CLI' : 'Propuesta de regla'}</Chip><span className="text-xs text-violet-800">{p.estado}</span></div>
              <p className="mt-1 text-sm font-semibold text-neutral-900">{p.titulo}</p>
              <p className="mt-1 text-xs text-neutral-700">{p.detalle}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function Solucion({ caso, decide, ensena }: { caso: CasoVista; decide: (accion: 'aprobar' | 'rechazar' | 'a_revision', motivo: string) => Promise<void>; ensena: (texto: string) => Promise<string | null> }) {
  const r = caso.resultado
  const cuarentena = caso.sandbox?.veredicto === 'cuarentena'
  return (
    <Celda prueba="solucion" titulo="Lo que propone el agente">
      {r.tipo === 'solucion' || r.tipo === 'grado_insuficiente' ? (
        <div className={`rounded-2xl border p-4 ${r.tipo === 'solucion' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`} data-prueba={`resultado-${r.tipo}`}>
          <div className="flex flex-wrap items-center gap-2"><Chip className="bg-white text-neutral-900">{r.regla}</Chip><Chip className="bg-white text-neutral-700">grado {r.grado}</Chip></div>
          <p className="mt-2 text-base font-bold text-neutral-900">{r.titulo}</p>
          <p className="mt-1 text-sm text-neutral-800">{r.resumen}</p>
          <p className="mt-2 text-xs text-neutral-600">Fuente: {r.cita}{r.url ? <> · <span className="font-mono">{r.url}</span></> : null}</p>
          <p className="mt-1 text-xs text-neutral-500">La matriz del laboratorio es sintética: sus notas no son notas de SAP.</p>
          {r.tipo === 'grado_insuficiente' ? <p className="mt-2 text-sm font-semibold text-amber-800">Su grado no alcanza para aplicarla sola: no se propone un plan. Dinos en tu veredicto si la regla es la correcta.</p> : null}
        </div>
      ) : cuarentena ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4" data-prueba="cuarentena">
          <p className="text-base font-bold text-amber-900">Este caso queda en cuarentena</p>
          <p className="mt-1 text-sm text-amber-900">Es de RR. HH. o nómina, o trae algo con forma de dato personal: no entra al sandbox y nadie lo aprende, aunque esté bien anonimizado (D14). La atención y el reloj del SLA siguen igual con su consultora.</p>
          {caso.sandbox?.senales.length ? <p className="mt-2 text-xs text-amber-800">Por qué: {caso.sandbox.senales.join('; ')}</p> : null}
          <p className="mt-2 text-xs text-amber-800">Tu veredicto sí se guarda: dinos qué debería hacer la herramienta con casos así.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4" data-prueba="no-lo-se">
          <p className="text-base font-bold text-neutral-900">No lo sé</p>
          <p className="mt-1 text-sm text-neutral-700">No tiene una regla para este caso, y no inventa una respuesta: lo pasa al sandbox, anonimizado, para aprenderlo contigo.</p>
          {caso.sandbox?.texto ? <p className="mt-2 rounded-xl bg-white p-2 font-mono text-xs text-neutral-600">Así lo ve el sandbox: {caso.sandbox.texto}</p> : null}
        </div>
      )}
      {caso.planes.map((p) => <Plan key={p.version} plan={p} vivo={caso.vivo} decide={decide} />)}
      {r.tipo === 'sin_solucion' && !cuarentena ? <Ensenanza caso={caso} ensena={ensena} /> : null}
    </Celda>
  )
}
