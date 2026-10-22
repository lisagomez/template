'use client'

/**
 * Un candidato, para el experto: la HIPÓTESIS, su fuente a la vista (archivo y línea de sapstack, en su SHA) y cuatro
 * respuestas. Lo que diga es una propuesta para el laboratorio: no cambia nada del agente hasta que se firme fuera.
 */
import { useState } from 'react'
import type { Candidato, FuenteVista, Valoracion, ValidacionCandidato } from '../services/modelo-candidatos'
import { Boton, Campo, Chip, ENTRADA_CLASE, fechaCorta } from './ui'

export const VALORACION: Readonly<Record<Valoracion, { readonly nombre: string; readonly icono: string; readonly tono: string }>> = {
  correcto: { nombre: 'Es correcto', icono: '✓', tono: 'bg-emerald-100 text-emerald-900' },
  mal: { nombre: 'Está mal', icono: '✗', tono: 'bg-rose-100 text-rose-900' },
  corrige: { nombre: 'Lo corrijo', icono: '✎', tono: 'bg-sky-100 text-sky-900' },
  no_se: { nombre: 'No lo sé', icono: '?', tono: 'bg-neutral-200 text-neutral-800' },
}
const ORDEN: readonly Valoracion[] = ['correcto', 'mal', 'corrige', 'no_se']

export type Envia = (x: { candidato: string; valoracion: Valoracion; comentario: string; correccion: string }) => Promise<string | null>

function Respuesta({ v, cambia }: { v: ValidacionCandidato; cambia: () => void }) {
  const t = VALORACION[v.valoracion]
  return (
    <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-3" data-prueba="validacion-hecha">
      <p className="flex flex-wrap items-center gap-2 text-sm text-violet-950">
        <Chip className={t.tono}>{t.icono} {t.nombre}</Chip>
        <span>Propuesta para el laboratorio · {fechaCorta(v.actualizado)}</span>
        <button type="button" onClick={cambia} className="ml-auto text-xs font-semibold text-violet-800 underline" data-prueba="cambiar-validacion">Cambiar</button>
      </p>
      {v.correccion ? <p className="mt-2 text-sm text-neutral-900"><b>Tu corrección:</b> {v.correccion}</p> : null}
      {v.comentario ? <p className="mt-1 text-xs text-neutral-700">{v.comentario}</p> : null}
    </div>
  )
}

function Formulario({ c, previa, envia, listo }: { c: Candidato; previa: ValidacionCandidato | null; envia: Envia; listo: () => void }) {
  const [valoracion, setValoracion] = useState<Valoracion | null>(previa?.valoracion ?? null)
  const [comentario, setComentario] = useState(previa?.comentario ?? '')
  const [correccion, setCorreccion] = useState(previa?.correccion ?? '')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const manda = async () => {
    if (!valoracion) return setError('elige una respuesta')
    setEnviando(true)
    const e = await envia({ candidato: c.id, valoracion, comentario, correccion })
    setEnviando(false)
    if (e) setError(e)
    else listo()
  }
  return (
    <div className="mt-4 space-y-3" data-prueba="formulario-validacion">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="¿Es cierta la hipótesis?">
        {ORDEN.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={valoracion === k} onClick={() => { setValoracion(k); setError(null) }} data-prueba={`valora-${k}`}
            className={`rounded-2xl border px-3 py-2 text-sm font-semibold transition ${valoracion === k ? `${VALORACION[k].tono} border-transparent ring-2 ring-violet-500` : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}>
            <span aria-hidden className="mr-1">{VALORACION[k].icono}</span>{VALORACION[k].nombre}
          </button>
        ))}
      </div>
      {valoracion === 'corrige' ? (
        <Campo id={`correccion-${c.id}`} etiqueta="¿Cómo es lo correcto?" ayuda="En una o dos frases, sin nombres de clientes ni de personas.">
          <textarea id={`correccion-${c.id}`} className={ENTRADA_CLASE} rows={2} maxLength={1500} value={correccion} onChange={(e) => setCorreccion(e.target.value)} data-prueba="correccion" />
        </Campo>
      ) : null}
      <Campo id={`comentario-${c.id}`} etiqueta="Comentario (opcional)" ayuda="Por qué, o en qué casos sí y en cuáles no." error={error}>
        <textarea id={`comentario-${c.id}`} className={ENTRADA_CLASE} rows={2} maxLength={1500} value={comentario} onChange={(e) => setComentario(e.target.value)} data-prueba="comentario" />
      </Campo>
      <div className="flex justify-end gap-2">
        {previa ? <Boton variante="fantasma" onClick={listo}>Cancelar</Boton> : null}
        <Boton onClick={manda} disabled={enviando} prueba="enviar-validacion">{enviando ? 'Guardando…' : 'Guardar mi respuesta'}</Boton>
      </div>
    </div>
  )
}

export function TarjetaCandidato({ c, fuente, previa, envia }: { c: Candidato; fuente: FuenteVista; previa: ValidacionCandidato | null; envia: Envia }) {
  const [editando, setEditando] = useState(previa === null)
  return (
    <li className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm" data-prueba={`candidato-${c.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip className="bg-amber-100 text-amber-900">Hipótesis</Chip>
        <Chip className="bg-neutral-900 text-white">{c.tipo === 'nota' ? 'SAP Note' : 'T-code'}</Chip>
        {c.modulos.map((m) => <Chip key={m}>{m}</Chip>)}
        {!c.enAlcance ? <Chip className="bg-neutral-100 text-neutral-500">fuera del alcance de hoy</Chip> : null}
      </div>
      <h3 className="mt-3 flex flex-wrap items-baseline gap-x-3 text-xl font-bold tracking-tight text-neutral-900">
        <span className="font-mono">{c.clave}</span><span className="text-base font-medium text-neutral-600">{c.titulo}</span>
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-neutral-800">{c.hipotesis}</p>
      <p className="mt-2 text-xs text-neutral-500">
        Fuente: <a href={c.fuente.url} target="_blank" rel="noreferrer noopener" className="font-mono text-violet-800 underline">{c.fuente.archivo}:{c.fuente.linea}</a>
        {' '}· {fuente.repo}@{fuente.sha.slice(0, 7)} · {fuente.licencia} · iría a {c.destino}
      </p>
      {c.aviso ? <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">⚠ {c.aviso}</p> : null}
      {editando || !previa
        ? <Formulario c={c} previa={previa} envia={envia} listo={() => setEditando(false)} />
        : <Respuesta v={previa} cambia={() => setEditando(true)} />}
    </li>
  )
}
