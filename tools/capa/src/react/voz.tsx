'use client'

/**
 * La ranura de voz en la interfaz: el botón «Modo conversación» (a la vista en toda app y producto), dictar en
 * el chat, «Escuchar» una respuesta. La experiencia es la de Arbrain; los motores son los del módulo que llene
 * la ranura (por defecto, locales: el audio no sale de la máquina).
 *
 * El botón: estados visibles (apagado, escuchando, pensando, hablando) con indicador de micrófono abierto;
 * `aria-pressed` y atajo Alt+C; el permiso del micrófono se pide al primer clic; apagarlo cierra el micrófono al
 * instante; la preferencia se recuerda (si la persona lo dejó encendido, el botón ofrece «Retomar conversación», pero
 * el micrófono NO se abre solo al recargar: siempre hace falta su clic); y no salta el freno (lo irreversible sigue
 * pidiendo su clic).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { MODULO_CAPA } from '../memoria.js'
import { microfonoAbierto, type EstadoConversacion } from '../voz.js'
import { useCapa } from './contexto.js'

export const ATAJO_CONVERSACION = 'Alt+C'

const ETIQUETA: Record<EstadoConversacion, string> = {
  apagado: 'Modo conversación',
  'pidiendo-permiso': 'Pidiendo el micrófono…',
  escuchando: 'Escuchando',
  pensando: 'Pensando',
  hablando: 'Hablando',
}

const esAtajo = (e: KeyboardEvent) => e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyC'

export function BotonModoConversacion() {
  const capa = useCapa()
  const { control, estadoVoz, memoria } = capa
  const [error, setError] = useState<string | null>(null)
  const [loDejoEncendido, setLoDejoEncendido] = useState(false)
  const encendido = estadoVoz !== 'apagado'
  const alterna = useCallback(async () => {
    if (!control) return
    if (control.estado() !== 'apagado') {
      control.apaga()
      setLoDejoEncendido(false)
      void memoria.recuerda(MODULO_CAPA, 'ajustes:voz', { conversacion: false })
      return
    }
    setError(null)
    const r = await control.enciende()
    if (!r.ok) setError(r.motivo)
    else void memoria.recuerda(MODULO_CAPA, 'ajustes:voz', { conversacion: true })
  }, [control, memoria])
  useEffect(() => {
    let vigente = true
    void memoria.recuerdo<{ conversacion?: boolean }>(MODULO_CAPA, 'ajustes:voz').then((p) => { if (vigente) setLoDejoEncendido(p?.conversacion === true) })
    return () => { vigente = false }
  }, [memoria])
  const alternaRef = useRef(alterna)
  useEffect(() => { alternaRef.current = alterna }, [alterna])
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (esAtajo(e)) { e.preventDefault(); void alternaRef.current() } }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])
  if (!control) return null
  const abierto = microfonoAbierto(estadoVoz)
  return (
    <>
      <button
        type="button"
        className="capa-conversar"
        data-capa-boton="modo-conversacion"
        data-estado={estadoVoz}
        aria-pressed={encendido}
        aria-keyshortcuts={ATAJO_CONVERSACION}
        title={`Modo conversación: escucha, responde en voz y se calla si le hablas encima (${ATAJO_CONVERSACION})`}
        onClick={() => void alterna()}
      >
        <span className="capa-microfono" aria-hidden="true" />
        <span>{estadoVoz === 'apagado' && loDejoEncendido ? 'Retomar conversación' : ETIQUETA[estadoVoz]}</span>
        <kbd className="capa-solo-ancho">{ATAJO_CONVERSACION}</kbd>
      </button>
      <span role="status" aria-live="polite" className="capa-oculto" data-capa-microfono={abierto ? 'abierto' : 'cerrado'}>
        {error ? `No se pudo encender: ${error}` : `${ETIQUETA[estadoVoz]}. Micrófono ${abierto ? 'abierto' : 'cerrado'}.`}
      </span>
      {error ? <span className="capa-aviso" role="alert">{error}</span> : null}
    </>
  )
}

/** Lo que dice la ranura cuando no hay voz: el botón no aparece, pero se explica por qué. */
export function VozNoDisponible() {
  const { producto } = useCapa()
  if (!producto.composicion.funciones.includes('voz') || producto.voz.visible) return null
  return <span className="capa-aviso" data-capa-voz="no-disponible" title={producto.voz.motivo}>Voz: {producto.voz.motivo}</span>
}

export function BotonDictar({ alDictar }: { alDictar: (texto: string) => void }) {
  const { voz, producto } = useCapa()
  const [grabando, setGrabando] = useState<AbortController | null>(null)
  if (!voz?.dicta || !producto.voz.puede.dictar) return null
  const alterna = async () => {
    if (grabando) { grabando.abort(); setGrabando(null); return }
    const c = new AbortController()
    setGrabando(c)
    try { const texto = await voz.dicta!(c.signal); if (texto) alDictar(texto) } catch { /* cancelado o sin micrófono */ } finally { setGrabando(null) }
  }
  return (
    <button type="button" className="capa-icono" data-capa-boton="dictar" aria-pressed={Boolean(grabando)} title={grabando ? 'Parar el dictado' : 'Dictar'} onClick={() => void alterna()}>
      {grabando ? '■ Parar' : '🎙 Dictar'}
    </button>
  )
}

export function BotonEscuchar({ texto }: { texto: string }) {
  const { voz, producto } = useCapa()
  const [sonando, setSonando] = useState<AbortController | null>(null)
  if (!voz?.lee || !producto.voz.puede.escuchar) return null
  const alterna = async () => {
    if (sonando) { sonando.abort(); setSonando(null); return }
    const c = new AbortController()
    setSonando(c)
    try { await voz.lee!(texto, c.signal) } catch { /* cortado */ } finally { setSonando(null) }
  }
  return <button type="button" className="capa-chip" data-capa-boton="escuchar" onClick={() => void alterna()}>{sonando ? 'Callar' : 'Escuchar'}</button>
}
