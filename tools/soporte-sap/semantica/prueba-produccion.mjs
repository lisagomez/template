#!/usr/bin/env node
/**
 * El job de la capa semántica contra el ESQUEMA DEL PRODUCTO, en contenedores efímeros:
 *
 *   1. red Docker aislada; Postgres pineado por digest con el Supabase mínimo y la propuesta de esquema;
 *   2. las semillas sintéticas cargadas en las tablas `ss_*` (ids → uuid determinista);
 *   3. un usuario de login que solo es miembro de `soporte_sap_metricas` (contraseña al azar, por stdin y
 *      por variable de entorno: nunca en una línea de comandos);
 *   4. la imagen del job (`docker build` de esta carpeta) corre `dbt build --target produccion`,
 *      `mf validate-configs`, las consultas y la inserción en `ss_metrica`;
 *   5. cada valor de `ss_metrica` se compara con el del corte del laboratorio (mismas entradas, mismo
 *      número); todo se tira al final.
 *
 * Uso: node tools/soporte-sap/semantica/prueba-produccion.mjs   (exit 1 si algo no cuadra)
 */
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { semillas } from './semillas.ts'
import { SUPABASE_MINIMO, SQL_SOPORTE } from '../pruebas/_base.ts'
import { IMAGEN_POSTGRES } from './imagen.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const IMAGEN_JOB = 'soporte-sap-semantica:lab'
const sufijo = String(process.pid)
const RED = `ss-prod-red-${sufijo}`, PG = `ss-prod-pg-${sufijo}`
const clave = randomBytes(24).toString('hex'), claveJob = randomBytes(24).toString('hex')

const corre = (cmd, args, opciones = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opciones })
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 2).join(' ')}: ${(r.stdout + r.stderr).slice(-3000)}`)
  return r.stdout
}
const psql = (sql) => corre('docker', ['exec', '-i', '-e', 'PGPASSWORD', PG, 'psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-At', '-f', '-'], { input: sql, env: { ...process.env, PGPASSWORD: clave } })
const uuid = (s) => { const h = createHash('sha256').update(s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}` }
const lit = (v) => (v === null || v === undefined || v === '' ? 'null' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms))

function cargaSql() {
  const s = semillas()
  const t = (n) => s.tablas[n].filas.map((f) => Object.fromEntries(s.tablas[n].columnas.map((c, i) => [c, f[i]])))
  const sql = ['begin;']
  for (const o of t('ss_organizacion')) sql.push(`insert into ss_organizacion (id, tipo, nombre, padre_id, creada_en, tamano, sistema, usuarios_sap) values ('${uuid(o.id)}', ${lit(o.tipo)}, ${lit(o.id)}, ${o.padre_id ? `'${uuid(o.padre_id)}'` : 'null'}, ${lit(o.creada_en)}, ${lit(o.tamano)}, ${lit(o.sistema)}, ${lit(o.usuarios_sap)});`)
  for (const i of t('ss_incidencia')) sql.push(`insert into ss_incidencia (id, consultora_id, cliente_id, titulo, sistema, modulo, prioridad, complejidad, regla_aplicada, estado, creada_en, primera_respuesta_en, resuelta_en, cerrada_en) values ('${uuid(i.id)}', '${uuid(i.consultora_id)}', '${uuid(i.cliente_id)}', 'incidencia sintética', ${lit(i.sistema)}, ${lit(i.modulo)}, ${lit(i.prioridad)}, ${lit(i.complejidad)}, ${lit(i.regla_aplicada)}, ${lit(i.estado)}, ${lit(i.creada_en)}, ${lit(i.primera_respuesta_en)}, ${lit(i.resuelta_en)}, ${lit(i.cerrada_en)});`)
  for (const r of t('ss_sla_resultado')) sql.push(`insert into ss_sla_resultado (incidencia_id, contrato_id, contrato_version, consultora_id, cliente_id, prioridad, respuesta_min, resolucion_min, meta_respuesta_min, meta_resolucion_min, cumple_respuesta, cumple_resolucion, estado, pausado_min, reabierta, espero_cliente) values ('${uuid(r.incidencia_id)}', ${lit(r.contrato_id)}, ${lit(r.contrato_version)}, '${uuid(r.consultora_id)}', '${uuid(r.cliente_id)}', ${lit(r.prioridad)}, ${lit(r.respuesta_min)}, ${lit(r.resolucion_min)}, ${lit(r.meta_respuesta_min)}, ${lit(r.meta_resolucion_min)}, ${lit(r.cumple_respuesta)}, ${lit(r.cumple_resolucion)}, ${lit(r.estado)}, ${lit(r.pausado_min)}, ${lit(r.reabierta)}, ${lit(r.espero_cliente)});`)
  for (const h of t('ss_horas')) sql.push(`insert into ss_horas (consultora_id, cliente_id, incidencia_id, consultor, minutos, fecha) values ('${uuid(h.consultora_id)}', '${uuid(h.cliente_id)}', '${uuid(h.incidencia_id)}', 'usr-000000000abc', ${h.minutos}, ${lit(h.fecha)});`)
  const crudos = [...new Set(t('ss_importacion_fila').map((f) => `${f.crudo_id}|${f.consultora_id}|${f.herramienta}`))]
  for (const c of crudos) { const [id, cons, h] = c.split('|'); sql.push(`insert into ss_crudo (id, consultora_id, herramienta, huella, contenido) values ('${uuid(id)}', '${uuid(cons)}', ${lit(h)}, '${createHash('sha256').update(id).digest('hex')}', '{}');`) }
  for (const f of t('ss_importacion_fila')) sql.push(`insert into ss_importacion_fila (crudo_id, indice, consultora_id, cliente_id, herramienta, version_mapeo, resultado, motivo, decidido_en) values ('${uuid(f.crudo_id)}', ${f.indice}, '${uuid(f.consultora_id)}', ${f.cliente_id ? `'${uuid(f.cliente_id)}'` : 'null'}, ${lit(f.herramienta)}, ${f.version_mapeo}, ${lit(f.resultado)}, ${f.resultado === 'limpia' ? 'null' : "'sintético'"}, ${lit(f.decidido_en)});`)
  sql.push('commit;')
  return { sql: sql.join('\n'), n: s.tablas.ss_incidencia.filas.length }
}

