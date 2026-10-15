'use client'

/** Vista de mes, vista de agenda (lista), indicador de salud del espejo y selector de huecos. */
import type { Calendario, Hueco, Instancia, ResultadoHuecos, Salud } from '../index.js'
import { colorDe, cubreDia, fechaLarga, hora, limitesDelDia } from './util.js'
import { huecoEnZona } from '../index.js'
import { EstilosCalendario } from './estilos-componente.js'

interface PropsDias {
  dias: string[]
  zona: string
  instancias: readonly Instancia[]
  calendarios: readonly Calendario[]
  hoy?: string
  mesActual?: number
  alSeleccionar?: (i: Instancia) => void
  alElegirDia?: (dia: string) => void
}

const delDia = (instancias: readonly Instancia[], dia: string, zona: string): Instancia[] => {
  const l = limitesDelDia(dia, zona)
  return instancias.filter((i) => (i.todoElDia ? cubreDia(i, dia) : i.inicioMs < l.hasta && i.finMs > l.desde))
}

export function Mes(p: PropsDias) {
  return (
    <div className="cal-mes" data-prueba="vista-mes">
      {p.dias.slice(0, 7).map((d) => <div key={`c${d}`} className="cal-cabecera-dia">{fechaLarga(d, { weekday: 'short' })}</div>)}
      {p.dias.map((d) => {
        const xs = delDia(p.instancias, d, p.zona)
        return (
          <div key={d} className="cal-mes-dia" data-hoy={d === p.hoy} data-fuera={p.mesActual !== undefined && Number(d.slice(5, 7)) !== p.mesActual}>
            <button type="button" className="cal-mes-num cal-boton" style={{ border: 0, padding: '1px 6px' }} onClick={() => p.alElegirDia?.(d)}>{Number(d.slice(8))}</button>
            {xs.slice(0, 3).map((i) => (
              <span key={i.id} className="cal-chip" role="button" tabIndex={0} data-prueba="evento" data-titulo={i.titulo}
                style={{ ['--cal-color' as string]: colorDe(p.calendarios, i) }} onClick={() => p.alSeleccionar?.(i)}>
                {i.todoElDia ? '' : `${hora(i.inicioMs, p.zona)} `}{i.titulo}
              </span>
            ))}
            {xs.length > 3 && <small style={{ marginLeft: 6, color: 'var(--cal-tenue)' }}>+{xs.length - 3} más</small>}
          </div>
        )
      })}
    </div>
  )
}

export function Lista(p: PropsDias) {
  const conEventos = p.dias.map((d) => [d, delDia(p.instancias, d, p.zona)] as const).filter(([, xs]) => xs.length)
  return (
    <div className="cal-lista" data-prueba="vista-agenda">
      {conEventos.length === 0 && <p style={{ color: 'var(--cal-tenue)' }}>Nada agendado en estos días.</p>}
      {conEventos.map(([d, xs]) => (
        <section key={d}>
          <h4>{fechaLarga(d, { weekday: 'long', day: 'numeric', month: 'long' })}{d === p.hoy ? ' · hoy' : ''}</h4>
          {xs.map((i) => (
            <div key={i.id} className="cal-fila" role="button" tabIndex={0} data-prueba="evento" data-titulo={i.titulo} onClick={() => p.alSeleccionar?.(i)}
              style={{ ['--cal-color' as string]: colorDe(p.calendarios, i) }}>
              <span className="cal-punto" />
              <span style={{ width: 104, color: 'var(--cal-tenue)', fontVariantNumeric: 'tabular-nums' }}>{i.todoElDia ? 'todo el día' : `${hora(i.inicioMs, p.zona)}–${hora(i.finMs, p.zona)}`}</span>
              <span style={{ fontWeight: 550 }}>{i.titulo}{i.recurrente ? ' ↻' : ''}</span>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

function edad(ms: number | null): string {
  if (ms === null) return 'nunca'
  if (ms < 60_000) return 'hace un momento'
  if (ms < 3_600_000) return `hace ${Math.round(ms / 60_000)} min`
  if (ms < 86_400_000) return `hace ${Math.round(ms / 3_600_000)} h`
  return `hace ${Math.round(ms / 86_400_000)} d`
}

export function IndicadorDeSalud({ salud }: { salud: Salud }) {
  const texto = salud.estado === 'fresco'
    ? `Espejo al día · ${edad(salud.edadMs)}`
    : salud.estado === 'rancio'
      ? `Espejo rancio · ${edad(salud.edadMs)}`
      : salud.escritura === 'bloqueada' ? 'Credencial caducada · se lee del espejo, no se escribe' : `Error de sincronización · ${salud.causa}`
  return (
    <span className="cal-tema cal-salud" data-estado={salud.estado} data-prueba="salud" title={[salud.causa, salud.destraba].filter(Boolean).join(' — ')}>
      {texto}{salud.reparacionesPendientes ? ` · ${salud.reparacionesPendientes} por asentar` : ''}
    </span>
  )
}

export interface PropsHuecos {
  resultado: ResultadoHuecos | null
  /** Zona de QUIEN RESERVA: los huecos se le dicen en su hora. */
  zonaPersona: string
  elegido?: string | null
  alElegir?: (h: Hueco) => void
  maximoPorDia?: number
}

export function SelectorDeHuecos(p: PropsHuecos) {
  if (!p.resultado) return null
  if (p.resultado.tipo === 'sin-hueco') {
    return <div className="cal-tema cal-aviso" data-prueba="sin-hueco" data-motivo={p.resultado.motivo}><EstilosCalendario />Sin hueco ({p.resultado.motivo}): {p.resultado.detalle}</div>
  }
  const porDia = new Map<string, Hueco[]>()
  for (const h of p.resultado.huecos) {
    const d = new Intl.DateTimeFormat('es-MX', { timeZone: p.zonaPersona, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(h.inicioMs))
    porDia.set(d, [...(porDia.get(d) ?? []), h])
  }
  return (
    <div className="cal-tema cal-huecos" data-prueba="huecos">
      <EstilosCalendario />
      {[...porDia].map(([d, hs]) => (
        <div key={d} className="cal-huecos-dia">
          <span>{d}</span>
          {hs.slice(0, p.maximoPorDia ?? 8).map((h) => (
            <button key={h.inicio} type="button" className="cal-boton cal-hueco" aria-pressed={p.elegido === h.inicio} data-prueba="hueco" data-inicio={h.inicio}
              title={huecoEnZona(h, p.zonaPersona)} onClick={() => p.alElegir?.(h)}>
              {hora(h.inicioMs, p.zonaPersona)}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
