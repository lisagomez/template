'use client'

/**
 * Las incidencias: el N3 las levanta con adjuntos; cada quien ve las suyas con la evidencia extraída
 * (campo, valor, de dónde salió, todo por revisar), la categorización del agente, el veredicto del
 * grafo, los planes (ejecutor → supervisor → sala → simulador), el sandbox, el reloj de SLA y la cadena.
 */
import { useState, type FormEvent } from 'react'
import type { IncidenciaVista, RelojVista, Rol } from '../services/tipos'
import { Celda, Pildora, hora } from './ui'
import { Impugnaciones } from './impugnaciones'

export function FormularioIncidencia({ levanta, ocupado }: { levanta: (f: FormData) => Promise<void>; ocupado: boolean }) {
  const enviar = async (ev: FormEvent<HTMLFormElement>) => { ev.preventDefault(); const form = ev.currentTarget; await levanta(new FormData(form)); form.reset() }
  return (
    <Celda titulo="Levantar una incidencia" ancho={5} prueba="formulario-incidencia" nota="Adjunta la captura del error, el PDF del spool o el XML del CFDI: se leen por sus bytes, en local.">
      <form onSubmit={enviar} className="space-y-2">
        <input name="titulo" required minLength={3} placeholder="Título" className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700" data-prueba="titulo" />
        <textarea name="descripcion" required minLength={3} rows={3} placeholder="¿Qué pasa? Transacción, mensaje, sociedad, periodo…" className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700" data-prueba="descripcion" />
        <input name="adjuntos" type="file" multiple accept=".png,.jpg,.jpeg,.pdf,.xml" className="block w-full text-sm" data-prueba="adjuntos" />
        <button disabled={ocupado} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900" data-prueba="levantar">{ocupado ? 'Leyendo adjuntos…' : 'Levantar incidencia'}</button>
      </form>
    </Celda>
  )
}

