/**
 * El vigía: un trabajo programado SIN modelo (reglas). Sigue el ciclo de cada fecha (calendariza con clave por
 * versión, programa recordatorios a 3 días, 1 día y al vencer, pregunta en el hilo si no hay avance, propone
 * reprogramar lo atrasado), vigila los topes (aviso al 80 %), el calendario de cierre (avisa a Finanzas del mes
 * vencido abierto) y las tarjetas de los socios: si la huella cambió, o la Puerta vio la deriva, SUSPENDE.
 *
 * Todo lo que escribe es idempotente por clave: correrlo dos veces no duplica un evento, un recordatorio ni un aviso.
 * El calendario y la descarga de tarjetas se INYECTAN (en el laboratorio, el simulador de tools/calendario y las
 * tarjetas del socio simulado): el núcleo no importa otra herramienta.
 */
import { como } from './base/como.js'
import type { Base, Sesion } from './base/tipos.js'
import { huellaDeTarjeta } from './llaves.js'
import { propone } from './propuesta.js'
import { firmaTarea } from './tarea.js'
import { sumaDias, siguienteHabil } from './fechas.js'

export interface PuertoCalendario { crea(e: { clave: string; titulo: string; dia: string }): Promise<{ ref: string }> }
export type DescargaTarjeta = (url: string) => Promise<Record<string, unknown> | null>

export interface InformeVigia {
  eventos: { nuevos: number; ya: number }
  recordatorios: number
  avisos: number
  propuestas: number
  suspendidos: Array<{ agente: string; motivo: string }>
}

export interface OpcionesVigia { base: Base; secreto: string; org: string; calendario: PuertoCalendario; descarga: DescargaTarjeta; hoy?: string }

