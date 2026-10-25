/**
 * El cruce sapstack → Soporte SAP, medido con el código de Soporte SAP (su `dist`), no leyendo su fuente: cuántos
 * T-codes de sapstack reconoce hoy el triage, cuántos términos de sapstack el anonimizador toma por nombre de persona y
 * qué entraría como candidato por módulo. Solo lectura.
 */
import { tcodes, notas } from './sapstack.mjs'

const RAIZ = new URL('../../../', import.meta.url)
const ss = await import(new URL('tools/soporte-sap/dist/index.js', RAIZ).href)

/** Los módulos que Soporte SAP atiende hoy (`mapeo.ts`, VALORES.modulo). BC en sapstack es Basis. */
export const ALCANCE = new Set(['FI', 'MM', 'SD', 'HCM', 'BASIS', 'BC', 'ABAP', 'FI-LOC'])
/** El anonimizador solo usa el validador de NSS para nombres; aquí ningún número es un dato. */
const SIN_DATOS = { rfc: () => false, curp: () => false, nss: () => false }

const ordena = (xs) => [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

/** ¿El triage de hoy reconoce el T-code dentro de un ticket? `transaccionDe` es lo que usa `categoriza`. */
export function reconocidosPorElTriage(codigos) {
  const si = codigos.filter((c) => ss.transaccionDe(`Desde ayer falla la ${c} en producción`) === c)
  return { si: ordena(si), no: ordena(codigos.filter((c) => !si.includes(c))) }
}

/** Lo que el anonimizador le hace a un término a media frase (así lo escribiría el experto). */
function tapa(frase) {
  const r = ss.anonimiza(frase, SIN_DATOS)
  return { nombre: r.reemplazos.NOMBRE ?? 0, usuario: r.reemplazos.USUARIO ?? 0, cuarentena: r.veredicto === 'cuarentena', texto: r.texto }
}

/**
 * Cada T-code en tres cajas (MIRO, Miro, miro) y cada nombre de transacción tal como lo trae sapstack («Enter Incoming
 * Invoice»): cuántos se tapan como nombre de persona o mandan el caso a cuarentena.
 */
export function confundidosConNombres(clon) {
  const t = tcodes(clon)
  const codigos = ordena(Object.keys(t))
  const cajas = (c) => [c, c[0] + c.slice(1).toLowerCase(), c.toLowerCase()]
  const codigoTapado = codigos.filter((c) => cajas(c).some((v) => { const r = tapa(`El error sale en ${v} al contabilizar`); return r.nombre || r.usuario || r.cuarentena }))
  const nombres = ordena(new Set(codigos.map((c) => String(t[c]?.name ?? '').replace(/\s*\(.*\)\s*$/, '').trim()).filter(Boolean)))
  const nombreTapado = nombres.filter((n) => tapa(`Abrí ${n} y sale el error`).nombre > 0)
  const ns = notas(clon).map((n) => String(n.title ?? '')).filter(Boolean)
  const tituloTapado = ns.filter((n) => tapa(`Revisé la nota «${n}» y sigue igual`).nombre > 0)
  return {
    codigos: { total: codigos.length, tapados: codigoTapado.length, ejemplos: codigoTapado.slice(0, 8) },
    nombresDeTransaccion: { total: nombres.length, tapados: nombreTapado.length, ejemplos: nombreTapado.slice(0, 8).map((n) => `${n} → ${tapa(`Abrí ${n} y sale el error`).texto}`) },
    titulosDeNota: { total: ns.length, tapados: tituloTapado.length, ejemplos: tituloTapado.slice(0, 3) },
  }
}

const primerModulo = (v) => (Array.isArray(v?.modules) && v.modules.length ? String(v.modules[0]) : '(sin módulo)')

/** Por módulo: cuántos T-codes entrarían como candidato (módulo que Soporte SAP atiende) y cuántos no. */
export function candidatosPorModulo(clon) {
  const t = tcodes(clon)
  const filas = new Map()
  for (const [codigo, v] of Object.entries(t)) {
    const m = primerModulo(v)
    const entra = (v?.modules ?? []).some((x) => ALCANCE.has(String(x)))
    const f = filas.get(m) ?? { modulo: m, entran: 0, noEntran: 0 }
    if (entra) f.entran++
    else f.noEntran++
    filas.set(m, f)
    void codigo
  }
  const lista = [...filas.values()].sort((a, b) => (a.modulo < b.modulo ? -1 : 1))
  const ns = notas(clon)
  const notaEntra = (n) => (n.modules ?? []).some((x) => ALCANCE.has(String(x)) || String(x) === 'ALL')
  return {
    tcodes: lista,
    totalTcodes: { entran: lista.reduce((s, f) => s + f.entran, 0), noEntran: lista.reduce((s, f) => s + f.noEntran, 0) },
    notas: { entran: ns.filter(notaEntra).length, noEntran: ns.filter((n) => !notaEntra(n)).length },
  }
}

/** El cruce entero. */
export function cruce(clon) {
  const codigos = ordena(Object.keys(tcodes(clon)))
  const triage = reconocidosPorElTriage(codigos)
  return {
    triage: { total: codigos.length, reconocidos: triage.si.length, cuales: triage.si, noReconocidos: triage.no.length },
    anonimizador: confundidosConNombres(clon),
    candidatos: candidatosPorModulo(clon),
  }
}
