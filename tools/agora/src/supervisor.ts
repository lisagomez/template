/**
 * El supervisor de reglas y el supervisor financiero: DETERMINISTAS, sin modelo. Validan una propuesta contra el
 * estado real de la base y dicen qué regla falló. Nunca aprueban ni ejecutan: lo que no pasa no llega al hilo, y lo
 * que pasa todavía necesita a la persona que dice la matriz. La base vuelve a comprobar lo que le toca (montos,
 * firmas, periodos); el supervisor dice POR QUÉ antes de que alguien pierda el tiempo.
 */
import type { Sesion } from './base/tipos.js'
import { CAMPOS_DE, REVERSIBLES_A2, arma, type Payload } from './propuesta.js'

export interface Regla { regla: string; ok: boolean; detalle: string }
export interface Veredicto { ok: boolean; reglas: Regla[]; motivo: string | null }

const esFecha = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(`${x}T12:00:00Z`))
const diaSemana = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`)).getUTCDay()
const habil = (d: string) => ![0, 6].includes(diaSemana(d))
const mes = (d: string) => d.slice(0, 7)

/** Lo que no debe viajar en una propuesta: datos personales que no hacen falta para planear. */
const SENSIBLE = [
  { nombre: 'CURP', re: /\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/ },
  { nombre: 'correo', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { nombre: 'teléfono', re: /(?<!\d)(?:\+?52[\s-]?)?(?:\d[\s-]?){10}(?!\d)/ },
  { nombre: 'tarjeta', re: /\b(?:\d[ -]?){15,16}\b/ },
]

export interface ContextoSupervisor {
  /** Quién propone: un agente (con su origen y techo) o una persona. */
  autor: { tipo: 'agente'; origen: 'interno' | 'externo'; autonomia: string } | { tipo: 'persona' }
  nivel?: 'A0' | 'A1' | 'A2' | 'A3'
}

export async function supervisa(s: Sesion, p: Payload, c: ContextoSupervisor): Promise<Veredicto> {
  const reglas: Regla[] = []
  const r = (regla: string, ok: boolean, detalle: string) => reglas.push({ regla, ok, detalle })
  try { arma(p); r('forma', true, 'el payload tiene la forma de su clase') } catch (e) { r('forma', false, (e as Error).message.split('\n')[0]!) }
  const cambios = p.cambios ?? []
  const nuevos = p.nuevos ?? []
  const permitidos = CAMPOS_DE[p.clase]
  if (permitidos) {
    const fuera = cambios.filter((x) => !permitidos.includes(x.campo))
    r('campos de la clase', fuera.length === 0, fuera.length ? `«${p.clase}» no toca ${fuera.map((x) => x.campo).join(', ')}` : `solo ${permitidos.join(', ')}`)
  }
  if (c.nivel === 'A2' || c.nivel === 'A3') {
    const noReversibles = cambios.filter((x) => !(REVERSIBLES_A2 as readonly string[]).includes(x.campo))
    r('A2 solo lo reversible', p.clase === 'editar' && noReversibles.length === 0 && nuevos.length === 0,
      noReversibles.length ? `A2 no aplica ${noReversibles.map((x) => x.campo).join(', ')}: va por aprobación` : 'reversible, sin dinero ni terceros')
    if (c.autor.tipo === 'agente' && c.autor.origen === 'externo') r('techo del externo', false, 'un externo propone y espera (A1)')
  }
  if (c.autor.tipo === 'agente' && c.autor.origen === 'externo' && ['asignar_externo', 'tope_gasto', 'tope_cuota', 'presupuesto'].includes(p.clase)) {
    r('lo que un externo no propone', false, `un agente externo no propone «${p.clase}»`)
  }
  // Fechas: coherentes, en día hábil y no antes de sus predecesores.
  const ids = [...new Set(cambios.map((x) => x.item))]
  const items = ids.length ? await s.consulta<{ id: string; inicio: string | null; fin: string | null; nombre: string }>(
    `select id, inicio::text, fin::text, nombre from agora.item where id = any ($1::uuid[])`, [ids]) : []
  const porId = new Map(items.map((i) => [i.id, i]))
  r('los ítems existen y se ven', items.length === ids.length, items.length === ids.length ? `${ids.length} ítem(s)` : 'un ítem de la propuesta no existe para quien propone')
  const fechas = new Map<string, { inicio: string | null; fin: string | null }>(items.map((i) => [i.id, { inicio: i.inicio, fin: i.fin }]))
  for (const x of cambios.filter((y) => y.campo === 'inicio' || y.campo === 'fin')) {
    const f = fechas.get(x.item)
    if (f) f[x.campo as 'inicio' | 'fin'] = x.despues as string | null
  }
  for (const n of nuevos) fechas.set(n.clave, { inicio: n.inicio ?? null, fin: n.fin ?? null })
  const malas: string[] = []
  for (const [id, f] of fechas) {
    const nombre = porId.get(id)?.nombre ?? id
    if ((f.inicio && !esFecha(f.inicio)) || (f.fin && !esFecha(f.fin))) malas.push(`${nombre}: fecha inválida`)
    else if (f.inicio && f.fin && f.inicio > f.fin) malas.push(`${nombre}: el inicio es después del fin`)
    else if (f.fin && !habil(f.fin) && (cambios.some((x) => x.item === id && x.campo === 'fin') || nuevos.some((n) => n.clave === id))) malas.push(`${nombre}: la fecha cae en fin de semana`)
  }
  r('fechas coherentes y en día hábil', malas.length === 0, malas.length ? malas.join('; ') : 'inicio ≤ fin, en día hábil')
  if (ids.length) {
    const preds = await s.consulta<{ item: string; pred: string; fin: string | null; nombre: string }>(
      `select d.item_id item, d.depende_de pred, p.fin::text fin, p.nombre from agora.dependencia d join agora.item p on p.id = d.depende_de where d.item_id = any ($1::uuid[])`, [ids])
    const antes = preds.filter((d) => { const f = fechas.get(d.item); return f?.inicio && d.fin && f.inicio < d.fin && cambios.some((x) => x.item === d.item && x.campo === 'inicio') })
    r('no antes de sus predecesores', antes.length === 0, antes.length ? antes.map((d) => `empieza antes de que termine «${d.nombre}»`).join('; ') : 'respeta sus dependencias')
  }
  // Dependencias de lo nuevo: sin ciclos.
  if (nuevos.length) {
    const grafo = new Map(nuevos.map((n) => [n.clave, n.depende_de ?? []]))
    const visita = (k: string, camino: Set<string>): boolean => {
      if (camino.has(k)) return true
      camino.add(k)
      const ciclo = (grafo.get(k) ?? []).some((d) => grafo.has(d) && visita(d, new Set(camino)))
      return ciclo
    }
    const ciclo = [...grafo.keys()].some((k) => visita(k, new Set()))
    r('dependencias sin ciclos', !ciclo, ciclo ? 'las dependencias de lo nuevo cierran un ciclo' : 'sin ciclos')
  }
  // Datos sensibles: lo que se planea no necesita CURP, correos ni teléfonos.
  const texto = JSON.stringify(p)
  const hallados = SENSIBLE.filter((x) => x.re.test(texto)).map((x) => x.nombre)
  r('sin datos sensibles', hallados.length === 0, hallados.length ? `trae ${hallados.join(', ')}: no hace falta para planear` : 'nada personal')
  // El supervisor financiero: el monto contra el presupuesto de la categoría del mes en que se ejercerá.
  const montos = [
    ...cambios.filter((x) => x.campo === 'monto_mxn').map((x) => ({ item: x.item, monto: Number(x.despues ?? 0), antes: Number(x.antes ?? 0) })),
    ...nuevos.filter((n) => n.monto_mxn).map((n) => ({ item: null as string | null, monto: n.monto_mxn!, antes: 0, fin: n.fin })),
  ]
  for (const m of montos) {
    const fin = m.item ? (fechas.get(m.item)?.fin ?? null) : ('fin' in m ? (m.fin ?? null) : null)
    const periodo = fin ? mes(fin) : (await s.consulta<{ p: string }>(`select to_char(now() at time zone 'America/Mexico_City', 'YYYY-MM') p`))[0]!.p
    const [d] = await s.consulta<{ disponible: string | null; presupuesto: string | null; vigente_item: string | null }>(
      `select v.disponible_mxn::text disponible, v.presupuesto_mxn::text presupuesto,
              (select sum(k.vigente_mxn)::text from agora.v_compromiso_saldo k where k.item_id = $3 and k.estado = 'vigente' and k.periodo = $2) vigente_item
         from agora.v_centro_periodo v where v.categoria_id = $1 and v.periodo = $2`, [p.categoria, periodo, m.item])
    const disponible = Number(d?.disponible ?? 0) + Number(d?.vigente_item ?? 0) // lo que el ítem ya tenía comprometido se libera al cambiarlo
    const cabe = d?.presupuesto !== undefined && d.presupuesto !== null && m.monto <= disponible
    r('cabe en el presupuesto de la categoría', cabe, cabe ? `${m.monto.toLocaleString('es-MX')} MXN ≤ disponible ${disponible.toLocaleString('es-MX')} MXN en ${periodo}`
      : d?.presupuesto == null ? `no hay presupuesto de la categoría en ${periodo}: primero se aprueba uno` : `${m.monto.toLocaleString('es-MX')} MXN pasa el disponible (${disponible.toLocaleString('es-MX')} MXN) de ${periodo}: primero se amplía el presupuesto`)
  }
  const fallas = reglas.filter((x) => !x.ok)
  return { ok: fallas.length === 0, reglas, motivo: fallas.length ? fallas.map((x) => `${x.regla}: ${x.detalle}`).join(' · ') : null }
}
