/**
 * Corre la matriz de trazabilidad de la AISIA y del C3 (`firmas/matriz.ts`): cada fila «probado», su prueba
 * sin sabotaje (debe pasar) y con su sabotaje (debe CAER). El sabotaje edita el archivo del control en su
 * sitio y lo restaura siempre; si un archivo versionado tiene cambios sin commit, no corre.
 *
 * Uso: node tools/soporte-sap/evidencia/firmas.ts [--fila <id>] [--md <ruta>]
 * Exit: 0 si todas las probadas pasan sin sabotaje y caen con él · 1 si no · 2 si no puede correr.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FILAS, HALLAZGOS, type Comprobacion, type Edicion, type Fila } from '../firmas/matriz.ts'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const arg = (n: string): string | null => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] ?? null : null }
const escapa = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

interface Corrida { readonly ok: boolean; readonly cae: boolean; readonly resumen: string }

function corre(c: Comprobacion): Corrida {
  const args = c.tipo === 'prueba'
    ? ['--test', '--test-reporter=tap', `--test-name-pattern=^${escapa(c.nombre)}$`, c.archivo]
    : c.comando.slice(1)
  const exe = c.tipo === 'prueba' ? process.execPath : c.comando[0] === 'node' ? process.execPath : c.comando[0]!
  const r = spawnSync(exe, args, { cwd: join(RAIZ, c.carpeta), encoding: 'utf8', timeout: 600_000, env: { ...process.env, NO_COLOR: '1' } })
  const salida = `${r.stdout ?? ''}${r.stderr ?? ''}`
  const n = (k: string) => Number(new RegExp(`^# ${k} (\\d+)$`, 'm').exec(salida)?.[1] ?? NaN)
  if (c.tipo === 'prueba') {
    const tests = n('tests'), fail = n('fail')
    return { ok: r.status === 0 && tests >= 1 && fail === 0, cae: r.status !== 0 && tests >= 1 && fail >= 1, resumen: `${tests} prueba(s), ${fail} en rojo` }
  }
  return { ok: r.status === 0, cae: r.status !== 0, resumen: `exit ${r.status}` }
}

/** ¿El archivo versionado tiene cambios sin commit? Un sabotaje no se aplica sobre trabajo ajeno. */
function sucio(archivo: string): boolean {
  const r = spawnSync('git', ['status', '--porcelain', '--', archivo], { cwd: RAIZ, encoding: 'utf8' })
  return r.status !== 0 || r.stdout.trim().length > 0
}

const originales = new Map<string, string>()
function restaura(): void {
  for (const [ruta, texto] of originales) writeFileSync(ruta, texto)
  originales.clear()
}
process.on('exit', restaura)
for (const s of ['SIGINT', 'SIGTERM'] as const) process.on(s, () => { restaura(); process.exit(130) })

/** Aplica las ediciones (cada `buscar` debe aparecer UNA vez) y devuelve la función que restaura. */
export function aplica(ediciones: readonly Edicion[]): void {
  for (const e of ediciones) {
    const ruta = join(RAIZ, e.archivo)
    if (!existsSync(ruta)) throw new Error(`no existe ${e.archivo}`)
    if (!originales.has(ruta)) {
      if (!e.archivo.includes('/dist/') && sucio(e.archivo)) throw new Error(`${e.archivo} tiene cambios sin commit: no se sabotea`)
      originales.set(ruta, readFileSync(ruta, 'utf8'))
    }
    const actual = readFileSync(ruta, 'utf8')
    const veces = actual.split(e.buscar).length - 1
    if (veces !== 1) throw new Error(`${e.archivo}: «${e.buscar.slice(0, 60)}» aparece ${veces} veces`)
    writeFileSync(ruta, actual.replace(e.buscar, () => e.poner))
  }
}

interface Resultado { readonly fila: Fila; readonly base: string; readonly conSabotaje: string; readonly bien: boolean }

