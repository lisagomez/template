/**
 * El entorno Python de MetricFlow, pineado por el lock con hashes (`semantica/requirements.lock`), igual que la
 * casa (`tools/clinica-dental/semantica/corre.mjs`): vive en `~/.cache/estudio-dashboards-semantica/venv-<huella
 * del lock>`, así que un lock nuevo es un entorno nuevo y nunca se mezcla con el anterior.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * `semantica/` del paquete: desde `dist/metricflow/` sube dos niveles.
 *
 * `turbopackIgnore` en cada ruta que se decide al ejecutar (el venv, el lock, el servidor): empaquetado por Next, sin
 * el comentario Turbopack las rastrea como patrón por todo el proyecto y revienta en cualquier venv local con un enlace
 * fuera de la raíz (el del banco de `tools/dictado`, 2026-10-29). Fuera de Turbopack el comentario no hace nada.
 */
export const DIR_SEMANTICA = join(/*turbopackIgnore: true*/ dirname(fileURLToPath(import.meta.url)), '..', '..', 'semantica')
export const LOCK = join(/*turbopackIgnore: true*/ DIR_SEMANTICA, 'requirements.lock')
export const SERVIDOR = join(/*turbopackIgnore: true*/ DIR_SEMANTICA, 'servidor_mf.py')

export function huellaLock(lock: string = LOCK): string {
  return createHash('sha256').update(readFileSync(/*turbopackIgnore: true*/ lock)).digest('hex').slice(0, 12)
}

/** El entorno del lock. `lock` explícito cuando este módulo corre empaquetado (Next) y `import.meta.url` no es el paquete. */
export function dirEntorno(lock: string = LOCK): string {
  return process.env['ESTUDIO_MF_VENV'] ?? join(/*turbopackIgnore: true*/ homedir(), '.cache', 'estudio-dashboards-semantica', `venv-${huellaLock(lock)}`)
}

/** Variables para dbt y MetricFlow: sin telemetría, siempre. */
export const SIN_TELEMETRIA = { DBT_SEND_ANONYMOUS_USAGE_STATS: 'false', DO_NOT_TRACK: '1', MF_DISABLE_UPDATE_CHECK: '1' } as const

/** Crea el entorno si falta (requiere `uv`); devuelve la ruta y si ya estaba. */
export function aseguraEntorno(): { dir: string; estado: 'ya estaba' | 'creado' } {
  const dir = dirEntorno()
  if (existsSync(/*turbopackIgnore: true*/ join(dir, 'bin', 'dbt')) && existsSync(/*turbopackIgnore: true*/ join(dir, 'bin', 'python'))) return { dir, estado: 'ya estaba' }
  mkdirSync(/*turbopackIgnore: true*/ dirname(dir), { recursive: true })
  for (const args of [['venv', '--python', '3.12', dir], ['pip', 'sync', '--python', join(/*turbopackIgnore: true*/ dir, 'bin', 'python'), '--require-hashes', LOCK]]) {
    const r = spawnSync(/*turbopackIgnore: true*/ 'uv', args, { encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`uv ${args[0]} falló: ${(r.stderr ?? '').slice(-2000)}`)
  }
  return { dir, estado: 'creado' }
}
