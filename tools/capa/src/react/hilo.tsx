'use client'

/**
 * La ranura de conversación: el hilo, la tarjeta del freno y el compositor. El tono es el de la capa (cálido,
 * directo, sin inventar). En la tarjeta del freno se ve la CITA tal cual (con lo invisible hecho visible) y solo
 * un clic la confirma: ni la voz, ni el Enter, ni un `click()` sintético.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Mensaje } from '../conversacion.js'
import { literalVisible } from '../freno.js'
import { useCapa } from './contexto.js'
import { BotonDictar, BotonEscuchar } from './voz.js'

/** «a Nora», pero «al asistente»: la contracción que pide el español. */
const aQuien = (asistente: string) => (/^el\s/i.test(asistente) ? `al ${asistente.slice(3)}` : `a ${asistente}`)

function TarjetaFreno({ m }: { m: Mensaje }) {
  const { conversacion, confirma, descarta, ocupada } = useCapa()
  const f = m.freno!
  const abierta = conversacion.freno.pendientes().some((s) => s.id === f.id)
  const cita = literalVisible(f.cita)
  if (!abierta) return null
  return (
    <div className="capa-freno" role="group" aria-label="Freno: acción irreversible" data-capa-freno={f.id}>
      <strong>Esto no tiene vuelta atrás ({f.categoria}).</strong>
      <div><small>Lo pediste así:</small></div>
      <blockquote>{cita.texto}</blockquote>
      {cita.invisibles ? <small role="alert">La cita trae caracteres invisibles (marcados ⟨U+…⟩).</small> : null}
      <small>Decirlo en voz alta no basta: hace falta tu clic.</small>
      <div className="capa-mensaje-pie">
        <button type="button" className="capa-boton capa-boton-peligro" data-capa-boton="confirmar-freno" disabled={ocupada} onClick={(e) => void confirma(f.id, e.nativeEvent)}>
          Confirmar
        </button>
        <button type="button" className="capa-boton" disabled={ocupada} onClick={() => void descarta(f.id)}>Cancelar</button>
      </div>
    </div>
  )
}

function Burbuja({ m }: { m: Mensaje }) {
  const { contesta, navega, ocupada } = useCapa()
  return (
    <div className="capa-mensaje" data-de={m.de} data-estado={m.estado ?? ''} data-capa-mensaje={m.id}>
      {m.texto}
      {m.de === 'asistente' ? (
        <div className="capa-mensaje-pie">
          <BotonEscuchar texto={m.texto} />
          {m.ir ? <a href={m.ir} onClick={(e) => { e.preventDefault(); navega(m.ir!) }}>Abrir {m.ir}</a> : null}
          {m.estado === 'pregunta'
            ? m.opciones?.map((o) => <button key={o} type="button" className="capa-chip" disabled={ocupada} onClick={() => void contesta(m.id, o === 'Sí')}>{o}</button>)
            : null}
        </div>
      ) : m.via === 'voz' ? <div className="capa-aviso">dicho en voz</div> : null}
      {m.freno ? <TarjetaFreno m={m} /> : null}
    </div>
  )
}

export function Hilo() {
  const { mensajes, cargada, producto } = useCapa()
  const fin = useRef<HTMLDivElement>(null)
  useEffect(() => { fin.current?.scrollIntoView?.({ block: 'end' }) }, [mensajes.length])
  return (
    <div className="capa-hilo" role="log" aria-live="polite" aria-label={`Conversación con ${producto.composicion.marca.asistente}`} data-capa-ranura="conversacion">
      {cargada && mensajes.length === 0 ? (
        <div className="capa-mensaje" data-de="asistente">{producto.composicion.marca.saludo} Pídemelo como lo dirías.</div>
      ) : null}
      {mensajes.map((m) => <Burbuja key={m.id} m={m} />)}
      <div ref={fin} />
    </div>
  )
}

export function Compositor() {
  const { envia, ocupada, producto } = useCapa()
  const [texto, setTexto] = useState('')
  const manda = () => {
    const t = texto.trim()
    if (!t || ocupada) return
    setTexto('')
    void envia(t, 'teclado')
  }
  const tecla = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); manda() }
  }
  return (
    <form className="capa-compositor" onSubmit={(e) => { e.preventDefault(); manda() }}>
      <label className="capa-oculto" htmlFor="capa-entrada">Escríbele a {producto.composicion.marca.asistente}</label>
      <textarea id="capa-entrada" className="capa-entrada" rows={1} value={texto} placeholder={`Pídele algo ${aQuien(producto.composicion.marca.asistente)}…`} onChange={(e) => setTexto(e.target.value)} onKeyDown={tecla} data-capa-entrada />
      <BotonDictar alDictar={(t) => setTexto((x) => (x ? `${x} ${t}` : t))} />
      <button type="submit" className="capa-boton capa-boton-primario" disabled={ocupada || !texto.trim()} data-capa-boton="enviar">Enviar</button>
    </form>
  )
}