function evalua(f: Fila): Resultado {
  if (f.estado !== 'probado' || !f.comprobacion || !f.sabotaje) return { fila: f, base: '—', conSabotaje: '—', bien: f.estado !== 'probado' }
  const base = corre(f.comprobacion)
  if (!base.ok) return { fila: f, base: `✗ ROJO (${base.resumen})`, conSabotaje: 'no se corre', bien: false }
  if ('integrado' in f.sabotaje) return { fila: f, base: `✓ verde (${base.resumen})`, conSabotaje: '✓ cazado por la propia suite', bien: true }
  try {
    aplica(f.sabotaje.ediciones)
    const s = corre(f.comprobacion)
    return { fila: f, base: `✓ verde (${base.resumen})`, conSabotaje: s.cae ? `✓ ROJO (${s.resumen})` : `✗ NO CAE (${s.resumen})`, bien: s.cae }
  } catch (e) {
    return { fila: f, base: `✓ verde (${base.resumen})`, conSabotaje: `✗ no se pudo sembrar: ${(e as Error).message}`, bien: false }
  } finally {
    restaura()
  }
}

const celda = (s: string) => s.replaceAll('|', '\\|').replaceAll('\n', ' ')
const pruebaDe = (c: Comprobacion | undefined) => !c ? '—' : c.tipo === 'prueba' ? `\`${c.carpeta}/${c.archivo}\` · «${c.nombre}»` : `\`${c.comando.join(' ')}\` (en \`${c.carpeta}\`)`

function markdown(rs: readonly Resultado[]): string {
  const l: string[] = []
  for (const doc of ['AISIA', 'C3'] as const) {
    l.push(`### ${doc}`, '', '| Daño o control | Afirmación | Control | Prueba | Sabotaje | Sin sabotaje | Con sabotaje | Estado |', '|---|---|---|---|---|---|---|---|')
    for (const r of rs.filter((x) => x.fila.doc === doc)) {
      const f = r.fila
      const estado = f.estado === 'probado' ? (r.bien ? 'probado' : '**FALLA**') : `${f.estado}: ${f.nota ?? ''}`
      l.push(`| ${celda(f.ref)}${f.infirmable ? ' *(infirmable)*' : ''} | ${celda(f.afirmacion)} | ${celda(f.control)} | ${celda(pruebaDe(f.comprobacion))} | ${celda(f.sabotaje?.que ?? '—')} | ${r.base} | ${r.conSabotaje} | ${celda(estado)} |`)
    }
    l.push('')
  }
  return l.join('\n')
}

const solo = (arg('--filas') ?? arg('--fila'))?.split(',').filter(Boolean) ?? null
const filas = solo ? FILAS.filter((f) => solo.includes(f.id)) : FILAS
if (!filas.length || (solo && filas.length !== solo.length)) { console.error(`no existen todas las filas: ${solo?.join(', ')}`); process.exit(2) }

const resultados: Resultado[] = []
for (const f of filas) {
  const r = evalua(f)
  resultados.push(r)
  const marca = f.estado !== 'probado' ? `· ${f.estado}` : r.bien ? '✓' : '✗'
  console.log(`${marca} ${f.id} — ${r.base} · ${r.conSabotaje}`)
}

const cuenta = (d: string, e: string) => resultados.filter((r) => r.fila.doc === d && r.fila.estado === e).length
const fallas = resultados.filter((r) => !r.bien)
console.log(`\nAISIA: ${cuenta('AISIA', 'probado')} probadas · ${cuenta('AISIA', 'brecha')} brechas · ${cuenta('AISIA', 'depende')} dependen de una D`)
console.log(`C3:    ${cuenta('C3', 'probado')} probadas · ${cuenta('C3', 'brecha')} brechas · ${cuenta('C3', 'depende')} dependen de una D`)
console.log(`Afirmaciones sin prueba que se pusiera roja al empezar: ${HALLAZGOS.length} (${HALLAZGOS.filter((h) => h.resolucion === 'codigo').length} con código y prueba, ${HALLAZGOS.filter((h) => h.resolucion === 'prueba').length} solo con prueba, ${HALLAZGOS.filter((h) => h.resolucion === 'texto').length} corrigiendo el texto, ${HALLAZGOS.filter((h) => h.resolucion === 'brecha').length} como brecha)`)
const md = arg('--md')
if (md) { writeFileSync(join(RAIZ, md), markdown(resultados)); console.log(`matriz escrita en ${md}`) }
console.log(fallas.length ? `\n✗ ${fallas.length} fila(s) en falla: ${fallas.map((r) => r.fila.id).join(', ')}` : `\n✓ ${resultados.filter((r) => r.fila.estado === 'probado').length}/${resultados.filter((r) => r.fila.estado === 'probado').length} probadas: verdes sin sabotaje y rojas con él`)
process.exit(fallas.length ? 1 : 0)
