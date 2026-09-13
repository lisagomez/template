#!/usr/bin/env node
/**
 * Captura de la FABRICA (spec 011, RF-5 y RF-6): convierte un transcript del arnes en una
 * trayectoria de forma. Dos modos:
 *
 *   --hook            lee por stdin el JSON del hook `SessionEnd` ({session_id, transcript_path})
 *   --historicas DIR  convierte todos los transcripts `*.jsonl` de primer nivel de DIR
 *   RUTA.jsonl        convierte uno
 *
 * Lo que se cuenta: skills invocados (por `<command-name>` en mensajes de usuario y por la
 * herramienta Skill), herramientas por nombre, modelos por mensaje, tokens con cache, turnos,
 * subagentes, errores de herramienta, y los gates que se corrieron (validate, prueba, regresion,
 * verifica:specs, gobernanza, lint, typecheck, build) con un resultado deducido de su salida.
 *
 * Lo que NO se copia, a proposito: ningun texto de mensaje, ningun comando, ningun nombre de
 * archivo. El `usage` se deduplica por id de mensaje: en el transcript cada bloque de contenido
 * repite el uso del mismo mensaje (medido: sumar lineas multiplica los tokens por 3 a 6).
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validaTrayectoria, cobertura, idDe } from './formato.mjs'

const raiz = process.env.CLAUDE_PROJECT_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DESTINO = join(raiz, 'trayectorias', 'datos', 'fabrica')
const DIR_SKILLS = join(raiz, '.claude', 'skills')

/**
 * Precios de los modelos del ARNES, del bloque `arnes` de routing-modelos.json (USD por millon).
 * Sin precio para alguno de los modelos de la sesion, el coste va null y la cobertura lo dice:
 * no se estima con el precio de otro.
 */
function preciosDelArnes() {
  try {
    const catalogo = JSON.parse(readFileSync(join(raiz, '.claude', 'routing-modelos.json'), 'utf8'))
    return catalogo.arnes?.modelos ?? {}
  } catch { return {} }
}
const PRECIOS = preciosDelArnes()

function costeDe(usoPorMensaje, modeloPorMensaje) {
  let total = 0
  for (const [id, u] of usoPorMensaje) {
    const modelo = modeloPorMensaje.get(id) ?? ''
    // `<synthetic>`: mensajes que fabrica el arnes sin llamar a ningun modelo. No cuestan.
    if (modelo.startsWith('<')) continue
    const precio = PRECIOS[modelo]?.precio
    if (precio === undefined) return null
    total += ((u.input_tokens ?? 0) * precio.entrada + (u.output_tokens ?? 0) * precio.salida
      + (u.cache_read_input_tokens ?? 0) * precio.lectura_cache + (u.cache_creation_input_tokens ?? 0) * precio.escritura_cache) / 1e6
  }
  return Math.round(total * 10000) / 10000
}

/**
 * Un `<command-name>` es un skill solo si existe en `.claude/skills/`. Los demas (`compact`,
 * `model`, `clear`, `exit`, `effort`, `goal`, `plan`...) son comandos del arnes y van aparte:
 * el evaluador ciego los tomaba por skills y juzgaba una sesion de `/goal` como si fuera de un
 * skill llamado «goal» (medido el 2026-09-13).
 */
const esSkill = (nombre) => existsSync(join(DIR_SKILLS, nombre))
const SKILLS_DE_PLANIFICACION = new Set(['goal-compiler', 'prp', 'spec-generator', 'new-app', 'plan'])

/**
 * El tipo de tarea de la sesion, deducido de lo que HIZO y no de lo que dijo: con ediciones es
 * implementacion; con skills de planificacion y sin ediciones, planificacion; con herramientas
 * pero sin ediciones, lectura; sin herramientas, conversacion. Da al evaluador una referencia
 * cuando no hubo skill: 5 de sus 6 «no» eran sesiones sin skill, imposibles de juzgar.
 */
/**
 * Un comando de Bash que ESCRIBE archivos cuenta como edicion: en este repo las ediciones van
 * muchas veces por `sed -i`, heredocs o un `python3 -` que llama a `write_text`. Sin esto, el
 * evaluador ciego etiquetaba como «lectura» sesiones que arreglaban codigo a base de Bash
 * (segunda pasada, 2026-09-13: 6 de 8 «no» eran eso). Solo se mira la FORMA del comando.
 */
