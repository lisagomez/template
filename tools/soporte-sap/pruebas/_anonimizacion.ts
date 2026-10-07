/**
 * La medición del anonimizador sobre el corpus sintético: todo lo que iría al sandbox (las
 * incidencias sin regla y las de nómina con datos sembrados) más variantes adversariales. Una FUGA es
 * un valor sensible sembrado que aparece en un texto que el anonimizador dejó ENTRAR. La referencia
 * es 0. Lo que va a cuarentena no fuga: no entra.
 */
import { validaRfc, validaCurp, validaNss, digitoVerificadorRfc, digitoVerificadorCurp } from '../../extractor-documental/dist/index.js'
import { anonimiza, generaCorpus, personaSintetica, ticketDeNomina, valoresSensibles, azar, type Validadores } from '../dist/index.js'
import { CASOS_ADVERSARIALES } from './_adversariales.ts'

export const VALIDADORES: Validadores = { rfc: (x) => validaRfc(x), curp: validaCurp, nss: validaNss }

export interface Caso { readonly id: string; readonly texto: string; readonly sensibles: readonly string[] }

/** Variantes que un detector ingenuo deja pasar: OCR que cambia 0 por O, guiones, mayúsculas, minúsculas. */
function adversariales(): Caso[] {
  const a = azar(99)
  const digitos = { rfc: digitoVerificadorRfc, curp: digitoVerificadorCurp }
  return Array.from({ length: 40 }, (_, k) => {
    const p = personaSintetica(a, digitos, 'aceros-del-norte')
    const variantes = [
      `Nómina: el RFC ${p.rfc.slice(0, 4)}${p.rfc.slice(4, 10).replace(/0/g, 'O')}${p.rfc.slice(10)} no cuadra para ${p.nombre}`,
      `Finiquito de ${p.nombre.toLowerCase()}: escribir a ${p.correo.toUpperCase()} o al ${p.telefono.replace(/ /g, '-')}`,
      `Recibo de nómina con CURP ${p.curp} y cuenta ${p.clabe}; empleado ${p.pernr}`,
      `Incapacidad de ${p.nombre}, NSS ${p.nss}, sueldo ${p.sueldo}`,
    ]
    const texto = variantes[k % variantes.length]!
    return { id: `adversarial-${k}`, texto, sensibles: valoresSensibles(p).filter((s) => texto.toLowerCase().includes(s.toLowerCase())) }
  })
}

/** Lo que iría al sandbox según el corpus, más las variantes propias y las del revisor adversarial. */
export function casosDelSandbox(): Caso[] {
  const c = generaCorpus({ rfc: digitoVerificadorRfc, curp: digitoVerificadorCurp })
  const delCorpus = c.incidencias.filter((i) => i.reglaDeOrigen === null || i.conDatosPersonales).map((i) => ({ id: i.id, texto: i.descripcion, sensibles: i.sensibles }))
  const sueltos = [personaSintetica(azar(5), { rfc: digitoVerificadorRfc, curp: digitoVerificadorCurp }, 'x')].map((p) => ({ id: 'nomina-suelta', texto: ticketDeNomina(p, 'Textiles del Golfo'), sensibles: valoresSensibles(p) }))
  const delRevisor = CASOS_ADVERSARIALES.map(([id, texto, sensibles]) => ({ id: `revisor-${id}`, texto, sensibles }))
  return [...delCorpus, ...sueltos, ...adversariales(), ...delRevisor]
}

const compacto = (s: string) => s.toLowerCase().replace(/[^a-z0-9ñ]/g, '')

/** ¿El valor sensible aparece en la salida, tal cual o sin separadores (un RFC partido en tres trozos)? */
export function fuga(salida: string, sensible: string): boolean {
  if (salida.toLowerCase().includes(sensible.toLowerCase())) return true
  const c = compacto(sensible)
  return c.length >= 6 && compacto(salida).includes(c)
}

export interface Medicion { readonly casos: number; readonly entran: number; readonly cuarentena: number; readonly conDatosSembrados: number; readonly fugas: ReadonlyArray<{ id: string; tipo: string }> }

export function mide(casos: readonly Caso[]): Medicion {
  let entran = 0, cuarentena = 0
  const fugas: Array<{ id: string; tipo: string }> = []
  for (const k of casos) {
    const r = anonimiza(k.texto, VALIDADORES)
    if (r.veredicto === 'cuarentena') { cuarentena++; continue }
    entran++
    for (const s of k.sensibles) if (fuga(r.texto, s)) fugas.push({ id: k.id, tipo: s.length > 20 ? 'texto largo' : `valor de ${s.length} caracteres` })
  }
  return { casos: casos.length, entran, cuarentena, conDatosSembrados: casos.filter((k) => k.sensibles.length).length, fugas }
}
