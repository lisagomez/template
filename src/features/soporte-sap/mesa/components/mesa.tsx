'use client'

/**
 * La mesa de pruebas del experto: a la izquierda sus casos; en el centro, el caso que escribe o el que corre, paso a paso;
 * a la derecha, lo que propone el agente, lo que decide él y su veredicto. Todo viene de la API de la mesa: aquí no se
 * calcula nada, solo se pinta y se manda lo que el experto hace.
 */
import { useCallback, useEffect, useState } from 'react'
import type { CasoVista, EntradaCaso, MesaVista, Veredicto } from '../services/modelo'
import { Compositor } from './compositor'
import { LineaDeTiempo } from './linea'
import { Solucion } from './solucion'
import { VeredictoDelCaso } from './veredicto'
import { Celda, Chip, fechaCorta } from './ui'

const API = '/api/mesa/soporte-sap'
type Respuesta = { caso?: CasoVista; error?: string; formas?: Record<string, string[]> }

async function pide(cuerpo: unknown): Promise<Respuesta> {
  try {
    const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
    const d = (await r.json().catch(() => ({}))) as Respuesta
    return r.ok ? d : { error: d.error ?? `la mesa respondió ${r.status}` }
  } catch { return { error: 'no hay conexión con la mesa' } }
}

const RESULTADO: Readonly<Record<string, { texto: string; clase: string }>> = {
  solucion: { texto: 'con regla', clase: 'bg-emerald-100 text-emerald-900' },
  grado_insuficiente: { texto: 'regla sin grado', clase: 'bg-amber-100 text-amber-900' },
  sin_solucion: { texto: 'no lo sé', clase: 'bg-neutral-200 text-neutral-800' },
}
const VEREDICTO: Readonly<Record<Veredicto, string>> = { resuelto: '✅ lo resolvió', parcial: '🟡 en parte', incorrecto: '❌ se equivocó', debio_no_lo_se: '🤔 debió decir no lo sé' }