const ESCRIBE = /\bsed -i\b|\bcat >|>>|\btee\b|write_text\(|\bcp \b|\bmv \b|\bgit (commit|checkout -b|merge|rebase)\b|\bnpm (install|uninstall)\b|\bmkdir\b|\brm -/
const escribe = (comando) => ESCRIBE.test(comando)

function tareaDe(herramientas, skills, comandos, ediciones) {
  const total = Object.values(herramientas).reduce((a, b) => a + b, 0)
  if (ediciones > 0) return 'implementacion'
  if ([...skills].some((s) => SKILLS_DE_PLANIFICACION.has(s)) || comandos.has('plan')) return 'planificacion'
  if (total > 0) return 'lectura'
  return 'conversacion'
}

const GATES = [
  ['validate', /npm run validate\b/], ['prueba', /npm run prueba\b|node --test\b/], ['regresion', /npm run regresion\b/],
  ['verifica:specs', /npm run verifica:specs\b/], ['verify:gobernanza', /npm run verify:gobernanza\b/],
  ['lint', /npm run lint\b|npx eslint\b/], ['typecheck', /npm run typecheck\b|npx tsc\b/], ['build', /npm run build\b|next build\b/],
]
const ROJO = /# fail [1-9]|✗|error TS\d|\bError:|FAIL\b|npm ERR!/
const VERDE = /✓|# pass \d+|en verde|sellado|conformes|Compiled/

function leeLineas(ruta) {
  const salida = []
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    if (linea.trim().length === 0) continue
    try { salida.push(JSON.parse(linea)) } catch { /* una linea rota no invalida la sesion */ }
  }
  return salida
}

/** Deduce el resultado de un gate por la SALIDA de la herramienta, sin copiarla. */
function resultadoDe(resultado) {
  if (resultado === undefined) return 'desconocido'
  if (resultado.is_error === true) return 'rojo'
  const texto = typeof resultado.content === 'string' ? resultado.content : Array.isArray(resultado.content) ? resultado.content.map((c) => c?.text ?? '').join('\n') : ''
  if (ROJO.test(texto)) return 'rojo'
  if (VERDE.test(texto)) return 'verde'
  return 'desconocido'
}

export function trayectoriaDeTranscript(lineas, referencia) {
  const herramientas = {}
  const modelos = {}
  const skills = new Set()
  const comandos = new Set()
  const gates = {}
  const usoPorMensaje = new Map()
  const modeloPorMensaje = new Map()
  const resultados = new Map()
  const usos = new Map()
  const erroresPor = {}
  let turnos = 0
  let subagentes = 0
  let errores = 0
  let ediciones = 0
  let inicio = null
  let fin = null
  const pendientes = []

  for (const l of lineas) {
    if (l.timestamp) { inicio ??= l.timestamp; fin = l.timestamp }
    const m = l.message
    if (!m || typeof m !== 'object') continue
    if (l.type === 'assistant') {
      if (m.model && !String(m.model).startsWith('<')) modelos[m.model] = (modelos[m.model] ?? 0) + 1
      if (m.usage && m.id && !usoPorMensaje.has(m.id)) { usoPorMensaje.set(m.id, m.usage); modeloPorMensaje.set(m.id, String(m.model ?? '')) }
      for (const b of Array.isArray(m.content) ? m.content : []) {
        if (b?.type !== 'tool_use') continue
        const nombre = String(b.name ?? 'desconocida').slice(0, 60)
        herramientas[nombre] = (herramientas[nombre] ?? 0) + 1
        if (b.id) usos.set(b.id, nombre)
        if (nombre === 'Agent') subagentes++
        if (nombre === 'Write' || nombre === 'Edit' || nombre === 'NotebookEdit') ediciones++
        if (nombre === 'Bash' && typeof b.input?.command === 'string' && escribe(b.input.command)) ediciones++
        if (nombre === 'Skill' && typeof b.input?.skill === 'string') skills.add(b.input.skill.slice(0, 40))
        if (nombre === 'Bash' && typeof b.input?.command === 'string') {
          for (const [gate, forma] of GATES) if (forma.test(b.input.command)) pendientes.push({ gate, id: b.id })
        }
      }
    } else if (l.type === 'user') {
      if (typeof m.content === 'string') {
        if (l.isMeta !== true) turnos++
        for (const s of m.content.matchAll(/<command-name>\/([a-z0-9-]+)<\/command-name>/g)) (esSkill(s[1]) ? skills : comandos).add(s[1])
      } else if (Array.isArray(m.content)) {
        let esResultado = false
        for (const b of m.content) {
          if (b?.type === 'tool_result') {
            esResultado = true; resultados.set(b.tool_use_id, b)
            // Por herramienta, no por comando: al aplicar las propuestas del 2026-09-13 hizo falta
            // saber DE QUE eran los errores, y la trayectoria solo traia el total.
            if (b.is_error === true) { errores++; const h = usos.get(b.tool_use_id) ?? 'desconocida'; erroresPor[h] = (erroresPor[h] ?? 0) + 1 }
          }
        }
        if (!esResultado && l.isMeta !== true) turnos++
      }
    }
  }
  for (const { gate, id } of pendientes) {
    const r = resultadoDe(resultados.get(id))
    const previo = gates[gate] ?? { nombre: gate, resultado: 'desconocido', veces: 0 }
    previo.veces++
    // El ultimo resultado conocido manda: un gate que paso de rojo a verde termino en verde.
    if (r !== 'desconocido') previo.resultado = r
    gates[gate] = previo
  }
  let uso = null
  if (usoPorMensaje.size > 0) {
    uso = { entrada: 0, salida: 0, cacheCreacion: 0, cacheLectura: 0 }
    for (const u of usoPorMensaje.values()) {
      uso.entrada += u.input_tokens ?? 0; uso.salida += u.output_tokens ?? 0
      uso.cacheCreacion += u.cache_creation_input_tokens ?? 0; uso.cacheLectura += u.cache_read_input_tokens ?? 0
    }
  }
  const faltan = []
  if (uso === null) faltan.push('uso')
  const costoUsd = uso === null ? null : costeDe(usoPorMensaje, modeloPorMensaje)
  if (uso !== null && costoUsd === null) faltan.push('costo')
  const totalMs = inicio && fin ? Math.max(0, Date.parse(fin) - Date.parse(inicio)) : null
  if (totalMs === null) faltan.push('tiempos')
  const t = {
    version: 1, id: idDe('fabrica', referencia), linea: 'fabrica',
    origen: { tipo: 'sesion', referencia: referencia.slice(0, 36), subagente: false },
    cuando: { inicio: inicio ?? new Date(0).toISOString(), ...(fin ? { fin } : {}) },
    actor: { skills: [...skills].sort(), tarea: tareaDe(herramientas, skills, comandos, ediciones) },
    modelos,
    acciones: { herramientas, llamadasAlModelo: usoPorMensaje.size, turnos, subagentes, comandos: [...comandos].sort().length, ediciones },
    uso, costoUsd,
    tiempos: { totalMs },
    gates: Object.values(gates),
    resultado: { errores, erroresPor },
    cobertura: cobertura(faltan),
  }
  return t
}

