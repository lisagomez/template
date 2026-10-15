'use client'

/**
 * Editor de evento (crear o cambiar). Para una ocurrencia de una serie pregunta el ALCANCE, como Google.
 * Notificar a invitados es irreversible: hace falta marcar la casilla Y confirmar explicitamente.
 * Para reiniciar el formulario, el consumidor cambia la `key` (el estado inicial sale de las props).
 */
import { useState } from 'react'
import { claveCalendario, puedeEscribir, type Alcance, type Calendario, type EntradaEvento, type Instancia, type Notificar, type RefCalendario } from '../index.js'
import { hora, hoyEn, instanteLocal } from './util.js'
import { EstilosCalendario } from './estilos-componente.js'
import { leeHora, sumaDias, leeFecha, textoFecha } from '../index.js'

export interface GuardadoDelEditor {
  calendario: RefCalendario
  entrada: EntradaEvento
  alcance: Alcance
  notificar: Notificar
  confirmaNotificar: boolean
}

export interface PropsEditor {
  instancia?: Instancia | null
  borrador?: { inicio: string; fin: string } | null
  calendarios: readonly Calendario[]
  zona: string
  error?: string | null
  ocupado?: boolean
  alGuardar: (g: GuardadoDelEditor) => void
  alBorrar?: (alcance: Alcance) => void
  alCerrar: () => void
}

type Repetir = 'no' | 'diaria' | 'laborables' | 'semanal' | 'mensual'
const REGLAS: Record<Exclude<Repetir, 'no'>, string> = {
  diaria: 'RRULE:FREQ=DAILY', laborables: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', semanal: 'RRULE:FREQ=WEEKLY', mensual: 'RRULE:FREQ=MONTHLY',
}
const ALCANCES: Array<[Alcance, string]> = [['este', 'Solo este'], ['siguientes', 'Este y los siguientes'], ['todos', 'Todos los de la serie']]

function inicial(p: PropsEditor) {
  const i = p.instancia
  const inicioMs = i ? i.inicioMs : Date.parse(p.borrador?.inicio ?? new Date().toISOString())
  const finMs = i ? i.finMs : Date.parse(p.borrador?.fin ?? new Date(inicioMs + 3_600_000).toISOString())
  const escribibles = p.calendarios.filter(puedeEscribir)
  return {
    titulo: i?.titulo ?? '', descripcion: i?.descripcion ?? '', lugar: i?.lugar ?? '',
    fecha: i?.todoElDia ? i.inicio : hoyEn(inicioMs, p.zona), horaInicio: hora(inicioMs, p.zona), horaFin: hora(finMs, p.zona),
    todoElDia: i?.todoElDia ?? false,
    calendario: i ? claveCalendario(i) : claveCalendario({ cuenta: escribibles[0]?.cuenta ?? '', calendario: escribibles[0]?.id ?? '' }),
    repetir: 'no' as Repetir, invitados: (i?.invitados ?? []).map((x) => x.correo).join(', '),
    notificar: false, confirmo: false, alcance: 'este' as Alcance,
  }
}

