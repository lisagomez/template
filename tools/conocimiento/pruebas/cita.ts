/**
 * D-SS-3 y D-SS-2 (2026-10-22): un dominio que nace aquí se declara con su cita y sus fuentes (`politica-cita.mjs`).
 * `sap-soporte` cita `interna`, y sus reglas salen de una SAP Note, de SAP Help o de la experiencia documentada en
 * CAMBIOS.md: de sapstack, nunca por sí solo. Se prueba sobre el conocimiento real con un dominio `sap-soporte` de
 * prueba encima: el contrato lo acepta, y la política dice qué fuente pasa. Ninguna de estas reglas se siembra.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import conocimiento from '../dist/index.js'
import { validaConocimiento } from '../../grafo-conocimiento/dist/index.js'
import { DOMINIOS_PROPIOS, problemasDeCita } from '../politica-cita.mjs'

const v = validaConocimiento(conocimiento)
const c = v.conocimiento!
type Regla = (typeof c.reglas)[number]
type Dominio = (typeof c.dominios)[number]

const regla = (clave: string, fuente_cita: string, fuente_url: string): Regla => ({
  clave, jurisdiccion: 'MX', dimension: 'soporte_sap', titulo: 'F110 no genera el DME',
  texto_resumen: 'El método de pago no tiene formato DME asignado en FBZP.', fuente_cita, fuente_url,
  vigente_desde: '2026-10-22', vigente_hasta: null,
  impactos: [{ categoria: 'SAP_F110_DME', regimen: 'GENERAL', veredicto_base: 'escalar_al_experto', requisitos: [], banderas: [], parametros: { grado: 'experimental' } }],
})
const NOTA = regla('SAP-F110-DME-NOTA', 'SAP Note 1234567, verificada por el experto el 2026-10-22', 'https://me.sap.com/notes/1234567')
const AYUDA = regla('SAP-F110-DME-AYUDA', 'SAP Help: Payment Medium Workbench', 'https://help.sap.com/docs/SAP_ERP/payment-medium-workbench')
const EXPERIENCIA = regla('SAP-F110-DME-EXPERIENCIA', 'Experiencia documentada del experto (0.3.0)', 'https://github.com/lisagomez/template/blob/main/tools/conocimiento/CAMBIOS.md#030')
const SAPSTACK = regla('SAP-F110-DME-SAPSTACK', 'sapstack data/tcodes.yaml:212 (F110, Automatic Payment Run)', 'https://github.com/Fioriuser2021/sapstack/blob/5be80773025a3ace996f02a5b0a8557779eaa334/data/tcodes.yaml#L212')
const CAMBIOS = [NOTA, AYUDA, EXPERIENCIA, SAPSTACK].map((r) => `- \`${r.clave}\``).join('\n')

/** El conocimiento real con el dominio `sap-soporte` encima, como lo traería su primera versión. */
const conSapSoporte = (reglas: Regla[], dominio: Partial<Dominio> = {}) => ({
  ...c,
  dimensiones: [...c.dimensiones, { codigo: 'soporte_sap', nombre: 'Soporte SAP', vocabulario: ['solucion_conocida', 'escalar_al_experto'] }],
  dominios: [...c.dominios, {
    clave: 'sap-soporte', nombre: 'Soporte SAP', jurisdiccion: 'MX', dimension: 'soporte_sap', cita: 'interna' as const, corte: '2026-10-22',
    procedencia: 'Prueba de la suite: no se siembra.', categorias: ['SAP_F110_DME'], ...dominio,
  }],
  categorias: [...c.categorias, { clave: 'SAP_F110_DME', nombre: 'F110 sin DME', keywords: ['f110 dme'], exclusiones: [] }],
  reglas: [...c.reglas, ...reglas],
})
const motivos = (x: ReturnType<typeof conSapSoporte>, cambios = CAMBIOS) => problemasDeCita(x, cambios).map((p: { clave: string; motivo: string }) => `${p.clave}: ${p.motivo}`)

test('D-SS-3: sap-soporte entra con cita interna y reglas de una SAP Note, de SAP Help o de experiencia documentada', () => {
  assert.equal(DOMINIOS_PROPIOS['sap-soporte'].cita, 'interna')
  const x = conSapSoporte([NOTA, AYUDA, EXPERIENCIA])
  // El contrato no reporta nada nuevo: lo único pendiente es lo que ya declara el conocimiento real.
  assert.deepEqual(validaConocimiento(x).problemas, v.problemas)
  assert.deepEqual(motivos(x), [])
})

test('D-SS-2: una regla de sap-soporte que cita a sapstack no se siembra', () => {
  const m = motivos(conSapSoporte([NOTA, SAPSTACK]))
  assert.equal(m.length, 1, m.join(' · '))
  assert.match(m[0]!, /^SAP-F110-DME-SAPSTACK: cita a sapstack/)
})

test('un dominio sin declarar se mide como migrado de Hermes: con cita interna o un corte nuevo, no pasa', () => {
  const m = motivos(conSapSoporte([], { clave: 'sap-otro' }), '')
  assert.deepEqual(m.map((x) => x.replace(/:.*$/, '')), ['sap-otro', 'sap-otro'])
  assert.match(m[0]!, /publica/)
  assert.match(m[1]!, /DOMINIOS_PROPIOS/)
})

test('sap-soporte no cita publica ni corta antes de nacer', () => {
  assert.deepEqual(motivos(conSapSoporte([NOTA], { cita: 'publica', corte: '2026-09-06' })), [
    'sap-soporte: cita `publica` y su declaración dice `interna`',
    'sap-soporte: corte 2026-09-06 anterior a 2026-10-22, cuando nace el dominio',
  ])
})

test('la cita de una SAP Note nombra la del enlace, la experiencia se cita como tal, otra fuente no vale, y cada regla aparece en CAMBIOS.md', () => {
  const otraNota = regla('SAP-F110-DME-NOTA', 'SAP Note 7654321', 'https://me.sap.com/notes/1234567')
  const sinNombre = regla('SAP-F110-DME-EXPERIENCIA', 'Lo dijo el experto', EXPERIENCIA.fuente_url)
  const foro = regla('SAP-F110-DME-FORO', 'SAP Community', 'https://community.sap.com/t5/f110/td-p/1')
  const m = motivos(conSapSoporte([otraNota, sinNombre, foro]))
  assert.deepEqual(m, [
    'SAP-F110-DME-NOTA: el enlace es la SAP Note 1234567 y la cita no la nombra',
    'SAP-F110-DME-EXPERIENCIA: un enlace a CAMBIOS.md cita «Experiencia documentada del experto…»',
    'SAP-F110-DME-FORO: fuente no admitida en sap-soporte: una SAP Note (me.sap.com/notes/N), SAP Help (help.sap.com) o la experiencia documentada en CAMBIOS.md (D-SS-2)',
    'SAP-F110-DME-FORO: no aparece en CAMBIOS.md: ahí la anota y la firma el laboratorio',
  ])
})
