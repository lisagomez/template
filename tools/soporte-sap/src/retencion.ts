/**
 * D8 (PRP-012): el job de retención y salida, y lo que se hace tras restaurar. La base decide qué se puede borrar; este
 * job lo encuentra y lo dice (`planDeRetencion`, el dry-run) y, solo si se le pide, lo hace (`ejecutaRetencion`). Corre
 * con el rol de plataforma y el token de su consultora (C7): la base no le deja borrar nada que no haya vencido.
 *
 * Los bytes van por el `Almacen`, que se INYECTA: en producción, la API de Storage (borrar la fila de `storage.objects`
 * no borra el archivo); en el laboratorio, la tabla.
 *
 * Tras restaurar CUALQUIER cosa (la base entera, un tenant o los bytes), `trasRestaurar` aplica la lista de bajas más
 * reciente: vuelve a poner las bajas, borra lo de los tenants que se fueron y los originales que vencieron.
 */
import { createHash } from 'node:crypto'
import { exportaCliente, exportaTenant, podaConLista, TABLAS_DE_TENANT, type Consulta, type ListaDeBajas } from './respaldo.js'
import { estadoDeBaja, type EstadoBaja } from './vencimiento.js'

export interface Almacen {
  sube(bucket: string, ruta: string, contenido: string): Promise<void>
  borra(bucket: string, ruta: string): Promise<void>
  lista(bucket: string, prefijo: string): Promise<readonly string[]>
}

export interface BajaEnPlan {
  readonly id: string; readonly consultora: string; readonly cliente: string | null
  readonly estado: EstadoBaja; readonly borrarDesde: string | null
}
export interface PlanDeRetencion {
  readonly consultora: string
  /** Originales vencidos (D8, DP-3), fuera de los tenants congelados: esos se van con su baja. */
  readonly originales: ReadonlyArray<{ readonly adjunto: string; readonly ruta: string }>
  readonly bajas: readonly BajaEnPlan[]
  /** Lo que el job no hace, y por qué: un contrato sin plazo no borra nada (DP-4). */
  readonly avisos: readonly string[]
}

/** El dry-run: qué vence y qué baja está en qué punto. No escribe nada. */
export async function planDeRetencion(q: Consulta, consultora: string): Promise<PlanDeRetencion> {
  const originales = await q<{ adjunto: string; ruta: string }>(`select a.id as adjunto, a.ruta from public.ss_adjunto a
    where a.consultora_id = $1 and ss_priv.original_vencido(a.id) and not ss_priv.en_baja(a.consultora_id, a.cliente_id) order by a.ruta`, [consultora])
  const filas = await q<{ id: string; consultora_id: string; cliente_id: string | null; borrar_desde: string | null; export_sha256: string | null; borrada_en: string | null; vencio: boolean }>(
    `select id, consultora_id, cliente_id, borrar_desde::text, export_sha256, borrada_en::text, coalesce(borrar_desde <= now(), false) as vencio
       from public.ss_baja where consultora_id = $1 order by registrada_en`, [consultora])
  const bajas = filas.map((b) => ({ id: b.id, consultora: b.consultora_id, cliente: b.cliente_id, borrarDesde: b.borrar_desde,
    estado: estadoDeBaja({ exportSha256: b.export_sha256, borrarDesde: b.borrar_desde, borradaEn: b.borrada_en, vencio: b.vencio }) }))
  const sinN = await q<{ cliente: string }>(`select distinct k.cliente_id as cliente from public.ss_contrato_sla k
    where k.consultora_id = $1 and k.cliente_id is not null and ss_priv.dias_del_contrato($1, k.cliente_id, 'retencionOriginalesDias') is null`, [consultora])
  const avisos = [
    ...sinN.map((r) => `el contrato vigente del cliente ${r.cliente} no declara cuántos días viven sus originales: no vencen (DP-4)`),
    ...bajas.filter((b) => b.estado === 'sin_plazo').map((b) => `la baja ${b.id} no tiene gracia en su contrato: no se borra nada (DP-4)`),
  ]
  return { consultora, originales, bajas, avisos }
}

export interface ResultadoRetencion { readonly originales: number; readonly exportes: number; readonly bajasCumplidas: number }

/** Ejecuta un plan: borra los bytes de lo vencido y lo marca, genera el export de quien se va y cumple lo que venció. */
export async function ejecutaRetencion(q: Consulta, almacen: Almacen, plan: PlanDeRetencion, ahora: string, secreto: string): Promise<ResultadoRetencion> {
  let originales = 0, exportes = 0, bajasCumplidas = 0
  for (const o of plan.originales) {
    await almacen.borra('ss-originales', o.ruta)
    await q(`update public.ss_adjunto set original_borrado_en = now() where id = $1`, [o.adjunto])
    originales++
  }
  for (const b of plan.bajas.filter((x) => x.estado === 'sin_export')) { await preparaSalida(q, almacen, b, ahora, secreto); exportes++ }
  for (const b of plan.bajas.filter((x) => x.estado === 'lista')) {
    await borraTenant(q, almacen, b)
    await q(`update public.ss_baja set borrada_en = now() where id = $1`, [b.id])
    bajasCumplidas++
  }
  return { originales, exportes, bajasCumplidas }
}

