/**
 * Conteo CICLICO por riesgo: pocas ubicaciones al dia, no el inventario entero (como SAP EWM por
 * ubicacion con intervalo por clase, u Odoo con frecuencia por ubicacion), elegidas con una regla
 * DETERMINISTA que se explica. Cada ubicacion suma puntos por:
 *
 * - caducidad cercana: vencido (+4), vence esta semana o esta en rojo (+3), este mes (+1);
 * - diferencias en conteos anteriores: +2 por conteo con diferencia (hasta +6), y +3 si es un
 *   faltante que se repite (el mismo patron que abre incidentes);
 * - volumen, a falta de precio en el sistema de etiquetas: +1 al cuarto de ubicaciones con mas cajas;
 * - dias sin contar: nunca (+2), mas de 30 (+2), mas de 14 (+1).
 *
 * Las razones NO llevan cantidades: las lee el almacenista, que cuenta a ciegas.
 */
import type { EstadoAlmacen, Zona } from './modelo.js'
import { cadenaDe } from './expediente.js'
import { diasParaCaducar } from './fefo.js'
import { faltantesRepetidos } from './conteo.js'
import { categoriaPorId, estadoSemaforo } from './semaforo.js'
import { ubicacionDe, zonaDe } from './ubicaciones.js'

export interface UbicacionElegida {
  readonly ubicacion: string
  readonly zona: Zona
  readonly posicion?: string
  readonly puntaje: number
  readonly razones: readonly string[]
}

interface Candidata { zona: Zona; posicion?: string; minDias: number; rojo: boolean; cajas: number }

function candidatas(estado: EstadoAlmacen, sitio: string, hoy: string): Map<string, Candidata> {
  const m = new Map<string, Candidata>()
  for (const e of estado.existencias) {
    const zona = zonaDe(e)
    if (e.sitio !== sitio || e.cantidad <= 0 || (zona !== 'almacen' && zona !== 'piso')) continue
    const u = ubicacionDe(zona, e.posicion)
    const dias = diasParaCaducar(e.caducidad, hoy)
    const cat = categoriaPorId(estado.configuracion.categorias, estado.articulos[e.sku]?.categoria)
    const x = m.get(u) ?? { zona, ...(e.posicion && zona === 'almacen' ? { posicion: e.posicion } : {}), minDias: Infinity, rojo: false, cajas: 0 }
    x.minDias = Math.min(x.minDias, dias)
    x.rojo ||= estadoSemaforo(dias, cat) === 'retiro'
    x.cajas += e.cantidad
    m.set(u, x)
  }
  return m
}

/** Por ubicacion: en cuantos conteos hubo diferencia y la fecha del ultimo conteo. */
function historial(estado: EstadoAlmacen, sitio: string): Map<string, { conDiferencia: Set<string>; ultimo: string }> {
  const h = new Map<string, { conDiferencia: Set<string>; ultimo: string }>()
  for (const ev of cadenaDe(estado, sitio).filter((x) => x.tipo === 'CONTEO')) {
    const rs = Array.isArray(ev.datos['renglones']) ? (ev.datos['renglones'] as { zona?: string; posicion?: string; diferencia?: number }[]) : []
    for (const r of rs) {
      const u = ubicacionDe((r.zona ?? 'almacen') as Zona, r.posicion)
      const x = h.get(u) ?? { conDiferencia: new Set<string>(), ultimo: '' }
      if ((r.diferencia ?? 0) !== 0) x.conDiferencia.add(String(ev.datos['folio']))
      if (ev.fecha > x.ultimo) x.ultimo = ev.fecha
      h.set(u, x)
    }
  }
  return h
}

function puntua(c: Candidata, h: { conDiferencia: Set<string>; ultimo: string } | undefined, repetido: boolean, voluminosa: boolean, hoy: string): { puntaje: number; razones: string[] } {
  const razones: string[] = []
  let p = 0
  const suma = (n: number, r: string) => { p += n; razones.push(r) }
  if (c.minDias < 0) suma(4, 'hay lotes vencidos')
  else if (c.minDias <= 7 || c.rojo) suma(3, c.rojo ? 'hay lotes en rojo' : 'hay lotes que vencen esta semana')
  else if (c.minDias <= 30) suma(1, 'hay lotes que vencen este mes')
  const dif = h?.conDiferencia.size ?? 0
  if (dif > 0) suma(Math.min(6, 2 * dif), `tuvo diferencia en ${dif === 1 ? 'un conteo anterior' : `${dif} conteos anteriores`}`)
  if (repetido) suma(3, 'un faltante que se repite en esta ubicación')
  if (voluminosa) suma(1, 'de las ubicaciones con más mercancía')
  const dias = h?.ultimo ? Math.floor((Date.parse(hoy) - Date.parse(h.ultimo.slice(0, 10))) / 86_400_000) : undefined
  if (dias === undefined) suma(2, 'nunca se ha contado')
  else if (dias > 30) suma(2, `no se cuenta desde hace ${dias} días`)
  else if (dias > 14) suma(1, `no se cuenta desde hace ${dias} días`)
  return { puntaje: p, razones }
}

/** Las `n` ubicaciones que toca contar hoy, de la de mas riesgo a la de menos, con sus razones. */
export function eligeConteoCiclico(estado: EstadoAlmacen, sitio: string, hoy: string, n = 3): UbicacionElegida[] {
  const cs = candidatas(estado, sitio, hoy)
  const hist = historial(estado, sitio)
  const repetidos = new Set(faltantesRepetidos(estado, sitio).map((f) => f.ubicacion.toUpperCase()))
  const orden = [...cs.values()].map((c) => c.cajas).sort((a, b) => b - a)
  const corte = orden[Math.max(0, Math.ceil(orden.length / 4) - 1)] ?? Infinity
  return [...cs.entries()]
    .map(([u, c]) => {
      const repetido = repetidos.has(`${c.zona} ${c.posicion ?? ''}`.trim().toUpperCase()) || repetidos.has(c.zona.toUpperCase())
      const r = puntua(c, hist.get(u), repetido, cs.size > 1 && c.cajas >= corte, hoy)
      return { ubicacion: u, zona: c.zona, ...(c.posicion ? { posicion: c.posicion } : {}), ...r }
    })
    .filter((x) => x.puntaje > 0)
    .sort((a, b) => b.puntaje - a.puntaje || a.ubicacion.localeCompare(b.ubicacion))
    .slice(0, n)
}
