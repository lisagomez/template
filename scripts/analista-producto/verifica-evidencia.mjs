#!/usr/bin/env node
/**
 * El comparador de evidencia del analista de producto (SDD §3.3–§3.9). Sin modelo y sin red: la
 * regla «un dolor sin cita no entra» no la hace cumplir quien escribe el hallazgo, la hace cumplir
 * esto. Lee `analisis.json` de una corrida y pone rojo:
 *
 *   E-ESQUEMA     falta un campo, un id repetido o con forma equivocada
 *   E-CITA        la ruta no existe, el literal no esta en la fuente, el commit o el PR no existen,
 *                 o la captura de una medicion declara otro comando
 *   E-GRADO       el grado declarado es mayor que el calculado (el maximo de sus citas validas),
 *                 o un hallazgo no tiene ninguna cita valida (eso es una hipotesis)
 *   E-HIPOTESIS   una hipotesis sin lo que haria falta para confirmarla
 *   E-COBERTURA   un activo del inventario no aparece, o su estado no cuadra con los hallazgos
 *   E-HUERFANO    un hallazgo que no cae en ningun caso, o un caso/candidato que cuelga de la nada
 *   E-CIFRA       una cifra que su literal no dice, sin captura, o un marcador [C-nn] que no existe
 *   E-PUNTUACION  un factor fuera de 1..3 o sin porque, la solidez elegida a mano, el total mal hecho
 *   E-VETO        un vetado en el ranking, un veto sin motivo, o el ranking fuera de orden
 *   E-ONEPAGER    menos de tres, el orden product first roto, o un TPL-* que no existe
 *   E-BORRADOR    una hipotesis de la peticion (el borrador) sin veredicto, o un veredicto sin cita
 *   E-INFORME     el informe no nombra un candidato, un vetado o una hipotesis del borrador
 *
 * Lo que NO comprueba: que la cita signifique lo que el hallazgo concluye. Eso es juicio, y por eso
 * el literal va pegado junto al hallazgo, para que quien lee lo juzgue de un vistazo.
 *
 * Uso:  node scripts/analista-producto/verifica-evidencia.mjs [docs/analisis/<fecha>]   (la ultima si no)
 *       node scripts/analista-producto/verifica-evidencia.mjs --prueba [corrida]  (siembra y exige que caigan)
 * Exit: 0 en verde · 1 en rojo.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SIEMBRAS } from './siembras.mjs'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const git = (args) => execFileSync('git', args, { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 })

export const GRADOS = { declarada: 1, registrada: 2, medida: 3 }
const NOMBRE_DE_GRADO = ['hipotesis', 'declarada', 'registrada', 'medida']
const VALOR_POR_TIPO = { archivo: 1, registro: 2, commit: 2, pr: 2, medicion: 3 }
const REGISTROS = /^\.claude\/gobernanza\/(INCIDENTES|REGISTRO-RIESGO|BITACORA-CDC)\.md$|^\.claude\/rules\/aprendizajes-[\w-]+\.md$/
/** Las hipotesis con que llego la peticion (el borrador): cada una sale con veredicto. */
const hipotesisDeEntrada = (a) => (a.peticion?.hipotesis ?? []).map((h) => h.id)
const VEREDICTOS = new Set(['confirmada', 'refutada', 'parcial', 'sin-evidencia'])
const ESTADOS_DE_COBERTURA = new Set(['con-dolores', 'sin-dolor-con-evidencia', 'no-mirado'])
const FORMA_DE_ID = { hallazgos: /^D-\d{2,3}$/, hipotesis: /^HP-\d{2}$/, casos: /^CU-\d{2}$/, candidatos: /^P-\d{2}$/, cifras: /^C-\d{2}$/ }
/** El orden product first del one-pager (SDD §3.9): usuario, tarea y coste antes de las piezas. */
const ORDEN_ONEPAGER = [/^##\s+Usuario/im, /^##\s+La tarea que hoy le cuesta/im, /^##\s+Cu[aá]nto le cuesta/im, /^##\s+Qu[eé] se recombina/im]
const MARCADOR_DE_CIFRA = /\[(C-\d{2})\]/g

export const normaliza = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

/**
 * El repo TAL COMO ESTABA en el commit analizado: una corrida es una foto. Si se leyera el arbol
 * de hoy, firmar un contrato (y borrar el «pendiente» que una cita copio) o dar de alta un activo
 * pondria roja una corrida vieja que era correcta, y el gate se volveria una trampa para cualquier
 * cambio. Que un dolor se cerro lo dice la corrida SIGUIENTE (fase 3 del PRP-009), no esta.
 * Se inyecta para que `--prueba` no dependa de nada mas. null si el commit no esta en la historia.
 */
export function repoReal(commit) {
  let ref
  try { ref = git(['rev-parse', '--verify', `${commit}^{commit}`]).trim() } catch { return null }
  const archivos = new Set(git(['ls-tree', '-r', '--name-only', ref]).split('\n').filter(Boolean))
  const prs = new Map()
  for (const bloque of git(['log', '--format=%s%x00%b%x1e', ref]).split('\x1e')) {
    const [asunto = '', cuerpo = ''] = bloque.trim().split('\x00')
    const n = asunto.match(/^Merge pull request #(\d+)/)?.[1] ?? asunto.match(/\(#(\d+)\)\s*$/)?.[1]
    if (n && !prs.has(Number(n))) prs.set(Number(n), `${asunto}\n${cuerpo}`)
  }
  const cache = new Map()
  const lee = (ruta) => {
    if (!cache.has(ruta)) cache.set(ruta, git(['show', `${ref}:${ruta}`]))
    return cache.get(ruta)
  }
  return {
    existe: (ruta) => archivos.has(ruta),
    lee,
    /** El mensaje del commit, si existe y es anterior (o igual) al analizado: no se cita el futuro. */
    commit: (sha) => {
      if (!/^[0-9a-f]{7,40}$/.test(String(sha))) return null
      try {
        execFileSync('git', ['merge-base', '--is-ancestor', String(sha), ref], { cwd: raiz, stdio: 'ignore' })
        return git(['log', '-1', '--format=%B', String(sha)])
      } catch { return null }
    },
    pr: (n) => prs.get(Number(n)) ?? null,
    scripts: JSON.parse(lee('package.json')).scripts ?? {},
    inventario: JSON.parse(lee('inventario/activos.json')).activos.map((a) => a.id),
  }
}

/** Una corrida en disco: su JSON, y una forma de leer sus archivos que la prueba puede sustituir. */
export function corridaReal(dir) {
  const base = join(raiz, dir)
  return {
    dir,
    analisis: JSON.parse(readFileSync(join(base, 'analisis.json'), 'utf8')),
    lee: (rel) => (existsSync(join(base, rel)) ? readFileSync(join(base, rel), 'utf8') : null),
  }
}

/** El literal aparece en el texto; con `linea`, cerca de ella (las lineas se mueven, la frase no). */
function contiene(texto, cita, linea) {
  const buscada = normaliza(cita)
  if (!buscada) return false
  if (!linea) return normaliza(texto).includes(buscada)
  const lineas = texto.split('\n')
  return normaliza(lineas.slice(Math.max(0, linea - 6), linea + 15).join('\n')).includes(buscada)
}

/** null si la cita vale; si no, por que. */
export function motivoDeCita(ev, corrida, repo) {
  switch (ev?.tipo) {
    case 'archivo':
    case 'registro': {
      if (ev.tipo === 'registro' && !REGISTROS.test(ev.ruta ?? '')) return `${ev.ruta} no es un registro`
      if (!repo.existe(ev.ruta)) return `${ev.ruta} no existe en el repo`
      return contiene(repo.lee(ev.ruta), ev.cita, ev.linea) ? null : `${ev.ruta} no dice «${normaliza(ev.cita).slice(0, 60)}»`
    }
    case 'commit': {
      const mensaje = repo.commit(ev.sha)
      if (mensaje === null) return `el commit ${ev.sha} no existe o es posterior al analizado`
      return contiene(mensaje, ev.cita) ? null : `el commit ${ev.sha} no dice «${normaliza(ev.cita).slice(0, 60)}»`
    }
    case 'pr': {
      const texto = repo.pr(ev.numero)
      if (texto === null) return `el PR #${ev.numero} no esta mergeado en esta historia`
      return !ev.cita || contiene(texto, ev.cita) ? null : `el merge del PR #${ev.numero} no dice «${normaliza(ev.cita).slice(0, 60)}»`
    }
    case 'medicion':
      return motivoDeMedicion(ev, corrida, repo)
    default:
      return `tipo de cita desconocido: ${ev?.tipo}`
  }
}

function motivoDeMedicion(ev, corrida, repo) {
  const propia = String(ev.archivo ?? '').startsWith(`${corrida.dir}/`)
  const texto = propia ? corrida.lee(ev.archivo.slice(corrida.dir.length + 1)) : repo.existe(ev.archivo) ? repo.lee(ev.archivo) : null
  if (texto === null) return `${ev.archivo} no existe`
  if (propia) {
    const declarado = texto.match(/^# comando: (.+)$/m)?.[1]
    if (declarado !== ev.comando) return `${ev.archivo} lo produjo «${declarado}», no «${ev.comando}»`
  } else {
    const script = String(ev.comando ?? '').match(/^npm run (\S+)$/)?.[1]
    if (!script || !repo.scripts[script]) return `«${ev.comando}» no es un script de package.json`
  }
  return contiene(texto, ev.cita) ? null : `${ev.archivo} no dice «${normaliza(ev.cita).slice(0, 60)}»`
}

/** El grado que sostienen las citas validas: el maximo. 0 = hipotesis. */
function gradoDeCitas(evidencias, corrida, repo, mete, quien) {
  let grado = 0
  for (const ev of evidencias ?? []) {
    const motivo = motivoDeCita(ev, corrida, repo)
    if (motivo) mete('E-CITA', `${quien}: ${motivo}`)
    else grado = Math.max(grado, VALOR_POR_TIPO[ev.tipo])
  }
  return grado
}

function compruebaIds(a, mete) {
  for (const [lista, forma] of Object.entries(FORMA_DE_ID)) {
    if (!Array.isArray(a[lista])) { mete('E-ESQUEMA', `falta la lista ${lista}`); continue }
    const vistos = new Set()
    for (const x of a[lista]) {
      if (!forma.test(x?.id ?? '')) mete('E-ESQUEMA', `${lista}: id con forma equivocada (${x?.id})`)
      if (vistos.has(x?.id)) mete('E-ESQUEMA', `${lista}: id repetido ${x.id}`)
      vistos.add(x?.id)
    }
  }
  for (const campo of ['fecha', 'commit', 'peticion', 'cobertura', 'ranking', 'borrador']) {
    if (a[campo] === undefined) mete('E-ESQUEMA', `falta el campo ${campo}`)
  }
}

function compruebaHallazgos(a, ctx, mete) {
  const grados = new Map()
  for (const h of a.hallazgos ?? []) {
    const calculado = gradoDeCitas(h.evidencia, ctx.corrida, ctx.repo, mete, h.id)
    grados.set(h.id, calculado)
    if (calculado === 0) mete('E-GRADO', `${h.id}: ninguna cita valida; sin cita es una hipotesis, no un hallazgo`)
    else if ((GRADOS[h.grado] ?? 0) > calculado) mete('E-GRADO', `${h.id}: declara «${h.grado}» y sus citas sostienen «${NOMBRE_DE_GRADO[calculado]}»`)
    if (!(h.activos?.length > 0)) mete('E-COBERTURA', `${h.id}: no dice a que activo le duele`)
    for (const id of h.activos ?? []) if (!ctx.repo.inventario.includes(id)) mete('E-COBERTURA', `${h.id}: ${id} no esta en el inventario`)
  }
  for (const p of a.hipotesis ?? []) if (!normaliza(p.falta)) mete('E-HIPOTESIS', `${p.id}: no dice que haria falta para confirmarla`)
  return grados
}

function compruebaCobertura(a, ctx, mete) {
  const porActivo = new Map((a.cobertura ?? []).map((c) => [c.activo, c]))
  const hallazgos = new Map((a.hallazgos ?? []).map((h) => [h.id, h]))
  for (const id of ctx.repo.inventario) if (!porActivo.has(id)) mete('E-COBERTURA', `${id} no aparece: ausente no es cero`)
  for (const c of a.cobertura ?? []) {
    if (!ctx.repo.inventario.includes(c.activo)) mete('E-COBERTURA', `${c.activo} no esta en el inventario`)
    if (!ESTADOS_DE_COBERTURA.has(c.estado)) mete('E-COBERTURA', `${c.activo}: estado «${c.estado}» desconocido`)
    if (c.estado === 'con-dolores') {
      if (!(c.hallazgos?.length > 0)) mete('E-COBERTURA', `${c.activo}: con-dolores sin hallazgos`)
      for (const id of c.hallazgos ?? []) {
        if (!hallazgos.get(id)?.activos?.includes(c.activo)) mete('E-COBERTURA', `${c.activo}: ${id} no existe o no le duele a este activo`)
      }
    }
    if (c.estado === 'sin-dolor-con-evidencia' && gradoDeCitas(c.evidencia, ctx.corrida, ctx.repo, mete, c.activo) === 0) {
      mete('E-COBERTURA', `${c.activo}: «sin dolor» sin una cita de que se miro`)
    }
    if (c.estado === 'no-mirado' && !normaliza(c.motivo)) mete('E-COBERTURA', `${c.activo}: no mirado y sin motivo`)
  }
  for (const h of a.hallazgos ?? []) {
    for (const id of h.activos ?? []) {
      if (porActivo.get(id) && !porActivo.get(id).hallazgos?.includes(h.id)) mete('E-COBERTURA', `${h.id} le duele a ${id}, pero su cobertura no lo lista`)
    }
  }
}

function compruebaArbol(a, mete) {
  const hallazgos = new Set((a.hallazgos ?? []).map((h) => h.id))
  const casos = new Set((a.casos ?? []).map((c) => c.id))
  const enCaso = new Set((a.casos ?? []).flatMap((c) => c.dolores ?? []))
  for (const h of a.hallazgos ?? []) if (!enCaso.has(h.id) && !normaliza(h.sin_caso)) mete('E-HUERFANO', `${h.id} no cae en ningun caso y no dice por que`)
  for (const c of a.casos ?? []) {
    if (!(c.dolores?.length > 0)) mete('E-HUERFANO', `${c.id}: caso sin dolores`)
    for (const id of c.dolores ?? []) if (!hallazgos.has(id)) mete('E-HUERFANO', `${c.id}: cuelga de ${id}, que no existe`)
    for (const campo of ['categoria', 'quien', 'momento', 'intenta', 'impide', 'cuesta']) if (!normaliza(c[campo])) mete('E-ESQUEMA', `${c.id}: falta «${campo}»`)
  }
  for (const p of a.candidatos ?? []) {
    if (!(p.casos?.length > 0)) mete('E-HUERFANO', `${p.id}: candidato sin casos`)
    for (const id of p.casos ?? []) if (!casos.has(id)) mete('E-HUERFANO', `${p.id}: cuelga de ${id}, que no existe`)
  }
}

function textosConMarcadores(a, corrida) {
  const textos = [['INFORME.md', corrida.lee('INFORME.md') ?? '']]
  for (const p of a.candidatos ?? []) if (p.onepager) textos.push([p.onepager, corrida.lee(p.onepager) ?? ''])
  for (const c of a.casos ?? []) textos.push([c.id, c.cuesta ?? ''])
  return textos
}

function compruebaCifras(a, ctx, mete) {
  const ids = new Set((a.cifras ?? []).map((c) => c.id))
  const usadas = new Set()
  for (const [donde, texto] of textosConMarcadores(a, ctx.corrida)) {
    for (const [, id] of texto.matchAll(MARCADOR_DE_CIFRA)) {
      usadas.add(id)
      if (!ids.has(id)) mete('E-CIFRA', `${donde} cita [${id}], que no existe`)
    }
  }
  for (const c of a.cifras ?? []) {
    if (c.evidencia?.tipo !== 'medicion') { mete('E-CIFRA', `${c.id}: una cifra sale de una medicion, no de un documento`); continue }
    const motivo = motivoDeCita(c.evidencia, ctx.corrida, ctx.repo)
    if (motivo) mete('E-CIFRA', `${c.id}: ${motivo}`)
    if (!normaliza(c.evidencia.cita).includes(normaliza(c.valor))) mete('E-CIFRA', `${c.id}: su literal no dice «${c.valor}»`)
    if (!usadas.has(c.id)) mete('E-CIFRA', `${c.id}: nadie la usa`)
  }
}

/** La solidez se calcula: el grado mas alto entre los dolores de los casos del candidato. */
function solidezDe(p, a, grados) {
  const casos = new Map((a.casos ?? []).map((c) => [c.id, c]))
  const dolores = (p.casos ?? []).flatMap((id) => casos.get(id)?.dolores ?? [])
  return Math.max(0, ...dolores.map((d) => grados.get(d) ?? 0))
}

function compruebaCandidatos(a, grados, mete) {
  const porId = new Map((a.candidatos ?? []).map((p) => [p.id, p]))
  for (const p of a.candidatos ?? []) {
    if (p.veto) {
      if (!['C3', 'C4'].includes(p.veto.control) || !normaliza(p.veto.motivo)) mete('E-VETO', `${p.id}: veto sin control C3/C4 o sin motivo`)
      if ((a.ranking ?? []).includes(p.id)) mete('E-VETO', `${p.id} esta vetado y aparece en el ranking`)
      continue
    }
    if (!(a.ranking ?? []).includes(p.id)) mete('E-VETO', `${p.id} no esta vetado y falta en el ranking`)
    const s = p.puntuacion ?? {}
    for (const f of ['frecuencia', 'severidad', 'reuso', 'esfuerzo']) {
      if (![1, 2, 3].includes(s[f]) || !normaliza(s.porque?.[f])) mete('E-PUNTUACION', `${p.id}: ${f} fuera de 1..3 o sin porque`)
    }
    const solidez = solidezDe(p, a, grados)
    if (s.solidez !== solidez) mete('E-PUNTUACION', `${p.id}: solidez ${s.solidez}, y sus dolores sostienen ${solidez}`)
    const total = Math.round(((s.frecuencia * s.severidad * solidez * s.reuso) / s.esfuerzo) * 100) / 100
    if (Math.abs((s.total ?? NaN) - total) > 0.005) mete('E-PUNTUACION', `${p.id}: total ${s.total}, y la cuenta da ${total}`)
  }
  const totales = (a.ranking ?? []).map((id) => porId.get(id)?.puntuacion?.total ?? -1)
  for (let i = 1; i < totales.length; i++) if (totales[i] > totales[i - 1]) mete('E-VETO', `el ranking no va de mayor a menor (${a.ranking[i]})`)
  for (const id of a.ranking ?? []) if (!porId.has(id)) mete('E-VETO', `el ranking nombra ${id}, que no existe`)
}

function compruebaOnepagers(a, ctx, mete) {
  const porId = new Map((a.candidatos ?? []).map((p) => [p.id, p]))
  const escritos = (a.candidatos ?? []).filter((p) => p.onepager && !p.veto)
  if (escritos.length < 3) mete('E-ONEPAGER', `hay ${escritos.length} one-pagers; hacen falta 3`)
  for (const id of (a.ranking ?? []).slice(0, 3)) if (!porId.get(id)?.onepager) mete('E-ONEPAGER', `${id} esta entre los tres primeros y no tiene one-pager`)
  for (const p of escritos) {
    const texto = ctx.corrida.lee(p.onepager)
    if (texto === null) { mete('E-ONEPAGER', `${p.id}: ${p.onepager} no existe`); continue }
    const posiciones = ORDEN_ONEPAGER.map((re) => texto.search(re))
    if (posiciones.some((x) => x < 0)) mete('E-ONEPAGER', `${p.id}: faltan secciones del orden product first`)
    else if (posiciones.some((x, i) => i > 0 && x < posiciones[i - 1])) mete('E-ONEPAGER', `${p.id}: el orden product first esta roto (usuario, tarea y coste van antes de las piezas)`)
    if (!(p.activos?.length > 0) && !normaliza(p.sin_activos_motivo)) mete('E-ONEPAGER', `${p.id}: no recombina ningun TPL-* y no dice por que`)
    for (const id of p.activos ?? []) {
      if (!ctx.repo.inventario.includes(id)) mete('E-ONEPAGER', `${p.id}: ${id} no esta en el inventario`)
      else if (!texto.includes(id)) mete('E-ONEPAGER', `${p.id}: el one-pager no nombra ${id}`)
    }
  }
}

function compruebaBorrador(a, ctx, mete) {
  const hallazgos = new Set((a.hallazgos ?? []).map((h) => h.id))
  const porId = new Map((a.borrador ?? []).map((b) => [b.id, b]))
  for (const id of hipotesisDeEntrada(a)) {
    if (!/^H\d+$/.test(id)) mete('E-ESQUEMA', `peticion: hipotesis con id «${id}»`)
    const b = porId.get(id)
    if (!b) { mete('E-BORRADOR', `${id} sin veredicto`); continue }
    if (!VEREDICTOS.has(b.veredicto)) mete('E-BORRADOR', `${id}: veredicto «${b.veredicto}» desconocido`)
    // las citas se comprueban en todo veredicto: tambien un «sin evidencia» puede afirmar algo al lado
    const citas = gradoDeCitas(b.evidencia, ctx.corrida, ctx.repo, mete, id)
    if (b.veredicto === 'sin-evidencia') { if (!normaliza(b.falta)) mete('E-BORRADOR', `${id}: sin evidencia y sin decir que falta`); continue }
    const refs = (b.hallazgos ?? []).filter((h) => hallazgos.has(h)).length
    if (refs === 0 && citas === 0) mete('E-BORRADOR', `${id}: «${b.veredicto}» sin hallazgo ni cita que lo sostenga`)
  }
}

function compruebaInforme(a, ctx, mete) {
  const informe = ctx.corrida.lee('INFORME.md')
  if (informe === null) { mete('E-INFORME', 'no hay INFORME.md'); return }
  const nombrados = [...(a.ranking ?? []), ...(a.candidatos ?? []).filter((p) => p.veto).map((p) => p.id), ...hipotesisDeEntrada(a)]
  for (const id of nombrados) if (!new RegExp(`\\b${id}\\b`).test(informe)) mete('E-INFORME', `el informe no nombra ${id}: se tiro en silencio`)
}

/** La verificacion entera. Devuelve los fallos (codigo + detalle) y un resumen para el informe. */
export function verifica(corrida, repo) {
  const fallos = []
  const mete = (codigo, detalle) => fallos.push({ codigo, detalle })
  const a = corrida.analisis
  const ctx = { corrida, repo }
  compruebaIds(a, mete)
  const grados = compruebaHallazgos(a, ctx, mete)
  compruebaCobertura(a, ctx, mete)
  compruebaArbol(a, mete)
  compruebaCifras(a, ctx, mete)
  compruebaCandidatos(a, grados, mete)
  compruebaOnepagers(a, ctx, mete)
  compruebaBorrador(a, ctx, mete)
  compruebaInforme(a, ctx, mete)
  return { fallos, resumen: resume(a, grados, repo) }
}

function resume(a, grados, repo) {
  const porGrado = { medida: 0, registrada: 0, declarada: 0 }
  for (const g of grados.values()) if (g > 0) porGrado[NOMBRE_DE_GRADO[g]]++
  const mirados = (a.cobertura ?? []).filter((c) => c.estado !== 'no-mirado' && repo.inventario.includes(c.activo)).length
  const citas = [...(a.hallazgos ?? []), ...(a.cobertura ?? []), ...(a.borrador ?? [])].reduce((n, x) => n + (x.evidencia?.length ?? 0), 0) + (a.cifras?.length ?? 0)
  return {
    cobertura: `${mirados}/${repo.inventario.length}`,
    hallazgos: a.hallazgos?.length ?? 0,
    porGrado,
    hipotesis: a.hipotesis?.length ?? 0,
    casos: a.casos?.length ?? 0,
    candidatos: a.candidatos?.length ?? 0,
    vetados: (a.candidatos ?? []).filter((p) => p.veto).length,
    cifras: a.cifras?.length ?? 0,
    citas,
  }
}

function ultimaCorrida() {
  const base = join(raiz, 'docs', 'analisis')
  const fechas = existsSync(base) ? readdirSync(base).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort() : []
  return fechas.length ? `docs/analisis/${fechas.at(-1)}` : null
}

/** La prueba de la prueba: sobre una copia en memoria de una corrida en verde, cada siembra cae. */
function prueba(dir, repo) {
  const base = corridaReal(dir)
  const limpio = verifica(base, repo)
  if (limpio.fallos.length > 0) {
    console.log(`✗ la corrida base no esta en verde (${limpio.fallos.length} fallos): una siembra «cazada» sobre rojo no prueba nada`)
    return 1
  }
  let cazadas = 0
  for (const s of SIEMBRAS) {
    const analisis = structuredClone(base.analisis)
    let sustitutos
    try { sustitutos = s.siembra(analisis, base) ?? {} } catch (e) {
      console.log(`  ✗ ${s.nombre} → no se pudo sembrar: ${e.message}`)
      continue
    }
    const corrida = { dir, analisis, lee: (rel) => (rel in sustitutos ? sustitutos[rel] : base.lee(rel)) }
    const cae = verifica(corrida, repo).fallos.some((f) => f.codigo === s.espera)
    if (cae) cazadas++
    console.log(`  ${cae ? '✓' : '✗'} ${s.nombre} → ${s.espera}${cae ? '' : ' (NO cayo)'}`)
  }
  console.log(`\nprueba de la prueba: ${cazadas} de ${SIEMBRAS.length} siembras cazadas`)
  return cazadas === SIEMBRAS.length ? 0 : 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const dir = args.find((x) => !x.startsWith('--')) ?? ultimaCorrida()
  if (!dir || !existsSync(join(raiz, dir, 'analisis.json'))) {
    console.error('no hay corrida que verificar (docs/analisis/<fecha>/analisis.json)')
    process.exit(1)
  }
  const corrida = corridaReal(dir)
  const repo = repoReal(corrida.analisis.commit)
  if (!repo) {
    console.error(`✗ E-ESQUEMA  el commit analizado (${corrida.analisis.commit}) no esta en esta historia: la corrida no se puede verificar; vuelve a correr el analista`)
    process.exit(1)
  }
  if (args.includes('--prueba')) process.exit(prueba(dir, repo))
  const { fallos, resumen } = verifica(corrida, repo)
  const r = resumen
  console.log(`Corrida ${dir}`)
  console.log(`  cobertura del inventario   ${r.cobertura}`)
  console.log(`  hallazgos                  ${r.hallazgos} (medida ${r.porGrado.medida} · registrada ${r.porGrado.registrada} · declarada ${r.porGrado.declarada})`)
  console.log(`  hipotesis aparte           ${r.hipotesis}`)
  console.log(`  casos de uso               ${r.casos}`)
  console.log(`  candidatos                 ${r.candidatos} (vetados ${r.vetados})`)
  console.log(`  cifras con su comando      ${r.cifras}`)
  console.log(`  citas comprobadas          ${r.citas}`)
  for (const f of fallos) console.log(`  ✗ ${f.codigo}  ${f.detalle}`)
  console.log(fallos.length === 0 ? '\n✓ Evidencia verificada: cada hallazgo con su cita, nada tirado en silencio.' : `\n✗ ${fallos.length} fallos: el informe afirma algo que su evidencia no sostiene.`)
  process.exit(fallos.length === 0 ? 0 : 1)
}
