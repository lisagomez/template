'use client'

/**
 * La rejilla de horas (vistas dia y semana): cada evento se coloca por sus minutos LOCALES en la zona
 * de quien mira; los que se solapan se reparten en columnas. Arrastrar mueve (con snap de 15 min,
 * tambien a otro dia), el tirador de abajo estira, y un clic en vacio propone crear.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as EventoPuntero } from 'react'
import { disponColumnas, type BloqueDeActividad, type Calendario, type Instancia } from '../index.js'
import { ALTO_HORA, colorDe, cubreDia, fechaLarga, hora, instanteLocal, limitesDelDia, minutosLocales } from './util.js'

export interface PropsRejilla {
  dias: string[]
  zona: string
  instancias: readonly Instancia[]
  calendarios: readonly Calendario[]
  actividad?: readonly BloqueDeActividad[]
  soloActividad?: boolean
  hoy?: string
  ahoraMs?: number
  horaInicial?: number
  alSeleccionar?: (i: Instancia) => void
  alMover?: (i: Instancia, inicio: string, fin: string) => void
  alCrear?: (inicio: string, fin: string) => void
}

interface Segmento { clave: string; inst: Instancia; dia: number; inicioMin: number; finMin: number }
interface Arrastre { clave: string; modo: 'mover' | 'estirar'; x0: number; y0: number; dMin: number; dDias: number }

const SNAP = 15

function segmentos(dias: string[], instancias: readonly Instancia[], zona: string): Segmento[] {
  const fuera: Segmento[] = []
  dias.forEach((dia, d) => {
    const l = limitesDelDia(dia, zona)
    for (const i of instancias) {
      if (i.todoElDia || i.inicioMs >= l.hasta || i.finMs <= l.desde) continue
      const inicioMin = i.inicioMs <= l.desde ? 0 : minutosLocales(i.inicioMs, zona)
      const finMin = i.finMs >= l.hasta ? 1440 : minutosLocales(i.finMs, zona)
      fuera.push({ clave: `${i.cuenta}/${i.calendario}/${i.id}/${d}`, inst: i, dia: d, inicioMin, finMin: Math.max(finMin, inicioMin + 15) })
    }
  })
  return fuera
}

function estiloEvento(s: Segmento, col: { columna: number; columnas: number }, color: string, a: Arrastre | null): CSSProperties {
  const dMin = a?.clave === s.clave ? a.dMin : 0
  const inicio = a?.clave === s.clave && a.modo === 'estirar' ? s.inicioMin : s.inicioMin + dMin
  const fin = a?.clave === s.clave && a.modo === 'estirar' ? Math.max(s.inicioMin + SNAP, s.finMin + dMin) : s.finMin + dMin
  const ancho = 100 / col.columnas
  return {
    top: (inicio / 60) * ALTO_HORA, height: Math.max(18, ((fin - inicio) / 60) * ALTO_HORA - 2),
    left: `calc(${col.columna * ancho}% + 2px)`, width: `calc(${ancho}% - 4px)`,
    transform: a?.clave === s.clave && a.modo === 'mover' && a.dDias ? `translateX(${a.dDias * 100 * col.columnas}%)` : undefined,
    ['--cal-color' as string]: color,
  }
}

export function Rejilla(p: PropsRejilla) {
  const cuerpo = useRef<HTMLDivElement>(null)
  const [arrastre, setArrastre] = useState<Arrastre | null>(null)
  const segs = useMemo(() => (p.soloActividad ? [] : segmentos(p.dias, p.instancias, p.zona)), [p.dias, p.instancias, p.zona, p.soloActividad])
  const colocacion = useMemo(() => {
    const m = new Map<string, { columna: number; columnas: number }>()
    p.dias.forEach((_, d) => {
      const delDia = segs.filter((s) => s.dia === d).map((s) => ({ clave: s.clave, inicioMs: s.inicioMin, finMs: s.finMin }))
      for (const [k, v] of disponColumnas(delDia)) m.set(k, v)
    })
    return m
  }, [segs, p.dias])

  useEffect(() => {
    if (cuerpo.current) cuerpo.current.scrollTop = (p.horaInicial ?? 7) * ALTO_HORA
  }, [p.horaInicial])

  const anchoDia = () => Math.max(1, ((cuerpo.current?.getBoundingClientRect().width ?? 0) - 56) / p.dias.length)

  const empieza = (e: EventoPuntero<HTMLElement>, s: Segmento, modo: Arrastre['modo']) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setArrastre({ clave: s.clave, modo, x0: e.clientX, y0: e.clientY, dMin: 0, dDias: 0 })
  }
  const mueve = (e: EventoPuntero<HTMLElement>) => {
    if (!arrastre) return
    const dMin = Math.round(((e.clientY - arrastre.y0) / ALTO_HORA) * 60 / SNAP) * SNAP
    const dDias = arrastre.modo === 'mover' ? Math.round((e.clientX - arrastre.x0) / anchoDia()) : 0
    if (dMin !== arrastre.dMin || dDias !== arrastre.dDias) setArrastre({ ...arrastre, dMin, dDias })
  }
  const termina = (s: Segmento) => {
    const a = arrastre
    setArrastre(null)
    if (!a || a.clave !== s.clave) return
    if (a.dMin === 0 && a.dDias === 0) { p.alSeleccionar?.(s.inst); return }
    const duracion = s.inst.finMs - s.inst.inicioMs
    const dia = p.dias[Math.min(p.dias.length - 1, Math.max(0, s.dia + a.dDias))] as string
    if (a.modo === 'mover') {
      const inicio = instanteLocal(dia, minutosLocales(s.inst.inicioMs, p.zona) + a.dMin, p.zona)
      p.alMover?.(s.inst, new Date(inicio).toISOString(), new Date(inicio + duracion).toISOString())
    } else {
      const fin = Math.max(s.inst.inicioMs + SNAP * 60_000, s.inst.finMs + a.dMin * 60_000)
      p.alMover?.(s.inst, s.inst.inicio, new Date(fin).toISOString())
    }
  }
  const creaEn = (e: EventoPuntero<HTMLDivElement>, dia: string) => {
    if (e.target !== e.currentTarget || !p.alCrear) return
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top
    const min = Math.floor(((y / ALTO_HORA) * 60) / 30) * 30
    const inicio = instanteLocal(dia, min, p.zona)
    p.alCrear(new Date(inicio).toISOString(), new Date(inicio + 3_600_000).toISOString())
  }

  const plantilla = `56px repeat(${p.dias.length}, minmax(0,1fr))`
  return (
    <>
      <div className="cal-cabecera-dias" style={{ gridTemplateColumns: plantilla }}>
        <div />
        {p.dias.map((d) => (
          <div key={d} className="cal-cabecera-dia" data-hoy={d === p.hoy} data-prueba="cabecera-dia" data-fecha={d}>
            {fechaLarga(d, { weekday: 'short' })}<b>{fechaLarga(d, { day: 'numeric' })}</b>
          </div>
        ))}
      </div>
      <div className="cal-todo-dia" style={{ gridTemplateColumns: plantilla }}>
        <div className="cal-hora" style={{ height: 'auto', transform: 'none', paddingTop: 6 }}>todo el día</div>
        {p.dias.map((d) => (
          <div key={d} style={{ borderLeft: '1px solid var(--cal-borde)' }}>
            {p.instancias.filter((i) => cubreDia(i, d)).map((i) => (
              <span key={i.id} className="cal-chip" data-prueba="evento" data-titulo={i.titulo} role="button" tabIndex={0}
                style={{ ['--cal-color' as string]: colorDe(p.calendarios, i) }} onClick={() => p.alSeleccionar?.(i)}
                onKeyDown={(e) => { if (e.key === 'Enter') p.alSeleccionar?.(i) }}>{i.titulo}</span>
            ))}
          </div>
        ))}
      </div>
      <div className="cal-cuerpo" ref={cuerpo}>
        <div className="cal-rejilla" style={{ gridTemplateColumns: plantilla, height: 24 * ALTO_HORA }}>
          <div className="cal-horas">
            {Array.from({ length: 24 }, (_, h) => <div key={h} className="cal-hora">{h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}</div>)}
          </div>
          {p.dias.map((dia, d) => (
            <Columna key={dia} {...p} dia={dia} indice={d} segs={segs.filter((s) => s.dia === d)} colocacion={colocacion}
              arrastre={arrastre} empieza={empieza} mueve={mueve} termina={termina} creaEn={creaEn} />
          ))}
        </div>
      </div>
    </>
  )
}

interface PropsColumna extends PropsRejilla {
  dia: string
  indice: number
  segs: Segmento[]
  colocacion: Map<string, { columna: number; columnas: number }>
  arrastre: Arrastre | null
  empieza: (e: EventoPuntero<HTMLElement>, s: Segmento, modo: Arrastre['modo']) => void
  mueve: (e: EventoPuntero<HTMLElement>) => void
  termina: (s: Segmento) => void
  creaEn: (e: EventoPuntero<HTMLDivElement>, dia: string) => void
}

function Columna(p: PropsColumna) {
  const l = limitesDelDia(p.dia, p.zona)
  const bloques = (p.actividad ?? []).filter((b) => b.inicioMs < l.hasta && b.finMs > l.desde)
  const ahora = p.ahoraMs !== undefined && p.ahoraMs >= l.desde && p.ahoraMs < l.hasta ? minutosLocales(p.ahoraMs, p.zona) : null
  return (
    <div className="cal-columna" data-hoy={p.dia === p.hoy} data-prueba="columna-dia" data-fecha={p.dia} onPointerDown={(e) => p.creaEn(e, p.dia)}>
      {p.segs.map((s) => {
        const col = p.colocacion.get(s.clave) ?? { columna: 0, columnas: 1 }
        return (
          <div key={s.clave} className="cal-evento" role="button" tabIndex={0} data-prueba="evento" data-titulo={s.inst.titulo}
            data-recurrente={s.inst.recurrente} data-arrastrando={p.arrastre?.clave === s.clave}
            style={estiloEvento(s, col, colorDe(p.calendarios, s.inst), p.arrastre)}
            onPointerDown={(e) => p.empieza(e, s, 'mover')} onPointerMove={p.mueve} onPointerUp={() => p.termina(s)}
            onKeyDown={(e) => { if (e.key === 'Enter') p.alSeleccionar?.(s.inst) }}
            title={`${s.inst.titulo} · ${hora(s.inst.inicioMs, p.zona)}–${hora(s.inst.finMs, p.zona)}`}>
            <strong>{s.inst.titulo}</strong>
            <small>{hora(s.inst.inicioMs, p.zona)}–{hora(s.inst.finMs, p.zona)}</small>
            <div className="cal-tirador" onPointerDown={(e) => p.empieza(e, s, 'estirar')} />
          </div>
        )
      })}
      {bloques.map((b) => {
        const ini = b.inicioMs <= l.desde ? 0 : minutosLocales(b.inicioMs, p.zona)
        const fin = b.finMs >= l.hasta ? 1440 : minutosLocales(b.finMs, p.zona)
        return (
          <div key={`${b.trabajo}-${b.inicioMs}`} className="cal-actividad" data-prueba="actividad" data-grupo={(b.grupo ?? '').toLowerCase()}
            title={`${b.nombre} · ${hora(b.inicioMs, p.zona)}`}
            style={{ top: (ini / 60) * ALTO_HORA, height: Math.max(14, ((fin - ini) / 60) * ALTO_HORA), ...(p.soloActividad ? { left: 2, width: 'auto' } : {}) }}>
            {p.soloActividad ? `${hora(b.inicioMs, p.zona)} ${b.nombre}` : b.nombre}
          </div>
        )
      })}
      {ahora !== null && <div className="cal-ahora" style={{ top: (ahora / 60) * ALTO_HORA }} />}
    </div>
  )
}
