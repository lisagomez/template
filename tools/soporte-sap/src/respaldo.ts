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

const firmaDe = (secreto: string, e: object): string =>
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

/** El export de UN cliente (D8, PRP-012): el que se va se lleva lo suyo. No se restaura: es portabilidad. */
export interface ExportCliente {
  readonly version: 1
  readonly consultora: string
  readonly cliente: string
  readonly exportado: string
  readonly tablas: Readonly<Record<string, unknown[]>>
  /** Sus originales: los descarga en la gracia, con el acceso que ya tiene. */
  readonly objetos: ReadonlyArray<{ readonly bucket: string; readonly nombre: string }>
  readonly firma: string
}

/** Export lógico de un cliente, FIRMADO: las filas de las tablas del tenant que son suyas, y el manifiesto de sus originales. */
export async function exportaCliente(q: Consulta, consultora: string, cliente: string, ahora: string, secreto: string): Promise<ExportCliente> {
  const c = exigeUuid(consultora), cl = exigeUuid(cliente)
  const conCliente = new Set((await q<{ t: string }>(
    `select table_name as t from information_schema.columns where table_schema = 'public' and column_name = 'cliente_id'`)).map((r) => r.t))
  const tablas: Record<string, unknown[]> = {}
  for (const [t, col, via] of TABLAS_DE_TENANT.filter(([t]) => conCliente.has(t))) {
    const donde = via === 'cliente' ? `ss_priv.padre_de(t.${col}) = $1 and t.${col} = $2` : `t.${col} = $1 and t.cliente_id = $2`
    const [r] = await q<{ filas: unknown[] }>(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]'::jsonb) as filas from public.${t} t where ${donde}`, [c, cl])
    tablas[t] = r?.filas ?? []
  }
  const objetos = await q<{ bucket: string; nombre: string }>(
    `select bucket_id as bucket, name as nombre from storage.objects where bucket_id = 'ss-originales' and name like $1 order by 1, 2`, [`${c}/${cl}/%`])
  const sinFirma = { version: 1 as const, consultora: c, cliente: cl, exportado: ahora, tablas, objetos }
  return { ...sinFirma, firma: firmaDe(exigeSecreto(secreto), sinFirma) }
}

/**
 * La LISTA DE BAJAS (D8): qué tenants se fueron y qué originales se borraron. Sin datos personales en claro:
 * identificadores, fechas y huellas. Viaja APARTE a todos los niveles de respaldo y, tras restaurar cualquier cosa, se
 * aplica la más reciente: si viviera solo en la base, restaurar una base vieja la haría volver atrás.
 */
export interface ListaDeBajas {
  readonly version: 1
  readonly generada: string
  readonly bajas: ReadonlyArray<{
    readonly consultora: string; readonly cliente: string | null; readonly registradaPor: string; readonly registradaEn: string
    readonly borrarDesde: string | null; readonly exportSha256: string | null; readonly borradaEn: string | null
  }>
  readonly originales: ReadonlyArray<{ readonly ruta: string; readonly borradoEn: string }>
}
export const LISTA_VACIA: ListaDeBajas = { version: 1, generada: '1970-01-01T00:00:00Z', bajas: [], originales: [] }
const ISO = (c: string) => `to_char(${c} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`

/** La lista de bajas de toda la base. La genera el job de respaldo, con su privilegio (lee a todas las consultoras). */
export async function listaDeBajas(q: Consulta, ahora: string): Promise<ListaDeBajas> {
  const bajas = await q<ListaDeBajas['bajas'][number]>(`select consultora_id as consultora, cliente_id as cliente, registrada_por as "registradaPor",
      ${ISO('registrada_en')} as "registradaEn", ${ISO('borrar_desde')} as "borrarDesde", export_sha256 as "exportSha256", ${ISO('borrada_en')} as "borradaEn"
    from public.ss_baja order by registrada_en, consultora_id, cliente_id`)
  const originales = await q<ListaDeBajas['originales'][number]>(
    `select ruta, ${ISO('original_borrado_en')} as "borradoEn" from public.ss_adjunto where original_borrado_en is not null order by ruta`)
  return { version: 1, generada: ahora, bajas, originales }
}

