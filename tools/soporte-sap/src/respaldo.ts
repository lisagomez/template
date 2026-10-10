/**
 * Respaldo y restauración POR TENANT (una consultora con todos sus clientes). Ni un snapshot ni el
 * respaldo del proveedor sirven para esto: restauran la base entera y regresan en el tiempo a todos.
 * El export lógico por tenant sí: es también la portabilidad que pide ERP-6.
 *
 * La base se INYECTA como una función de consulta (`Consulta`): en el laboratorio, PGlite; en
 * producción, la conexión del job. Las huellas se calculan EN la base (sha256 sobre las filas en JSON
 * canónico de Postgres), así no dependen de cómo serialice el cliente.
 *
 * EXPORTAR lo hace el rol de plataforma con el token de su tarea: lee solo su consultora (C7). El export
 * va FIRMADO (HMAC sobre su JSON canónico, con el secreto del job): quien lo altere no puede recalcular
 * la huella y hacerlo pasar (PRP-010 H-08).
 *
 * RESTAURAR es un job con privilegio de migración (C7, declarado): corre dentro de una transacción, con
 * los disparadores en modo réplica para volver a poner los eventos con su fecha y su cadena originales.
 * Por eso verifica TODO antes de escribir y antes de confirmar (H-08):
 *   1. la firma del export, antes de abrir la transacción;
 *   2. que cada fila sea del tenant que se restaura: con los disparadores apagados, nada más lo ataría;
 *   3. dentro de la transacción, antes del commit: la huella del tenant igual a la del export, y la de
 *      cada otra consultora igual a como estaba. Si algo no cuadra, rollback: no queda nada a medias.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { canonico, type Json } from './cadena.js'

export type Consulta = <T = Record<string, unknown>>(sql: string, parametros?: unknown[]) => Promise<T[]>

/**
 * Tablas del tenant en orden de dependencia (padres primero), la columna que dice de quién son y si esa
 * columna nombra a la consultora o a un CLIENTE suyo (el acceso motivado es del cliente: PRP-010 H-08).
 */
export const TABLAS_DE_TENANT: ReadonlyArray<readonly [tabla: string, columna: string, via?: 'cliente']> = [
  ['ss_incidencia', 'consultora_id'], ['ss_escalamiento', 'consultora_id'], ['ss_evento', 'consultora_id'],
  ['ss_adjunto', 'consultora_id'], ['ss_campo_extraido', 'consultora_id'], ['ss_cuarentena', 'consultora_id'],
  ['ss_impugnacion', 'consultora_id'], ['ss_sla_resultado', 'consultora_id'], ['ss_horas', 'consultora_id'],
  ['ss_crudo', 'consultora_id'], ['ss_importacion_fila', 'consultora_id'], ['ss_mapeo', 'consultora_id'], ['ss_procedencia', 'consultora_id'],
  ['ss_contrato_sla', 'consultora_id'], ['ss_consentimiento_nucleo', 'consultora_id'], ['ss_presupuesto', 'consultora_id'], ['ss_caso_sandbox', 'origen_consultora_id'],
  ['ss_propuesta', 'consultora_id'], ['ss_acceso_motivado', 'cliente_id', 'cliente'],
]

/**
 * La sala del N1–N2 de la consultora (su tenant ES la consultora): las aprobaciones son la prueba de quién
 * decidió, y el contrato del producto las pone en el export por tenant. Van si la sala vive en la misma base.
 */
export const TABLAS_DE_LA_SALA: ReadonlyArray<readonly [tabla: string, columna: string]> = [
  ['sala_participante', 'tenant_id'], ['sala_canales', 'tenant_id'], ['sala_miembros', 'tenant_id'], ['sala_mensajes', 'tenant_id'],
  ['sala_reacciones', 'tenant_id'], ['sala_lecturas', 'tenant_id'], ['sala_aprobaciones', 'tenant_id'],
]

type Tabla = readonly [tabla: string, columna: string, via?: 'cliente']

export interface HuellaTenant {
  readonly conteos: Readonly<Record<string, number>>
  readonly huellas: Readonly<Record<string, string>>
  /** Huella del conjunto: cambia si cambia cualquier fila de cualquier tabla del tenant. */
  readonly total: string
}

