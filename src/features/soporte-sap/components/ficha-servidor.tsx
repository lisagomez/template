'use client'

/**
 * La ficha de servidor de cada consultora (PRP-010, fase 3): el modo, la última medición de `configura:deploy`, las tres
 * preguntas sobre snapshots con su respuesta y si se probó una restauración en esa máquina. No crea servidores, y no
 * dice «apto» sin la restauración probada (GATE 3).
 */
import type { FichaVista } from '../services/tipos'
import { Celda, Pildora } from './ui'

export function FichasDeServidor({ fichas }: { fichas: readonly FichaVista[] }) {
  return (
    <Celda titulo="Ficha de servidor por consultora" ancho={6} prueba="fichas"
      nota="Se mide con configura:deploy. No crea servidores (es un cobro: gate humano). No dice «apto» sin una restauración probada en esa máquina (GATE 3).">
      <ul className="space-y-3 text-xs">{fichas.map((f) => (
        <li key={f.consultora} data-prueba={`ficha-${f.consultora}`}>
          <p><b>{f.consultora}</b> · {f.modo} · <Pildora tono={f.apto ? 'bien' : 'mal'}><span data-prueba={f.apto ? 'ficha-apto' : 'ficha-no-apto'}>{f.apto ? 'apto' : 'no apto'}</span></Pildora></p>
          <p className="text-neutral-500">Medición: {f.medicion ?? 'sin medir'}</p>
          <ul className="mt-1 list-disc pl-4">{f.preguntas.map((p) => <li key={p.pregunta}>{p.pregunta} <span className="text-neutral-500">{p.respuesta ?? 'sin respuesta (D12)'}</span></li>)}</ul>
          <p>Restauración en esta máquina: {f.restauracion ?? 'no probada'}</p>
          {f.faltan.length ? <p className="text-red-700 dark:text-red-300">Falta: {f.faltan.join('; ')}</p> : null}
        </li>
      ))}</ul>
    </Celda>
  )
}