/** El export de quien se va: el del cliente, o el de la consultora entera. Se guarda en su carpeta y se registra su huella. */
async function preparaSalida(q: Consulta, almacen: Almacen, b: BajaEnPlan, ahora: string, secreto: string): Promise<void> {
  const e = b.cliente ? await exportaCliente(q, b.consultora, b.cliente, ahora, secreto) : await exportaTenant(q, b.consultora, ahora, secreto)
  const contenido = JSON.stringify(e)
  const sha = createHash('sha256').update(contenido).digest('hex')
  await almacen.sube('ss-exportes', `${b.cliente ? `${b.consultora}/${b.cliente}` : b.consultora}/${ahora.slice(0, 10)}-${sha}.json`, contenido)
  await q(`update public.ss_baja set export_sha256 = $2 where id = $1`, [b.id, sha])
}

/**
 * Borra lo de un tenant cuya baja venció, con la plataforma y sus políticas: los bytes (originales y exportes) y las
 * filas, hijas primero; la incidencia arrastra su cadena. Lo que se queda (sandbox y lo enseñado) no se toca.
 */
async function borraTenant(q: Consulta, almacen: Almacen, b: BajaEnPlan): Promise<void> {
  const prefijo = b.cliente ? `${b.consultora}/${b.cliente}/` : `${b.consultora}/`
  for (const bucket of ['ss-originales', 'ss-exportes']) for (const ruta of await almacen.lista(bucket, prefijo)) await almacen.borra(bucket, ruta)
  const delCliente = b.cliente
    ? [['ss_horas', 'consultora_id = $1 and cliente_id = $2'], ['ss_importacion_fila', 'consultora_id = $1 and cliente_id = $2'],
       ['ss_acceso_motivado', 'ss_priv.padre_de(cliente_id) = $1 and cliente_id = $2'], ['ss_consentimiento_nucleo', 'consultora_id = $1 and cliente_id = $2'],
       ['ss_incidencia', 'consultora_id = $1 and cliente_id = $2'], ['ss_contrato_sla', 'consultora_id = $1 and cliente_id = $2']]
    : [['ss_horas', 'consultora_id = $1'], ['ss_importacion_fila', 'consultora_id = $1'], ['ss_acceso_motivado', 'ss_priv.padre_de(cliente_id) = $1'],
       ['ss_consentimiento_nucleo', 'consultora_id = $1'], ['ss_incidencia', 'consultora_id = $1'], ['ss_contrato_sla', 'consultora_id = $1'],
       ['ss_mapeo', 'consultora_id = $1'], ['ss_procedencia', 'consultora_id = $1'], ['ss_presupuesto', 'consultora_id = $1'], ['ss_crudo', 'consultora_id = $1']]
  for (const [tabla, donde] of delCliente) {
    if (!TABLAS_DE_TENANT.some(([t]) => t === tabla)) throw new Error(`${tabla} no es una tabla del tenant`)
    await q(`delete from public.${tabla} where ${donde}`, b.cliente ? [b.consultora, b.cliente] : [b.consultora])
  }
}

/**
 * Tras restaurar, con privilegio de migración (C7, declarado, como `restauraTenant`): la lista más reciente vuelve a
 * poner las bajas que falten (sin retroceder ninguna), borra las filas y los bytes de los tenants que se fueron y los
 * originales borrados, y verifica que no quede nada de ellos antes del commit.
 */
export async function trasRestaurar(q: Consulta, almacen: Almacen, lista: ListaDeBajas): Promise<{ filas: number; objetos: number }> {
  if (lista?.version !== 1) throw new Error('una lista de bajas desconocida: no se aplica')
  let filas = 0, objetos = 0
  await q('begin')
  try {
    await q(`set local session_replication_role = replica`)
    for (const b of lista.bajas) {
      await q(`insert into public.ss_baja (consultora_id, cliente_id, registrada_por, registrada_en, borrar_desde, export_sha256, borrada_en)
          values ($1, $2, $3, $4, $5, $6, $7)
        on conflict (consultora_id, cliente_id) do update set export_sha256 = coalesce(ss_baja.export_sha256, excluded.export_sha256),
          borrada_en = coalesce(ss_baja.borrada_en, excluded.borrada_en)`,
      [b.consultora, b.cliente, b.registradaPor, b.registradaEn, b.borrarDesde, b.exportSha256, b.borradaEn])
    }
    for (const consultora of new Set([...lista.bajas.map((b) => b.consultora), ...lista.originales.map((o) => o.ruta.split('/')[0]!)])) {
      const r = await podaConLista(q, lista, consultora)
      filas += r.filas + r.originales
    }
    for (const b of lista.bajas.filter((x) => x.borradaEn !== null)) {
      const prefijo = b.cliente ? `${b.consultora}/${b.cliente}/` : `${b.consultora}/`
      for (const bucket of ['ss-originales', 'ss-exportes']) for (const ruta of await almacen.lista(bucket, prefijo)) { await almacen.borra(bucket, ruta); objetos++ }
      const [queda] = await q<{ si: boolean }>(`select ss_priv.quedan_datos_de($1, $2) as si`, [b.consultora, b.cliente])
      if (queda?.si) throw new Error(`tras aplicar la lista quedan datos de ${b.cliente ?? b.consultora}: rollback`)
    }
    for (const o of lista.originales) if ((await almacen.lista('ss-originales', o.ruta)).includes(o.ruta)) { await almacen.borra('ss-originales', o.ruta); objetos++ }
    await q('commit')
  } catch (err) {
    await q('rollback')
    throw err
  }
  return { filas, objetos }
}