function Casos({ casos, abierto, abre, nuevo }: { casos: readonly CasoVista[]; abierto: string | null; abre: (id: string) => void; nuevo: () => void }) {
  return (
    <Celda prueba="casos" titulo="Tus casos" nota={casos.length ? `${casos.length} guardados` : 'Todavía ninguno'}>
      <button type="button" onClick={nuevo} data-prueba="nuevo-caso" className={`mb-3 w-full rounded-2xl border-2 border-dashed px-3 py-3 text-sm font-semibold ${abierto === null ? 'border-violet-500 bg-violet-50 text-violet-900' : 'border-neutral-300 text-neutral-700 hover:bg-neutral-50'}`}>+ Nuevo caso</button>
      <ul className="space-y-2">
        {casos.map((c) => {
          const r = c.sandbox?.veredicto === 'cuarentena' ? { texto: 'cuarentena', clase: 'bg-amber-100 text-amber-900' } : RESULTADO[c.resultado.tipo]!
          return (
            <li key={c.id}>
              <button type="button" onClick={() => abre(c.id)} data-prueba={`caso-${c.id}`} aria-current={abierto === c.id ? 'true' : undefined}
                className={`w-full rounded-2xl border p-3 text-left ${abierto === c.id ? 'border-violet-500 bg-violet-50' : 'border-neutral-200 bg-white hover:bg-neutral-50'}`}>
                <span className="block truncate text-sm font-semibold text-neutral-900">{c.entrada.transaccion || c.entrada.modulo} · {c.entrada.sintoma.slice(0, 48)}{c.entrada.sintoma.length > 48 ? '…' : ''}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1">
                  <Chip className={r.clase}>{r.texto}</Chip>
                  {c.retro.veredicto ? <Chip className="bg-violet-100 text-violet-900">{VEREDICTO[c.retro.veredicto.valor]}</Chip> : <Chip className="bg-white text-neutral-500 ring-1 ring-neutral-200">sin veredicto</Chip>}
                  {!c.vivo ? <Chip className="bg-neutral-100 text-neutral-500">guardado</Chip> : null}
                </span>
                <span className="mt-1 block text-xs text-neutral-500">{fechaCorta(c.creado)}{c.por.prueba ? ' · de prueba' : ''}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </Celda>
  )
}

function Cabecera({ caso }: { caso: CasoVista }) {
  const e = caso.entrada
  return (
    <Celda prueba="caso-abierto">
      <div className="flex flex-wrap items-center gap-2">
        <Chip className="bg-neutral-900 text-white">{e.sistema === 'S4HANA' ? 'S/4HANA' : 'ECC'}</Chip>
        <Chip>{e.modulo}</Chip>{e.transaccion ? <Chip className="bg-neutral-100 font-mono">{e.transaccion}</Chip> : null}{e.mensaje ? <Chip className="bg-neutral-100 font-mono">{e.mensaje}</Chip> : null}
        {caso.prioridad ? <Chip className="bg-rose-100 text-rose-900">prioridad {caso.prioridad}</Chip> : null}
      </div>
      <p className="mt-3 text-base text-neutral-900">{e.sintoma}</p>
      {e.intento ? <p className="mt-1 text-sm text-neutral-600">Ya intentaste: {e.intento}</p> : null}
      <p className="mt-2 text-xs text-neutral-500">Lo levantó, en tu nombre, el cliente sintético {caso.cliente} de Consultora Andina · {fechaCorta(caso.creado)}</p>
      {!caso.vivo ? <p className="mt-2 rounded-xl bg-neutral-100 p-2 text-xs text-neutral-700" data-prueba="no-vive">El laboratorio se reinició desde que corriste este caso: su línea, tu retro y tu veredicto se guardaron. Para decidir o enseñar, vuelve a correrlo.</p> : null}
    </Celda>
  )
}

export function Mesa() {
  const [vista, setVista] = useState<MesaVista | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [recien, setRecien] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  // El estado lo escribe la promesa: el efecto solo consulta (react-hooks/set-state-in-effect).
  const carga = useCallback(() => {
    fetch(API, { cache: 'no-store' })
      .then(async (r) => {
        if (r.ok) setVista((await r.json()) as MesaVista)
        else setAviso(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'la mesa no responde')
      })
      .catch(() => setAviso('no hay conexión con la mesa'))
  }, [])
  useEffect(() => { carga() }, [carga])

  const pon = (c: CasoVista) => setVista((v) => (v ? { ...v, casos: v.casos.some((x) => x.id === c.id) ? v.casos.map((x) => (x.id === c.id ? c : x)) : [c, ...v.casos] } : v))
  const actua = async (cuerpo: unknown): Promise<string | null> => {
    const r = await pide(cuerpo)
    if (r.caso) pon(r.caso)
    return r.error ?? null
  }
  const corre = async (entrada: EntradaCaso): Promise<string | null> => {
    setOcupado(true)
    const r = await pide({ tipo: 'ingresa', entrada })
    setOcupado(false)
    if (!r.caso) return r.error ?? 'no se pudo correr el caso'
    pon(r.caso); setRecien(r.caso.id); setAbierto(r.caso.id)
    return null
  }
  const revisa = async (campos: Record<string, string>) => (await pide({ tipo: 'revisa', campos })).formas ?? {}

  if (aviso && !vista) return <Celda prueba="mesa-aviso"><p className="text-sm text-neutral-700">{aviso}</p></Celda>
  if (!vista) return <p className="text-sm text-neutral-500" data-prueba="cargando">Abriendo la mesa…</p>
  const caso = vista.casos.find((c) => c.id === abierto) ?? null

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12" data-prueba="mesa">
      <div className="lg:col-span-3"><Casos casos={vista.casos} abierto={abierto} abre={(id) => { setAbierto(id); setRecien(null) }} nuevo={() => setAbierto(null)} /></div>
      {caso ? (
        <>
          <div className="space-y-4 lg:col-span-5">
            <Cabecera caso={caso} />
            <Celda titulo="Paso a paso" nota="Cada paso es un evento real de la cadena del laboratorio, en su orden y con su tiempo. Dinos cuál estuvo bien y cuál no.">
              <LineaDeTiempo key={`${caso.id}-${recien === caso.id}`} pasos={caso.pasos} retro={caso.retro.pasos} revela={recien === caso.id}
                guarda={async (clave, gesto, esperaba) => { const e = await actua({ tipo: 'retro_paso', caso: caso.id, clave, gesto, esperaba }); if (e) setAviso(e) }} />
            </Celda>
          </div>
          <div className="space-y-4 lg:col-span-4">
            <Solucion caso={caso} decide={async (accion, motivo) => { const e = await actua({ tipo: 'decide', caso: caso.id, accion, motivo }); if (e) setAviso(e) }} ensena={(texto) => actua({ tipo: 'ensena', caso: caso.id, texto })} />
            <VeredictoDelCaso key={caso.id} caso={caso} guarda={(valor, solucion, nota) => actua({ tipo: 'veredicto', caso: caso.id, valor, solucion, nota })} />
          </div>
        </>
      ) : (
        <div className="lg:col-span-9"><Compositor muestras={vista.muestras} corre={corre} revisa={revisa} ocupado={ocupado} /></div>
      )}
      {aviso ? <div role="alert" className="fixed bottom-4 left-1/2 z-50 max-w-lg -translate-x-1/2 rounded-2xl bg-neutral-900 px-4 py-3 text-sm text-white shadow-lg" data-prueba="aviso">{aviso} <button type="button" className="ml-2 underline" onClick={() => setAviso(null)}>cerrar</button></div> : null}
    </div>
  )
}
