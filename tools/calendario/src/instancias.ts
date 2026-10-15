/**
 * Del espejo (eventos sueltos, series y excepciones) a lo que se pinta en una ventana: las ocurrencias
 * de cada serie, sustituidas por su excepcion cuando la hay, y sin las canceladas. Es lo que Google
 * hace con `singleEvents=true`, pero aqui: el espejo guarda la serie UNA vez y funciona sin red.
 */
import { esTextoFecha, inicioDelDia, leeFecha, ordinalFecha, sumaDias, textoFecha, DIA } from './tiempo.js'
import { expande, parseaRecurrencia } from './recurrencia.js'
import type { Evento, Instancia, Ventana } from './tipos.js'

/** Id de instancia al estilo de Google: `<serie>_20261021T150000Z` o `<serie>_20261021`. */
export function idInstancia(serie: string, inicioOriginal: string): string {
  const marca = esTextoFecha(inicioOriginal)
    ? inicioOriginal.replace(/-/g, '')
    : new Date(inicioOriginal).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return `${serie}_${marca}`
}

/** Limites en ms de un evento; los de todo el dia se anclan a la medianoche de `zonaVista`. */
export function limites(e: Pick<Evento, 'inicio' | 'fin' | 'todoElDia'>, zonaVista: string): { inicioMs: number; finMs: number } {
  if (!e.todoElDia) return { inicioMs: Date.parse(e.inicio), finMs: Date.parse(e.fin) }
  return { inicioMs: inicioDelDia(leeFecha(e.inicio), zonaVista), finMs: inicioDelDia(leeFecha(e.fin), zonaVista) }
}

const comoInstancia = (e: Evento, zonaVista: string, recurrente: boolean): Instancia => ({ ...e, recurrente, ...limites(e, zonaVista) })

/** La ocurrencia `inicioOriginal` de una serie, como evento (con la duracion de la serie). */
export function ocurrenciaDe(serie: Evento, inicioOriginal: string): Evento {
  const base = { ...serie, id: idInstancia(serie.id, inicioOriginal), serie: serie.id, inicioOriginal, recurrencia: null }
  if (serie.todoElDia) {
    const dias = ordinalFecha(leeFecha(serie.fin)) - ordinalFecha(leeFecha(serie.inicio))
    return { ...base, inicio: inicioOriginal, fin: textoFecha(sumaDias(leeFecha(inicioOriginal), dias)) }
  }
  const duracion = Date.parse(serie.fin) - Date.parse(serie.inicio)
  return { ...base, inicio: new Date(Date.parse(inicioOriginal)).toISOString(), fin: new Date(Date.parse(inicioOriginal) + duracion).toISOString() }
}

function ocurrenciasDeSerie(serie: Evento, excepciones: Map<string, Evento>, v: Ventana, zonaVista: string): Instancia[] {
  const rec = parseaRecurrencia(serie.recurrencia ?? [], serie.zona)
  const base = limites(serie, serie.zona)
  const duracion = base.finMs - base.inicioMs
  // Margen de un dia: una excepcion movida hacia la ventana desde fuera se sigue encontrando.
  const ocurrencias = expande(rec, { inicio: serie.inicio, todoElDia: serie.todoElDia, zona: serie.zona }, duracion, v.desde - DIA, v.hasta + DIA)
  const fuera: Instancia[] = []
  for (const o of ocurrencias) {
    const excepcion = excepciones.get(o.clave)
    if (excepcion) {
      excepciones.delete(o.clave)
      if (excepcion.estado !== 'cancelado') fuera.push(comoInstancia(excepcion, zonaVista, true))
      continue
    }
    fuera.push(comoInstancia(ocurrenciaDe(serie, o.clave), zonaVista, true))
  }
  // Excepciones movidas a la ventana cuya ocurrencia original quedo fuera del margen.
  for (const excepcion of excepciones.values()) {
    if (excepcion.estado !== 'cancelado') fuera.push(comoInstancia(excepcion, zonaVista, true))
  }
  return fuera
}

/** Instancias que se solapan con la ventana, ordenadas por inicio. */
export function expandeVentana(eventos: readonly Evento[], v: Ventana, zonaVista: string): Instancia[] {
  const series = new Map<string, Evento>()
  const excepcionesPorSerie = new Map<string, Map<string, Evento>>()
  const sueltos: Evento[] = []
  for (const e of eventos) {
    if (e.recurrencia && !e.serie) series.set(e.id, e)
    else if (e.serie && e.inicioOriginal) {
      const mapa = excepcionesPorSerie.get(e.serie) ?? new Map<string, Evento>()
      mapa.set(e.inicioOriginal, e)
      excepcionesPorSerie.set(e.serie, mapa)
    } else sueltos.push(e)
  }
  const todas: Instancia[] = []
  for (const e of sueltos) if (e.estado !== 'cancelado') todas.push(comoInstancia(e, zonaVista, false))
  for (const [id, serie] of series) {
    if (serie.estado === 'cancelado') continue
    todas.push(...ocurrenciasDeSerie(serie, excepcionesPorSerie.get(id) ?? new Map(), v, zonaVista))
    excepcionesPorSerie.delete(id)
  }
  // Excepciones huerfanas (la serie no llego al espejo): se pintan solas antes que perderlas.
  for (const mapa of excepcionesPorSerie.values()) {
    for (const e of mapa.values()) if (e.estado !== 'cancelado') todas.push(comoInstancia(e, zonaVista, true))
  }
  return todas
    .filter((i) => i.inicioMs < v.hasta && Math.max(i.finMs, i.inicioMs + 1) > v.desde)
    .sort((a, b) => a.inicioMs - b.inicioMs || a.titulo.localeCompare(b.titulo))
}