export async function correVigia(o: OpcionesVigia): Promise<InformeVigia> {
  const [v] = await o.base.consulta<{ id: string }>(`select id from agora.agente where org_id = $1 and rol = 'vigia' and origen = 'interno' and estado = 'aprobado' limit 1`, [o.org])
  if (!v) throw new Error('no hay vigía vivo en la organización')
  const comoVigia = <T>(fn: (s: Sesion) => Promise<T>) => como(o.base, { tipo: 'agente', token: firmaTarea(o.secreto, { org: o.org, agente: v.id }) }, fn)
  const hoy = o.hoy ?? (await o.base.consulta<{ h: string }>(`select (now() at time zone 'America/Mexico_City')::date::text h`))[0]!.h
  const informe: InformeVigia = { eventos: { nuevos: 0, ya: 0 }, recordatorios: 0, avisos: 0, propuestas: 0, suspendidos: [] }
  const items = await comoVigia((s) => s.consulta<{ id: string; nombre: string; categoria_id: string; inicio: string | null; fin: string; version_fecha: number; progreso: number; estado: string }>(
    `select id, nombre, categoria_id, inicio::text, fin::text, version_fecha, progreso, estado from agora.item where fin is not null and estado <> 'done' and fin between $1::date - 30 and $1::date + 45 order by fin`, [hoy]))
  const avisa = async (clave: string, tipo: string, rol: string | null, nodo: string | null, item: string | null, agente: string | null, texto: string, hilo = false) => {
    const [r] = await comoVigia((s) => s.consulta<{ ok: boolean }>('select agora.vigia_aviso($1, $2, $3, $4, $5, $6, $7, $8, $9) ok', [o.org, clave, tipo, rol, nodo, item, agente, texto, hilo]))
    if (r!.ok) informe.avisos++
  }
  for (const i of items) {
    // 1. Calendariza: la clave lleva la versión de la fecha. Si ya existe, no se vuelve a crear (ni aquí ni en el calendario).
    const clave = `item:${i.id}:fecha:v${i.version_fecha}`
    const [ya] = await comoVigia((s) => s.consulta<{ n: string }>('select count(*) n from agora.item_evento where clave = $1', [clave]))
    if (Number(ya!.n) > 0) informe.eventos.ya++
    else {
      const ev = await o.calendario.crea({ clave, titulo: `Vence: ${i.nombre}`, dia: i.fin })
      const [r] = await comoVigia((s) => s.consulta<{ r: { nuevo: boolean } }>('select agora.vigia_evento($1, $2, $3) r', [i.id, i.version_fecha, ev.ref]))
      if (r!.r.nuevo) informe.eventos.nuevos++
      else informe.eventos.ya++
    }
    // 2. Recordatorios a 3 días, 1 día y al vencer (9:00, hora del centro de México).
    for (const [tipo, d] of [['fecha_3d', -3], ['fecha_1d', -1], ['vence', 0]] as const) {
      const dia = sumaDias(i.fin, d)
      if (dia < hoy) continue
      const [r] = await comoVigia((s) => s.consulta<{ ok: boolean }>(`select agora.vigia_recordatorio($1, $2, ($3::date + time '09:00') at time zone 'America/Mexico_City', $4) ok`,
        [i.id, tipo, dia, `item:${i.id}:v${i.version_fecha}:${tipo}`]))
      if (r!.ok) informe.recordatorios++
    }
    // 3. A tres días: aviso. 4. Mañana y sin avance: pregunta en el hilo. 5. Atrasado: aviso y propuesta de reprogramar.
    const faltan = Math.round((Date.UTC(+i.fin.slice(0, 4), +i.fin.slice(5, 7) - 1, +i.fin.slice(8, 10)) - Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10))) / 864e5)
    if (faltan >= 0 && faltan <= 3) await avisa(`fecha_3d:${i.id}:v${i.version_fecha}`, 'fecha_3d', null, i.categoria_id, i.id, null, `Faltan ${faltan} día(s) para «${i.nombre}» (${i.fin}) y va al ${i.progreso} %.`)
    if (faltan === 1 && i.progreso < 80) await avisa(`sin_avance:${i.id}:v${i.version_fecha}`, 'sin_avance', null, i.categoria_id, i.id, null, `Mañana vence «${i.nombre}» y va al ${i.progreso} %. ¿Lo reprogramamos o se cierra a tiempo?`, true)
    if (faltan < 0) {
      await avisa(`atrasado:${i.id}:v${i.version_fecha}`, 'atrasado', null, i.categoria_id, i.id, null, `«${i.nombre}» venció el ${i.fin} y no está listo: propongo reprogramarlo.`, true)
      const nueva = siguienteHabil(sumaDias(hoy, 5))
      const p = await comoVigia(async (s) => {
        const [prev] = await s.consulta<{ id: string }>('select id from agora.propuesta where clave = $1', [`vigia:atrasado:${i.id}:v${i.version_fecha}`])
        if (prev) return null
        return propone(s, { org: o.org, autorAgente: v.id, clave: `vigia:atrasado:${i.id}:v${i.version_fecha}`, resumen: `Reprogramar «${i.nombre}» (atrasado) al ${nueva}`,
          payload: { version: 1, clase: 'reprogramar', categoria: i.categoria_id, cambios: [{ item: i.id, campo: 'fin', antes: i.fin, despues: nueva }] } }).catch(() => null)
      })
      if (p) informe.propuestas++
    }
  }
  // 6. Topes al 80 %: la misma clave que pone la base al escribir (un aviso por tope y por ventana).
  const agentes = await comoVigia((s) => s.consulta<{ id: string; nombre: string; origen: string; estado: string; card_url: string | null; card_sha256: string | null }>(
    `select id, nombre, origen, estado, card_url, card_sha256 from agora.agente where org_id = $1`, [o.org]))
  const [per] = await o.base.consulta<{ p: string; h: string }>(`select to_char(now() at time zone 'America/Mexico_City', 'YYYY-MM') p, to_char(now() at time zone 'America/Mexico_City', 'YYYY-MM-DD"h"HH24') h`)
  for (const a of agentes.filter((x) => ['aprobado', 'prueba'].includes(x.estado))) {
    const [t] = await comoVigia((s) => s.consulta<{ t: { gasto: { uso: string; tope: string } } | null }>('select agora.topes_de($1) t', [a.id]))
    const g = t?.t?.gasto
    if (g && Number(g.tope) > 0 && Number(g.uso) >= 0.8 * Number(g.tope)) {
      const nivel = Number(g.uso) >= Number(g.tope) ? 'tope_100' : 'tope_80'
      const texto = `${a.nombre} lleva ${Number(g.uso).toFixed(2)} de ${Number(g.tope).toFixed(2)} MXN de modelo este mes (${Math.round((100 * Number(g.uso)) / Number(g.tope))} %).`
      await avisa(`${nivel}:${a.id}:gasto:${per!.p}`, nivel, 'propietario', null, null, a.id, texto)
      await avisa(`${nivel}:${a.id}:gasto:${per!.p}:finanzas`, nivel, 'finanzas', null, null, a.id, texto)
    }
  }
  // 7. Las tarjetas de los socios: se descargan y se comparan con la huella FIJADA; la deriva suspende.
  for (const a of agentes.filter((x) => x.origen === 'externo' && ['aprobado', 'prueba'].includes(x.estado))) {
    const derivaEnPuerta = await comoVigia((s) => s.consulta<{ motivo: string; n: string }>(
      `select motivo, count(*) n from agora.a2a_llamada where agente_id = $1 and resultado = 'rechazada' and motivo in ('deriva de la tarjeta', 'firma inválida') and cuando > now() - interval '1 hour' group by motivo`, [a.id]))
    let motivo: 'deriva_tarjeta' | 'firma_invalida' | null = null
    if (derivaEnPuerta.some((x) => x.motivo === 'deriva de la tarjeta')) motivo = 'deriva_tarjeta'
    else if (derivaEnPuerta.some((x) => x.motivo === 'firma inválida' && Number(x.n) >= 3)) motivo = 'firma_invalida'
    else if (a.card_url) {
      const tarjeta = await o.descarga(a.card_url).catch(() => null)
      if (tarjeta && huellaDeTarjeta(tarjeta) !== a.card_sha256) motivo = 'deriva_tarjeta'
    }
    if (motivo) {
      await comoVigia((s) => s.consulta('select agora.suspende_por_vigia($1, $2)', [a.id, motivo]))
      informe.suspendidos.push({ agente: a.nombre, motivo })
    }
  }
  // 8. El calendario de cierre: un mes vencido y abierto avisa a Finanzas (uno por periodo).
  const abiertos = await comoVigia((s) => s.consulta<{ p: string }>('select p from agora.vigia_periodos_abiertos() p'))
  for (const x of abiertos) await avisa(`cierre:${x.p}`, 'cierre_proximo', 'finanzas', null, null, null, `El periodo ${x.p} terminó y sigue abierto: Finanzas cierra sus costos (por el freno) y deja la póliza para Contabilidad.`)
  return informe
}
