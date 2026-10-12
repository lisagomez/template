'use client'

/**
 * Soporte SAP en laboratorio, por nivel: N3 (cliente) levanta y ve su servicio; N2 (consultor) atiende
 * con SLA, horas y accionables; N1 (superadministrador y experto) decide en la sala, conversa con el A2A
 * y ve los agregados y el sandbox. Las identidades son de laboratorio: en producción, `auth.uid()`.
 */
import { useState } from 'react'
import { SESIONES, type Rol, type Vista } from '../services/tipos'
import { FormularioIncidencia, Incidencias } from './incidencias'
import { Sala, Chat } from './sala-chat'
import { Tablero, Sla, Horas, RelojDemo, Accionables, Foda, Propuestas, Sandbox, ConocimientoComun } from './negocio'
import { Pildora } from './ui'
import { Presupuesto } from './presupuesto'
import { FichasDeServidor } from './ficha-servidor'
import { Salidas } from './salida'
import { MUESTRAS } from '../vitrina/en-vivo/muestras'

const ROLES: ReadonlyArray<[Rol, string]> = [['cliente', 'N3 · Cliente'], ['consultor', 'N2 · Consultor'], ['superadmin', 'N1 · Superadministrador'], ['experto', 'N1 · Experto HIL']]

/**
 * De dónde sale lo que se pinta. `laboratorio`: la API del laboratorio en esta máquina (lo de siempre). `vitrina`: las
 * vistas congeladas de un momento del journey, de solo lectura. `en-vivo`: la API de la vitrina en Vercel, que pasa al
 * laboratorio local firmada; ahí no se suben archivos, se eligen documentos de muestra.
 */
export type Fuente =
  | { readonly modo: 'laboratorio' }
  | { readonly modo: 'vitrina'; readonly vistas: Readonly<Record<Rol, Vista>> }
  | { readonly modo: 'en-vivo'; readonly api: string }
const ENCABEZADO: Record<Fuente['modo'], string> = {
  laboratorio: 'Soporte SAP · laboratorio · datos sintéticos, simulador en lugar de SAP, sin modelo',
  vitrina: 'Soporte SAP · vitrina · lo que el producto mostró en este momento del journey, congelado y de solo lectura',
  'en-vivo': 'Soporte SAP · en vivo · el laboratorio corriendo en la máquina del laboratorio · datos sintéticos, simulador en lugar de SAP, sin modelo',
}

