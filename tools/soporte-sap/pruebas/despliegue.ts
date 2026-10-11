/**
 * El perfil de despliegue de Soporte SAP (PRP-010, fase 3): el manifiesto declara REQUISITOS (plantilla v3) y
 * `configura:deploy` mide la instalación contra ellos. Los casos del PRP: una máquina chica, una región frente a D10,
 * sin destino de respaldo, y una instalación que pasa. Y lo que no puede pasar: imprimir o guardar un secreto.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { revisaPerfil, RESPALDO_S3 } from '../../../scripts/despliegue/perfil.mjs'
import { consumoMensual, maquinaPara, INCIDENCIAS_MES, veredictoDeFicha } from '../dist/index.js'
import { RAIZ, HERRAMIENTA } from './_ayuda.ts'

const MANIFIESTO = JSON.parse(readFileSync(join(RAIZ, 'productos', 'soporte-sap.json'), 'utf8'))
const SECRETO = 'f'.repeat(64)
const GRANDE = { vcpu: 4, ramMB: 8192, discoGb: 80 }
/** Una instalación completa de Soporte SAP: tamaño, región, respaldo y secretos. */
const completa = (cambios: Record<string, string | null> = {}) => {
  const base: Record<string, string> = {
    PRODUCTO: 'soporte-sap', DESPLIEGUE_TAMANO: 'M', DESPLIEGUE_REGION: 'mx-central-1', DESPLIEGUE_PROVEEDOR: 'el mío',
    RESPALDO_S3_URL: 'https://s3.ejemplo.mx', RESPALDO_S3_BUCKET: 'respaldo-ss', RESPALDO_S3_LLAVE: 'LLAVE-DE-PRUEBA', RESPALDO_S3_SECRETO: SECRETO, RESPALDO_S3_BLOQUEO_DIAS: '30',
    SS_SECRETO_TAREAS: SECRETO, SS_SECRETO_RESPALDOS: SECRETO, SS_SAL_IMPORTADOR: SECRETO,
  }
  for (const [k, v] of Object.entries(cambios)) { if (v === null) delete base[k]; else base[k] = v }
  return new Map(Object.entries(base))
}
const revisa = (valores: Map<string, string>, maquina = GRANDE, manifiesto = MANIFIESTO) => revisaPerfil(manifiesto, valores, maquina, '2026-10-09T00:00:00Z')

test('una instalación completa pasa: cabe, la región queda «pendiente de D10» y el respaldo, declarado', () => {
  const r = revisa(completa())
  assert.deepEqual(r.problemas, [])
  assert.deepEqual([r.medicion?.cabe, r.medicion?.region_estado, r.medicion?.respaldo, r.medicion?.proveedor], [true, 'pendiente de D10', 'declarado', 'el mío'])
})

test('una máquina chica no cabe en el tamaño contratado, y se dice qué le falta', () => {
  const r = revisa(completa({ DESPLIEGUE_TAMANO: 'L' }), { vcpu: 1, ramMB: 1024, discoGb: 10 })
  assert.equal(r.medicion?.cabe, false)
  assert.match(r.problemas.join('\n'), /no cabe en el tamaño L de soporte-sap: 1 vCPU de 2, 1\.0 GB de RAM de 1\.5, 10 GB de disco de 22/)
  assert.match(revisa(completa({ DESPLIEGUE_TAMANO: null })).problemas.join('\n'), /DESPLIEGUE_TAMANO falta/, 'sin tamaño contratado no hay contra qué medir')
})

test('la región frente a D10: abierta, «pendiente» y nunca «cumple»; decidida, cumple o queda fuera; sin declarar, no pasa', () => {
  const abierta = revisa(completa())
  assert.equal(abierta.medicion?.region_estado, 'pendiente de D10')
  assert.match(abierta.avisos.join('\n'), /pendiente de D10.*no «cumple»/)
  const decidida = structuredClone(MANIFIESTO)
  decidida.despliegue.exige.region = { decision: 'D10', estado: 'decidida', regiones: ['mx-central-1'] }
  assert.equal(revisa(completa(), GRANDE, decidida).medicion?.region_estado, 'cumple')
  const fuera = revisa(completa({ DESPLIEGUE_REGION: 'us-east-1' }), GRANDE, decidida)
  assert.equal(fuera.medicion?.region_estado, 'fuera')
  assert.match(fuera.problemas.join('\n'), /fuera de las que fija D10/)
  assert.match(revisa(completa({ DESPLIEGUE_REGION: null })).problemas.join('\n'), /DESPLIEGUE_REGION falta/)
})

test('sin destino de respaldo, aviso; un destino sin https o sin días de bloqueo, no pasa', () => {
  const sin = revisa(completa(Object.fromEntries(RESPALDO_S3.map((k) => [k, null]))))
  assert.equal(sin.medicion?.respaldo, 'falta')
  assert.match(sin.avisos.join('\n'), /falta el destino de respaldo inmutable fuera de sitio/)
  assert.match(revisa(completa({ RESPALDO_S3_URL: 'http://s3.ejemplo.mx' })).problemas.join('\n'), /no es https/)
  assert.match(revisa(completa({ RESPALDO_S3_BLOQUEO_DIAS: '0' })).problemas.join('\n'), /sin bloqueo, el respaldo se borra/)
})

