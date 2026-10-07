'use client'

/**
 * Las incidencias: el N3 las levanta con adjuntos; cada quien ve las suyas con la evidencia extraída
 * (campo, valor, de dónde salió, todo por revisar), la categorización del agente, el veredicto del
 * grafo, los planes (ejecutor → supervisor → sala → simulador), el sandbox, el reloj de SLA y la cadena.
 */
import { useState, type FormEvent } from 'react'
import type { IncidenciaVista, RelojVista, Rol } from '../services/tipos'
import { Celda, Pildora, hora } from './ui'

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

function Detalle({ i, rol, actua }: { i: IncidenciaVista; rol: Rol; actua: (a: object) => Promise<void> }) {
  return (
    <div className="mt-3 space-y-3 text-sm" data-prueba={`detalle-${i.id}`}>
      {i.adjuntos.length ? (
        <div data-prueba="evidencia">
          <h3 className="font-semibold">Evidencia de los adjuntos <span className="font-normal text-neutral-500">(cada campo queda por revisar: sin umbral medido)</span></h3>
          {i.adjuntos.map((a) => (
            <div key={a.nombre} className="mt-1 rounded-lg bg-neutral-50 p-2 dark:bg-neutral-800/60">
              <p className="text-xs"><b>{a.nombre}</b> · {a.aceptado ? `vía ${a.via}` : `rechazado: ${a.motivo}`}{a.aviso ? ` · ${a.aviso}` : ''}</p>
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
          {p.decision ? <p className="mt-1 text-xs">Decisión en la sala: <b>{p.decision.accion}</b> por {p.decision.por}{p.decision.motivo ? ` · motivo: «${p.decision.motivo}»` : ''}</p> : p.mensaje ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">En la sala, esperando la fila humana.</p> : null}
          {p.aplicado ? (
            <p data-prueba="antes-despues" className="mt-1 rounded bg-emerald-50 p-1 text-xs dark:bg-emerald-950">Aplicado en el simulador · antes: {p.aplicado.antes} (error {p.aplicado.errorAntes ? 'presente' : 'ausente'}) → después: {p.aplicado.despues} (error {p.aplicado.errorDespues ? 'presente' : 'ausente'})</p>
          ) : null}
        </div>
      ))}
      {i.sandbox ? (
        <div data-prueba="sandbox-incidencia" className="rounded-lg bg-neutral-50 p-2 text-xs dark:bg-neutral-800/60">
          <b>Sin regla: anonimizada → {i.sandbox.veredicto === 'entra' ? 'al sandbox' : 'en cuarentena (revisión humana)'}</b>
          {i.sandbox.texto ? <p className="mt-1 font-mono">{i.sandbox.texto}</p> : null}
          {i.sandbox.senales.length ? <p className="text-neutral-500">Señales: {i.sandbox.senales.join('; ')}</p> : null}
        </div>
      ) : null}
      <div data-prueba="reloj-incidencia">
        <h3 className="font-semibold">Reloj de SLA</h3>
        <Reloj r={i.reloj} />
        {rol === 'consultor' ? (
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => actua({ tipo: 'espera_cliente', incidencia: i.id })} className="rounded border px-2 py-1 text-xs" data-prueba="espera-cliente">Pedir un dato al cliente (pausa)</button>
            <button type="button" onClick={() => actua({ tipo: 'responde_cliente', incidencia: i.id })} className="rounded border px-2 py-1 text-xs" data-prueba="responde-cliente">El cliente respondió (reanuda)</button>
          </div>
        ) : null}
      </div>
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