/** Lo que se queda tras la baja (D8): el sandbox anonimizado y lo enseñado. Todo lo demás del tenant se va. */
export const QUEDAN_TRAS_LA_BAJA: readonly string[] = ['ss_caso_sandbox', 'ss_propuesta']

/**
 * Aplica la lista a las FILAS de una consultora, en modo réplica (sin disparadores ni cascadas: borra tabla por tabla):
 * lo de un tenant cuya baja se cumplió se borra, y un original borrado queda marcado. Los bytes son del `Almacen`.
 */
export async function podaConLista(q: Consulta, lista: ListaDeBajas, consultora: string): Promise<{ filas: number; originales: number }> {
  const c = exigeUuid(consultora)
  let filas = 0, originales = 0
  for (const b of lista.bajas.filter((x) => x.consultora === c && x.borradaEn !== null)) {
    for (const [t, col, via] of TABLAS_DE_TENANT.filter(([t]) => !QUEDAN_TRAS_LA_BAJA.includes(t))) {
      if (b.cliente === null) {
        const donde = via === 'cliente' ? `ss_priv.padre_de(t.${col}) = $1` : `t.${col} = $1`
        filas += (await q<{ n: number }>(`with b as (delete from public.${t} t where ${donde} returning 1) select count(*)::int as n from b`, [c]))[0]?.n ?? 0
      } else {
        const tieneCliente = (await q<{ si: boolean }>(`select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = 'cliente_id') as si`, [t]))[0]?.si
        if (!tieneCliente) continue
        const donde = via === 'cliente' ? `ss_priv.padre_de(t.${col}) = $1 and t.${col} = $2` : `t.${col} = $1 and t.cliente_id = $2`
        filas += (await q<{ n: number }>(`with b as (delete from public.${t} t where ${donde} returning 1) select count(*)::int as n from b`, [c, exigeUuid(b.cliente)]))[0]?.n ?? 0
      }
    }
  }
  for (const o of lista.originales.filter((x) => x.ruta.startsWith(`${c}/`))) {
    originales += (await q<{ n: number }>(`with m as (update public.ss_adjunto set original_borrado_en = $2 where ruta = $1 and original_borrado_en is null returning 1)
      select count(*)::int as n from m`, [o.ruta, o.borradoEn]))[0]?.n ?? 0
  }
  return { filas, originales }
}

/** ¿Lo firmó el job con este secreto, y nadie lo tocó después? */
export function exportIntegro(e: ExportTenant | ExportCliente, secreto: string): boolean {
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
 *
 * La LISTA DE BAJAS es obligatoria (D8): un export viejo trae lo que después se dio de baja o se borró por retención.
 * Se aplica después de verificar que el export entró entero y antes del commit: lo dado de baja no resucita.
 */
export async function restauraTenant(q: Consulta, e: ExportTenant, secreto: string, lista: ListaDeBajas): Promise<{ borradas: number; insertadas: number; podadas: number }> {
  const c = exigeUuid(e.consultora)
  if (e.version !== 1) throw new Error(`versión de export desconocida: ${String(e.version)}`)
  if (!exportIntegro(e, secreto)) throw new Error('el export no lo firmó este job, o lo cambiaron después: no se restaura')
  const tablas = await tablasDelRespaldo(q)
  const ajenas = await filasAjenas(q, e, tablas)
  if (ajenas.length) throw new Error(`el export trae filas que no son de la consultora ${c}: ${ajenas.slice(0, 3).join('; ')}`)
  const otras = (await q<{ id: string }>(`select id from public.ss_organizacion where tipo = 'consultora' and id <> $1 order by id`, [c])).map((r) => r.id)
  if (lista?.version !== 1) throw new Error('sin la lista de bajas no se restaura: lo dado de baja resucitaría (D8)')
  let borradas = 0, insertadas = 0, podadas = 0
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
    const poda = await podaConLista(q, lista, c)
    podadas = poda.filas + poda.originales
    await q('commit')
  } catch (err) {
    await q('rollback')
    throw err
  }
  return { borradas, insertadas, podadas }
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