test('el bloqueo del respaldo no pasa el tope que promete el producto (D8): una copia bloqueada no se borra', () => {
  assert.equal(MANIFIESTO.retencion.bloqueoMaximoDias, 365)
  assert.deepEqual(revisa(completa({ RESPALDO_S3_BLOQUEO_DIAS: '365' })).problemas, [])
  const largo = revisa(completa({ RESPALDO_S3_BLOQUEO_DIAS: '2555' }))
  assert.equal(largo.medicion?.respaldo, 'mal')
  assert.match(largo.problemas.join('\n'), /RESPALDO_S3_BLOQUEO_DIAS=2555 pasa el tope de 365 días que promete soporte-sap/)
  const sinTope = structuredClone(MANIFIESTO)
  sinTope.retencion = { ...sinTope.retencion, plazos: null, bloqueoMaximoDias: null }
  const r = revisa(completa({ RESPALDO_S3_BLOQUEO_DIAS: '2555' }), GRANDE, sinTope)
  assert.deepEqual(r.problemas, [])
  assert.match(r.avisos.join('\n'), /no declara hasta cuándo llega el borrado a las copias/, 'sin tope declarado, se avisa: no se calla')
})

test('los secretos del producto: si faltan o son cortos no pasa, y la medición no lleva ninguno', () => {
  assert.match(revisa(completa({ SS_SAL_IMPORTADOR: null })).problemas.join('\n'), /SS_SAL_IMPORTADOR falta/)
  assert.match(revisa(completa({ SS_SECRETO_TAREAS: 'corto' })).problemas.join('\n'), /SS_SECRETO_TAREAS tiene 5 caracteres/)
  const r = revisa(completa())
  assert.doesNotMatch(JSON.stringify(r), new RegExp(`${SECRETO}|LLAVE-DE-PRUEBA`), 'ni en la medición, ni en los avisos, ni en los problemas')
})

test('los tamaños del manifiesto salen del estimado: la misma máquina que calcula maquinaPara', () => {
  const e = JSON.parse(readFileSync(join(HERRAMIENTA, 'medicion', 'estimado.json'), 'utf8'))
  for (const t of ['S', 'M', 'L'] as const) {
    const q = maquinaPara(e.insumos, consumoMensual(e.insumos, INCIDENCIAS_MES.consultora[t]))
    assert.deepEqual(MANIFIESTO.despliegue.tamanos[t], { vcpu: q.vcpu.valor, ramGb: q.ramGb.valor, discoGb: q.discoGb.valor }, t)
  }
})

test('configura:deploy mide contra el perfil del producto y no imprime ningún secreto', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ss-perfil-'))
  try {
    const env = join(dir, 'env')
    writeFileSync(env, [...completa({ DESPLIEGUE_TAMANO: 'S' })].map(([k, v]) => `${k}=${v}`).join('\n'))
    const r = spawnSync(process.execPath, ['scripts/configura-deploy.mjs'], { cwd: RAIZ, env: { ...process.env, ENV_PRODUCCION: relative(RAIZ, env) }, encoding: 'utf8' })
    const salida = `${r.stdout}${r.stderr}`
    assert.match(salida, /Perfil de soporte-sap: modo gestionado · tamaño S \((cabe|NO cabe)\) · región: pendiente de D10 · respaldo: declarado/)
    assert.match(salida, /SS_SAL_IMPORTADOR: .*presente \(64 car\.\)/)
    assert.doesNotMatch(salida, new RegExp(`${SECRETO}|LLAVE-DE-PRUEBA`))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('con Soporte SAP, configura:deploy no deja encender un motor de OCR fuera de la máquina, ni con una decisión C4', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ss-ocr-'))
  try {
    const decision = join(dir, 'decision-c4.md')
    writeFileSync(decision, 'una decisión C4 firmada para otro uso')
    const env = join(dir, 'env')
    writeFileSync(env, [...completa({ OCR_RESPALDO: 'mistral', OCR_DECISION_C4_ARCHIVO: decision })].map(([k, v]) => `${k}=${v}`).join('\n'))
    const r = spawnSync(process.execPath, ['scripts/configura-deploy.mjs'], { cwd: RAIZ, env: { ...process.env, ENV_PRODUCCION: relative(RAIZ, env) }, encoding: 'utf8' })
    assert.equal(r.status, 1)
    assert.match(`${r.stdout}${r.stderr}`, /OCR_RESPALDO=mistral mandaría los documentos de Soporte SAP a un motor fuera de la máquina/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// --- La ficha de servidor (PRP-010, fase 3): no dice «apto» sin la restauración probada en esa máquina (GATE 3).
test('la ficha de servidor no dice «apto» sin la restauración probada en esa máquina, aunque todo lo demás esté', () => {
  const medicion = revisa(completa()).medicion!
  const respuestas = ['sí, con el servidor encendido', 'sí, los volúmenes', 'sí, sobrevive'] as const
  const decidida = { ...medicion, region_estado: 'cumple' }
  const sinRestaurar = veredictoDeFicha({ consultora: 'andina', modo: 'gestionado', medicion: decidida, respuestas, restauracion: null })
  assert.deepEqual([sinRestaurar.apto, sinRestaurar.faltan], [false, ['probar una restauración en esta máquina (GATE 3)']])
  const conGate3 = veredictoDeFicha({ consultora: 'andina', modo: 'gestionado', medicion: decidida, respuestas, restauracion: { fecha: '2026-10-09', evidencia: 'verificar-restauracion.sh, RTO 412 s' } })
  assert.deepEqual([conGate3.apto, conGate3.faltan], [true, []])
  const hoy = veredictoDeFicha({ consultora: 'andina', modo: 'gestionado', medicion, respuestas: [null, null, null], restauracion: null })
  assert.equal(hoy.apto, false)
  assert.match(hoy.faltan.join('\n'), /la región: pendiente de D10[\s\S]*3 de 3 preguntas[\s\S]*GATE 3/, 'mientras D10 siga abierta, tampoco')
  assert.match(veredictoDeFicha({ consultora: 'boreal', modo: 'despacho', medicion: null, respuestas: [], restauracion: null }).faltan[0]!, /medir la máquina/)
})
