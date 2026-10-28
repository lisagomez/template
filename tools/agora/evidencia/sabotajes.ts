/**
 * Los sabotajes de cada fase: en una base NUEVA se siembra el defecto y se corre la suite entera de la fase; la
 * comprobación que el sabotaje apunta tiene que CAER. Antes, la suite limpia tiene que estar en verde. Imprime la
 * versión del servidor: la evidencia dice dónde corrió (PGlite o Postgres real).
 *
 * Uso: node evidencia/sabotajes.ts [--fase nucleo] [--json]   ·   con AGORA_PG_URL corre en Postgres real.
 * Exit: 0 si la suite limpia pasa y todos los sabotajes caen · 1 si no.
 */
import { corre, preparada } from '../pruebas/_marco.ts'
import { FASES } from '../pruebas/_fases.ts'

const verde = (s: string) => `\x1b[32m${s}\x1b[0m`
const rojo = (s: string) => `\x1b[31m${s}\x1b[0m`
const gris = (s: string) => `\x1b[2m${s}\x1b[0m`
const i = process.argv.indexOf('--fase')
const pedida = i > 0 ? process.argv[i + 1] : undefined
const fases = Object.entries(FASES).filter(([k]) => !pedida || k === pedida)
if (!fases.length) { console.error(rojo(`no hay fase ${pedida}: ${Object.keys(FASES).join(', ')}`)); process.exit(1) }

let malas = 0
const limpia = await preparada()
console.log(`Servidor: ${(await limpia.base.version()).split(' on ')[0]} (${limpia.base.motor})`)
for (const [clave, f] of fases) {
  console.log(`\n\x1b[1m${f.titulo}\x1b[0m`)
  const r = await corre(limpia.c, f.comprobaciones)
  for (const x of r) console.log(`  ${x.ok ? verde('✓') : rojo('✗')} ${x.nombre}${x.ok ? '' : rojo(` — ${x.error}`)}`)
  const fallan = r.filter((x) => !x.ok).length
  if (fallan) malas += fallan
  console.log(fallan ? rojo(`  suite EN ROJO: ${fallan} de ${r.length}`) : verde(`  suite en verde: ${r.length}/${r.length}`))
  console.log(gris(`  sabotajes (cada uno sobre una base nueva; su comprobación tiene que caer):`))
  for (const s of f.sabotajes) {
    const b = await preparada(s.sql).catch((e: Error) => ({ error: e }))
    if ('error' in b) { console.log(`  ${verde('✓ bloqueado al sembrar')} ${s.nombre} ${gris(`(${b.error.message.split('\n')[0]})`)}`); continue }
    const rs = await corre(b.c, f.comprobaciones)
    await b.cierra()
    const cayeron = rs.filter((x) => !x.ok && s.caza.test(x.nombre))
    if (cayeron.length) console.log(`  ${verde('✓ cae')}  ${s.nombre} ${gris(`→ ${cayeron.map((x) => x.nombre).join(' · ')}`)}`)
    else { malas++; console.log(`  ${rojo('✗ NO cae')} ${s.nombre}`) }
  }
  void clave
}
await limpia.cierra()
console.log(malas ? rojo(`\nEN ROJO: ${malas}`) : verde(`\nTodo en verde: suites limpias y cada sabotaje cazado.`))
process.exit(malas ? 1 : 0)
