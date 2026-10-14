#!/usr/bin/env node
/**
 * Aterriza la firma del laboratorio sobre la AISIA v3 y el contrato de Soporte SAP (PRP-010, fase 5).
 *
 * LA FIRMA LA ESCRIBE EL LABORATORIO, a mano y en dos líneas; este guion no escribe ninguna:
 *   · la AISIA (`docs/goals/soporte-sap-AISIA.md`):  «Firmada por: <nombre>  Rol: <rol>  Fecha: <AAAA-MM-DD>»;
 *   · el contrato (`src/features/soporte-sap/BUSINESS_LOGIC.md`):  «**Firma:** <nombre> (<rol>) · Fecha: <AAAA-MM-DD> …».
 * Si falta una de las dos, o sigue en blanco o «pendiente», no toca nada y lo dice.
 *
 * Con las dos firmas hace solo lo mecánico, todo o nada (calcula cada cambio antes de escribir):
 *   · mueve la AISIA a `.claude/gobernanza/AISIA-soporte-sap.md`, con su estado y su enlace a la matriz;
 *   · el manifiesto (`contrato.aisia`, `contrato.firma`), el índice del portafolio, el C3 (PRP-008), el §6 del
 *     contrato y el informe de la corrida A apuntan a la AISIA firmada.
 *
 * Uso: node tools/soporte-sap/firmas/aterriza.mjs [--prueba] [--raiz <dir>]
 *   --prueba  dice lo que cambiaría, sin escribir.
 * Exit: 0 si aterrizó (o ya estaba) · 1 si falta una firma o un texto no está donde se espera.
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const RUTAS = {
  borrador: 'docs/goals/soporte-sap-AISIA.md',
  firmada: '.claude/gobernanza/AISIA-soporte-sap.md',
  contrato: 'src/features/soporte-sap/BUSINESS_LOGIC.md',
  c3: '.claude/PRPs/PRP-008-soporte-sap.md',
  manifiesto: 'productos/soporte-sap.json',
  indice: 'BUSINESS_LOGIC.md',
  informe: 'docs/goals/soporte-sap-informe-a.md',
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const enBlanco = (x) => !x || /_{3,}|\[|pendiente/i.test(x)

/** La firma de la AISIA, o el motivo por el que no está. */
export function firmaDeLaAisia(texto) {
  const m = /^Firmada por:\s*(.*?)\s+Rol:\s*(.*?)\s+Fecha:\s*(\S*)\s*$/m.exec(texto)
  if (!m) return { error: 'la AISIA no tiene la línea «Firmada por: … Rol: … Fecha: …»' }
  const [, nombre, rol, fecha] = m.map((x) => x.replace(/\*\*/g, '').trim())
  if (enBlanco(nombre) || nombre.length < 2) return { error: 'la AISIA sigue sin firmar: falta el nombre en «Firmada por:»' }
  if (enBlanco(rol)) return { error: 'la AISIA sigue sin firmar: falta el rol' }
  if (!FECHA.test(fecha) || Number.isNaN(Date.parse(fecha))) return { error: `la fecha de la AISIA no es AAAA-MM-DD: «${fecha}»` }
  return { nombre, rol, fecha }
}

/** La firma del contrato, o el motivo por el que no está. */
export function firmaDelContrato(texto) {
  const m = /^\*\*Firma:\*\*(.*)$/m.exec(texto)
  if (!m) return { error: 'el contrato no tiene la línea «**Firma:**»' }
  const linea = m[1].trim()
  if (enBlanco(linea)) return { error: 'el contrato sigue con la firma pendiente' }
  if (!/\d{4}-\d{2}-\d{2}/.test(linea)) return { error: 'la firma del contrato no lleva su fecha (AAAA-MM-DD)' }
  return { linea }
}

