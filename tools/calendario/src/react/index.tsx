'use client'

/**
 * @tu-scope/calendario/react — la UI, APARTE del nucleo (React es peer opcional: quien solo usa la
 * logica no lo instala). Componentes "tontos": reciben instancias, salud y actividad, y avisan con
 * callbacks; quien consume decide si eso pasa por la pluma (y con que clave).
 */
import type { ReactNode } from 'react'
import { navega, rangoDeVista, type BloqueDeActividad, type Calendario, type Instancia, type Salud, type Vista } from '../index.js'
import { EstilosCalendario } from './estilos-componente.js'
import { Rejilla } from './rejilla.js'
import { IndicadorDeSalud, Lista, Mes } from './vistas.js'
import { tituloDeVista } from './util.js'

export { EditorDeEvento, type GuardadoDelEditor, type PropsEditor } from './editor.js'
export { IndicadorDeSalud, SelectorDeHuecos, type PropsHuecos } from './vistas.js'
export { CSS_CALENDARIO } from './estilos.js'
export { EstilosCalendario } from './estilos-componente.js'

export interface PropsAgenda {
  vista: Vista
  fecha: string
  zona: string
  instancias: readonly Instancia[]
  calendarios: readonly Calendario[]
  actividad?: readonly BloqueDeActividad[]
  /** Lente de actividad: la rejilla muestra solo la actividad programada, a todo lo ancho. */
  soloActividad?: boolean
  salud?: Salud | null
  hoy?: string
  ahoraMs?: number
  inicioSemana?: number
  horaInicial?: number
  /** Controles extra a la derecha de la barra (sincronizar, lente…). */
  extra?: ReactNode
  alto?: number | string
  alCambiarVista?: (v: Vista) => void
  alCambiarFecha?: (fecha: string) => void
  alSeleccionar?: (i: Instancia) => void
  alMover?: (i: Instancia, inicio: string, fin: string) => void
  alCrear?: (inicio: string, fin: string) => void
}

const VISTAS: Array<[Vista, string]> = [['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes'], ['agenda', 'Agenda']]

export function Agenda(p: PropsAgenda) {
  const rango = rangoDeVista(p.vista, p.fecha, p.zona, p.inicioSemana ?? 1)
  const comunes = { dias: rango.dias, zona: p.zona, instancias: p.instancias, calendarios: p.calendarios, hoy: p.hoy, alSeleccionar: p.alSeleccionar }
  return (
    <div className="cal-tema cal-raiz" style={{ height: p.alto ?? 680 }} data-prueba="agenda" data-vista={p.vista}>
      <EstilosCalendario />
      <div className="cal-barra">
        <button type="button" className="cal-boton" onClick={() => p.alCambiarFecha?.(p.hoy ?? p.fecha)}>Hoy</button>
        <div className="cal-grupo">
          <button type="button" className="cal-boton" aria-label="Anterior" onClick={() => p.alCambiarFecha?.(navega(p.vista, p.fecha, -1))}>‹</button>
          <button type="button" className="cal-boton" aria-label="Siguiente" onClick={() => p.alCambiarFecha?.(navega(p.vista, p.fecha, 1))}>›</button>
        </div>
        <h2 className="cal-titulo" data-prueba="titulo-vista">{tituloDeVista(p.vista, rango.dias, p.fecha)}</h2>
        {p.salud && <IndicadorDeSalud salud={p.salud} />}
        {p.extra}
        <div className="cal-grupo" role="group" aria-label="Vista">
          {VISTAS.map(([v, t]) => (
            <button key={v} type="button" className="cal-boton" aria-pressed={p.vista === v} onClick={() => p.alCambiarVista?.(v)} data-prueba={`vista-${v}`}>{t}</button>
          ))}
        </div>
      </div>
      {(p.vista === 'dia' || p.vista === 'semana') && (
        <Rejilla {...comunes} actividad={p.actividad} soloActividad={p.soloActividad} ahoraMs={p.ahoraMs} horaInicial={p.horaInicial}
          alMover={p.alMover} alCrear={p.alCrear} />
      )}
      {p.vista === 'mes' && (
        <Mes {...comunes} mesActual={Number(p.fecha.slice(5, 7))} alElegirDia={(d) => { p.alCambiarFecha?.(d); p.alCambiarVista?.('dia') }} />
      )}
      {p.vista === 'agenda' && <Lista {...comunes} />}
    </div>
  )
}