async function principal() {
  const inicio = Date.now()
  corre('docker', ['network', 'create', '--internal', RED])
  try {
    corre('docker', ['run', '-d', '--rm', '--name', PG, '--network', RED, '-e', 'POSTGRES_PASSWORD', IMAGEN_POSTGRES], { env: { ...process.env, POSTGRES_PASSWORD: clave } })
    for (let k = 0; spawnSync('docker', ['exec', PG, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']).status !== 0; k++) { if (k > 60) throw new Error('Postgres no respondió'); await espera(1000) }
    psql(`${SUPABASE_MINIMO}\n${SQL_SOPORTE}`)
    const carga = cargaSql()
    psql(carga.sql)
    psql(`create role ss_job_metricas login password '${claveJob}' in role soporte_sap_metricas;`)
    console.log(`▸ esquema del producto aplicado y ${carga.n} incidencias sintéticas cargadas (red interna ${RED}, sin salida a internet)`)
    const salida = corre('docker', ['run', '--rm', '--network', RED, '-e', `SS_PG_HOST=${PG}`, '-e', 'SS_PG_USER=ss_job_metricas', '-e', 'SS_PG_PASSWORD', '-e', 'SS_PG_DB=postgres',
      '-e', 'SS_PERIODO_DESDE=2026-04-01', '-e', 'SS_PERIODO_HASTA=2026-09-30', IMAGEN_JOB], { env: { ...process.env, SS_PG_PASSWORD: claveJob } })
    console.log(`▸ job: ${salida.trim().split('\n').at(-1)}`)
    const enBase = psql(`select metrica || '|' || to_char(periodo, 'YYYY-MM') || '|' || alcance || '|' || coalesce(tamano, '') || '|' || coalesce(consultora_id::text, '') || '|' || coalesce(cliente_id::text, '') || '|' || coalesce(etapa, '') || '|' || coalesce(round(valor, 6)::text, '') || '|' || visible_al_cliente from ss_metrica`)
      .trim().split('\n').filter(Boolean)
    const corte = JSON.parse(readFileSync(join(AQUI, 'corte.json'), 'utf8'))
    const visible = Object.fromEntries(corte.metricas.map((m) => [m.nombre, m.visibleAlCliente]))
    const clave6 = (f) => [f.metrica, f.periodo, f.alcance, f.tamano ?? '', f.consultora ? uuid(f.consultora) : '', f.cliente ? uuid(f.cliente) : '', f.etapa ?? ''].join('|')
    const delLab = new Map(corte.filas.map((f) => [clave6(f), f.valor === null ? '' : Number(f.valor).toFixed(6)]))
    const deBase = new Map(enBase.map((l) => { const p = l.split('|'); return [p.slice(0, 7).join('|'), { valor: p[7] === '' ? '' : Number(p[7]).toFixed(6), visible: p[8] === 't' || p[8] === 'true', metrica: p[0] }] }))
    const difieren = [...delLab].filter(([k, v]) => !deBase.has(k) || deBase.get(k).valor !== v)
    const visiblesMal = [...deBase.values()].filter((x) => x.visible !== Boolean(visible[x.metrica]))
    console.log(`▸ ss_metrica: ${deBase.size} valores · corte del laboratorio: ${delLab.size} · difieren: ${difieren.length} · «visible al cliente» mal puesto: ${visiblesMal.length} · ${((Date.now() - inicio) / 1000).toFixed(1)} s`)
    if (difieren.length) console.log(`  ejemplos: ${difieren.slice(0, 5).map(([k, v]) => `${k} lab=${v} base=${deBase.get(k)?.valor ?? 'falta'}`).join('\n  ')}`)
    process.exitCode = difieren.length || visiblesMal.length || deBase.size !== delLab.size ? 1 : 0
  } finally {
    spawnSync('docker', ['rm', '-f', PG]); spawnSync('docker', ['network', 'rm', RED])
    console.log('▸ contenedor y red tirados')
  }
}

principal().catch((e) => { console.error(`✗ ${e.message}`); spawnSync('docker', ['rm', '-f', PG]); spawnSync('docker', ['network', 'rm', RED]); process.exit(1) })