export interface ExportTenant {
  readonly version: 1
  readonly consultora: string
  readonly exportado: string
  readonly tablas: Readonly<Record<string, unknown[]>>
  readonly huella: HuellaTenant
  /** Los objetos de Storage del tenant: sus BYTES van por su propia línea de respaldo (`pg_dump` no los incluye). */
  readonly objetos: ReadonlyArray<{ readonly bucket: string; readonly nombre: string }>
  /** HMAC-SHA256 (hex) del JSON canónico de todo lo de arriba, con el secreto del job. */
  readonly firma: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const exigeUuid = (c: string): string => {
  if (!UUID.test(c)) throw new Error('la consultora de un respaldo es un uuid')
  return c
}
const exigeSecreto = (s: string): string => {
  if (s.length < 32) throw new Error('el secreto de los respaldos debe tener al menos 32 caracteres')
  return s
}

/** La condición SQL que dice qué filas de una tabla son del tenant ($1 = la consultora). */
const condicion = ([, col, via]: Tabla): string =>
  via === 'cliente' ? `t.${col} in (select o.id from public.ss_organizacion o where o.padre_id = $1)` : `t.${col} = $1`

/** Las tablas que el respaldo cubre en ESTA base: las del producto y, si está, la sala. */
export async function tablasDelRespaldo(q: Consulta): Promise<readonly Tabla[]> {
  const [r] = await q<{ sala: boolean }>(`select to_regclass('public.sala_mensajes') is not null as sala`)
  return r?.sala ? [...TABLAS_DE_TENANT, ...TABLAS_DE_LA_SALA] : TABLAS_DE_TENANT
}

/** Conteos y huellas por tabla del tenant, calculados en la base. */
export async function huellaTenant(q: Consulta, consultora: string): Promise<HuellaTenant> {
  const c = exigeUuid(consultora)
  const conteos: Record<string, number> = {}
  const huellas: Record<string, string> = {}
  for (const tabla of await tablasDelRespaldo(q)) {
    const [r] = await q<{ n: number; h: string }>(
      `select count(*)::int as n, encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text, '|' order by to_jsonb(t)::text), ''), 'UTF8')), 'hex') as h
         from public.${tabla[0]} t where ${condicion(tabla)}`, [c])
    conteos[tabla[0]] = r?.n ?? 0
    huellas[tabla[0]] = r?.h ?? ''
  }
  const [t] = await q<{ h: string }>(`select encode(sha256(convert_to($1, 'UTF8')), 'hex') as h`, [JSON.stringify(huellas)])
  return { conteos, huellas, total: t?.h ?? '' }
}

const firmaDe = (secreto: string, e: Omit<ExportTenant, 'firma'>): string =>
  createHmac('sha256', secreto).update(canonico(e as unknown as Json)).digest('hex')

/** Export lógico de un tenant, FIRMADO: sus filas, su huella y el manifiesto de sus objetos. */
export async function exportaTenant(q: Consulta, consultora: string, ahora: string, secreto: string): Promise<ExportTenant> {
  const c = exigeUuid(consultora)
  const tablas: Record<string, unknown[]> = {}
  for (const tabla of await tablasDelRespaldo(q)) {
    const [r] = await q<{ filas: unknown[] }>(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]'::jsonb) as filas from public.${tabla[0]} t where ${condicion(tabla)}`, [c])
    tablas[tabla[0]] = r?.filas ?? []
  }
  const objetos = await q<{ bucket: string; nombre: string }>(
    `select bucket_id as bucket, name as nombre from storage.objects where split_part(name, '/', 1) = $1 order by 1, 2`, [c])
  const sinFirma = { version: 1 as const, consultora: c, exportado: ahora, tablas, huella: await huellaTenant(q, c), objetos }
  return { ...sinFirma, firma: firmaDe(exigeSecreto(secreto), sinFirma) }
}

/** ¿Lo firmó el job con este secreto, y nadie lo tocó después? */
export function exportIntegro(e: ExportTenant, secreto: string): boolean {
  const { firma, ...resto } = e
  if (typeof firma !== 'string' || !/^[0-9a-f]{64}$/.test(firma)) return false
  return timingSafeEqual(Buffer.from(firmaDe(exigeSecreto(secreto), resto), 'hex'), Buffer.from(firma, 'hex'))
}

/** Las filas del export que NO son del tenant (con los disparadores apagados, nada más las ataría). */
async function filasAjenas(q: Consulta, e: ExportTenant, tablas: readonly Tabla[]): Promise<string[]> {
  const clientes = new Set((await q<{ id: string }>(`select id from public.ss_organizacion where padre_id = $1`, [e.consultora])).map((r) => r.id))
  const ajenas: string[] = []
  for (const [tabla, col, via] of tablas) {
    for (const fila of (e.tablas[tabla] ?? []) as Array<Record<string, unknown>>) {
      const dueno = String(fila[col] ?? '')
      if (via === 'cliente' ? !clientes.has(dueno) : dueno !== e.consultora) ajenas.push(`${tabla}: ${col} = ${dueno}`)
    }
  }
  for (const tabla of Object.keys(e.tablas)) if (!tablas.some(([t]) => t === tabla)) ajenas.push(`${tabla}: no es una tabla del respaldo`)
  return ajenas
}

/**
 * Restaura UN tenant desde su export. Verifica antes de escribir (firma y tenant de cada fila) y antes de
 * confirmar (huellas del tenant y de los demás); si algo no cuadra, rollback. No toca a nadie más.
 */
export async function restauraTenant(q: Consulta, e: ExportTenant, secreto: string): Promise<{ borradas: number; insertadas: number }> {
  const c = exigeUuid(e.consultora)
  if (e.version !== 1) throw new Error(`versión de export desconocida: ${String(e.version)}`)
  if (!exportIntegro(e, secreto)) throw new Error('el export no lo firmó este job, o lo cambiaron después: no se restaura')
  const tablas = await tablasDelRespaldo(q)
  const ajenas = await filasAjenas(q, e, tablas)
  if (ajenas.length) throw new Error(`el export trae filas que no son de la consultora ${c}: ${ajenas.slice(0, 3).join('; ')}`)
  const otras = (await q<{ id: string }>(`select id from public.ss_organizacion where tipo = 'consultora' and id <> $1 order by id`, [c])).map((r) => r.id)
  let borradas = 0, insertadas = 0
  await q('begin')
  try {
    const otrasAntes = await Promise.all(otras.map(async (o) => [o, (await huellaTenant(q, o)).total] as const))
    await q(`set local session_replication_role = replica`)
    for (const tabla of [...tablas].reverse()) {
      const r = await q<{ n: number }>(`with b as (delete from public.${tabla[0]} t where ${condicion(tabla)} returning 1) select count(*)::int as n from b`, [c])
      borradas += r[0]?.n ?? 0
    }
    for (const [tabla] of tablas) {
      const filas = e.tablas[tabla] ?? []
      if (!filas.length) continue
      await q(`insert into public.${tabla} select * from jsonb_populate_recordset(null::public.${tabla}, $1::jsonb)`, [JSON.stringify(filas)])
      insertadas += filas.length
    }
    // Antes del commit: el tenant quedó como su export y los demás como estaban.
    const despues = await huellaTenant(q, c)
    if (despues.total !== e.huella.total) throw new Error('tras restaurar, la huella del tenant no es la del export: rollback')
    for (const [o, total] of otrasAntes) {
      if ((await huellaTenant(q, o)).total !== total) throw new Error(`restaurar tocó a la consultora ${o}: rollback`)
    }
    await q('commit')
  } catch (err) {
    await q('rollback')
    throw err
  }
  return { borradas, insertadas }
}

export interface VerificacionRestauracion {
  readonly tenantIgual: boolean
  readonly otrosIguales: boolean
  readonly diferencias: readonly string[]
}

/** Después de restaurar (para el informe): el tenant quedó como su export y los demás como estaban antes. */
export function verificaRestauracion(e: ExportTenant, despues: HuellaTenant, otrosAntes: Readonly<Record<string, HuellaTenant>>, otrosDespues: Readonly<Record<string, HuellaTenant>>): VerificacionRestauracion {
  const diferencias: string[] = []
  for (const tabla of Object.keys(e.huella.conteos)) {
    if (e.huella.conteos[tabla] !== despues.conteos[tabla]) diferencias.push(`${tabla}: ${despues.conteos[tabla]} filas, el export tenía ${e.huella.conteos[tabla]}`)
    else if (e.huella.huellas[tabla] !== despues.huellas[tabla]) diferencias.push(`${tabla}: misma cuenta, otra huella`)
  }
  const otros = Object.keys(otrosAntes).filter((k) => otrosAntes[k]!.total !== otrosDespues[k]?.total)
  for (const k of otros) diferencias.push(`el tenant ${k} cambió al restaurar a otro`)
  return { tenantIgual: diferencias.length === otros.length, otrosIguales: otros.length === 0, diferencias }
}
