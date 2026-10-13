'use client'

/**
 * La salida de un cliente (D8, PRP-012). La registra una persona del cliente o de su consultora (DP-2) y no tiene
 * vuelta: desde ese momento el cliente queda congelado, su export es el último y, tras la gracia de su contrato, se borra
 * lo suyo. El export lo descargan él y su consultora; el laboratorio ve la baja, no el export.
 */
import { useState } from 'react'
import type { SalidaVista } from '../services/tipos'
import { Celda, Pildora, hora } from './ui'

export function Salidas({ lista, rol, actua }: { lista: readonly SalidaVista[]; rol: string; actua: (a: object) => Promise<void> }) {
  if (lista.length === 0) return null
  return (
    <Celda titulo="Salida del servicio" ancho={rol === 'cliente' ? 5 : 6} prueba="salidas"
      nota="Al registrarla, nada del cliente cambia más, se genera su export y, tras la gracia de su contrato, se borra lo suyo. El sandbox anonimizado y el núcleo se quedan.">
      <ul className="space-y-3 text-sm">{lista.map((s) => <Salida key={s.cliente} s={s} rol={rol} actua={actua} />)}</ul>
    </Celda>
  )
}

function Salida({ s, rol, actua }: { s: SalidaVista; rol: string; actua: (a: object) => Promise<void> }) {
  const [entiendo, setEntiendo] = useState(false)
  const r = s.registrada
  return (
    <li data-prueba={`salida-${s.cliente}`}>
      <p className="font-semibold">{s.nombre} {r ? <Pildora tono="aviso">salida registrada</Pildora> : null}</p>
      <p className="text-xs text-neutral-500">Gracia de su contrato: {s.gracia}</p>
      {r ? (
        <div className="mt-1 space-y-1 text-xs" data-prueba="salida-registrada">
          <p>Registrada por {r.por}, {hora(r.fecha)} · {r.estado}</p>
          {r.export ? (
            <p data-prueba="salida-export">Export: {r.export.incidencias} incidencia(s), {r.export.bytes} bytes · <span className="font-mono">sha256:{r.export.sha256.slice(0, 12)}…</span>{' '}
              <a href={`/api/soporte-sap?rol=${rol}&export=${s.cliente}`} className="underline" data-prueba="salida-descarga">Descargar</a></p>
          ) : <p className="text-neutral-500">El export es del cliente y de su consultora: el laboratorio no lo ve.</p>}
        </div>
      ) : s.puedeRegistrar ? (
        <div className="mt-1 space-y-1 text-xs">
          <label className="flex items-start gap-2"><input type="checkbox" checked={entiendo} onChange={(e) => setEntiendo(e.target.checked)} data-prueba="salida-entiendo" />
            <span>Entiendo que no tiene vuelta: las incidencias de {s.nombre} se congelan y, tras la gracia, se borran.</span></label>
          <button type="button" disabled={!entiendo} onClick={() => actua({ tipo: 'registra_salida', cliente: s.cliente })}
            className="rounded border px-2 py-1 disabled:opacity-50" data-prueba="salida-registra">Registrar la salida</button>
        </div>
      ) : null}
    </li>
  )
}
