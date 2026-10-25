'use client'

/**
 * El primer arranque guiado y los Ajustes. Cada paso nombra UNA decisión y lo seguro es el botón principal (la
 * regla de `primer-arranque/lib/pasos.ts` de Arbrain); todo se cambia después en Ajustes. En Ajustes › Voz,
 * «Probar» suena con el motor que llena la ranura, y se dice qué sale de la máquina.
 */
import { useState } from 'react'
import { MODULO_CAPA } from '../memoria.js'
import { ETIQUETA_NIVEL, NIVELES_PREGUNTA, pasosDe, type NivelPregunta } from '../primer-arranque.js'
import { useCapa } from './contexto.js'

function Niveles({ valor, cambia }: { valor: NivelPregunta; cambia: (n: NivelPregunta) => void }) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: '0 0 12px' }}>
      <legend className="capa-titulo-seccion">Cuánto te pregunto</legend>
      {NIVELES_PREGUNTA.map((n) => (
        <label key={n} className="capa-opcion">
          <input type="radio" name="capa-nivel" checked={valor === n} onChange={() => cambia(n)} />
          <span><b>{ETIQUETA_NIVEL[n].nombre}</b><br /><span className="capa-aviso">{ETIQUETA_NIVEL[n].queHace}</span></span>
        </label>
      ))}
    </fieldset>
  )
}

function useProbar() {
  const { voz } = useCapa()
  const [estado, setEstado] = useState<'' | 'sonando' | 'listo' | 'fallo'>('')
  const probar = async () => {
    if (!voz?.lee) return
    setEstado('sonando')
    try { await voz.lee('Así sueno. Si me oyes, la voz funciona.', new AbortController().signal); setEstado('listo') } catch { setEstado('fallo') }
  }
  return { puede: Boolean(voz?.lee), estado, probar }
}

export function PrimerArranque() {
  const capa = useCapa()
  const { primerArranque: e, guardaPrimerArranque, cargada, producto } = capa
  const pasos = pasosDe(producto)
  const probar = useProbar()
  const [nivel, setNivel] = useState<NivelPregunta>(e.nivel)
  if (!cargada || e.terminado || !producto.composicion.funciones.includes('primer-arranque')) return null
  const i = Math.min(e.paso, pasos.length - 1)
  const paso = pasos[i]!
  const avanza = () => guardaPrimerArranque({ ...e, nivel, paso: i + 1, terminado: i + 1 >= pasos.length })
  return (
    <div className="capa-velo" data-capa-ranura="primer-arranque">
      <div className="capa-dialogo" role="dialog" aria-modal="true" aria-labelledby="capa-paso-titulo" data-capa-paso={paso.id}>
        <div className="capa-pasos" aria-hidden="true">{pasos.map((p, k) => <i key={p.id} data-hecho={k <= i} />)}</div>
        <div className="capa-ceja" style={{ margin: 0 }}>{producto.composicion.marca.nombre} · paso {i + 1} de {pasos.length}</div>
        <h2 id="capa-paso-titulo">{paso.titulo}</h2>
        <p>{paso.texto}</p>
        {paso.id === 'pregunta' ? <Niveles valor={nivel} cambia={setNivel} /> : null}
        {paso.id === 'voz' && probar.estado ? <p className="capa-aviso" role="status">{probar.estado === 'sonando' ? 'Sonando…' : probar.estado === 'listo' ? 'Listo: así suena.' : 'No pude hacerla sonar.'}</p> : null}
        <div className="capa-dialogo-pie">
          {paso.alternativa && probar.puede ? <button type="button" className="capa-boton" onClick={() => void probar.probar()}>{paso.alternativa}</button> : null}
          <button type="button" className="capa-boton capa-boton-primario" data-capa-boton="primer-arranque-sigue" onClick={avanza}>
            {paso.id === 'pregunta' ? ETIQUETA_NIVEL[nivel].nombre : paso.principal}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Ajustes({ cierra }: { cierra: () => void }) {
  const { nivel, cambiaNivel, producto, voz, memoria, persistente } = useCapa()
  const probar = useProbar()
  const motores = voz?.describe?.()
  const [olvidada, setOlvidada] = useState(false)
  return (
    <div className="capa-velo" onClick={(e) => { if (e.target === e.currentTarget) cierra() }}>
      <div className="capa-dialogo" role="dialog" aria-modal="true" aria-labelledby="capa-ajustes-titulo" data-capa-ranura="ajustes">
        <h2 id="capa-ajustes-titulo">Ajustes</h2>
        <Niveles valor={nivel} cambia={cambiaNivel} />
        <h4 className="capa-titulo-seccion">Voz</h4>
        {producto.voz.visible ? (
          <>
            {motores ? <div className="capa-aviso">Escucha: {motores.stt} · Detecta: {motores.vad} · Habla: {motores.tts}. {motores.sale}</div> : null}
            <p className="capa-aviso">{producto.voz.motivo}</p>
            <button type="button" className="capa-boton" data-capa-boton="probar-voz" disabled={!probar.puede || probar.estado === 'sonando'} onClick={() => void probar.probar()}>Probar</button>
            {probar.estado ? <span className="capa-aviso" role="status"> {probar.estado === 'listo' ? 'Listo.' : probar.estado === 'fallo' ? 'No sonó.' : 'Sonando…'}</span> : null}
          </>
        ) : <p className="capa-aviso">{producto.voz.motivo}</p>}
        <h4 className="capa-titulo-seccion">Memoria</h4>
        <p className="capa-aviso">Lo que recuerdo es de {producto.composicion.memoria.duena === 'inquilino' ? 'tu cuenta' : 'este producto'}.{persistente ? '' : ' Este navegador no deja guardar: se olvida al cerrar.'}</p>
        <button type="button" className="capa-boton" disabled={olvidada} onClick={() => { void memoria.olvida(MODULO_CAPA, 'conversacion').then(() => setOlvidada(true)) }}>
          {olvidada ? 'Olvidada (al recargar)' : 'Olvidar la conversación'}
        </button>
        <div className="capa-dialogo-pie"><button type="button" className="capa-boton capa-boton-primario" onClick={cierra}>Listo</button></div>
      </div>
    </div>
  )
}
