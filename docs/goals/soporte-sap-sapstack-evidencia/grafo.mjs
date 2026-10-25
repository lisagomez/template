/**
 * El grafo, corrido sobre los candidatos de sapstack: se escriben con el contrato del grafo en un paquete de PRUEBA
 * (versión 0.0.1-candidato, nunca registrado ni dentro de tools/conocimiento), se validan con `validaConocimiento` y se
 * corre el motor (`evalua`) sobre los 5 escenarios de sapstack, contados en español por este guion. Además, la matriz de
 * herencia en el motor: un choque global ↔ local sin declarar da conflicto (al experto); declarado con `reemplaza`, gana
 * lo local.
 */
const RAIZ = new URL('../../../', import.meta.url)
const g = await import(new URL('tools/grafo-conocimiento/dist/index.js', RAIZ).href)
const gate = await import(new URL('tools/grafo-conocimiento/dist/gate-entrada.js', RAIZ).href)
const ss = await import(new URL('tools/soporte-sap/dist/index.js', RAIZ).href)
const { readFileSync } = await import('node:fs')
const leeJson = (r) => JSON.parse(readFileSync(new URL(r, RAIZ), 'utf8'))

const DIM = 'soporte_sap'
const HOY = '2026-10-22'
/** Los 5 escenarios de sapstack (docs/scenarios/01-05), dichos como los reportaría un usuario; los T-codes y dumps, tal cual. */
export const ESCENARIOS = [
  { id: '01-miro-tax-code', sistema: 'S4HANA', texto: 'Al registrar la factura del proveedor en MIRO sale que falta el código de impuesto, aunque en ME23N el pedido sí lo trae; MIRO no lo propone.' },
  { id: '02-f110-payment-failure', sistema: 'S4HANA', texto: 'En F110 la propuesta de pago corrió bien, pero el paso de pago no genera el archivo DME del banco; ayer funcionaba.' },
  { id: '03-afab-dump', sistema: 'S4HANA', texto: 'Al lanzar AFAB en modo de prueba sale el dump DBIF_RSQL_SQL_ERROR; parece que falla solo con algunos activos fijos.' },
  { id: '04-bp-migration', sistema: 'S4HANA', texto: 'En la conversión brownfield, CVI no convierte algunos clientes a Business Partner, sobre todo los que tienen número de identificación fiscal.' },
  { id: '05-korean-unicode-dump', sistema: 'S4HANA', texto: 'Después de la migración con SUM, algunos programas Z dan el dump CONVT_CODEPAGE con textos en otro alfabeto; no tenemos acceso al SAP Support Portal.' },
]

const claveCat = (k) => `TC_${k.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase()}`

/** Los candidatos T-code en alcance, escritos con el contrato del grafo. Veredicto: al experto (son hipótesis). */
export function conocimientoCandidato() {
  const cat = leeJson('src/features/soporte-sap/mesa/fuentes/sapstack/candidatos-sapstack.json')
  const f = leeJson('src/features/soporte-sap/mesa/fuentes/sapstack/fuente.json')
  const tcodes = cat.candidatos.filter((c) => c.tipo === 'tcode' && c.enAlcance)
  const procedencia = `candidatos de ${f.repo}@${f.sha} (${f.version}), extraídos de data/tcodes.yaml; sin validar por el experto y sin firma del laboratorio: no es una fuente citable para un veredicto`
  return {
    version: '0.0.1-candidato', procedencia,
    jurisdicciones: [{ codigo: 'MX', nombre: 'México' }],
    dimensiones: [{ codigo: DIM, nombre: 'Soporte SAP', vocabulario: ['solucion_conocida', 'escalar_al_experto'] }],
    dominios: [{ clave: 'sap-soporte', nombre: 'Soporte SAP (candidatos)', jurisdiccion: 'MX', dimension: DIM, cita: 'interna', corte: HOY, procedencia, categorias: tcodes.map((c) => claveCat(c.clave)) }],
    categorias: tcodes.map((c) => ({ clave: claveCat(c.clave), nombre: `${c.clave} · ${c.titulo}`, keywords: [c.clave.toLowerCase()], exclusiones: [] })),
    reglas: tcodes.map((c) => ({
      clave: `SS-CAND-${claveCat(c.clave).slice(3)}`, jurisdiccion: 'MX', dimension: DIM, titulo: `${c.clave}: ${c.titulo}`, texto_resumen: c.hipotesis,
      fuente_cita: `sapstack ${f.version} (${f.sha.slice(0, 7)}), ${c.fuente.archivo}:${c.fuente.linea}; fuente secundaria sin verificar`, fuente_url: c.fuente.url,
      vigente_desde: f.commitFecha, vigente_hasta: null,
      impactos: [{ categoria: claveCat(c.clave), regimen: 'GENERAL', veredicto_base: 'escalar_al_experto', requisitos: [], banderas: ['candidato sin validar'], parametros: { grado: 'hipotesis', origen: 'sapstack' } }],
    })),
  }
}