export function Reloj({ r, prueba }: { r: RelojVista; prueba?: string }) {
  const tono = r.cumpleRespuesta === false ? 'mal' : r.alerta === 'escala' ? 'aviso' : r.cumpleRespuesta ? 'bien' : 'neutro'
  return (
    <div data-prueba={prueba} className="text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Pildora tono={tono}>{r.cumpleRespuesta === false ? 'respuesta fuera de meta' : r.cumpleRespuesta ? 'respuesta en meta' : r.metaRespuestaMin === null ? 'sin meta (por decidir)' : `en plazo · ${r.alerta ?? ''}`}</Pildora>
        <span className="text-xs text-neutral-500">{r.contrato} · {r.prioridad} · meta de respuesta {r.metaRespuestaMin ?? '—'} min · respuesta {r.respuestaMin ?? '—'} min · resolución {r.resolucionMin ?? '—'} min · en pausa {r.pausadoMin} min · {r.estado}</span>
      </div>
      <table className="mt-2 w-full text-xs">
        <thead className="text-left text-neutral-500"><tr><th>Desde</th><th>Hasta</th><th>Reloj</th><th className="text-right">Min</th><th className="pl-2">Lo abrió</th></tr></thead>
        <tbody>
          {r.tramos.map((t) => (
            <tr key={`${t.desde}-${t.estado}`} className="border-t border-neutral-100 dark:border-neutral-800">
              <td>{hora(t.desde)}</td><td>{hora(t.hasta)}</td>
              <td><Pildora tono={t.estado === 'corre' ? 'info' : t.estado === 'pausa' ? 'aviso' : 'neutro'}>{t.estado}</Pildora></td>
              <td className="text-right tabular-nums">{t.minutos}</td><td className="pl-2">{t.porque}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** El consultor le responde al cliente: su primera respuesta es la que para el reloj (DP-4, PRP-010 H-17). */
function RespuestaAlCliente({ incidencia, actua }: { incidencia: string; actua: (a: object) => Promise<void> }) {
  const [texto, setTexto] = useState('')
  const envia = async (ev: FormEvent) => {
    ev.preventDefault()
    if (texto.trim().length < 5) return
    await actua({ tipo: 'responde', incidencia, texto: texto.trim() })
    setTexto('')
  }
  return (
    <form onSubmit={envia} className="mt-2 flex gap-2" data-prueba="responde-al-cliente">
      <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Respuesta al cliente" maxLength={2000}
        className="flex-1 rounded border px-2 py-1 text-xs" aria-label="Respuesta al cliente" />
      <button type="submit" className="rounded border px-2 py-1 text-xs">Responder</button>
    </form>
  )
}

/**
 * La pausa del reloj: el consultor la pide diciendo qué le pide al cliente, y el cliente la ve y la reanuda al
 * responder, sin depender de su consultora (la pausa unilateral, AISIA §2).
 */
function PausaDelReloj({ i, rol, actua }: { i: IncidenciaVista; rol: Rol; actua: (a: object) => Promise<void> }) {
  const [pide, setPide] = useState('')
  const pausa = async (ev: FormEvent) => {
    ev.preventDefault()
    if (pide.trim().length < 10) return
    await actua({ tipo: 'espera_cliente', incidencia: i.id, pide: pide.trim() })
    setPide('')
  }
  if (rol === 'cliente') {
    return i.pide ? (
      <div className="mt-2 rounded bg-amber-50 p-2 text-xs dark:bg-amber-950" data-prueba="cliente-pide">
        <p>Tu consultora te pidió: «{i.pide}». El reloj de resolución está en pausa hasta que respondas.</p>
        <button type="button" onClick={() => actua({ tipo: 'responde_cliente', incidencia: i.id })} className="mt-1 rounded border px-2 py-1" data-prueba="cliente-reanuda">Ya respondí (reanuda el reloj)</button>
      </div>
    ) : null
  }
  if (rol !== 'consultor') return null
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <form onSubmit={pausa} className="flex flex-1 gap-2" data-prueba="espera-cliente">
        <input value={pide} onChange={(e) => setPide(e.target.value)} placeholder="Qué le pides al cliente" maxLength={500}
          className="flex-1 rounded border px-2 py-1 text-xs" aria-label="Qué le pides al cliente" />
        <button type="submit" className="rounded border px-2 py-1 text-xs">Pedir y pausar</button>
      </form>
      <button type="button" onClick={() => actua({ tipo: 'responde_cliente', incidencia: i.id })} className="rounded border px-2 py-1 text-xs" data-prueba="responde-cliente">El cliente respondió (reanuda)</button>
    </div>
  )
}

/** Lo que solo hace la consultora: escalar al laboratorio a su nombre (DP-3) y dar por resuelta la incidencia. */
function AccionesDeLaConsultora({ i, rol, actua }: { i: IncidenciaVista; rol: Rol; actua: (a: object) => Promise<void> }) {
  const respuesta = i.respuestaLaboratorio ? <span data-prueba="respuesta-laboratorio"> · {i.respuestaLaboratorio}</span> : null
  if (rol !== 'consultor') return i.escaladaPor ? <p className="mt-2 text-xs text-neutral-500">Escalada al laboratorio por {i.escaladaPor}.{respuesta}</p> : null
  return (
    <div className="mt-2 flex flex-wrap gap-2 text-xs">
      {i.escaladaPor ? <span className="text-neutral-500">Escalada al laboratorio por {i.escaladaPor}.{respuesta}</span>
        : <button type="button" onClick={() => actua({ tipo: 'escala', incidencia: i.id })} className="rounded border px-2 py-1" data-prueba="escala">Escalar al laboratorio</button>}
      {i.estado !== 'resuelta' ? <button type="button" onClick={() => actua({ tipo: 'resuelve', incidencia: i.id })} className="rounded border px-2 py-1" data-prueba="resuelve">Dar por resuelta</button> : null}
    </div>
  )
}

function Detalle({ i, rol, actua }: { i: IncidenciaVista; rol: Rol; actua: (a: object) => Promise<void> }) {
  return (
    <div className="mt-3 space-y-3 text-sm" data-prueba={`detalle-${i.id}`}>
      {i.congelada ? <p data-prueba="congelada"><Pildora tono="aviso">La salida de este cliente está registrada: la incidencia ya no cambia, y su export es el último</Pildora></p> : null}
      {i.adjuntos.length ? (
        <div data-prueba="evidencia">
          <h3 className="font-semibold">Evidencia de los adjuntos <span className="font-normal text-neutral-500">(cada campo queda por revisar: sin umbral medido)</span></h3>
          {i.adjuntos.map((a) => (
            <div key={a.nombre} className="mt-1 rounded-lg bg-neutral-50 p-2 dark:bg-neutral-800/60">
              <p className="text-xs"><b>{a.nombre}</b> · {a.aceptado ? `vía ${a.via}` : `rechazado: ${a.motivo}`}{a.aviso ? ` · ${a.aviso}` : ''}</p>
              {a.vence ? <p className="text-xs text-neutral-500" data-prueba="vence">Original: {a.vence}</p> : null}
              {a.campos.length ? (
                <table className="mt-1 w-full text-xs"><thead className="text-left text-neutral-500"><tr><th>Campo</th><th>Valor</th><th>De dónde salió</th><th>Estado</th></tr></thead>
                  <tbody>{a.campos.map((c) => <tr key={`${c.campo}-${c.valor}`} className="border-t border-neutral-200 dark:border-neutral-700"><td>{c.campo}</td><td className="font-mono">{c.valor}</td><td className="text-neutral-500">{c.evidencia}</td><td><Pildora tono="aviso">{c.estado.replace('_', ' ')}</Pildora></td></tr>)}</tbody>
                </table>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <div data-prueba="categorizacion">
        <h3 className="font-semibold">Categorización del agente</h3>
        <p className="text-xs">Prioridad <b>{i.prioridad}</b> · módulo {i.modulo ?? '—'} · transacción {i.transaccion ?? '—'} · mensaje {i.mensaje ?? '—'} · etiquetas {i.etiquetas.join(', ') || '—'}</p>
        <p className="text-xs text-neutral-500">Por qué: {i.razones.join('; ')}</p>
        <p className="text-xs">Grafo: <Pildora tono={i.consulta.tipo === 'solucion' ? 'bien' : 'aviso'}>{i.consulta.tipo.replace('_', ' ')}</Pildora> {i.consulta.regla ? `${i.consulta.regla} · grado ${i.consulta.grado} · ${i.consulta.cita}` : i.consulta.razon}</p>
      </div>
      {i.planes.map((p) => (
        <div key={p.sha256} data-prueba={`plan-v${p.version}`} className="rounded-lg border border-neutral-200 p-2 dark:border-neutral-700">
          <p className="text-xs font-semibold">Plan v{p.version} · ejecutor → supervisor <Pildora tono={p.supervisor.resultado === 'a_la_sala' ? 'bien' : 'aviso'}>{p.supervisor.resultado.replace(/_/g, ' ')}</Pildora> <span className="font-mono font-normal text-neutral-500">sha256:{p.sha256.slice(0, 12)}…</span></p>
          {p.cambios.length ? <p className="text-xs text-sky-700 dark:text-sky-300">Cambios: {p.cambios.join('; ')}</p> : null}
          <ul className="ml-4 list-disc text-xs">{p.pasos.map((x) => <li key={x}>{x}</li>)}</ul>
          <p className="text-xs text-neutral-500">Previsión en el simulador: {p.prevision.join('; ') || 'sin previsión'}</p>
          <ul className="mt-1 text-xs">{p.supervisor.comprobaciones.map((c) => <li key={c.que}>{c.ok ? '✓' : '✗'} {c.que} <span className="text-neutral-500">({c.detalle})</span></li>)}</ul>
          {p.decision ? <p className="mt-1 text-xs">Decisión en la sala: <b>{p.decision.accion}</b> por {p.decision.por}{p.decision.motivo ? ` · motivo: «${p.decision.motivo}»` : ''}</p> : p.mensaje ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">En la sala, esperando la fila humana.</p>
            : p.supervisor.resultado === 'a_la_sala' ? <p className="mt-1 text-xs text-sky-700 dark:text-sky-300" data-prueba="plan-pendiente">Verificado: espera que la consultora lo escale al laboratorio.</p> : null}
          {p.aplicado ? (
            <p data-prueba="antes-despues" className="mt-1 rounded bg-emerald-50 p-1 text-xs dark:bg-emerald-950">Aplicado en el simulador, no en el SAP del cliente · antes: {p.aplicado.antes} (error {p.aplicado.errorAntes ? 'presente' : 'ausente'}) → después: {p.aplicado.despues} (error {p.aplicado.errorDespues ? 'presente' : 'ausente'})<span data-prueba="fuera-del-producto" className="block text-neutral-500">Llevarlo a su SAP lo hace una persona con su propio acceso y el control de cambios del cliente, fuera del producto (contrato §13, D6).</span></p>
          ) : null}
        </div>
      ))}
      {i.sandbox ? (
        <div data-prueba="sandbox-incidencia" className="rounded-lg bg-neutral-50 p-2 text-xs dark:bg-neutral-800/60">
          <b>Sin regla: anonimizada → {i.sandbox.veredicto === 'entra' ? 'al sandbox' : 'en cuarentena (no entra al sandbox; es definitiva y nadie la revisa, D14)'}</b>
          {i.sandbox.texto ? <p className="mt-1 font-mono">{i.sandbox.texto}</p> : null}
          {i.sandbox.senales.length ? <p className="text-neutral-500">Señales: {i.sandbox.senales.join('; ')}</p> : null}
        </div>
      ) : null}
      <div data-prueba="reloj-incidencia">
        <h3 className="font-semibold">Reloj de SLA</h3>
        <Reloj r={i.reloj} />
        {/* Con la salida registrada nada cambia (D8): sin los botones que la base y el runtime ya rechazan. */}
        {rol === 'consultor' && !i.congelada ? <RespuestaAlCliente incidencia={i.id} actua={actua} /> : null}
        {i.congelada ? null : <PausaDelReloj i={i} rol={rol} actua={actua} />}
        <AccionesDeLaConsultora i={i} rol={i.congelada ? 'experto' : rol} actua={actua} />
        {i.respuestas.length ? (
          <ul className="mt-2 space-y-1 text-xs" data-prueba="respuestas">{i.respuestas.map((r) => <li key={r.fecha + r.por}>Respuesta de {r.por}: «{r.texto}»</li>)}</ul>
        ) : null}
      </div>
      <Impugnaciones incidencia={i.id} lista={i.impugnaciones} rol={i.congelada ? 'experto' : rol} actua={actua} />
      <details data-prueba="cadena">
        <summary className="cursor-pointer text-xs font-semibold">Cadena de eventos ({i.cadena.length}) · {i.cadenaIntegra ? 'íntegra ✓' : 'ROTA ✗'}</summary>
        <ol className="mt-1 space-y-0.5 text-[11px]">{i.cadena.map((e) => <li key={e.seq}><span className="font-mono text-neutral-500">#{e.seq} {e.hash.slice(0, 10)}</span> {e.tipo} · {e.actor} · {e.resumen}</li>)}</ol>
      </details>
    </div>
  )
}

export function Incidencias({ lista, rol, actua, titulo }: { lista: readonly IncidenciaVista[]; rol: Rol; actua: (a: object) => Promise<void>; titulo: string }) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const elegida = abierta ?? lista[0]?.id ?? null
  return (
    <Celda titulo={titulo} ancho={rol === 'cliente' ? 7 : 12} prueba="incidencias">
      {lista.length === 0 ? <p className="text-sm text-neutral-500">Sin incidencias en esta sesión del laboratorio.</p> : null}
      <div className="flex flex-wrap gap-2">
        {lista.map((i) => (
          <button key={i.id} type="button" onClick={() => setAbierta(i.id)} data-prueba={`incidencia-${i.id}`}
            className={`rounded-lg border px-3 py-1.5 text-left text-xs ${i.id === elegida ? 'border-neutral-900 dark:border-white' : 'border-neutral-200 dark:border-neutral-700'}`}>
            <b>{i.id}</b> · {i.prioridad} · {i.estado.replace('_', ' ')}<br /><span className="text-neutral-500">{i.titulo}</span>
          </button>
        ))}
      </div>
      {lista.filter((i) => i.id === elegida).map((i) => <Detalle key={i.id} i={i} rol={rol} actua={actua} />)}
    </Celda>
  )
}
