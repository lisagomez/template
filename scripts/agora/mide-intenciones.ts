/**
 * Mide el enrutador de intenciones de la capa con las intenciones REALES de Ágora (su composición y sus enchufes),
 * sin LLM, contra un corpus congelado antes de medir (`tools/agora/medicion/corpus-*.json`, con su huella). Mide por
 * el camino de la CONVERSACIÓN de la capa (lo que vive la persona: incluye «recuerda que…»), no solo el enrutador.
 * Como el corpus D de la capa: la tasa de acierto se DECLARA (y si cae, se dice). Lo que no se negocia sale aparte y
 * pone la salida en 1: una frase que no pide escribir y cae en una intención que escribe, o una irreversible que nadie
 * pidió.
 *
 * Uso: node scripts/agora/mide-intenciones.ts [corpus] [--escribe <nombre>]   (deja la medición en la evidencia del goal)
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { AlmacenEnMemoria, compone, creaConversacion, creaMemoria, UMBRAL, MARGEN, type Enchufe, type Manejadores } from '../../tools/capa/dist/index.js'

const RAIZ = resolve(import.meta.dirname, '../..')
const lee = (p: string) => readFileSync(join(RAIZ, p), 'utf8')
const RUTA = process.argv.slice(2).find((a) => a.endsWith('.json')) ?? 'tools/agora/medicion/corpus-intenciones.json'
const crudo = lee(RUTA)
const corpus = JSON.parse(crudo) as { corpus: string; frases: Array<[string, string]> }
const enchufes: Enchufe[] = [...lee('src/shared/capa/enchufes.ts').matchAll(/'([^']+\/enchufe\.json)'/g)].map((m) => m[1]!).filter((a) => !a.startsWith('.')).map((a) => JSON.parse(lee(a)))
const r = compone(JSON.parse(lee('productos/composiciones/agora.json')), enchufes)
if (!r.ok) { console.error(`la composición de Ágora no compone: ${r.problemas.join('; ')}`); process.exit(2) }
const intenciones = r.producto.intenciones
const de = (id: string) => intenciones.find((i) => i.id === id)
const permisos = r.producto.permisos
const nada: Manejadores = Object.fromEntries(intenciones.map((i) => [i.id, async () => ({ texto: 'medido' })]))

const fallos: Array<{ frase: string; esperada: string; salio: string }> = []
let aciertos = 0, escrituraNoPedida = 0, irreversibleNoPedida = 0
for (const [frase, esperada] of corpus.frases) {
  // Una conversación nueva por frase: nada de lo anterior influye. La intención es la del mensaje del asistente.
  const memoria = creaMemoria({ almacen: new AlmacenEnMemoria(), producto: 'agora', inquilino: 'medicion', permisos })
  const c = creaConversacion({ intenciones, manejadores: nada, memoria, nivel: 'lo-importante' })
  const m = await c.envia(frase, 'teclado')
  const elegida = m?.intencion ? de(m.intencion) : undefined
  const salio = elegida?.id ?? (m?.estado === 'ambigua' ? 'ambigua' : 'no-se')
  const bien = esperada === 'no-se' || esperada === 'ambigua' ? !elegida : salio === esperada
  if (bien) aciertos++
  else fallos.push({ frase, esperada, salio })
  const pidioEscribir = de(esperada)?.efecto === 'escribe'
  if (elegida?.efecto === 'escribe' && !pidioEscribir) escrituraNoPedida++
  if (elegida?.irreversible && salio !== esperada) irreversibleNoPedida++
}
const total = corpus.frases.length
const medicion = {
  corpus: { ruta: RUTA, sha256: `sha256:${createHash('sha256').update(crudo).digest('hex')}`, frases: total },
  enrutador: { de: '@tu-scope/capa (la conversación con su enrutador, sin LLM)', umbral: UMBRAL, margen: MARGEN, intenciones: intenciones.length },
  medicion: { total, aciertos, acierto: Math.round((1000 * aciertos) / total) / 10, escrituraNoPedida, irreversibleNoPedida, fallos },
}
console.log(`Intenciones de Ágora: ${aciertos}/${total} (${medicion.medicion.acierto} %) con ${intenciones.length} intenciones · corpus ${medicion.corpus.sha256.slice(0, 19)}…`)
console.log(`  escrituras que nadie pidió: ${escrituraNoPedida} · irreversibles que nadie pidió: ${irreversibleNoPedida}`)
for (const f of fallos) console.log(`  · «${f.frase}»: esperaba ${f.esperada}, salió ${f.salio}`)
const k = process.argv.indexOf('--escribe')
if (k > 0) writeFileSync(join(RAIZ, `docs/goals/agora-a2a-evidencia/intenciones-${process.argv[k + 1] ?? 'medicion'}.json`), `${JSON.stringify({ fecha: new Date().toISOString(), ...medicion }, null, 2)}\n`)
process.exit(escrituraNoPedida || irreversibleNoPedida ? 1 : 0)
