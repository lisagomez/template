'use client'

/** El veredicto del experto sobre el caso entero: qué hizo bien el agente y, si se equivocó, cuál es la solución correcta. */
import { useState } from 'react'
import type { CasoVista, Veredicto } from '../services/modelo'
import { Boton, Celda, ENTRADA_CLASE } from './ui'

const OPCIONES: ReadonlyArray<{ valor: Veredicto; icono: string; texto: string; ayuda: string }> = [
  { valor: 'resuelto', icono: '✅', texto: 'Lo resolvió', ayuda: 'La solución es la correcta' },
  { valor: 'parcial', icono: '🟡', texto: 'En parte', ayuda: 'Iba bien, pero faltó algo' },
  { valor: 'incorrecto', icono: '❌', texto: 'Se equivocó', ayuda: 'La solución no es esa' },
  { valor: 'debio_no_lo_se', icono: '🤔', texto: 'Debió decir «no lo sé»', ayuda: 'Contestó sin saber' },
]

export function VeredictoDelCaso({ caso, guarda }: { caso: CasoVista; guarda: (valor: Veredicto, solucion: string, nota: string) => Promise<string | null> }) {
  const v = caso.retro.veredicto
  const [valor, setValor] = useState<Veredicto | null>(v?.valor ?? null)
  const [solucion, setSolucion] = useState(v?.solucion ?? '')
  const [nota, setNota] = useState(v?.nota ?? '')
  const [estado, setEstado] = useState<string | null>(null)
  const pideSolucion = valor === 'incorrecto' || valor === 'parcial'
  const manda = async () => {
    if (!valor) return
    const e = await guarda(valor, solucion, nota)
    setEstado(e ?? 'Guardado: el laboratorio lo leerá')
  }
  return (
    <Celda prueba="veredicto" titulo="Tu veredicto" nota="Sobre el caso entero. Es lo que más le sirve al laboratorio para mejorar al agente.">
      <div className="grid grid-cols-2 gap-2">
        {OPCIONES.map((o) => (
          <button key={o.valor} type="button" aria-pressed={valor === o.valor} onClick={() => setValor(o.valor)} data-prueba={`veredicto-${o.valor}`}
            className={`rounded-2xl border p-3 text-left ${valor === o.valor ? 'border-violet-600 bg-violet-50 ring-2 ring-violet-200' : 'border-neutral-200 bg-white hover:bg-neutral-50'}`}>
            <span className="text-lg" aria-hidden>{o.icono}</span>
            <span className="block text-sm font-bold text-neutral-900">{o.texto}</span>
            <span className="block text-xs text-neutral-500">{o.ayuda}</span>
          </button>
        ))}
      </div>
      {valor ? (
        <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); void manda() }}>
          {pideSolucion || valor === 'debio_no_lo_se' ? (
            <textarea rows={3} value={solucion} onChange={(e) => setSolucion(e.target.value)} data-prueba="solucion-correcta" className={ENTRADA_CLASE}
              placeholder={pideSolucion ? 'La solución correcta, como se la explicarías a un colega (obligatoria)' : 'Si sabes la solución, cuéntala (opcional)'} aria-label="La solución correcta" />
          ) : null}
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Una nota para el laboratorio (opcional)" className={ENTRADA_CLASE} data-prueba="nota" aria-label="Nota para el laboratorio" />
          <Boton tipo="submit" disabled={pideSolucion && !solucion.trim()} prueba="guarda-veredicto">Guardar veredicto</Boton>
          {estado ? <p className="text-xs font-semibold text-violet-800" role="status" data-prueba="veredicto-estado">{estado}</p> : null}
        </form>
      ) : null}
    </Celda>
  )
}
