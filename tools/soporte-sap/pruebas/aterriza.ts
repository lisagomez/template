/**
 * El guion que aterriza la firma del laboratorio (`firmas/aterriza.mjs`, PRP-010 fase 5). Corre sobre un repo MÍNIMO
 * en una carpeta temporal, con los textos que el guion busca: así no depende de si la firma real ya aterrizó (la
 * primera versión copiaba los archivos del repo, y al firmar se quedó sin borrador que probar). Sin las dos firmas no
 * hace nada, nunca escribe una firma, y con las dos lo hace todo o nada. Aparte, el estado real después de la firma.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { aterriza, firmaDeLaAisia, firmaDelContrato, RUTAS } from '../firmas/aterriza.mjs'
import { RAIZ } from './_ayuda.ts'

const FIRMA_AISIA = 'Firmada por: **laboratorio-de-prueba**  Rol: responsable del proyecto  Fecha: 2026-10-10'
const FIRMA_CONTRATO = '**Firma:** laboratorio-de-prueba (responsable del proyecto) · Fecha: 2026-10-10 · firma el contrato con su C3 v4 y su AISIA v3.'

/** Los archivos que toca el guion, con lo que tenían antes de la firma (solo lo que el guion busca, y la firma en blanco). */
const SIN_FIRMAR: Record<string, string> = {
  [RUTAS.borrador]: `# AISIA — Soporte SAP (borrador v3)

> Fecha: 2026-10-09 · Estado: **borrador, fuera del registro** (no es una entrada de
> \`.claude/gobernanza/\`; al firmarla, el laboratorio la pega donde corresponda) · Revisión: al
> conectar un LLM real. La matriz: ([\`soporte-sap-firmas-matriz.md\`](soporte-sap-firmas-matriz.md)).

Firmada por: ____________  Rol: ____________  Fecha: ____________
`,
  [RUTAS.contrato]: `## 6. Gobernanza

> La evaluación completa está en la AISIA en borrador,
> [\`${RUTAS.borrador}\`](../../../${RUTAS.borrador}), y el modelo de
> amenazas en el PRP-008.

**Firma:** pendiente: el laboratorio firma aquí el contrato con su C3 v4 y su AISIA v3.
`,
  [RUTAS.c3]: `> **Estado**: corrida A cerrada. El C3 v4 de abajo y la AISIA v3
> esperan la firma del laboratorio (PRP-010, fase 5).

Borrador fuera del registro: [\`${RUTAS.borrador}\`](../../${RUTAS.borrador}).
`,
  [RUTAS.manifiesto]: `{\n  "contrato": {\n    "aisia": "${RUTAS.borrador}",\n    "firma": "pendiente del laboratorio"\n  }\n}\n`,
  [RUTAS.indice]: `| Producto | Contrato | Activos | Estado |
|---|---|---|---|
| Etiquetas | x | y | **firma pendiente del laboratorio** |
| Soporte SAP | x | y | hipótesis del 2026-10-04 construida en laboratorio (corrida A del goal); **firma pendiente del laboratorio** |
`,
  [RUTAS.informe]: '> AISIA: [`soporte-sap-AISIA.md`](soporte-sap-AISIA.md) · CDC firmado.\n',
}

/** Un repo mínimo sin firmar, en una carpeta temporal. */
function repoSinFirmar(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ss-aterriza-'))
  for (const [p, texto] of Object.entries(SIN_FIRMAR)) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), texto) }
  return dir
}
const lee = (dir: string, p: string) => readFileSync(join(dir, p), 'utf8')
const firma = (dir: string, { aisia = true, contrato = true } = {}) => {
  if (aisia) writeFileSync(join(dir, RUTAS.borrador), lee(dir, RUTAS.borrador).replace(/^Firmada por:.*$/m, FIRMA_AISIA))
  if (contrato) writeFileSync(join(dir, RUTAS.contrato), lee(dir, RUTAS.contrato).replace(/^\*\*Firma:\*\*.*$/m, FIRMA_CONTRATO))
}
const foto = (dir: string) => Object.values(RUTAS).map((p) => (existsSync(join(dir, p)) ? lee(dir, p) : null))