const cuentaPor = (xs, k) => Object.fromEntries([...xs.reduce((m, x) => m.set(x[k], (m.get(x[k]) ?? 0) + 1), new Map())].sort())

/** Qué hace el motor con un texto: categoría, motivo, veredicto y lo que eso significa en Soporte SAP. */
function corre(c, e) {
  const k = g.evalua(c, { contexto: { jurisdiccion: 'MX', dimension: DIM, regimen: e.sistema, fecha: HOY }, conceptos: [{ descripcion: e.texto }] }).conceptos[0]
  const destino = k.motivo !== 'regla' ? `al experto (${k.motivo})` : k.veredicto === 'escalar_al_experto' ? 'al experto (hipótesis sin validar)' : 'solución conocida'
  return { categoria: k.categoria, motivo: k.motivo, veredicto: k.veredicto, destino, razon: k.razon }
}

/** La matriz de herencia, en el motor: un choque sin declarar y uno declarado con `reemplaza`. */
function herencia(base) {
  const cat = claveCat('F110')
  const global = base.reglas.find((r) => r.impactos[0].categoria === cat)
  const local = { ...global, clave: 'SS-MX-F110-LOCAL', titulo: 'F110 en México (local, firmada)', fuente_cita: 'regla local de ejemplo (firmada por el laboratorio)', vigente_desde: '2026-10-01',
    impactos: [{ ...global.impactos[0], veredicto_base: 'solucion_conocida', banderas: [], parametros: { grado: 'validada', origen: 'laboratorio' } }] }
  const sinDeclarar = { ...base, reglas: [...base.reglas, local] }
  const declarado = { ...base, reglas: [...base.reglas.map((r) => (r.clave === global.clave ? { ...r, vigente_hasta: '2026-09-30' } : r)), { ...local, reemplaza: global.clave }] }
  const e = ESCENARIOS[1]
  const valida = (x) => g.validaConocimiento(x).problemas.map((p) => p.tipo)
  return {
    sinDeclarar: { problemasDelGate: [...new Set(valida(sinDeclarar))], motor: corre(g.validaConocimiento(sinDeclarar).conocimiento, e) },
    declarado: { problemasDelGate: [...new Set(valida(declarado))], motor: corre(g.validaConocimiento(declarado).conocimiento, e) },
  }
}

/** El grafo entero: validación, contenciones, choque con el catálogo real, motor y herencia. */
export function grafo() {
  const c = conocimientoCandidato()
  const v = g.validaConocimiento(c)
  const real = leeJson('tools/conocimiento/dist/conocimiento.json')
  const reales = new Set(real.categorias.flatMap((x) => x.keywords))
  const chocan = c.categorias.flatMap((x) => x.keywords).filter((k) => reales.has(k))
  const abiertas = v.conocimiento ? gate.contenciones(v.conocimiento).filter((x) => !x.cubierta) : []
  return {
    candidato: { version: c.version, categorias: c.categorias.length, reglas: c.reglas.length },
    validacion: { ok: v.ok, problemas: cuentaPor(v.problemas, 'tipo'), ejemplos: v.problemas.slice(0, 3).map((p) => `${p.tipo}: ${p.clave} — ${p.detalle}`) },
    contencionesSinCubrir: abiertas.length,
    chocaConElCatalogoReal: chocan,
    escenarios: ESCENARIOS.map((e) => {
      const hoy = ss.categoriza(e.texto)
      return { id: e.id, hoy: { modulo: hoy.modulo ?? null, transaccion: hoy.transaccion ?? null }, conCandidatos: corre(v.conocimiento, e) }
    }),
    herencia: herencia(c),
  }
}