/** Cada cambio: el archivo, el texto que tiene que estar UNA vez y el que lo reemplaza. */
function cambios(f) {
  return [
    [RUTAS.firmada, '# AISIA — Soporte SAP (borrador v3)', '# AISIA — Soporte SAP (v3)'],
    [RUTAS.firmada, '> Fecha: 2026-10-09 · Estado: **borrador, fuera del registro** (no es una entrada de\n> `.claude/gobernanza/`; al firmarla, el laboratorio la pega donde corresponda) · Revisión: al',
      `> Fecha: 2026-10-09 · Estado: **firmada** por ${f.nombre} el ${f.fecha} · Revisión: al`],
    [RUTAS.firmada, '](soporte-sap-firmas-matriz.md)', '](../../docs/goals/soporte-sap-firmas-matriz.md)'],
    [RUTAS.manifiesto, `"aisia": "${RUTAS.borrador}"`, `"aisia": "${RUTAS.firmada}"`],
    [RUTAS.manifiesto, '"firma": "pendiente del laboratorio"', `"firma": "firmada por ${f.nombre} el ${f.fecha}"`],
    [RUTAS.indice, '| hipótesis del 2026-10-04 construida en laboratorio (corrida A del goal); **firma pendiente del laboratorio** |',
      `| construida en laboratorio (corrida A, cerrada por el PRP-010); **C3 v4 y AISIA v3 firmados** por ${f.nombre} el ${f.fecha}; opera solo en laboratorio (AISIA §5) |`],
    [RUTAS.c3, 'El C3 v4 de abajo y la AISIA v3\n> esperan la firma del laboratorio (PRP-010, fase 5).',
      `El C3 v4 de abajo y la AISIA v3\n> los firmó ${f.nombre} el ${f.fecha} (PRP-010, fase 5).`],
    [RUTAS.c3, `Borrador fuera del registro: [\`${RUTAS.borrador}\`](../../${RUTAS.borrador}).`,
      `Firmada por ${f.nombre} el ${f.fecha}: [\`${RUTAS.firmada}\`](../gobernanza/AISIA-soporte-sap.md).`],
    [RUTAS.contrato, `> La evaluación completa está en la AISIA en borrador,\n> [\`${RUTAS.borrador}\`](../../../${RUTAS.borrador}), y el modelo de`,
      `> La evaluación completa está en la AISIA firmada,\n> [\`${RUTAS.firmada}\`](../../../${RUTAS.firmada}), y el modelo de`],
    [RUTAS.informe, '[`soporte-sap-AISIA.md`](soporte-sap-AISIA.md)', '[`AISIA-soporte-sap.md`](../../.claude/gobernanza/AISIA-soporte-sap.md)'],
  ]
}

/** Aterriza en `raiz`. Devuelve lo que hizo (o haría, con `prueba`), o el motivo por el que no. */
export function aterriza(raiz, { prueba = false } = {}) {
  const ruta = (p) => join(raiz, p)
  if (!existsSync(ruta(RUTAS.borrador)) && existsSync(ruta(RUTAS.firmada))) return { ok: true, hecho: [], aviso: 'ya estaba aterrizada' }
  const aisia = readFileSync(ruta(RUTAS.borrador), 'utf8')
  const fa = firmaDeLaAisia(aisia)
  if (fa.error) return { ok: false, motivo: fa.error }
  const fc = firmaDelContrato(readFileSync(ruta(RUTAS.contrato), 'utf8'))
  if (fc.error) return { ok: false, motivo: fc.error }

  const contenidos = new Map([[RUTAS.firmada, aisia]])
  const lee = (p) => contenidos.get(p) ?? readFileSync(ruta(p), 'utf8')
  for (const [p, buscar, poner] of cambios(fa)) {
    const actual = lee(p)
    const veces = actual.split(buscar).length - 1
    if (veces !== 1) return { ok: false, motivo: `${p}: «${buscar.split('\n')[0].slice(0, 70)}» aparece ${veces} veces (se esperaba 1): no toco nada` }
    contenidos.set(p, actual.replace(buscar, poner))
  }
  const hecho = [`${RUTAS.borrador} → ${RUTAS.firmada}`, ...[...contenidos.keys()].filter((p) => p !== RUTAS.firmada)]
  if (prueba) return { ok: true, hecho, prueba: true, firma: fa }
  mkdirSync(dirname(ruta(RUTAS.firmada)), { recursive: true })
  for (const [p, texto] of contenidos) writeFileSync(ruta(p), texto)
  unlinkSync(ruta(RUTAS.borrador))
  return { ok: true, hecho, firma: fa }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--raiz')
  const raiz = i >= 0 ? resolve(process.argv[i + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
  const r = aterriza(raiz, { prueba: process.argv.includes('--prueba') })
  if (!r.ok) {
    console.error(`✗ No aterrizo: ${r.motivo}.`)
    console.error('  La firma la escribes tú, en las dos líneas; este guion no la escribe.')
    process.exit(1)
  }
  if (r.aviso) { console.log(`✓ ${r.aviso}`); process.exit(0) }
  console.log(`${r.prueba ? 'Cambiaría' : '✓ Aterrizó'} la firma de ${r.firma.nombre} (${r.firma.fecha}):`)
  for (const h of r.hecho) console.log(`  · ${h}`)
  if (!r.prueba) console.log('\nSigue: dile a Claude «listo»; corre el validate y prepara el commit. Nada se sube sin ti.')
}