test('sin las dos firmas no toca nada, y dice cuál falta', () => {
  const dir = repoSinFirmar()
  try {
    const antes = foto(dir)
    assert.match(aterriza(dir).motivo ?? '', /AISIA sigue sin firmar/)
    assert.deepEqual(foto(dir), antes, 'sin firmas, nada cambió')
    firma(dir, { contrato: false })
    assert.match(aterriza(dir).motivo ?? '', /contrato sigue con la firma pendiente/)
    assert.ok(existsSync(join(dir, RUTAS.borrador)) && !existsSync(join(dir, RUTAS.firmada)), 'con una sola firma, la AISIA no se mueve')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('con las dos firmas mueve la AISIA a gobernanza y todo apunta a ella; las firmas son las que escribió el laboratorio', () => {
  const dir = repoSinFirmar()
  try {
    firma(dir)
    const ensayo = aterriza(dir, { prueba: true })
    assert.ok(ensayo.ok && existsSync(join(dir, RUTAS.borrador)), '--prueba no escribe')
    const r = aterriza(dir)
    assert.ok(r.ok, r.motivo)
    assert.ok(!existsSync(join(dir, RUTAS.borrador)) && existsSync(join(dir, RUTAS.firmada)))
    const aisia = lee(dir, RUTAS.firmada)
    assert.ok(aisia.includes(FIRMA_AISIA), 'la firma de la AISIA es la que escribió el laboratorio')
    assert.match(aisia, /Estado: \*\*firmada\*\* por laboratorio-de-prueba el 2026-10-10/)
    assert.match(aisia, /\]\(\.\.\/\.\.\/docs\/goals\/soporte-sap-firmas-matriz\.md\)/, 'el enlace a la matriz sigue funcionando')
    const m = JSON.parse(lee(dir, RUTAS.manifiesto))
    assert.deepEqual([m.contrato.aisia, m.contrato.firma], [RUTAS.firmada, 'firmada por laboratorio-de-prueba el 2026-10-10'])
    assert.match(lee(dir, RUTAS.indice), /Soporte SAP .*\*\*C3 v4 y AISIA v3 firmados\*\* por laboratorio-de-prueba el 2026-10-10/)
    assert.match(lee(dir, RUTAS.indice), /Etiquetas .*\*\*firma pendiente del laboratorio\*\*/, 'la fila de otro producto no se toca')
    assert.match(lee(dir, RUTAS.c3), /Firmada por laboratorio-de-prueba el 2026-10-10: \[`\.claude\/gobernanza\/AISIA-soporte-sap\.md`\]/)
    assert.ok(lee(dir, RUTAS.contrato).includes(FIRMA_CONTRATO), 'la firma del contrato no se toca')
    assert.match(lee(dir, RUTAS.contrato), /AISIA firmada,\n> \[`\.claude\/gobernanza\/AISIA-soporte-sap\.md`\]/)
    assert.doesNotMatch(Object.values(RUTAS).filter((p) => p !== RUTAS.borrador).map((p) => lee(dir, p)).join('\n'), /\]\([^)]*soporte-sap-AISIA\.md\)/, 'ningún enlace queda apuntando al borrador')
    assert.equal(aterriza(dir).aviso, 'ya estaba aterrizada', 'correrlo otra vez no hace nada')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('si un texto no está donde se espera, no escribe nada (todo o nada)', () => {
  const dir = repoSinFirmar()
  try {
    firma(dir)
    writeFileSync(join(dir, RUTAS.indice), lee(dir, RUTAS.indice).replace('hipótesis del 2026-10-04 construida en laboratorio (corrida A del goal)', 'otra cosa'))
    const antes = foto(dir)
    const r = aterriza(dir)
    assert.equal(r.ok, false)
    assert.match(r.motivo ?? '', /BUSINESS_LOGIC\.md: .*aparece 0 veces/)
    assert.deepEqual(foto(dir), antes, 'ni la AISIA se movió')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('una firma en blanco, sin rol o con una fecha que no es AAAA-MM-DD no cuenta', () => {
  for (const [linea, error] of [
    ['Firmada por: ____________  Rol: ____________  Fecha: ____________', /sin firmar/],
    ['Firmada por: lisa  Rol: ____  Fecha: 2026-10-10', /falta el rol/],
    ['Firmada por: lisa  Rol: responsable  Fecha: 10/10/2026', /no es AAAA-MM-DD/],
  ] as const) assert.match(firmaDeLaAisia(linea).error ?? '', error, linea)
  assert.match(firmaDelContrato('**Firma:** pendiente del laboratorio.').error ?? '', /pendiente/)
  assert.match(firmaDelContrato('**Firma:** lisa (responsable)').error ?? '', /fecha/)
})

test('en el repo, la firma aterrizó: la AISIA está en gobernanza, firmada, y nada apunta al borrador', () => {
  if (existsSync(join(RAIZ, RUTAS.borrador))) return // antes de la firma no hay nada que comprobar aquí
  const aisia = readFileSync(join(RAIZ, RUTAS.firmada), 'utf8')
  assert.equal(firmaDeLaAisia(aisia).error, undefined, 'la AISIA lleva su firma')
  assert.equal(firmaDelContrato(readFileSync(join(RAIZ, RUTAS.contrato), 'utf8')).error, undefined, 'el contrato lleva su firma')
  const m = JSON.parse(readFileSync(join(RAIZ, RUTAS.manifiesto), 'utf8'))
  assert.equal(m.contrato.aisia, RUTAS.firmada)
  assert.match(m.contrato.firma, /^firmada por /)
  const todo = Object.values(RUTAS).filter((p) => p !== RUTAS.borrador).map((p) => readFileSync(join(RAIZ, p), 'utf8')).join('\n')
  assert.doesNotMatch(todo, /\]\([^)]*soporte-sap-AISIA\.md\)/, 'ningún enlace apunta al borrador')
})
