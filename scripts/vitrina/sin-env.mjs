#!/usr/bin/env node
/**
 * El candado de `.env` del despliegue de la vitrina (incidente del 2026-10-12). `@vercel/next` mete en CADA función
 * todo `.env` y `.env.*` de la raíz, sin mirar outputFileTracingExcludes: su nube construye desde Git y no los ve, pero
 * la vitrina se construye aquí. El `.env.local` con un token que deja `vercel link` viajó así en dos despliegues.
 * Lo corre `despliega.sh` entre el build y la subida: si una función lleva un `.env*` que no está en Git, no se sube.
 * Uso: node scripts/vitrina/sin-env.mjs [salida de vercel build, por defecto .vercel/output]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Los `.env*` que las funciones de `salida` llevarían a Vercel y no están en `enGit`, ordenados. */
export function envFueraDeGit(salida, enGit) {
  const fuera = new Set()
  const recorre = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) { recorre(p); continue }
      if (n !== '.vc-config.json') continue
      for (const v of Object.values(JSON.parse(readFileSync(p, 'utf8')).filePathMap ?? {})) {
        if (/^\.env/.test(basename(v)) && !enGit.has(v)) fuera.add(v)
      }
    }
  }
  recorre(join(salida, 'functions'))
  return [...fuera].sort()
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const enGit = new Set(execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n'))
  const fuera = envFueraDeGit(process.argv[2] ?? '.vercel/output', enGit)
  if (fuera.length) {
    console.error(`✗ no se sube: ${fuera.join(', ')} iría dentro de cada función. Sácalo de la raíz del worktree y vuelve a correrlo.`)
    process.exit(1)
  }
  console.log('✓ ningún .env fuera de Git va en las funciones')
}
