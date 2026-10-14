/**
 * Imprime la suite de la sala sin sabotaje y con cada sabotaje: qué comprobación cae.
 * Uso: node tools/sala-a2a/evidencia/sabotajes.ts   · Exit 1 si un sabotaje no se caza o la base no está en verde.
 */
import { baseSala, corre, SABOTAJES } from '../pruebas/_suite.ts'

let malo = false
const base = await corre(await baseSala())
console.log('## Sin sabotaje\n\n| Comprobación | Clase | Qué intenta | |\n|---|---|---|---|')
for (const c of base) console.log(`| ${c.id} | ${c.clase} | ${c.que} | ${c.ok ? '✓ verde' : '✗ ROJO'} |`)
if (base.some((c) => !c.ok)) malo = true

console.log('\n## Con cada sabotaje (base nueva por sabotaje)\n\n| Sabotaje | Qué se siembra | Cayeron | ¿Cazado? |\n|---|---|---|---|')
for (const s of SABOTAJES) {
  const r = await corre(await baseSala(s.sql ?? ''), s.opciones ?? {})
  const rojas = r.filter((c) => !c.ok).map((c) => c.id)
  const cazado = s.caza.every((id) => rojas.includes(id))
  if (!cazado) malo = true
  console.log(`| ${s.id} | ${s.que} | ${rojas.join(', ') || '—'} | ${cazado ? '✓ ROJO, como debe' : '✗ NO CAZADO'} |`)
}
console.log(`\n${malo ? '✗ la suite no vigila lo que dice' : `✓ base en verde (${base.length}/${base.length}) y ${SABOTAJES.length}/${SABOTAJES.length} sabotajes cazados`} · Postgres efímero (PGlite)`)
process.exit(malo ? 1 : 0)
