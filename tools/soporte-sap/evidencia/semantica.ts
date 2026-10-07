/**
 * La misma métrica del mismo periodo en cada superficie, leída del corte semántico.
 * Uso: node tools/soporte-sap/evidencia/semantica.ts   (el corte lo produce semantica/corre.mjs)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  tableroN1, tableroN2, tableroN3, estadoSla, insumosPricing, respondeMetrica, contratoDeLaboratorio, type Corte, type Lector, type ContratoSla,
} from '../dist/index.js'
import { HERRAMIENTA } from '../pruebas/_ayuda.ts'

const corte: Corte = JSON.parse(readFileSync(join(HERRAMIENTA, 'semantica', 'corte.json'), 'utf8'))
const P = '2026-09'
const N1: Lector = { nivel: 'N1' }, N2: Lector = { nivel: 'N2', consultora: 'andina' }, N3: Lector = { nivel: 'N3', consultora: 'andina', cliente: 'alimentos-del-bajio' }
const ent = {
  andina: { tipo: 'consultora' as const, nombre: 'Consultora Andina' },
  'alimentos-del-bajio': { tipo: 'cliente' as const, nombre: 'Alimentos del Bajío', consultora: 'andina' },
}
const k = contratoDeLaboratorio('andina', 'alimentos-del-bajio', '2026-04-01')
const c: ContratoSla = { ...k, id: 'sla-andina', nivel: 'N1-N2', cliente: null }
const v = (x: { valor: number | null } | undefined) => (x?.valor ?? 'sin dato')
const t = (xs: ReadonlyArray<{ nombre: string; valor: number | null }>, m: string) => v(xs.find((y) => y.nombre === m))

console.log(`Corte ${corte.version.slice(0, 19)} · ${corte.metricas.filter((m) => !m.auxiliar).length} métricas del ciclo de vida · ${corte.filas.length} valores · generado con ${Object.entries(corte.generadoCon).map(([a, b]) => `${a} ${b.slice(0, 20)}`).join(', ')}\n`)
for (const [m, frase] of [['mttr_horas', 'el MTTR'], ['cumplimiento_sla_respuesta', 'el cumplimiento de SLA de respuesta']] as const) {
  const n1 = tableroN1(corte, P), n2 = tableroN2(corte, 'andina', P), n3 = tableroN3(corte, 'andina', 'alimentos-del-bajio', P)
  const delSla = (s: ReturnType<typeof estadoSla>) => v(m === 'mttr_horas' ? s.mttrHoras : s.respuesta)
  const delPr = (p: ReturnType<typeof insumosPricing>) => v(m === 'mttr_horas' ? p.mttrHoras : p.cumplimientoSlaRespuesta)
  console.log(`«${m}» · ${P}\n| Superficie | Consultora Andina | Cliente Alimentos del Bajío |\n|---|---|---|`)
  console.log(`| Tablero N1 (laboratorio) | ${t(n1.porConsultora.find((x) => x.consultora === 'andina')!.tarjetas, m)} | — (el N1 no ve clientes) |`)
  console.log(`| Tablero N2 (consultora) | ${t(n2.propio, m)} | ${t(n2.clientes.find((x) => x.cliente === 'alimentos-del-bajio')!.tarjetas, m)} |`)
  console.log(`| Tablero N3 (cliente) | — | ${t(n3.tarjetas, m)} |`)
  console.log(`| SLA (N1–N2 / N2–N3) | ${delSla(estadoSla(corte, N1, c, P))} | ${delSla(estadoSla(corte, N3, k, P))} |`)
  console.log(`| Pricing (insumos) | ${delPr(insumosPricing(corte, N2, 'andina', P))} | ${delPr(insumosPricing(corte, N2, 'andina', P, 'alimentos-del-bajio'))} |`)
  const q = (quien: string) => `¿Cuál fue ${frase} de ${quien} en septiembre de 2026?`
  console.log(`| Chat del HIL | ${v(respondeMetrica(corte, N1, q('Consultora Andina'), ent))} (N1) · ${v(respondeMetrica(corte, N2, q('Consultora Andina'), ent))} (N2) | ${v(respondeMetrica(corte, N2, q('Alimentos del Bajío'), ent))} (N2) · ${v(respondeMetrica(corte, N3, q('Alimentos del Bajío'), ent))} (N3) |\n`)
}
const r = respondeMetrica(corte, N2, '¿Cuál fue el MTTR de Alimentos del Bajío en septiembre de 2026?', ent)
console.log(`Chat: «${r.texto}» — fuente: ${r.fuente}`)
console.log(`Chat sin fuente: «${respondeMetrica(corte, N2, '¿Cuál es el NPS de Alimentos del Bajío en septiembre de 2026?', ent).texto}»`)
const etapas = corte.filas.filter((f) => f.metrica === 'clientes_en_cartera' && f.alcance === 'cliente' && f.valor && (f.periodo === '2026-06' || f.periodo === P))
console.log(`\nCiclo de vida por cliente: ${['2026-06', P].map((p) => `${p}: ${etapas.filter((f) => f.periodo === p).map((f) => `${f.cliente} ${f.etapa}`).join(', ')}`).join(' · ')}`)
