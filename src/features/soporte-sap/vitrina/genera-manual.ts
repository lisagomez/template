/**
 * Escribe el manual de usuario en Markdown, desde la misma fuente que la vitrina (`contenido/manual.ts`). Una prueba
 * exige que el archivo del repo y la fuente digan lo mismo.
 *
 * Uso: node src/features/soporte-sap/vitrina/genera-manual.ts [--comprueba]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { EN_PRODUCCION, MANUAL } from './contenido/manual.ts'
import { ARCHIVOS_DE_CAPTURA } from './contenido/capturas.ts'

export const RUTA_DEL_MANUAL = 'src/features/soporte-sap/MANUAL.md'

export function manualEnMarkdown(): string {
  const l: string[] = [
    '<!-- ALTO: ARTEFACTO AUTOGENERADO desde vitrina/contenido/manual.ts. No lo edites a mano: node src/features/soporte-sap/vitrina/genera-manual.ts -->',
    '# Manual de usuario — Soporte SAP',
    '',
    '> Se genera desde `src/features/soporte-sap/vitrina/contenido/manual.ts` con `node src/features/soporte-sap/vitrina/genera-manual.ts`:',
    '> no se edita a mano. Lo mismo se lee en la vitrina, en `/vitrina/soporte-sap/manual`.',
    '',
    '## Esto es el laboratorio: en producción será distinto',
    '',
    ...EN_PRODUCCION.map((x) => `- ${x}`),
    '',
  ]
  for (const m of MANUAL) {
    l.push(`## ${m.titulo}`, '', `${m.quien} En el laboratorio: ${m.entra}`, '')
    for (const s of m.secciones) {
      l.push(`### ${s.titulo}`, '', `Para qué: ${s.para}`, '', ...s.pasos.map((x, k) => `${k + 1}. ${x}`), '')
      if (s.ojo) l.push(`> **Ojo:** ${s.ojo}`, '')
      if (s.captura) l.push(`![${s.titulo}](../../../public/vitrina/soporte-sap/capturas/${ARCHIVOS_DE_CAPTURA[s.captura]})`, '')
    }
  }
  return `${l.join('\n').trimEnd()}\n`
}

if (import.meta.url === `file://${resolve(process.argv[1] ?? '')}`) {
  const ruta = join(process.cwd(), RUTA_DEL_MANUAL)
  if (process.argv.includes('--comprueba')) {
    const igual = readFileSync(ruta, 'utf8') === manualEnMarkdown()
    console.log(igual ? '✓ el manual del repo dice lo mismo que su fuente' : '✗ el manual del repo no es el de su fuente: vuelve a generarlo')
    process.exit(igual ? 0 : 1)
  }
  writeFileSync(ruta, manualEnMarkdown())
  console.log(`✓ ${RUTA_DEL_MANUAL}`)
}