export function EditorDeEvento(p: PropsEditor) {
  const [f, setF] = useState(() => inicial(p))
  const pon = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const i = p.instancia
  const recurrente = Boolean(i?.recurrente)
  const correos = f.invitados.split(/[\s,;]+/).filter(Boolean)
  const escribibles = p.calendarios.filter(puedeEscribir)

  const guarda = () => {
    const cal = escribibles.find((c) => claveCalendario({ cuenta: c.cuenta, calendario: c.id }) === f.calendario) ?? escribibles[0]
    if (!cal) return
    let inicio: string
    let fin: string
    if (f.todoElDia) {
      inicio = f.fecha
      fin = textoFecha(sumaDias(leeFecha(f.fecha), 1))
    } else {
      const a = instanteLocal(f.fecha, leeHora(f.horaInicio), p.zona)
      let b = instanteLocal(f.fecha, leeHora(f.horaFin), p.zona)
      if (b <= a) b += 86_400_000
      inicio = new Date(a).toISOString()
      fin = new Date(b).toISOString()
    }
    const entrada: EntradaEvento = {
      titulo: f.titulo, descripcion: f.descripcion, lugar: f.lugar, inicio, fin, todoElDia: f.todoElDia, zona: p.zona,
      invitados: correos.map((correo) => ({ correo })),
      ...(recurrente ? {} : { recurrencia: f.repetir === 'no' ? null : [REGLAS[f.repetir]] }),
    }
    p.alGuardar({ calendario: { cuenta: cal.cuenta, calendario: cal.id }, entrada, alcance: f.alcance, notificar: f.notificar ? 'todos' : 'nadie', confirmaNotificar: f.confirmo })
  }

  return (
    <div className="cal-velo" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) p.alCerrar() }}>
      <div className="cal-dialogo cal-tema" role="dialog" aria-modal="true" aria-label={i ? 'Editar evento' : 'Nuevo evento'} data-prueba="editor">
        <EstilosCalendario />
        <h3>{i ? 'Editar evento' : 'Nuevo evento'}</h3>
        <label className="cal-campo">Título<input value={f.titulo} onChange={(e) => pon('titulo', e.target.value)} autoFocus data-prueba="editor-titulo" /></label>
        <div className="cal-fila-campos">
          <label className="cal-campo">Fecha<input type="date" value={f.fecha} onChange={(e) => pon('fecha', e.target.value)} data-prueba="editor-fecha" /></label>
          <label className="cal-campo">Empieza<input type="time" step={900} value={f.horaInicio} disabled={f.todoElDia} onChange={(e) => pon('horaInicio', e.target.value)} data-prueba="editor-inicio" /></label>
          <label className="cal-campo">Termina<input type="time" step={900} value={f.horaFin} disabled={f.todoElDia} onChange={(e) => pon('horaFin', e.target.value)} data-prueba="editor-fin" /></label>
        </div>
        <label className="cal-campo" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={f.todoElDia} onChange={(e) => pon('todoElDia', e.target.checked)} /> Todo el día
        </label>
        <div className="cal-fila-campos" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <label className="cal-campo">Calendario
            <select value={f.calendario} disabled={Boolean(i)} onChange={(e) => pon('calendario', e.target.value)}>
              {escribibles.map((c) => <option key={c.id} value={claveCalendario({ cuenta: c.cuenta, calendario: c.id })}>{c.nombre}</option>)}
            </select>
          </label>
          {recurrente ? <div className="cal-campo">Repetición<span style={{ color: 'var(--cal-texto)', paddingTop: 8 }}>Parte de una serie ↻</span></div> : (
            <label className="cal-campo">Se repite
              <select value={f.repetir} onChange={(e) => pon('repetir', e.target.value as Repetir)}>
                <option value="no">No se repite</option><option value="diaria">Cada día</option><option value="laborables">De lunes a viernes</option>
                <option value="semanal">Cada semana</option><option value="mensual">Cada mes</option>
              </select>
            </label>
          )}
        </div>
        <label className="cal-campo">Lugar<input value={f.lugar} onChange={(e) => pon('lugar', e.target.value)} /></label>
        <label className="cal-campo">Descripción<textarea rows={2} value={f.descripcion} onChange={(e) => pon('descripcion', e.target.value)} /></label>
        <label className="cal-campo">Invitados (correos)<input value={f.invitados} onChange={(e) => pon('invitados', e.target.value)} placeholder="nadie" /></label>
        {correos.length > 0 && (
          <div className="cal-aviso" style={{ marginBottom: 10 }}>
            <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={f.notificar} onChange={(e) => pon('notificar', e.target.checked)} /> Avisar por correo a los invitados</label>
            {f.notificar && (
              <label style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input type="checkbox" checked={f.confirmo} onChange={(e) => pon('confirmo', e.target.checked)} data-prueba="confirmo-notificar" />
                Confirmo: esto manda correo a {correos.length} persona(s) y no se puede deshacer.
              </label>
            )}
          </div>
        )}
        {recurrente && (
          <fieldset className="cal-campo" style={{ border: '1px solid var(--cal-borde)', borderRadius: 9, padding: '8px 10px' }} data-prueba="editor-alcance">
            <legend style={{ padding: '0 4px' }}>¿A cuáles aplica?</legend>
            {ALCANCES.map(([v, t]) => (
              <label key={v} style={{ display: 'flex', gap: 8, color: 'var(--cal-texto)' }}>
                <input type="radio" name="alcance" value={v} checked={f.alcance === v} onChange={() => pon('alcance', v)} data-prueba={`alcance-${v}`} /> {t}
              </label>
            ))}
          </fieldset>
        )}
        {p.error && <div className="cal-error" role="alert" data-prueba="editor-error">{p.error}</div>}
        <div className="cal-acciones">
          {i && p.alBorrar && <button type="button" className="cal-boton cal-boton-peligro" style={{ marginRight: 'auto' }} disabled={p.ocupado} onClick={() => p.alBorrar?.(f.alcance)}>Borrar</button>}
          <button type="button" className="cal-boton" onClick={p.alCerrar}>Cancelar</button>
          <button type="button" className="cal-boton cal-boton-primario" disabled={p.ocupado || !f.titulo.trim()} onClick={guarda} data-prueba="editor-guardar">Guardar</button>
        </div>
      </div>
    </div>
  )
}
