'use client'

/**
 * El mapa del laboratorio: cómo crece la base de conocimiento de Soporte SAP, de un vistazo. De izquierda a derecha, de
 * dónde sale (sapstack fijado, el experto, los punteros a SAP Notes), dónde vive (la base sap-soporte) y quién la usa
 * (triage, motor, léxico, CLIs). Debajo, las métricas con su serie, el detalle del nodo elegido, las propuestas por
 * firmar, las versiones y los pins. Cada número lo cuenta el servidor; sin datos, lo dice.
 */
import { useCallback, useEffect, useState } from 'react'
import type { MapaVista } from '../services/modelo-candidatos'
import { Detalle, Pins, Propuestas, Versiones, type Nodo } from './mapa-detalle'
import { Conector, Cuenta, Fila, NodoFuente, TarjetaMetrica } from './mapa-piezas'
import { Celda } from './ui'

const API = '/api/mesa/soporte-sap?vista=mapa'

function Fuentes({ m, abre }: { m: MapaVista; abre: (n: Nodo) => void }) {
  const s = m.fuentes.sapstack, e = m.fuentes.experto, n = m.fuentes.notas
  return (
    <div className="flex flex-col justify-between gap-4">
      <NodoFuente nombre={`sapstack @${m.fuente.sha.slice(0, 7)}`} cuenta={s.candidatos} aviso={s.commitNuevo ? 'commit nuevo' : null} abre={() => abre('sapstack')} prueba="nodo-sapstack">
        {s.tcodes} T-codes y {s.notas} SAP Notes; {s.enAlcance} en los módulos que atiende Soporte SAP. Fuente secundaria: cada uno es una hipótesis.
      </NodoFuente>
      <NodoFuente nombre="El experto" cuenta={e.casos + e.validaciones} abre={() => abre('experto')} prueba="nodo-experto">
        {e.casos} casos y {e.validaciones} validaciones de {e.expertos} experto(s). De prueba, aparte: {e.dePrueba}.
      </NodoFuente>
      <NodoFuente nombre="SAP Notes" cuenta={n.punteros} abre={() => abre('notas')} prueba="nodo-notas">
        Solo número y enlace a SAP for Me; {n.validadas} validadas por un experto.
      </NodoFuente>
    </div>
  )
}

function Base({ m, abre }: { m: MapaVista; abre: (n: Nodo) => void }) {
  const firmadas = m.metricas.firmados.valor ?? 0
  return (
    <div className="self-center rounded-2xl border border-neutral-300 bg-white shadow-sm ring-4 ring-neutral-100" data-prueba="nodo-base">
      <button type="button" onClick={() => abre('base')} className="flex w-full items-center gap-2 border-b border-neutral-200 px-4 py-3 text-left" data-prueba="nodo-base-abre">
        <svg viewBox="0 0 20 20" className="h-4 w-4 text-neutral-600" aria-hidden><path d="M10 2l7 4v8l-7 4-7-4V6z" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
        <span className="font-semibold">{m.base.dominio}</span>
        <span className={`ml-auto h-2.5 w-2.5 rounded-full ${m.base.existe ? 'bg-blue-600' : 'bg-amber-400'}`} title={m.base.existe ? 'activa' : 'todavía sin reglas firmadas'} />
      </button>
      <div className="px-3 py-2">
        <p className="px-1 pb-1 text-xs font-medium text-neutral-500">{m.base.paquete}</p>
        <Fila clave="Versión con sap-soporte" valor={<span className="rounded-full border border-neutral-200 px-2 py-0.5 text-xs">{m.base.versionActual ?? 'ninguna'}</span>} />
        <Fila clave="Reglas firmadas" valor={<span className="rounded-full border border-neutral-200 px-2 py-0.5 text-xs tabular-nums">{firmadas}</span>} />
        <Fila clave="Propuestas por firmar" valor={<span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-900 tabular-nums">{m.propuestas.length}</span>} prueba="propuestas-por-firmar" />
      </div>
    </div>
  )
}

function Usos({ m, abre }: { m: MapaVista; abre: (n: Nodo) => void }) {
  const u = m.usos
  const medidos = u.clis.filter((c) => c.grado !== 'no medido').length
  return (
    <div className="self-center rounded-2xl border border-neutral-300 bg-white shadow-sm ring-4 ring-neutral-100" data-prueba="nodo-usos">
      <p className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3 font-semibold">Lo que la usa <Cuenta n={4} /></p>
      <div className="px-3 py-2">
        <Fila clave="Triage" valor={<span className="text-xs tabular-nums">{u.triage.reconocidos}/{u.triage.total} T-codes</span>} onClick={() => abre('triage')} prueba="uso-triage" />
        <Fila clave="Motor" valor={<span className="text-xs">{u.motor.casos ? `${u.motor.alExperto}/${u.motor.casos} al experto` : 'sin datos'}</span>} onClick={() => abre('motor')} prueba="uso-motor" />
        <Fila clave="Léxico del anonimizador" valor={<span className="text-xs tabular-nums">{u.lexico.nombresTapados}/{u.lexico.total} nombres tapados</span>} onClick={() => abre('lexico')} prueba="uso-lexico" />
        <Fila clave="CLIs ss-*" valor={<span className="text-xs">{u.clis.length} · {medidos ? `${medidos} medidos` : 'no medidos'}</span>} onClick={() => abre('clis')} prueba="uso-clis" />
      </div>
    </div>
  )
}

function Lienzo({ m, abre }: { m: MapaVista; abre: (n: Nodo) => void }) {
  return (
    <section className="rounded-3xl border border-neutral-200 bg-neutral-50 p-4 md:p-8" style={{ backgroundImage: 'radial-gradient(#d4d4d4 1px, transparent 1px)', backgroundSize: '18px 18px' }} data-prueba="mapa-lienzo" aria-label="Mapa: fuentes, base y lo que la usa">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)_4rem_minmax(0,1fr)] lg:gap-0">
        <Fuentes m={m} abre={abre} />
        <Conector salidas={[16, 50, 84]} />
        <p className="text-center text-neutral-400 lg:hidden" aria-hidden>↓</p>
        <Base m={m} abre={abre} />
        <Conector salidas={[50]} />
        <p className="text-center text-neutral-400 lg:hidden" aria-hidden>↓</p>
        <Usos m={m} abre={abre} />
      </div>
    </section>
  )
}

