/**
 * Simulacro de restauración POR TENANT, cronometrado para consultoras S, M y L, en efímero (PGlite).
 * Para cada tamaño: carga sintética de 12 meses para la consultora A (el tamaño) y una vecina B →
 * export de A → daño sembrado en A → restauración solo de A → conteos y huellas de A iguales al
 * export y de B iguales a como estaban. Los tiempos son DE LABORATORIO (PGlite en proceso, una
 * máquina de desarrollo): no son el RTO de producción, que sigue «desconocido» hasta GATE 3.
 *
 * Uso: node tools/soporte-sap/evidencia/respaldo.ts   · Exit 1 si una restauración no cuadra.
 */
import { exportaTenant, huellaTenant, restauraTenant, verificaRestauracion, type Consulta } from '../dist/index.js'
import { baseSoporte, ORG } from '../pruebas/_base.ts'

/** Incidencias por mes de una consultora según su tamaño (SUPUESTO del laboratorio, D11). */
const TAMANOS = { S: 24, M: 64, L: 218 } as const

async function carga(db: Awaited<ReturnType<typeof baseSoporte>>, consultora: string, cliente: string, porMes: number): Promise<void> {
  const n = porMes * 12
  await db.exec(`begin; set local session_replication_role = replica;
    insert into ss_incidencia (id, consultora_id, cliente_id, titulo, descripcion, prioridad, estado, creada_en)
      select gen_random_uuid(), '${consultora}', '${cliente}', 'Incidencia sintética ' || g, repeat('texto de la incidencia ', 12), (array['P1','P2','P3','P4'])[1 + g % 4], 'cerrada', now() - (g || ' hours')::interval
      from generate_series(1, ${n}) g;
    insert into ss_evento (incidencia_id, consultora_id, cliente_id, seq, tipo, actor, fecha, anterior, hash)
      select i.id, i.consultora_id, i.cliente_id, s, (array['RECIBIDA','CATEGORIZADA','PRIMERA_RESPUESTA','RESUELTA','CERRADA','NOTA'])[s], 'agente:soporte-sap-a2a', i.creada_en + (s || ' minutes')::interval, md5(i.id::text || (s - 1)), md5(i.id::text || s)
      from ss_incidencia i, generate_series(1, 6) s where i.consultora_id = '${consultora}' and i.titulo like 'Incidencia sintética%';
    insert into ss_adjunto (incidencia_id, consultora_id, cliente_id, sha256, ruta, tipo_mime, bytes, via)
      select i.id, i.consultora_id, i.cliente_id, encode(sha256(i.id::text::bytea), 'hex'), i.consultora_id || '/' || i.cliente_id || '/' || i.id || '/' || encode(sha256(i.id::text::bytea), 'hex'), 'image/png', 180000, 'ocr_local'
      from ss_incidencia i where i.consultora_id = '${consultora}' and i.titulo like 'Incidencia sintética%';
    insert into ss_horas (consultora_id, cliente_id, incidencia_id, consultor, minutos, fecha)
      select i.consultora_id, i.cliente_id, i.id, 'usr-000000000abc', 30 + (random() * 300)::int, current_date
      from ss_incidencia i where i.consultora_id = '${consultora}' and i.titulo like 'Incidencia sintética%';
    commit;`)
}

const ms = (t0: number) => `${(performance.now() - t0).toFixed(0)} ms`

let malo = false
console.log('| Tamaño | Incidencias de A | Filas de A | Export | Daño | Restauración | Verificación | A = export | B intacta |\n|---|---|---|---|---|---|---|---|---|')
for (const [tamano, porMes] of Object.entries(TAMANOS)) {
  const db = await baseSoporte()
  const q: Consulta = async <T>(sql: string, p?: unknown[]) => (await db.query<T>(sql, p)).rows
  await carga(db, ORG.CA, ORG.A1, porMes)
  await carga(db, ORG.CB, ORG.B1, TAMANOS.S)
  const bAntes = await huellaTenant(q, ORG.CB)
  let t = performance.now()
  const e = await exportaTenant(q, ORG.CA, new Date().toISOString())
  const tExport = ms(t)
  t = performance.now()
  await db.exec(`begin; set local session_replication_role = replica; delete from ss_evento where consultora_id = '${ORG.CA}'; delete from ss_horas where consultora_id = '${ORG.CA}'; commit;`)
  const tDano = ms(t)
  t = performance.now()
  await restauraTenant(q, e)
  const tRestaura = ms(t)
  t = performance.now()
  const v = verificaRestauracion(e, await huellaTenant(q, ORG.CA), { [ORG.CB]: bAntes }, { [ORG.CB]: await huellaTenant(q, ORG.CB) })
  const tVerifica = ms(t)
  const filas = Object.values(e.huella.conteos).reduce((s, x) => s + x, 0)
  if (!v.tenantIgual || !v.otrosIguales) malo = true
  console.log(`| ${tamano} | ${e.huella.conteos['ss_incidencia']} | ${filas} | ${tExport} | ${tDano} | ${tRestaura} | ${tVerifica} | ${v.tenantIgual ? '✓' : '✗'} | ${v.otrosIguales ? '✓' : '✗'} |`)
}
console.log(`\nTiempos de LABORATORIO (PGlite en proceso). RPO y RTO de producción: desconocidos hasta GATE 3.`)
console.log(malo ? '✗ una restauración no cuadró' : '✓ S, M y L: cada consultora vuelve a su export y la vecina no cambia')
process.exit(malo ? 1 : 0)
