/**
 * Respaldo y restauración POR TENANT (una consultora con todos sus clientes). Ni un snapshot ni el
 * respaldo del proveedor sirven para esto: restauran la base entera y regresan en el tiempo a todos.
 * El export lógico por tenant sí: es también la portabilidad que pide ERP-6.
 *
 * La base se INYECTA como una función de consulta (`Consulta`): en el laboratorio, PGlite; en
 * producción, la conexión del job de plataforma. Las huellas se calculan EN la base (sha256 sobre
 * las filas en JSON canónico de Postgres), así no dependen de cómo serialice el cliente.
 *
 * Restaurar es un job de plataforma con privilegio de migración (C7, declarado): corre dentro de
 * una transacción, con los disparadores en modo réplica para poder volver a poner los eventos con
 * su fecha original, y SOLO sobre las filas del tenant que se restaura. Después se verifica: conteos
 * y huellas del tenant iguales al export, y los de los demás iguales a como estaban.
 */

export type Consulta = <T = Record<string, unknown>>(sql: string, parametros?: unknown[]) => Promise<T[]>

/** Tablas del tenant en orden de dependencia (padres primero) y la columna que dice de quién son. */
export const TABLAS_DE_TENANT: ReadonlyArray<readonly [tabla: string, columna: string]> = [
  ['ss_incidencia', 'consultora_id'], ['ss_escalamiento', 'consultora_id'], ['ss_evento', 'consultora_id'],
  ['ss_adjunto', 'consultora_id'], ['ss_campo_extraido', 'consultora_id'], ['ss_cuarentena', 'consultora_id'],
  ['ss_impugnacion', 'consultora_id'], ['ss_sla_resultado', 'consultora_id'], ['ss_horas', 'consultora_id'],
  ['ss_crudo', 'consultora_id'], ['ss_importacion_fila', 'consultora_id'], ['ss_mapeo', 'consultora_id'], ['ss_procedencia', 'consultora_id'],
  ['ss_contrato_sla', 'consultora_id'], ['ss_presupuesto', 'consultora_id'], ['ss_caso_sandbox', 'origen_consultora_id'],
  ['ss_propuesta', 'consultora_id'],
]

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
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const exigeUuid = (c: string): string => {
  if (!UUID.test(c)) throw new Error('la consultora de un respaldo es un uuid')
  return c
}

/** Conteos y huellas por tabla del tenant, calculados en la base. */
export async function huellaTenant(q: Consulta, consultora: string): Promise<HuellaTenant> {
  const c = exigeUuid(consultora)
  const conteos: Record<string, number> = {}
  const huellas: Record<string, string> = {}
  for (const [tabla, col] of TABLAS_DE_TENANT) {
    const [r] = await q<{ n: number; h: string }>(
      `select count(*)::int as n, encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text, '|' order by to_jsonb(t)::text), ''), 'UTF8')), 'hex') as h
         from public.${tabla} t where t.${col} = $1`, [c])
    conteos[tabla] = r?.n ?? 0
    huellas[tabla] = r?.h ?? ''
  }
  const [t] = await q<{ h: string }>(`select encode(sha256(convert_to($1, 'UTF8')), 'hex') as h`, [JSON.stringify(huellas)])
  return { conteos, huellas, total: t?.h ?? '' }
}

/** Export lógico de un tenant: sus filas, su huella y el manifiesto de sus objetos. */
export async function exportaTenant(q: Consulta, consultora: string, ahora: string): Promise<ExportTenant> {
  const c = exigeUuid(consultora)
  const tablas: Record<string, unknown[]> = {}
  for (const [tabla, col] of TABLAS_DE_TENANT) {
    const [r] = await q<{ filas: unknown[] }>(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]'::jsonb) as filas from public.${tabla} t where t.${col} = $1`, [c])
    tablas[tabla] = r?.filas ?? []
  }
  const objetos = await q<{ bucket: string; nombre: string }>(
    `select bucket_id as bucket, name as nombre from storage.objects where split_part(name, '/', 1) = $1 order by 1, 2`, [c])
  return { version: 1, consultora: c, exportado: ahora, tablas, huella: await huellaTenant(q, c), objetos }
}

/**
 * Restaura UN tenant desde su export. Transacción única: si algo falla, no queda a medias. Borra
 * las filas del tenant (hijas primero) y las vuelve a poner (padres primero). No toca a nadie más.
 */
export async function restauraTenant(q: Consulta, e: ExportTenant): Promise<{ borradas: number; insertadas: number }> {
  const c = exigeUuid(e.consultora)
  let borradas = 0, insertadas = 0
  await q('begin')
  try {
    await q(`set local session_replication_role = replica`)
    for (const [tabla, col] of [...TABLAS_DE_TENANT].reverse()) {
      const r = await q<{ n: number }>(`with b as (delete from public.${tabla} t where t.${col} = $1 returning 1) select count(*)::int as n from b`, [c])
      borradas += r[0]?.n ?? 0
    }
    for (const [tabla] of TABLAS_DE_TENANT) {
      const filas = e.tablas[tabla] ?? []
      if (!filas.length) continue
      await q(`insert into public.${tabla} select * from jsonb_populate_recordset(null::public.${tabla}, $1::jsonb)`, [JSON.stringify(filas)])
      insertadas += filas.length
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

/** Después de restaurar: el tenant quedó como su export y los demás como estaban antes. */
export function verificaRestauracion(e: ExportTenant, despues: HuellaTenant, otrosAntes: Readonly<Record<string, HuellaTenant>>, otrosDespues: Readonly<Record<string, HuellaTenant>>): VerificacionRestauracion {
  const diferencias: string[] = []
  for (const [tabla] of TABLAS_DE_TENANT) {
    if (e.huella.conteos[tabla] !== despues.conteos[tabla]) diferencias.push(`${tabla}: ${despues.conteos[tabla]} filas, el export tenía ${e.huella.conteos[tabla]}`)
    else if (e.huella.huellas[tabla] !== despues.huellas[tabla]) diferencias.push(`${tabla}: misma cuenta, otra huella`)
  }
  const otros = Object.keys(otrosAntes).filter((k) => otrosAntes[k]!.total !== otrosDespues[k]?.total)
  for (const k of otros) diferencias.push(`el tenant ${k} cambió al restaurar a otro`)
  return { tenantIgual: diferencias.length === otros.length, otrosIguales: otros.length === 0, diferencias }
}
