#!/usr/bin/env node
/**
 * La capa semántica del portal, de punta a punta, por el mismo camino que soporte-sap (`tools/soporte-sap/semantica`):
 *
 *   1. el LIBRO de eventos del laboratorio, VERIFICADO (cadena y contrato) antes de cargar nada;
 *   2. semillas: el evento tal cual (`raw_eventos`), el conteo DIRECTO por tipo (`conteo_libro`) y los servicios;
 *   3. staging regenerado del contrato (`genera.ts`); Postgres efímero en Docker pineado por digest, solo en
 *      127.0.0.1, contraseña al azar fuera de toda línea de comandos;
 *   4. `dbt build` (semillas, modelos y pruebas, con la de convergencia libro = staging) y `mf validate-configs`;
 *   5. `mf query` de cada métrica por clínica, el embudo por canal y las aristas del recorrido;
 *   6. cada cifra junto a su conteo directo (`directo.ts`) → docs/goals/clinica-dental-medicion/corte-semantico.json;
 *   7. el contenedor se tira siempre.
 *
 * Sin telemetría (DBT_SEND_ANONYMOUS_USAGE_STATS=false, DO_NOT_TRACK=1). Uso:
 *   node tools/clinica-dental/semantica/corre.mjs [--libro <dir>] [--salida <json>]   (por defecto ~/.clinica-dental/libro)
 */
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLINICAS, TIPOS_EVENTO, verificaLibro } from '../dist/servidor.js'
import { IMAGEN_POSTGRES } from './imagen.mjs'
import { aristasDirectas, metricasDirectas } from './directo.ts'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..', '..', '..')
const arg = (n, d) => process.argv.find((_, i) => process.argv[i - 1] === n) ?? d
const LIBRO = arg('--libro', join(process.env.CLINICA_DATOS ?? join(homedir(), '.clinica-dental'), 'libro'))
const SALIDA = arg('--salida', join(RAIZ, 'docs/goals/clinica-dental-medicion/corte-semantico.json'))
const LOCK = readFileSync(join(AQUI, 'requirements.lock'), 'utf8')
const HUELLA_LOCK = createHash('sha256').update(LOCK).digest('hex').slice(0, 12)
/** El mismo lock que soporte-sap: si su entorno ya existe, se reutiliza (mismas versiones, mismos hashes). */
const VENV = process.env.CD_DBT_VENV ?? [join(homedir(), '.cache', 'soporte-sap-semantica', `venv-${HUELLA_LOCK}`), join(homedir(), '.cache', 'clinica-dental-semantica', `venv-${HUELLA_LOCK}`)].find((v) => existsSync(join(v, 'bin', 'mf'))) ?? join(homedir(), '.cache', 'clinica-dental-semantica', `venv-${HUELLA_LOCK}`)
const bin = (x) => join(VENV, 'bin', x)

const corre = (cmd, args, o = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...o })
  if (r.error) throw r.error
  return { codigo: r.status ?? 1, salida: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}
const exige = (cmd, args, o, que) => {
  const r = corre(cmd, args, o)
  if (r.codigo !== 0) { console.error(r.salida.slice(-8000)); throw new Error(`${que} falló (código ${r.codigo})`) }
  return r.salida
}
const puertoLibre = () => new Promise((ok, mal) => { const s = createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)) }).on('error', mal) })
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms))
const csv = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
const leeCsv = (t) => {
  const [cab, ...filas] = t.trim().split(/\r?\n/)
  const cols = cab.split(',')
  return filas.filter(Boolean).map((f) => Object.fromEntries(f.split(',').map((v, i) => [cols[i], v])))
}
const num = (v) => (v === '' || v === undefined || v === 'None' || v === 'nan' ? null : Math.round(Number(v) * 1e6) / 1e6)