function guarda(t) {
  const mes = t.cuando.inicio.slice(0, 7)
  const dir = join(DESTINO, mes)
  mkdirSync(dir, { recursive: true })
  const ruta = join(dir, `${t.id}.json`)
  writeFileSync(ruta, JSON.stringify(t, null, 1) + '\n')
  return ruta
}

function convierte(ruta) {
  const referencia = basename(ruta, '.jsonl')
  const lineas = leeLineas(ruta)
  if (lineas.length === 0) return null
  const t = trayectoriaDeTranscript(lineas, referencia)
  const errores = validaTrayectoria(t)
  if (errores.length > 0) throw new Error(`la trayectoria de ${referencia} no pasa el formato: ${errores.join('; ')}`)
  return t
}

const esPrincipal = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (esPrincipal) {
  const args = process.argv.slice(2)
  if (args[0] === '--hook') {
    let entrada = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (d) => { entrada += d })
    process.stdin.on('end', () => {
      try {
        const hook = JSON.parse(entrada)
        const ruta = hook.transcript_path
        if (typeof ruta === 'string' && existsSync(ruta)) {
          const t = convierte(ruta)
          if (t) { guarda(t); console.error(`trayectorias: sesion ${t.origen.referencia.slice(0, 8)} capturada (${t.acciones.llamadasAlModelo} llamadas, ${Object.values(t.acciones.herramientas).reduce((a, b) => a + b, 0)} herramientas)`) }
        }
      } catch (error) {
        console.error(`trayectorias: no se capturo la sesion (${error instanceof Error ? error.constructor.name : 'error'})`)
      }
      process.stdout.write('{}')
    })
  } else if (args[0] === '--historicas') {
    const dir = args[1]
    const archivos = readdirSync(dir).filter((n) => n.endsWith('.jsonl')).sort()
    const filas = []
    for (const nombre of archivos) {
      const t = convierte(join(dir, nombre))
      if (t === null) continue
      guarda(t)
      const h = t.acciones.herramientas
      filas.push([t.origen.referencia.slice(0, 8), t.cuando.inicio.slice(0, 10), `${t.actor.tarea}${t.actor.skills.length ? ':' + t.actor.skills.join(',') : ''}`, Object.values(h).reduce((a, b) => a + b, 0), t.acciones.llamadasAlModelo, t.uso?.salida ?? '-', t.uso?.cacheLectura ?? '-', t.gates.map((g) => `${g.nombre}:${g.resultado[0]}`).join(' ') || '-', t.resultado.errores])
    }
    const anchos = [9, 11, 34, 6, 8, 9, 12, 38, 4]
    const fila = (c) => console.log(c.map((v, i) => String(v).slice(0, anchos[i]).padEnd(anchos[i])).join(' '))
    fila(['sesion', 'fecha', 'skills', 'herr', 'llamadas', 'salida', 'cacheLect', 'gates', 'err'])
    for (const f of filas) fila(f)
    console.log(`\n${filas.length} sesion(es) convertida(s) en ${DESTINO.replace(raiz, '.')}`)
  } else if (args[0]) {
    const t = convierte(args[0])
    if (t) console.log(guarda(t))
  } else {
    console.error('uso: captura-sesion.mjs --hook | --historicas DIR | RUTA.jsonl')
    process.exit(1)
  }
}