function Metricas({ m }: { m: MapaVista }) {
  const x = m.metricas
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7" data-prueba="metricas">
      <TarjetaMetrica etiqueta="Pendientes" m={x.pendientes} prueba="metrica-pendientes" />
      <TarjetaMetrica etiqueta="Correctos" m={x.correctos} prueba="metrica-correctos" />
      <TarjetaMetrica etiqueta="Corregidos" m={x.corregidos} prueba="metrica-corregidos" />
      <TarjetaMetrica etiqueta="Rechazados" m={x.rechazados} prueba="metrica-rechazados" />
      <TarjetaMetrica etiqueta="No sé" m={x.noSe} prueba="metrica-no-se" />
      <TarjetaMetrica etiqueta="Firmados" m={x.firmados} prueba="metrica-firmados" />
      <TarjetaMetrica etiqueta="Al experto" m={x.alExperto} sufijo="%" prueba="metrica-al-experto" />
    </div>
  )
}

export function Mapa() {
  const [m, setM] = useState<MapaVista | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nodo, setNodo] = useState<Nodo | null>(null)
  const carga = useCallback(() => {
    fetch(API, { cache: 'no-store' })
      .then(async (r) => { if (r.ok) setM((await r.json()) as MapaVista); else setError(`la mesa respondió ${r.status}`) })
      .catch(() => setError('no hay conexión con la mesa'))
  }, [])
  useEffect(() => { carga() }, [carga])
  if (error) return <Celda><p className="text-sm text-neutral-700">{error}</p></Celda>
  if (!m) return <p className="text-sm text-neutral-500">Dibujando el mapa…</p>
  return (
    <div className="space-y-5" data-prueba="mapa">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm">
        <span className={`h-2.5 w-2.5 rounded-full ${m.fuente.integro ? 'bg-emerald-500' : 'bg-rose-500'}`} aria-hidden />
        <a href={`${m.fuente.web}/tree/${m.fuente.sha}`} target="_blank" rel="noreferrer noopener" className="font-medium underline">{m.fuente.repo}@{m.fuente.sha.slice(0, 7)}</a>
        <span className="text-neutral-500">Fuente externa fijada · {m.fuente.licencia} · revisada el {m.fuente.revision.fecha}</span>
        <span className="ml-auto text-xs text-neutral-400">contado el {new Date(m.generado).toLocaleString('es-MX')}</span>
      </div>
      <Lienzo m={m} abre={(n) => setNodo(n)} />
      {nodo ? <Detalle nodo={nodo} m={m} cierra={() => setNodo(null)} /> : null}
      <Metricas m={m} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5"><Propuestas m={m} /><Celda titulo="Versiones de la base" nota="Del registro de @tu-scope/conocimiento: solo avanza, y lo que cambia un veredicto lo firma el laboratorio."><Versiones vs={m.base.versiones} /></Celda></div>
        <Pins m={m} />
      </div>
    </div>
  )
}