export function SoporteSap({ inicial, fuente = { modo: 'laboratorio' } }: { inicial: Vista; fuente?: Fuente }) {
  const [propia, setVista] = useState(inicial)
  const [rolCongelado, setRolCongelado] = useState<Rol>(inicial.sesion.rol)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const soloLectura = fuente.modo === 'vitrina'
  const vista = fuente.modo === 'vitrina' ? fuente.vistas[rolCongelado] : propia
  const rol = vista.sesion.rol
  const api = fuente.modo === 'en-vivo' ? fuente.api : '/api/soporte-sap'

  const pide = async (r: Rol, init?: RequestInit) => {
    if (soloLectura) return
    setOcupado(true); setError(null)
    try {
      const resp = await fetch(`${api}?rol=${r}`, init)
      const datos = (await resp.json()) as { vista?: Vista; error?: string } & Partial<Vista>
      if (datos.error) setError(datos.error)
      if (datos.vista || datos.sesion) setVista(datos.vista ?? (datos as Vista))
    } finally { setOcupado(false) }
  }
  const cambia = (r: Rol) => (soloLectura ? setRolCongelado(r) : pide(r))
  const actua = (a: object) => pide(rol, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(a) })
  // En vivo se levanta con documentos de muestra, por nombre: el portero los lee del disco del laboratorio.
  const levanta = fuente.modo === 'en-vivo'
    ? (f: FormData) => actua({ levanta: { titulo: f.get('titulo'), descripcion: f.get('descripcion'), muestras: f.getAll('muestras') } })
    : (f: FormData) => pide(rol, { method: 'POST', body: f })
  const decide = (mensaje: string, accion: string, motivo: string) => actua({ tipo: 'decide', mensaje, accion, motivo })
  const envia = (texto: string) => actua({ tipo: 'chat', texto })
  const fija = (consultora: string, topeTokens: number | null, topePaginasOcr: number | null) => actua({ tipo: 'fija_presupuesto', consultora, topeTokens, topePaginasOcr })

  return (
    <main className="mx-auto max-w-7xl px-4 pb-24 pt-6">
      <header className="mb-4 pr-32">
        <p className="text-xs uppercase tracking-widest text-neutral-500">{ENCABEZADO[fuente.modo]}</p>
        <h1 className="text-3xl font-bold">{SESIONES[rol].nombre}</h1>
        <p className="text-sm text-neutral-500">Periodo de las métricas: {vista.periodo} · corte semántico {vista.versionCorte} · identidad de laboratorio <code>{vista.sesion.usuario}</code></p>
      </header>
      <nav className="mb-4 flex flex-wrap gap-2" data-prueba="roles">
        {ROLES.map(([r, t]) => (
          <button key={r} type="button" onClick={() => cambia(r)} data-prueba={`rol-${r}`}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${r === rol ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900' : 'border border-neutral-300 dark:border-neutral-700'}`}>{t}</button>
        ))}
        {soloLectura ? null : <button type="button" onClick={() => actua({ tipo: 'reinicia' })} className="ml-auto rounded-full border border-dashed px-3 py-1 text-xs" data-prueba="reinicia">Reiniciar laboratorio</button>}
      </nav>
      {error ? <p className="mb-3" data-prueba="error"><Pildora tono="mal">{error}</Pildora></p> : null}
      <fieldset disabled={soloLectura} className="contents">
      <div className="grid grid-cols-12 gap-4" data-prueba={`vista-${rol}`}>
        {rol === 'cliente' ? (
          <>
            <FormularioIncidencia levanta={levanta} ocupado={ocupado} muestras={fuente.modo === 'en-vivo' ? MUESTRAS : null} />
            <Incidencias lista={vista.incidencias} rol={rol} actua={actua} titulo="Tus incidencias" />
            <Tablero grupos={vista.tablero} />
            {vista.sla ? <Sla sla={vista.sla} /> : null}
            <Accionables lista={vista.accionables} ancho={5} />
            {vista.foda ? <Foda foda={vista.foda} /> : null}
            <ConocimientoComun lista={vista.conocimientoComun} propia={vista.sesion.organizacion} actua={actua} />
            <Salidas lista={vista.salidas} rol={rol} actua={actua} />
          </>
        ) : null}
        {rol === 'consultor' ? (
          <>
            <Incidencias lista={vista.incidencias} rol={rol} actua={actua} titulo="Bandeja de la consultora" />
            {vista.sla ? <Sla sla={vista.sla} /> : null}
            <Horas tarjetas={vista.horas} />
            <Presupuesto lista={vista.presupuesto} fija={null} />
            {vista.relojesDemo.length ? <RelojDemo relojes={vista.relojesDemo} /> : null}
            <Accionables lista={vista.accionables} />
            <Sala mensajes={vista.sala} rol={rol} decide={decide} />
            <Tablero grupos={vista.tablero} />
            {vista.foda ? <Foda foda={vista.foda} /> : null}
            <ConocimientoComun lista={vista.conocimientoComun} propia={vista.sesion.organizacion} actua={actua} />
            <Salidas lista={vista.salidas} rol={rol} actua={actua} />
          </>
        ) : null}
        {rol === 'superadmin' || rol === 'experto' ? (
          <>
            <Sala mensajes={vista.sala} rol={rol} decide={decide} />
            <Chat mensajes={vista.chat} rol={rol} envia={envia} />
            <Propuestas lista={vista.propuestas} alNucleo={rol === 'superadmin' ? (id) => actua({ tipo: 'al_nucleo', propuesta: id }) : null} />
            {rol === 'superadmin' ? <Presupuesto lista={vista.presupuesto} fija={fija} /> : null}
            {rol === 'superadmin' ? <FichasDeServidor fichas={vista.fichas} /> : null}
            <Salidas lista={vista.salidas} rol={rol} actua={actua} />
            <Sandbox casos={vista.sandbox} />
            <Incidencias lista={vista.incidencias} rol={rol} actua={actua} titulo="Lo escalado al laboratorio" />
            <Tablero grupos={vista.tablero} />
          </>
        ) : null}
      </div>
      </fieldset>
    </main>
  )
}
