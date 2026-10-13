'use client'

/**
 * La sala A2A y el chat del HIL, uno al lado del otro. En la sala decide una PERSONA con su sesión
 * (aprobar, rechazar o a revisión, con motivo); el chat contesta con fuente, propone o promueve a la
 * sala, y nunca aprueba: no tiene botón para eso.
 */
import { useState } from 'react'
import type { MensajeSalaVista, MensajeChatVista, Rol } from '../services/tipos'
import { Celda, Pildora } from './ui'

function Mensaje({ m, puedeDecidir, decide }: { m: MensajeSalaVista; puedeDecidir: boolean; decide: (mensaje: string, accion: string, motivo: string) => Promise<void> }) {
  const [motivo, setMotivo] = useState('')
  return (
    <li data-prueba={`sala-${m.id}`} className={`rounded-lg p-2 text-xs ${m.hilo ? 'ml-6 border-l-2 border-neutral-300 dark:border-neutral-700' : 'bg-neutral-50 dark:bg-neutral-800/60'}`}>
      <p className="mb-1 text-neutral-500"><b>{m.autor}</b> ({m.tipoAutor}) {m.origen === 'chat_hil' ? <Pildora tono="info">desde el chat del HIL</Pildora> : null} {m.hilo ? '· en hilo' : ''}</p>
      <p className="whitespace-pre-wrap">{m.cuerpo}</p>
      {m.decisiones.length ? <p className="mt-1"><Pildora tono="bien">{m.decisiones.join(' · ')}</Pildora></p> : null}
      {m.acciones && puedeDecidir && !m.decisiones.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-2" data-prueba="acciones-sala">
          <button type="button" onClick={() => decide(m.id, 'aprobar', '')} className="rounded bg-emerald-600 px-2 py-1 font-semibold text-white" data-prueba="aprobar">Aprobar (mi sesión)</button>
          <button type="button" onClick={() => decide(m.id, 'rechazar', '')} className="rounded border px-2 py-1" data-prueba="rechazar">Rechazar</button>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo para revisión" className="min-w-48 flex-1 rounded border bg-transparent px-2 py-1" data-prueba="motivo" />
          <button type="button" disabled={motivo.trim().length < 3} onClick={() => decide(m.id, 'a_revision', motivo)} className="rounded border px-2 py-1 disabled:opacity-40" data-prueba="a-revision">A revisión</button>
        </div>
      ) : null}
    </li>
  )
}

export function Sala({ mensajes, rol, decide }: { mensajes: readonly MensajeSalaVista[]; rol: Rol; decide: (mensaje: string, accion: string, motivo: string) => Promise<void> }) {
  const raiz = mensajes.filter((m) => !m.hilo)
  const puedeDecidir = rol === 'superadmin' || rol === 'experto'
  return (
    <Celda titulo="Sala A2A · canal de Consultora Andina" ancho={7} prueba="sala" nota={puedeDecidir ? 'Decides tú, con tu sesión: la fila de aprobación es humana y lleva la huella del plan.' : 'Ves la sala de tu consultora; aprueba el HIL del laboratorio.'}>
      {raiz.length === 0 ? <p className="text-sm text-neutral-500">Sin mensajes todavía.</p> : null}
      <ul className="space-y-2">
        {raiz.map((r) => [r, ...mensajes.filter((m) => m.hilo === r.id)]).flat().map((m) => <Mensaje key={m.id} m={m} puedeDecidir={puedeDecidir} decide={decide} />)}
      </ul>
    </Celda>
  )
}

export function Chat({ mensajes, rol, envia }: { mensajes: readonly MensajeChatVista[]; rol: Rol; envia: (texto: string) => Promise<void> }) {
  const [texto, setTexto] = useState('')
  const sugerencias = rol === 'experto'
    ? ['Te enseño el caso de la app Fiori en blanco: hay que limpiar la caché del launchpad', '¿Qué hago con MIGO? Mensaje M7 053 en sociedad 1000, periodo 2026/10']
    : ['¿Cuál fue el MTTR de Consultora Andina en septiembre de 2026?', '¿Cuál es el NPS de Consultora Andina en septiembre de 2026?']
  const manda = async (t: string) => { if (t.trim()) { await envia(t); setTexto('') } }
  return (
    <Celda titulo={`Chat con el A2A · ${rol}`} ancho={5} prueba="chat" nota="Contesta con la fuente (métrica o regla) o dice «no lo sé». Lo que pide aprobación lo lleva a la sala.">
      <ul className="max-h-80 space-y-2 overflow-y-auto text-xs" data-prueba="chat-mensajes">
        {mensajes.map((m, k) => (
          <li key={k} className={m.autor === 'humano' ? 'text-right' : ''}>
            <span className={`inline-block max-w-[90%] rounded-xl px-3 py-2 text-left ${m.autor === 'humano' ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900' : 'bg-neutral-100 dark:bg-neutral-800'}`}>
              {m.tipo ? <Pildora tono={m.tipo === 'valor' || m.tipo === 'regla' ? 'bien' : m.tipo === 'promovida' || m.tipo === 'propuesta' ? 'info' : 'aviso'}>{m.tipo.replace('_', ' ')}</Pildora> : null} {m.texto}
              {m.fuentes.map((f) => <span key={f} className="mt-1 block text-[10px] text-neutral-500">fuente: {f}</span>)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-1">{sugerencias.map((s) => <button key={s} type="button" onClick={() => setTexto(s)} className="rounded-full border px-2 py-0.5 text-[10px]">{s.slice(0, 48)}…</button>)}</div>
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); void manda(texto) }}>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Pregunta, enseña o pide…" className="flex-1 rounded-lg border bg-transparent px-3 py-2 text-sm" data-prueba="chat-texto" />
        <button className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white dark:bg-white dark:text-neutral-900" data-prueba="chat-enviar">Enviar</button>
      </form>
    </Celda>
  )
}
