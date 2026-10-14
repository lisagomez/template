'use client'

/**
 * El presupuesto del mes (PRP-010 H-18): tope y gastado de cada consultora, y los avisos que dejó en la cadena. Al
 * tope, un P1 o un P2 pasa a una persona y un P3 o un P4 espera, y aquí se ve. El tope lo fija el superadministrador.
 */
import { useState, type FormEvent } from 'react'
import type { PresupuestoVista } from '../services/tipos'
import { Celda, Pildora } from './ui'

type Fija = (consultora: string, topeTokens: number | null, topePaginasOcr: number | null) => Promise<void>

const TIPO: Readonly<Record<string, string>> = { AVISO_PRESUPUESTO: 'aviso al 80 %', A_HUMANO_POR_PRESUPUESTO: 'a una persona', EN_ESPERA_POR_PRESUPUESTO: 'en espera' }
const cifra = (x: number | null) => (x === null ? 'sin tope' : x.toLocaleString('es-MX'))

export function Presupuesto({ lista, fija }: { lista: readonly PresupuestoVista[]; fija: Fija | null }) {
  return (
    <Celda titulo="Presupuesto del mes" ancho={6} prueba="presupuesto"
      nota="Al tope, P1 y P2 pasan a una persona ahora y P3 y P4 esperan, con aviso. Sin tope del mes, nada llama al modelo. En el laboratorio los tokens son un estimado: no hay modelo.">
      {lista.map((p) => (
        <div key={p.consultora} className="mb-3 text-xs" data-prueba={`presupuesto-${p.consultora}`}>
          <p><b>{p.consultora}</b> · {p.mes.slice(0, 7)} · tokens {cifra(p.tokens)} de {cifra(p.topeTokens)} · páginas de OCR {cifra(p.paginasOcr)} de {cifra(p.topePaginasOcr)}</p>
          {fija ? <FijaTope consultora={p.consultora} fija={fija} /> : null}
          {p.avisos.length ? (
            <ul className="mt-1 space-y-1">{p.avisos.map((a, k) => (
              <li key={k}><Pildora tono={a.tipo === 'AVISO_PRESUPUESTO' ? 'aviso' : 'mal'}>{TIPO[a.tipo] ?? a.tipo}</Pildora> {a.incidencia}: {a.aviso}</li>
            ))}</ul>
          ) : <p className="text-neutral-500">Sin avisos este mes.</p>}
        </div>
      ))}
    </Celda>
  )
}

/** Vacío es «sin tope»; y sin tope, nada llama al modelo. */
function FijaTope({ consultora, fija }: { consultora: string; fija: Fija }) {
  const [tokens, setTokens] = useState('')
  const [paginas, setPaginas] = useState('')
  // La ruta lo valida (entero, 0 o más): aquí solo se lee lo que escribió.
  const valor = (s: string) => (s.trim() === '' ? null : Number(s))
  const envia = async (ev: FormEvent) => {
    ev.preventDefault()
    await fija(consultora, valor(tokens), valor(paginas))
  }
  return (
    <form onSubmit={envia} className="mt-1 flex flex-wrap gap-2" data-prueba={`fija-presupuesto-${consultora}`}>
      <input value={tokens} onChange={(e) => setTokens(e.target.value)} inputMode="numeric" placeholder="tope de tokens" aria-label={`tope de tokens de ${consultora}`}
        className="w-32 rounded border px-2 py-1" data-prueba={`tope-tokens-${consultora}`} />
      <input value={paginas} onChange={(e) => setPaginas(e.target.value)} inputMode="numeric" placeholder="páginas de OCR" aria-label={`tope de páginas de OCR de ${consultora}`}
        className="w-32 rounded border px-2 py-1" data-prueba={`tope-ocr-${consultora}`} />
      <button type="submit" className="rounded border px-2 py-1">Fijar tope del mes</button>
    </form>
  )
}