function entorno() {
  if (existsSync(bin('dbt')) && existsSync(bin('mf'))) return 'ya estaba'
  mkdirSync(dirname(VENV), { recursive: true })
  exige('uv', ['venv', '--python', '3.12', VENV], {}, 'crear el entorno Python 3.12')
  exige('uv', ['pip', 'sync', '--python', bin('python'), '--require-hashes', join(AQUI, 'requirements.lock')], {}, 'instalar el lock')
  return 'creado'
}

/** El libro, verificado: si la cadena o el contrato fallan, no se carga NADA. */
function leeLibro() {
  const porClinica = {}
  for (const c of CLINICAS) {
    const ruta = join(LIBRO, `${c.id}.jsonl`)
    const es = existsSync(ruta) ? readFileSync(ruta, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []
    const v = verificaLibro(es)
    if (!v.ok) throw new Error(`el libro de ${c.id} no verifica (${v.fallo} en el eslabón ${v.seq}): ${v.detalle}`)
    porClinica[c.id] = { eslabones: es, verificacion: v }
  }
  return porClinica
}

function escribeSemillas(libro) {
  const dir = join(AQUI, 'semillas')
  const base = new Set(['v', 'id', 'en', 'clinica', 'tipo', 'sujeto'])
  const filas = Object.values(libro).flatMap((l) => l.eslabones).map((e) => {
    const datos = Object.fromEntries(Object.entries(e.evento).filter(([k]) => !base.has(k)))
    return [e.clinica, e.seq, e.evento.tipo, e.evento.id, e.evento.en, e.evento.sujeto, JSON.stringify(datos), e.hash].map(csv).join(',')
  })
  writeFileSync(join(dir, 'raw_eventos.csv'), `clinica,seq,tipo,evento_id,en,sujeto,datos,hash\n${filas.join('\n')}\n`)
  const conteo = Object.fromEntries(TIPOS_EVENTO.map((t) => [t, 0]))
  for (const l of Object.values(libro)) for (const e of l.eslabones) conteo[e.evento.tipo]++
  writeFileSync(join(dir, 'conteo_libro.csv'), `tipo,eventos\n${TIPOS_EVENTO.map((t) => `${t},${conteo[t]}`).join('\n')}\n`)
  writeFileSync(join(dir, 'servicios.csv'), `clinica,servicio,categoria,precio_mxn,costo_variable_mxn,duracion_min\n${CLINICAS.flatMap((c) => c.servicios.map((s) => [c.id, s.id, s.categoria, s.precioMxn, s.costoVariableMxn, s.duracionMin].join(','))).join('\n')}\n`)
  return conteo
}

/** Qué se pregunta a MetricFlow: cada métrica agrupada por la clínica de SU modelo; el embudo por canal; las aristas. */
const CONSULTAS = [
  { metricas: ['pacientes_nuevos', 'horas_registro_a_cita_p50'], por: 'paciente__clinica' },
  { metricas: ['citas_confirmadas', 'citas_atendidas_n', 'tasa_inasistencia', 'citas_canceladas_n', 'ingreso_atendido_mxn', 'margen_atendido_mxn', 'asistencias_confirmadas_n', 'citas_por_whatsapp_n'], por: 'cita__clinica' },
  { metricas: ['avisos_entregados_n', 'entregabilidad', 'costo_por_aviso_usd', 'avisos_leidos_n'], por: 'aviso__clinica' },
  { metricas: ['turnos_asistente_n', 'urgencias_derivadas', 'latencia_asistente_p50_ms', 'urgencias_whatsapp_n'], por: 'turno__clinica' },
  { metricas: ['mensajes_whatsapp_n', 'mensajes_whatsapp_cobrados_n', 'costo_whatsapp_usd', 'costo_por_mensaje_whatsapp_usd'], por: 'mensaje_wa__clinica' },
  { metricas: ['entrantes_whatsapp_n', 'entrantes_whatsapp_vinculados_n'], por: 'entrante_wa__clinica' },
  { metricas: ['codigos_vinculo_n', 'vinculos_confirmados_n', 'vinculos_rechazados_n', 'tasa_vinculo'], por: 'vinculo_wa__clinica' },
  { metricas: ['recepcion_atiende_n'], por: 'recepcion__clinica' },
  { metricas: ['conversaciones_asistente_n', 'costo_por_conversacion_usd'], por: 'conversacion__clinica' },
  { metricas: ['visitantes_portal', 'registros_embudo', 'conversion_visita_registro', 'conversion_inicio_registro', 'conversion_registro_cita'], por: 'embudo__clinica' },
  { metricas: ['bajas_newsletter'], por: 'baja__clinica' },
]

function consulta(env, carpeta, metricas, por, nombre) {
  const archivo = join(carpeta, `${nombre}.csv`)
  exige(bin('mf'), ['query', '--metrics', metricas.join(','), '--group-by', por, '--csv', archivo], { cwd: AQUI, env }, `mf query ${nombre}`)
  // Sin filas (p. ej. nadie se dio de baja en la corrida), MetricFlow no escribe el CSV: es un resultado, no un error.
  return existsSync(archivo) ? leeCsv(readFileSync(archivo, 'utf8')) : []
}

async function principal() {
  const t0 = Date.now()
  console.log(`▸ entorno dbt + MetricFlow: ${entorno()} (${VENV.replace(homedir(), '~')})`)
  const libro = leeLibro()
  for (const [c, l] of Object.entries(libro)) console.log(`▸ libro ${c}: ${l.verificacion.n} eventos, cadena íntegra, raíz ${l.verificacion.raiz.slice(0, 16)}…`)
  const conteo = escribeSemillas(libro)
  console.log(`▸ ${exige('node', [join(AQUI, 'genera.ts')], {}, 'genera staging').trim()}`)
  const versiones = Object.fromEntries(exige('uv', ['pip', 'freeze', '--python', bin('python')], {}, 'uv pip freeze').split('\n').map((l) => l.trim().split('==')).filter(([n, v]) => v && /^(dbt-core|dbt-postgres|dbt-metricflow|metricflow)$/.test(n)))
  const puerto = await puertoLibre()
  const clave = randomBytes(24).toString('hex')
  const nombre = `cd-semantica-${process.pid}`
  exige('docker', ['run', '-d', '--rm', '--name', nombre, '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_DB=semantica', '-p', `127.0.0.1:${puerto}:5432`, IMAGEN_POSTGRES], { env: { ...process.env, POSTGRES_PASSWORD: clave } }, 'levantar Postgres')
  try {
    for (let k = 0; corre('docker', ['exec', nombre, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'semantica']).codigo !== 0; k++) {
      if (k > 60) throw new Error('Postgres no respondió en 60 s')
      await espera(1000)
    }
    console.log(`▸ Postgres efímero ${IMAGEN_POSTGRES.slice(0, 28)}… en 127.0.0.1:${puerto}`)
    const env = { ...process.env, CD_PG_HOST: '127.0.0.1', CD_PG_PORT: String(puerto), CD_PG_PASSWORD: clave, CD_PG_DB: 'semantica', DBT_PROFILES_DIR: join(AQUI, 'perfil'), DBT_SEND_ANONYMOUS_USAGE_STATS: 'false', DO_NOT_TRACK: '1' }
    const dbt = exige(bin('dbt'), ['build', '--no-use-colors'], { cwd: AQUI, env }, 'dbt build')
    const resumenDbt = dbt.split('\n').filter((l) => /Done\. PASS=|Completed successfully|Finished running/.test(l)).map((l) => l.replace(/^\S+\s+/, '').trim())
    resumenDbt.forEach((l) => console.log(`  dbt  ${l}`))
    const consultaStaging = TIPOS_EVENTO.map((t) => `select '${t}', count(*) from semantica.stg_${t}`).join(' union all ')
    const enStaging = Object.fromEntries(exige('docker', ['exec', nombre, 'psql', '-U', 'postgres', '-d', 'semantica', '-At', '-F', ',', '-c', consultaStaging], {}, 'contar el staging').trim().split('\n').map((l) => l.split(',')).map(([t, n]) => [t, Number(n)]))
    const convergencia = TIPOS_EVENTO.map((t) => ({ tipo: t, libro: conteo[t], staging: enStaging[t] ?? null }))
    const valida = exige(bin('mf'), ['validate-configs'], { cwd: AQUI, env }, 'mf validate-configs')
    // Solo el veredicto de cada paso (lo que va tras la última ✔), sin los cuadros del spinner ni los colores.
    const resumenMf = valida.split('\n').filter((l) => /✔|WARNING|ERROR|Validat/.test(l)).map((l) => l.replace(/\x1b\[[0-9;]*m/g, '').trim()).map((l) => (l.includes('✔') ? `✔${l.split('✔').pop()}` : l)).filter(Boolean)
    resumenMf.forEach((l) => console.log(`  mf   ${l}`))
    const carpeta = mkdtempSync(join(tmpdir(), 'cd-corte-'))
    const metricas = {}
    for (const [i, q] of CONSULTAS.entries()) {
      for (const fila of consulta(env, carpeta, q.metricas, q.por, `q${i}`)) {
        const clinica = fila[q.por]
        for (const m of q.metricas) (metricas[m] ??= {})[clinica] = num(fila[m])
      }
    }
    const porCanal = consulta(env, carpeta, ['visitantes_portal', 'registros_embudo', 'conversion_visita_registro'], 'embudo__clinica,embudo__canal', 'canal')
    const avisosPorCanal = consulta(env, carpeta, ['avisos_entregados_n', 'avisos_leidos_n', 'entregabilidad', 'costo_por_aviso_usd'], 'aviso__clinica,aviso__canal', 'avisos-canal')
    const mensajesWa = consulta(env, carpeta, ['mensajes_whatsapp_n', 'mensajes_whatsapp_cobrados_n', 'costo_whatsapp_usd'], 'mensaje_wa__clinica,mensaje_wa__categoria,mensaje_wa__mensaje', 'mensajes-wa')
    const entrantesWa = consulta(env, carpeta, ['entrantes_whatsapp_n'], 'entrante_wa__clinica,entrante_wa__manejo', 'entrantes-wa')
    const aristas = consulta(env, carpeta, ['transiciones', 'segundos_arista_p50'], 'transicion__arista', 'aristas')
    const aristasClinica = consulta(env, carpeta, ['transiciones', 'segundos_arista_p50'], 'transicion__clinica,transicion__arista', 'aristas-clinica')
    const servicios = (c) => new Map(CLINICAS.find((x) => x.id === c).servicios.map((s) => [s.id, { precio: s.precioMxn, costo: s.costoVariableMxn }]))
    const directo = Object.fromEntries(Object.entries(libro).map(([c, l]) => [c, metricasDirectas(l.eslabones.map((e) => e.evento), servicios(c))]))
    const todos = Object.values(libro).flatMap((l) => l.eslabones.map((e) => e.evento))
    const aristasDir = aristasDirectas(todos)
    const corte = {
      version: `sha256:${createHash('sha256').update(JSON.stringify(Object.values(libro).map((l) => l.verificacion.raiz))).digest('hex').slice(0, 16)}`,
      generado: new Date().toISOString(), generadoCon: { ...versiones, postgres: IMAGEN_POSTGRES, python: '3.12' },
      libro: Object.fromEntries(Object.entries(libro).map(([c, l]) => [c, { eventos: l.verificacion.n, raiz: `sha256:${l.verificacion.raiz}` }])),
      dbt: resumenDbt, mf: resumenMf, conteoLibro: conteo, convergencia,
      metricas: Object.fromEntries(Object.entries(metricas).map(([m, v]) => [m, Object.fromEntries(Object.entries(v).map(([c, x]) => [c, { metricflow: x, directo: directo[c]?.[m] ?? null }]))])),
      porCanal: porCanal.map((f) => ({ clinica: f.embudo__clinica, canal: f.embudo__canal, visitantes: num(f.visitantes_portal), registrados: num(f.registros_embudo), conversion: num(f.conversion_visita_registro) })),
      avisosPorCanal: avisosPorCanal.map((f) => ({ clinica: f.aviso__clinica, canal: f.aviso__canal, entregados: num(f.avisos_entregados_n), leidos: num(f.avisos_leidos_n), entregabilidad: num(f.entregabilidad), costoPorAvisoUsd: num(f.costo_por_aviso_usd) })),
      mensajesWhatsapp: mensajesWa.map((f) => ({ clinica: f.mensaje_wa__clinica, categoria: f.mensaje_wa__categoria, mensaje: f.mensaje_wa__mensaje, n: num(f.mensajes_whatsapp_n), cobrables: num(f.mensajes_whatsapp_cobrados_n), costoUsd: num(f.costo_whatsapp_usd) })),
      entrantesWhatsapp: entrantesWa.map((f) => ({ clinica: f.entrante_wa__clinica, manejo: f.entrante_wa__manejo, n: num(f.entrantes_whatsapp_n) })),
      aristas: aristas.map((f) => ({ arista: f.transicion__arista, metricflow: { n: num(f.transiciones), p50: num(f.segundos_arista_p50) }, directo: aristasDir.find((a) => `${a.desde}→${a.hacia}` === f.transicion__arista) ?? null })),
      aristasPorClinica: aristasClinica.map((f) => ({ clinica: f.transicion__clinica, arista: f.transicion__arista, n: num(f.transiciones), p50: num(f.segundos_arista_p50) })),
    }
    mkdirSync(dirname(SALIDA), { recursive: true })
    writeFileSync(SALIDA, `${JSON.stringify(corte, null, 1)}\n`)
    imprime(corte)
    console.log(`▸ corte-semantico.json · ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  } finally {
    corre('docker', ['rm', '-f', nombre])
    console.log('▸ contenedor tirado')
  }
}

function imprime(corte) {
  console.log('\n  CONVERGENCIA libro (conteo directo) = staging (filas en Postgres), por tipo; dbt lo exige además con libro_igual_staging:')
  let distintas = 0
  for (const { tipo, libro, staging } of corte.convergencia) {
    if (libro !== staging) distintas++
    console.log(`    ${libro === staging ? '✓' : '✗'} ${tipo.padEnd(26)} libro ${String(libro).padStart(4)} · staging ${String(staging).padStart(4)}`)
  }
  console.log('\n  MÉTRICA (MetricFlow) vs CONTEO DIRECTO sobre el libro:')
  for (const [m, porC] of Object.entries(corte.metricas)) {
    for (const [c, v] of Object.entries(porC)) {
      const igual = v.metricflow === v.directo || (v.metricflow !== null && v.directo !== null && Math.abs(v.metricflow - v.directo) < 1e-4)
      if (!igual) distintas++
      console.log(`    ${igual ? '✓' : '✗'} ${m.padEnd(28)} ${c.padEnd(8)} MF ${String(v.metricflow).padStart(12)} · directo ${String(v.directo === null ? null : Math.round(v.directo * 1e6) / 1e6).padStart(12)}`)
    }
  }
  console.log('\n  ARISTAS del recorrido (MetricFlow vs directo):')
  for (const a of corte.aristas) {
    const igual = a.directo && a.directo.n === a.metricflow.n && Math.abs((a.directo.p50 ?? 0) - (a.metricflow.p50 ?? 0)) < 1e-3
    if (!igual) distintas++
    console.log(`    ${igual ? '✓' : '✗'} ${a.arista.padEnd(30)} n ${String(a.metricflow.n).padStart(3)} / ${String(a.directo?.n).padStart(3)} · p50 ${String(a.metricflow.p50).padStart(10)} s / ${String(a.directo?.p50 === null || a.directo?.p50 === undefined ? null : Math.round(a.directo.p50 * 1e3) / 1e3).padStart(10)} s`)
  }
  if (distintas) throw new Error(`${distintas} cifra(s) de MetricFlow no cuadran con el conteo directo`)
}

principal().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1) })
