'use client'

/**
 * La impugnación (PRP-010 H-10): el cliente impugna la prioridad, la categoría, la complejidad o una pausa del reloj de
 * su incidencia, con su motivo; la consultora la resuelve a su nombre. No reescribe la queja, y una resuelta no se
 * reabre. Las mismas reglas que `ss_impugnacion` en la base.
 */
import { useState, type FormEvent } from 'react'
import type { ImpugnacionVista, Rol } from '../services/tipos'
import { Pildora, hora } from './ui'

const CAMPOS = [['prioridad', 'la prioridad'], ['categoria', 'la categoría'], ['complejidad', 'la complejidad'], ['pausa', 'una pausa del reloj'], ['resolucion', 'que quedó resuelta']] as const

export function Impugnaciones({ incidencia, lista, rol, actua }: { incidencia: string; lista: readonly ImpugnacionVista[]; rol: Rol; actua: (a: object) => Promise<void> }) {
  return (
    <div data-prueba="impugnaciones">
      <h3 className="font-semibold">Impugnaciones <span className="font-normal text-neutral-500">(el cliente impugna; la consultora resuelve a su nombre y no se reabre)</span></h3>
      {lista.length === 0 ? <p className="text-xs text-neutral-500">Sin impugnaciones.</p> : null}
      <ul className="mt-1 space-y-1 text-xs">{lista.map((m) => (
        <li key={m.id} data-prueba={`impugnacion-${m.id}`}>
          <Pildora tono={m.estado === 'abierta' ? 'aviso' : m.estado === 'aceptada' ? 'bien' : 'neutro'}>{m.estado}</Pildora> {m.campo} · «{m.motivo}» · {m.por}, {hora(m.creada)}
          {m.resueltaPor ? <span className="text-neutral-500"> · resuelta por {m.resueltaPor}, {hora(m.resuelta ?? '')}</span> : null}
          {rol === 'consultor' && m.estado === 'abierta' ? (
            <span className="ml-2 inline-flex gap-1">
              <button type="button" onClick={() => actua({ tipo: 'resuelve_impugnacion', incidencia, impugnacion: m.id, decision: 'aceptada' })} className="rounded border px-2 py-0.5" data-prueba="impugnacion-acepta">Aceptar</button>
              <button type="button" onClick={() => actua({ tipo: 'resuelve_impugnacion', incidencia, impugnacion: m.id, decision: 'rechazada' })} className="rounded border px-2 py-0.5" data-prueba="impugnacion-rechaza">Rechazar</button>
            </span>
          ) : null}
        </li>
      ))}</ul>
      {rol === 'cliente' ? <Impugna incidencia={incidencia} actua={actua} /> : null}
    </div>
  )
}

function Impugna({ incidencia, actua }: { incidencia: string; actua: (a: object) => Promise<void> }) {
  const [campo, setCampo] = useState<(typeof CAMPOS)[number][0]>('prioridad')
  const [motivo, setMotivo] = useState('')
  const envia = async (ev: FormEvent) => {
    ev.preventDefault()
    if (motivo.trim().length < 10) return
    await actua({ tipo: 'impugna', incidencia, campo, motivo: motivo.trim() })
    setMotivo('')
  }
  return (
    <form onSubmit={envia} className="mt-2 flex flex-wrap gap-2" data-prueba="impugna">
      <select value={campo} onChange={(e) => setCampo(e.target.value as typeof campo)} className="rounded border px-2 py-1 text-xs" aria-label="Qué impugnas" data-prueba="impugna-campo">
        {CAMPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
      <input value={motivo} onChange={(e) => setMotivo(e.target.value)} minLength={10} maxLength={2000} placeholder="Por qué (10 caracteres o más)"
        className="flex-1 rounded border px-2 py-1 text-xs" aria-label="Motivo de la impugnación" data-prueba="impugna-motivo" />
      <button type="submit" className="rounded border px-2 py-1 text-xs" data-prueba="impugna-envia">Impugnar</button>
    </form>
  )
}
