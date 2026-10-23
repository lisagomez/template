'use client'

/**
 * Lo que va debajo del mapa: el detalle del nodo elegido, las propuestas de los expertos (lo que el laboratorio firma o
 * no), las versiones de la base (como la lista de Deployments) y las fuentes con sus pins.
 */
import type { ReactNode } from 'react'
import type { MapaVista, VersionBase } from '../services/modelo-candidatos'
import { RAIZ_DE_LA_MESA } from './marco'
import { VALORACION } from './candidato'
import { Celda, Chip, fechaCorta } from './ui'

export type Nodo = 'sapstack' | 'web' | 'experto' | 'notas' | 'base' | 'triage' | 'motor' | 'lexico' | 'clis'
const si = (b: boolean) => (b ? 'sí' : 'no')
const n = (k: number, una: string, varias = `${una}s`) => `${k} ${k === 1 ? una : varias}`

export function Versiones({ vs }: { vs: readonly VersionBase[] }) {
  return (
    <div className="overflow-x-auto" data-prueba="versiones">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="text-xs text-neutral-500"><tr><th className="py-2 font-medium">Versión</th><th className="font-medium">Fecha</th><th className="font-medium">Firmó</th><th className="font-medium">Reglas</th><th className="font-medium">Firmadas</th><th className="font-medium">sap-soporte</th><th className="font-medium">Huella</th></tr></thead>
        <tbody className="divide-y divide-neutral-100">
          {vs.map((v) => (
            <tr key={v.version}>
              <td className="py-2 font-mono font-semibold">{v.version}</td><td>{v.fecha ?? '—'}</td><td>{v.firmo ?? '—'}</td><td className="tabular-nums">{v.reglas}</td><td className="tabular-nums">{v.firmadas}</td>
              <td>{v.categoriasSapSoporte === null ? <span className="text-neutral-400">no está</span> : `${v.categoriasSapSoporte} categorías`}</td><td className="font-mono text-xs text-neutral-500">{v.huella.replace('sha256:', '')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Pin({ clave, children }: { clave: string; children: ReactNode }) {
  return <div className="border-b border-neutral-100 py-3 last:border-0"><p className="text-xs font-medium text-neutral-500">{clave}</p><div className="mt-0.5 break-words text-sm text-neutral-900">{children}</div></div>
}

/** La web de BASIS: cada fuente con su SHA, lo que dio, la captura y la última revisión (que avisa y no mueve). */
function DetalleWeb({ m }: { m: MapaVista }) {
  const w = m.web, x = m.fuentes.web
  const cuantos = new Map(x.porFuente.map((p) => [p.fuente, p.candidatos]))
  return (
    <div className="space-y-3 text-sm" data-prueba="detalle-web-cuerpo">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {w.pins.map((p) => <div key={p.id} className="rounded-xl border border-neutral-200 bg-white p-3"><b>{p.nombre}</b><br /><a href={`${p.web}/tree/${p.sha}`} target="_blank" rel="noreferrer noopener" className="font-mono text-xs text-violet-800 underline">@{p.sha.slice(0, 12)}</a> · <span className="text-xs text-neutral-500">{p.licencia}</span><br /><span className="text-xs">{n(cuantos.get(p.id) ?? 0, 'candidato')}{p.id === 'kev' ? ` · versión ${w.kevVersion} (marca las explotadas)` : ''}</span></div>)}
      </div>
      <p>Capturada el <b>{w.capturadoEl}</b> (CVE de SAP del {w.ventana.desde} al {w.ventana.hasta}; último Patch Day fijado: {w.ultimoPatchDay}). {x.validados} validados por un experto.</p>
      <p>Cruce con los {x.cruce.total} candidatos de BASIS/BC de sapstack: <b>{x.cruce.corroborados}</b> corroborados por una fuente que politica-cita admite, <b>{x.cruce.contradichos}</b> contradichos y <b>{x.cruce.noEncontrados}</b> no encontrados.</p>
      <p data-prueba="revision-web">{w.revision ? (w.revision.estado === 'al_dia' ? <span className="text-emerald-700">Al día: revisada el {w.revision.fecha}; el próximo Patch Day es el {w.revision.proximoPatchDay}.</span> : <span className="font-semibold text-amber-800">Hay versión nueva (revisada el {w.revision.fecha}): {w.revision.avisos.join(' · ')}. El pin no se mueve solo.</span>) : 'Sin revisar todavía.'}</p>
      <p className="text-xs text-neutral-500">SAP Help, el Patch Day de support.sap.com y la estrategia de mantenimiento no se capturan: su robots.txt y los términos de SAP no dejan extraerlos en automático. Los lee una persona.</p>
      <a href={`${RAIZ_DE_LA_MESA}?pestana=candidatos`} className="inline-block rounded-xl bg-violet-700 px-3 py-2 text-center text-sm font-semibold text-white">Validar candidatos →</a>
    </div>
  )
}

export function Pins({ m }: { m: MapaVista }) {
  const f = m.fuente
  return (
    <Celda prueba="pins" titulo="Fuentes y pins">
      <Pin clave="sapstack (fijado)"><a href={`${f.web}/tree/${f.sha}`} target="_blank" rel="noreferrer noopener" className="font-mono text-violet-800 underline" title={f.sha}>{f.repo}@{f.sha.slice(0, 12)}</a><br />{f.version} · commit del {f.commitFecha}</Pin>
      <Pin clave="Licencia">{f.licencia} · {f.copyright}</Pin>
      <Pin clave="Origen">{f.origen.repo}: {f.origen.estado}</Pin>
      <Pin clave="Última revisión del origen">{f.revision.fecha} · {f.revision.head === f.sha ? <span className="text-emerald-700">sin commits nuevos</span> : <span className="font-semibold text-amber-800">commit nuevo {f.revision.head.slice(0, 12)}: el pin no se mueve solo</span>}</Pin>
      <Pin clave="Catálogo">{f.integro ? <span className="text-emerald-700">íntegro (huella y SHA del pin)</span> : <span className="text-rose-700">{f.motivo}</span>}</Pin>
      <Pin clave="La web de BASIS (fijada)">{m.web.pins.map((p) => <span key={p.id} className="block font-mono text-xs">{p.id}@{p.sha.slice(0, 12)}</span>)}capturada el {m.web.capturadoEl} · {m.web.integro ? <span className="text-emerald-700">íntegra</span> : <span className="text-rose-700">{m.web.motivo}</span>}</Pin>
      <Pin clave="Base de conocimiento">{m.base.paquete}<br /><span className="text-neutral-500">Soporte SAP todavía no fija una versión: no hay conocimiento de producción.</span></Pin>
    </Celda>
  )
}

export function Propuestas({ m }: { m: MapaVista }) {
  return (
    <Celda prueba="propuestas" titulo="Propuestas de los expertos" nota="Cada validación es una propuesta. Firmar una regla es fuera de la mesa: en tools/conocimiento, con una fuente citable (de una SAP Note, solo el número y el enlace).">
      {m.propuestas.length === 0 ? <p className="text-sm text-neutral-500">Ningún experto ha validado un candidato todavía.</p> : (
        <ul className="space-y-3">
          {m.propuestas.map(({ candidato: c, validaciones }) => (
            <li key={c.id} className="rounded-2xl border border-neutral-200 p-3" data-prueba={`propuesta-${c.id}`}>
              <p className="flex flex-wrap items-center gap-2 text-sm"><Chip className="bg-neutral-900 text-white">{c.tipo === 'nota' ? 'SAP Note' : 'T-code'}</Chip><b className="font-mono">{c.clave}</b><span className="text-neutral-600">{c.titulo}</span></p>
              <p className="mt-1 text-xs text-neutral-600">{c.hipotesis} <a href={c.fuente.url} target="_blank" rel="noreferrer noopener" className="text-violet-800 underline">{c.fuente.archivo}:{c.fuente.linea}</a></p>
              <ul className="mt-2 space-y-1">
                {validaciones.map((v) => (
                  <li key={v.por.usuario} className="flex flex-wrap items-center gap-2 text-xs">
                    <Chip className={VALORACION[v.valoracion].tono}>{VALORACION[v.valoracion].icono} {VALORACION[v.valoracion].nombre}</Chip>
                    <Chip className="bg-violet-100 text-violet-900">propuesta</Chip>{v.por.prueba ? <Chip className="bg-amber-100 text-amber-900">de prueba</Chip> : null}
                    <span className="text-neutral-500">{v.por.correo} · {fechaCorta(v.actualizado)}</span>
                    {v.correccion ? <span className="basis-full text-neutral-900">Corrige: «{v.correccion}»</span> : null}
                    {v.comentario ? <span className="basis-full text-neutral-600">«{v.comentario}»</span> : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Celda>
  )
}

function DetalleDe({ nodo, m }: { nodo: Nodo; m: MapaVista }) {
  const u = m.usos, s = m.fuentes.sapstack
  if (nodo === 'web') return <DetalleWeb m={m} />
  if (nodo === 'sapstack') return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {s.porModulo.map((x) => <div key={x.modulo} className={`rounded-xl border p-3 text-sm ${x.enAlcance ? 'border-neutral-200 bg-white' : 'border-dashed border-neutral-200 bg-neutral-50 text-neutral-500'}`}><b>{x.modulo}</b> · {n(x.candidatos, 'candidato')} · {n(x.validados, 'validado')}<br /><span className="text-xs text-neutral-500">{x.enAlcance === x.candidatos ? 'todos en el alcance de hoy' : x.enAlcance ? `${x.enAlcance} en el alcance de hoy` : 'fuera del alcance de hoy'}</span></div>)}
      <a href={`${RAIZ_DE_LA_MESA}?pestana=candidatos`} className="rounded-xl bg-violet-700 p-3 text-center text-sm font-semibold text-white">Validar candidatos →</a>
    </div>
  )
  if (nodo === 'experto') return <p className="text-sm">{m.fuentes.experto.casos} casos y {m.fuentes.experto.validaciones} validaciones de {m.fuentes.experto.expertos} experto(s); {m.fuentes.experto.dePrueba} de prueba, contadas aparte. <a className="text-violet-800 underline" href={`${RAIZ_DE_LA_MESA}/laboratorio?pestana=casos`}>Ver los casos</a></p>
  if (nodo === 'notas') return <p className="text-sm">{m.fuentes.notas.punteros} punteros a SAP Notes (número y enlace a SAP for Me); {m.fuentes.notas.validadas} validados por un experto. El contenido de una nota es de SAP: no se copia, se cita.</p>
  if (nodo === 'base') return <><p className="mb-3 text-sm">{m.base.existe ? `El dominio ${m.base.dominio} existe desde ${m.base.versionActual}.` : `El dominio ${m.base.dominio} todavía no existe: entra con la primera regla firmada, con su fuente citada, en una versión nueva de ${m.base.paquete.replace(/@[^@]+$/, '')}.`}</p><Versiones vs={m.base.versiones} /></>
  if (nodo === 'triage') return <p className="text-sm">El triage de hoy reconoce <b>{u.triage.reconocidos} de {u.triage.total}</b> T-codes en alcance del catálogo. Sin reconocer, por ejemplo: <span className="font-mono">{u.triage.faltan.join(', ')}</span>. Un candidato validado y firmado le diría el módulo del ticket.</p>
  if (nodo === 'motor') return <p className="text-sm">{u.motor.casos === 0 ? 'Sin casos de expertos todavía: sin datos.' : `De ${u.motor.casos} casos del experto, el agente resolvió ${u.motor.solucion} y ${u.motor.alExperto} fueron al experto (sin regla o con grado insuficiente).`} Con conocimiento de producción, solo una regla firmada da veredicto; un candidato nunca.</p>
  if (nodo === 'lexico') return <p className="text-sm">Del catálogo en alcance, el anonimizador de hoy tapa como nombre de persona {u.lexico.codigosTapados} T-codes y {u.lexico.nombresTapados} de {u.lexico.total} nombres de transacción{u.lexico.ejemplos.length ? ` (p. ej. ${u.lexico.ejemplos.join('; ')})` : ''}. Cambiar el léxico decide qué se tapa: se propone medido, no se cambia aquí.</p>
  return (
    <table className="w-full text-left text-sm" data-prueba="tabla-clis"><thead className="text-xs text-neutral-500"><tr><th className="py-1 font-medium">CLI</th><th className="font-medium">Qué hace</th><th className="font-medium">Solo lectura</th><th className="font-medium">Simula por defecto</th><th className="font-medium">Grado</th></tr></thead>
      <tbody className="divide-y divide-neutral-100">{u.clis.map((c) => <tr key={c.nombre}><td className="py-1.5 font-mono">{c.nombre}</td><td className="text-neutral-700">{c.que}</td><td>{si(c.readOnly)}</td><td>{si(c.dryRunPorDefecto)}</td><td><Chip className="bg-amber-100 text-amber-900">{c.grado}</Chip></td></tr>)}</tbody>
    </table>
  )
}

const TITULO: Readonly<Record<Nodo, string>> = { sapstack: 'sapstack: candidatos por módulo', web: 'La web de BASIS: fuentes fijadas, cruce y vigencia', experto: 'El experto en la mesa', notas: 'Punteros a SAP Notes', base: 'La base sap-soporte', triage: 'Triage y categorización', motor: 'El motor y sus veredictos', lexico: 'El léxico del anonimizador', clis: 'Los CLIs de Soporte SAP' }

export function Detalle({ nodo, m, cierra }: { nodo: Nodo; m: MapaVista; cierra: () => void }) {
  return (
    <Celda prueba={`detalle-${nodo}`} titulo={<span className="flex items-center gap-2">{TITULO[nodo]}<button type="button" onClick={cierra} className="ml-auto text-xs font-medium text-neutral-500 hover:underline">Cerrar</button></span>}>
      <DetalleDe nodo={nodo} m={m} />
    </Celda>
  )
}
