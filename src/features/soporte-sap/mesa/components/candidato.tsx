'use client'

/**
 * Un candidato, para el experto: la HIPÓTESIS, su fuente a la vista (archivo y línea de sapstack en su SHA; o, si sale de
 * la web, su cita, el día de la captura y su huella) y cuatro respuestas. A uno de sapstack se le ve lo que dicen de él
 * las fuentes web fijadas. Lo que diga el experto es una propuesta para el laboratorio: no cambia nada del agente hasta
 * que se firme fuera.
 */
import { useState } from 'react'
import type { Candidato, Corroboracion, FuenteVista, FuenteWebVista, Valoracion, ValidacionCandidato } from '../services/modelo-candidatos'
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

const TONO_PRIORIDAD: Readonly<Record<string, string>> = { 'Hot News': 'bg-rose-600 text-white', Alta: 'bg-orange-100 text-orange-900', Media: 'bg-yellow-100 text-yellow-900', Baja: 'bg-neutral-100 text-neutral-700' }
const enlace = 'font-mono text-violet-800 underline'

/** De dónde sale: sapstack (archivo:línea en su SHA) o la web (la cita que admite politica-cita, la captura y su huella). */
function Procedencia({ c, fuente, web }: { c: Candidato; fuente: FuenteVista; web: FuenteWebVista }) {
  if (c.origen !== 'web' || !c.captura) return (
    <p className="mt-2 text-xs text-neutral-500">
      Fuente: <a href={c.fuente.url} target="_blank" rel="noreferrer noopener" className={enlace}>{c.fuente.archivo}:{c.fuente.linea}</a>
      {' '}· {fuente.repo}@{fuente.sha.slice(0, 7)} · {fuente.licencia} · iría a {c.destino}
    </p>
  )
  const pin = web.pins.find((p) => p.id === c.captura?.fuente)
  return (
    <div className="mt-2 space-y-1 text-xs text-neutral-500" data-prueba="procedencia-web">
      <p>Cita: {c.cita ? <a href={c.cita.url} target="_blank" rel="noreferrer noopener" className={enlace} data-prueba="cita-web">{c.cita.texto}</a> : <span className="text-amber-800">ninguna que politica-cita admita</span>} · iría a {c.destino}</p>
      <p>Capturada el <b data-prueba="captura-fecha">{c.captura.fecha}</b> de <a href={c.fuente.url} target="_blank" rel="noreferrer noopener" className={enlace}>{pin?.nombre ?? c.captura.fuente} · {c.fuente.archivo.split('/').at(-1)}:{c.fuente.linea}</a> @{c.captura.ref.slice(0, 7)} · {pin?.licencia} · huella <span className="font-mono">{c.captura.huella.slice(7, 19)}</span></p>
    </div>
  )
}

const ESTADO_CRUCE: Readonly<Record<Corroboracion['estado'], { readonly texto: string; readonly tono: string }>> = {
  corroborado: { texto: 'Corroborado por una fuente citable', tono: 'border-emerald-200 bg-emerald-50 text-emerald-950' },
  contradicho: { texto: 'Una fuente citable dice otra cosa', tono: 'border-rose-200 bg-rose-50 text-rose-950' },
  no_encontrado: { texto: 'Ninguna fuente web fijada lo corrobora', tono: 'border-neutral-200 bg-neutral-50 text-neutral-700' },
}

/** Lo que las fuentes web fijadas dicen de un candidato de sapstack. Lo que corrobora es una fuente que politica-cita admite. */
function Cruce({ x }: { x: Corroboracion }) {
  const e = ESTADO_CRUCE[x.estado]
  return (
    <div className={`mt-3 rounded-2xl border p-3 text-xs ${e.tono}`} data-prueba={`cruce-${x.estado}`}>
      <p className="font-semibold">{e.texto}{x.evidencias.length ? ` · ${x.evidencias.length} página(s)` : ''}</p>
      <ul className="mt-1 space-y-0.5">
        {x.evidencias.slice(0, 3).map((v) => (
          <li key={`${v.fuente}:${v.archivo}`}>
            {v.admitida && v.cita ? <a href={v.cita.url} target="_blank" rel="noreferrer noopener" className="underline">{v.pagina}</a> : <span>{v.pagina} (no admitida)</span>}
            {' '}— {v.detalle} · <a href={v.url} target="_blank" rel="noreferrer noopener" className="font-mono underline">{v.guia}</a>
          </li>
        ))}
      </ul>
      {x.estado === 'no_encontrado' ? <p className="mt-1">Sigue siendo una hipótesis: necesita que el experto la valide con su propia fuente.</p> : null}
    </div>
  )
}

function Chips({ c }: { c: Candidato }) {
  const s = c.seguridad
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip className="bg-amber-100 text-amber-900">Hipótesis</Chip>
      <Chip className="bg-neutral-900 text-white">{s ? 'Nota de seguridad' : c.tipo === 'nota' ? 'SAP Note' : 'T-code'}</Chip>
      {c.origen === 'web' ? <Chip className="bg-sky-100 text-sky-900">la web</Chip> : <Chip>sapstack</Chip>}
      {s?.prioridad ? <Chip className={TONO_PRIORIDAD[s.prioridad]}>CVSS {s.cvss} · {s.prioridad}</Chip> : null}
      {s?.explotada ? <Chip className="bg-rose-100 text-rose-900">explotada (KEV, {s.explotada})</Chip> : null}
      {c.modulos.map((m) => <Chip key={m}>{m}</Chip>)}
      {!c.enAlcance ? <Chip className="bg-neutral-100 text-neutral-500">fuera del alcance de hoy</Chip> : null}
    </div>
  )
}

export function TarjetaCandidato({ c, fuente, web, previa, envia }: { c: Candidato; fuente: FuenteVista; web: FuenteWebVista; previa: ValidacionCandidato | null; envia: Envia }) {
  const [editando, setEditando] = useState(previa === null)
  return (
    <li className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm" data-prueba={`candidato-${c.id}`}>
      <Chips c={c} />
      <h3 className="mt-3 flex flex-wrap items-baseline gap-x-3 text-xl font-bold tracking-tight text-neutral-900">
        <span className="font-mono">{c.clave}</span><span className="text-base font-medium text-neutral-600">{c.titulo}</span>
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-neutral-800">{c.hipotesis}</p>
      <Procedencia c={c} fuente={fuente} web={web} />
      {c.corroboracion ? <Cruce x={c.corroboracion} /> : null}
      {c.aviso ? <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">⚠ {c.aviso}</p> : null}
      {editando || !previa
        ? <Formulario c={c} previa={previa} envia={envia} listo={() => setEditando(false)} />
        : <Respuesta v={previa} cambia={() => setEditando(true)} />}
    </li>
  )
}
