/**
 * El grafo, corrido sobre los candidatos de BASIS: los de la web y los de BASIS/BC de sapstack (con su cruce) se escriben
 * con el contrato del grafo en un paquete de PRUEBA (0.0.1-candidato, nunca registrado ni dentro de tools/conocimiento).
 * Se validan con `validaConocimiento`, se pasa la política de cita de sap-soporte (la forma de la fuente y la firma en
 * CAMBIOS.md) y se corre el motor (`evalua`) sobre 5 escenarios de BASIS. Ningún candidato da veredicto.
 */
const RAIZ = new URL('../../../', import.meta.url)
const g = await import(new URL('tools/grafo-conocimiento/dist/index.js', RAIZ).href)
const ss = await import(new URL('tools/soporte-sap/dist/index.js', RAIZ).href)
const { problemasDeCita } = await import(new URL('tools/conocimiento/politica-cita.mjs', RAIZ).href)
import { SAPSTACK, WEB } from './cobertura.mjs'

const DIM = 'soporte_sap'
const HOY = '2026-10-23'
/** Cinco tickets de BASIS, dichos como los escribiría un usuario. */
export const ESCENARIOS = [
  { id: 'dump-time-out', texto: 'Un job de fondo cae cada noche con el dump TIME_OUT; en ST22 se ve que el programa Z pasó el tiempo máximo.' },
  { id: 'transporte-rc-8', texto: 'Al importar la orden en calidad con STMS termina con RC 8 por un error de sintaxis en una clase.' },
  { id: 'nota-cvss-9', texto: 'El escaneo de seguridad dice que en producción falta la SAP Note 3797111 de Visual Composer (CVSS 9.9).' },
  { id: 'job-cancelado', texto: 'El job del cierre aparece como cancelado en SM37 desde ayer; el log dice que al usuario de fondo le falta una autorización.' },
  { id: 'usuario-bloqueado', texto: 'Un usuario quedó bloqueado por intentos fallidos de contraseña y hay que desbloquearlo en SU01.' },
]

const clave = (c) => `${c.tipo === 'nota' ? 'NOTA' : 'TC'}_${c.clave.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}`
const sapstackBasis = () => SAPSTACK.filter((c) => c.tipo === 'tcode' && c.modulos.some((m) => m === 'BASIS' || m === 'BC'))

/** La regla de un candidato: siempre «al experto», con su grado (corroborada o hipótesis) y su fuente tal cual. */
function regla(c, origen) {
  const x = origen === 'sapstack' ? WEB.corroboraciones[c.id] : null
  const cita = origen === 'web' ? c.cita : x?.estado === 'corroborado' ? x.evidencias.find((e) => e.admitida)?.cita : null
  const grado = origen === 'web' ? (c.cita ? 'hipotesis-citable' : 'hipotesis') : x?.estado === 'corroborado' ? 'corroborada' : 'hipotesis'
  return {
    clave: `SS-CAND-${clave(c)}`, jurisdiccion: 'MX', dimension: DIM, titulo: `${c.clave}: ${c.titulo}`.slice(0, 200), texto_resumen: c.hipotesis,
    fuente_cita: cita?.texto ?? `sapstack v1.4.0, ${c.fuente.archivo}:${c.fuente.linea}`, fuente_url: cita?.url ?? c.fuente.url,
    vigente_desde: HOY, vigente_hasta: null,
    impactos: [{ categoria: clave(c), regimen: 'GENERAL', veredicto_base: 'escalar_al_experto', requisitos: [], banderas: ['candidato sin validar'], parametros: { grado, origen } }],
  }
}

/** Los candidatos de BASIS escritos con el contrato del grafo. Veredicto: al experto (son hipótesis). */
export function conocimientoCandidato() {
  const web = WEB.candidatos.filter((c) => c.enAlcance && c.modulos.includes('BASIS'))
  const todos = [...web.map((c) => [c, 'web']), ...sapstackBasis().map((c) => [c, 'sapstack'])]
  const procedencia = 'candidatos de BASIS de la web fijada (CVE List de SAP, KEV, SAP-docs) y de sapstack; sin validar por el experto y sin firma del laboratorio'
  return {
    version: '0.0.1-candidato', procedencia,
    jurisdicciones: [{ codigo: 'MX', nombre: 'México' }],
    dimensiones: [{ codigo: DIM, nombre: 'Soporte SAP', vocabulario: ['solucion_conocida', 'escalar_al_experto'] }],
    dominios: [{ clave: 'sap-soporte', nombre: 'Soporte SAP (candidatos de BASIS)', jurisdiccion: 'MX', dimension: DIM, cita: 'interna', corte: HOY, procedencia, categorias: todos.map(([c]) => clave(c)) }],
    categorias: todos.map(([c]) => ({ clave: clave(c), nombre: `${c.clave} · ${c.titulo}`.slice(0, 200), keywords: [c.clave.toLowerCase()], exclusiones: [] })),
    reglas: todos.map(([c, o]) => regla(c, o)),
  }
}

function corre(con, e) {
  const k = g.evalua(con, { contexto: { jurisdiccion: 'MX', dimension: DIM, regimen: 'S4HANA', fecha: HOY }, conceptos: [{ descripcion: e.texto }] }).conceptos[0]
  const r = con.reglas.find((x) => x.impactos[0].categoria === k.categoria)
  const grado = r?.impactos[0].parametros.grado ?? null
  const destino = k.motivo !== 'regla' ? `al experto (${k.motivo})` : k.veredicto === 'escalar_al_experto' ? `al experto (${grado})` : 'solución conocida'
  return { categoria: k.categoria, motivo: k.motivo, veredicto: k.veredicto, grado, cita: r?.fuente_url ?? null, destino, razon: k.razon }
}

const cuentaPor = (xs, f) => Object.fromEntries([...xs.reduce((m, x) => m.set(f(x), (m.get(f(x)) ?? 0) + 1), new Map())].sort())

/** El grafo entero: validación, la política de cita (forma y firma) y el motor sobre los 5 escenarios. */
export function grafo() {
  const c = conocimientoCandidato()
  const v = g.validaConocimiento(c)
  const cita = problemasDeCita(v.conocimiento ?? c, '')
  const grados = cuentaPor(c.reglas, (r) => r.impactos[0].parametros.grado)
  return {
    candidato: { version: c.version, categorias: c.categorias.length, reglas: c.reglas.length, grados },
    validacion: { ok: v.ok, problemas: cuentaPor(v.problemas, (p) => p.tipo), ejemplos: v.problemas.slice(0, 3).map((p) => `${p.tipo}: ${p.clave} — ${p.detalle}`) },
    cita: { problemas: cita.length, porMotivo: cuentaPor(cita, (p) => p.motivo.replace(/SAP Note \d+/, 'SAP Note N')) },
    escenarios: ESCENARIOS.map((e) => { const hoy = ss.categoriza(e.texto); return { id: e.id, hoy: { modulo: hoy.modulo ?? null, transaccion: hoy.transaccion ?? null }, conCandidatos: corre(v.conocimiento, e) } }),
  }
}
