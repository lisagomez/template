#!/usr/bin/env node
/**
 * ss-respaldo — el simulacro de restauración POR TENANT en un Postgres efímero (PGlite): export de
 * una consultora, daño sembrado, restauración solo de ella y verificación de que la vecina no
 * cambió. No toca ninguna base real: contra producción, `exportaTenant` y `restauraTenant` corren
 * como job de plataforma declarado (C7), no desde este CLI.
 *
 * Uso:  ss-respaldo simulacro
 */
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ayuda } from '../dist/index.js'

export const DESCRIPCION = { nombre: 'ss-respaldo', que: 'simulacro de restauración por tenant en efímero, cronometrado S/M/L', uso: 'ss-respaldo simulacro', readOnly: true, dryRunPorDefecto: false }

const [orden] = process.argv.slice(2)
if (orden !== 'simulacro') { console.log(ayuda(DESCRIPCION)); process.exit(orden === '--help' ? 0 : 2) }
const r = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), '..', 'evidencia', 'respaldo.ts')], { stdio: 'inherit' })
process.exit(r.status ?? 1)
