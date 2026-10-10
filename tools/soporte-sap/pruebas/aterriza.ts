/**
 * El guion que aterriza la firma del laboratorio (`firmas/aterriza.mjs`, PRP-010 fase 5). Corre sobre una copia de los
 * archivos que toca: sin las dos firmas no hace nada, nunca escribe una firma, y con las dos lo hace todo o nada.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdirSync } from 'node:fs'
import { aterriza, RUTAS } from '../firmas/aterriza.mjs'
import { RAIZ } from './_ayuda.ts'

const FIRMA_AISIA = 'Firmada por: **laboratorio-de-prueba**  Rol: responsable del proyecto  Fecha: 2026-10-10'
const FIRMA_CONTRATO = '**Firma:** laboratorio-de-prueba (responsable del proyecto) · Fecha: 2026-10-10 · firma el contrato con su C3 v4 y su AISIA v3.'

/** Una copia de los archivos que toca el guion, en una carpeta temporal. */
function copia(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ss-aterriza-'))
  for (const p of Object.values(RUTAS)) {
    if (!existsSync(join(RAIZ, p))) continue
    mkdirSync(dirname(join(dir, p)), { recursive: true })
    cpSync(join(RAIZ, p), join(dir, p))
  }
  return dir
}
const lee = (dir: string, p: string) => readFileSync(join(dir, p), 'utf8')
const firma = (dir: string, { aisia = true, contrato = true } = {}) => {
  if (aisia) writeFileSync(join(dir, RUTAS.borrador), lee(dir, RUTAS.borrador).replace(/^Firmada por:.*$/m, FIRMA_AISIA))
  if (contrato) writeFileSync(join(dir, RUTAS.contrato), lee(dir, RUTAS.contrato).replace(/^\*\*Firma:\*\*.*$/m, FIRMA_CONTRATO))
}
const foto = (dir: string) => Object.values(RUTAS).map((p) => (existsSync(join(dir, p)) ? lee(dir, p) : null))

test('sin las dos firmas no toca nada, y dice cuál falta', () => {
  const dir = copia()
  try {
    const antes = foto(dir)
    assert.match(aterriza(dir).motivo ?? '', /AISIA sigue sin firmar/)
    firma(dir, { contrato: false })
    assert.match(aterriza(dir).motivo ?? '', /contrato sigue con la firma pendiente/)
    assert.deepEqual(foto(dir).filter((_, k) => Object.values(RUTAS)[k] !== RUTAS.borrador), antes.filter((_, k) => Object.values(RUTAS)[k] !== RUTAS.borrador), 'nada más cambió')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('con las dos firmas mueve la AISIA a gobernanza y todo apunta a ella; las firmas son las que escribió el laboratorio', () => {
  const dir = copia()
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
    assert.match(lee(dir, RUTAS.indice), /\*\*C3 v4 y AISIA v3 firmados\*\* por laboratorio-de-prueba el 2026-10-10/)
    assert.match(lee(dir, RUTAS.c3), /Firmada por laboratorio-de-prueba el 2026-10-10: \[`\.claude\/gobernanza\/AISIA-soporte-sap\.md`\]/)
    assert.ok(lee(dir, RUTAS.contrato).includes(FIRMA_CONTRATO), 'la firma del contrato no se toca')
    assert.match(lee(dir, RUTAS.contrato), /AISIA firmada,\n> \[`\.claude\/gobernanza\/AISIA-soporte-sap\.md`\]/)
    assert.doesNotMatch(Object.values(RUTAS).filter((p) => p !== RUTAS.borrador).map((p) => lee(dir, p)).join('\n'), /\]\([^)]*soporte-sap-AISIA\.md\)/, 'ningún enlace queda apuntando al borrador')
    assert.equal(aterriza(dir).aviso, 'ya estaba aterrizada', 'correrlo otra vez no hace nada')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('si un texto no está donde se espera, no escribe nada (todo o nada)', () => {
  const dir = copia()
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
  const dir = copia()
  try {
    for (const [linea, error] of [
      ['Firmada por: ____________  Rol: ____________  Fecha: ____________', /sin firmar/],
      ['Firmada por: lisa  Rol: ____  Fecha: 2026-10-10', /falta el rol/],
      ['Firmada por: lisa  Rol: responsable  Fecha: 10/10/2026', /no es AAAA-MM-DD/],
    ] as const) {
      writeFileSync(join(dir, RUTAS.borrador), lee(dir, RUTAS.borrador).replace(/^Firmada por:.*$/m, linea))
      assert.match(aterriza(dir).motivo ?? '', error, linea)
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
