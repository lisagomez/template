/**
 * La medición del piloto (spec 015, fase 6: RF-5, RF-8, RF-20 a RF-22). Pura: de las horas registradas y de los
 * documentos del buzón salen las cifras agregadas que el laboratorio se lleva, y nada más. Lo prueba `prueba:buzon`.
 *
 * Lo único de cada pyme que sale es su SEUDÓNIMO (RF-8). `sinFugas` lo comprueba sobre el texto final: si aparece
 * algo con forma de RFC, de folio fiscal o de correo, el archivo no sale.
 */
import { RFC } from '../types/index.ts'

export type Fase = 'previo' | 'piloto'

export interface RegistroDeHoras { readonly pyme_id: string; readonly mes: string; readonly fase: Fase; readonly horas: number; readonly cfdi_recibidos: number | null }
export interface PymeMedida { readonly id: string; readonly seudonimo: string; readonly consiente: boolean }
export interface DocumentoMedido {
  readonly pyme_id: string; readonly tipo: 'xml' | 'impresa'; readonly estado: string; readonly uuid: string | null
  readonly id: string; readonly recibido_en: string; readonly confirmado_en: string | null
}

export interface CifraDelMes {
  readonly pyme: string
  readonly mes: string
  readonly fase: Fase
  readonly horas: number
  readonly cfdi_recibidos: number | null
  /** Solo en el mes del piloto: los CFDI recibidos ese mes que no estaban confirmados al cerrarlo (RF-22). */
  readonly proporcion_pendientes: number | null
}

const mesDe = (fecha: string) => fecha.slice(0, 7)
const finDeMes = (mes: string): string => {
  const [a, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(a, m, 1)).toISOString()
}

/** Los CFDI de una pyme en un mes, contados una vez cada uno: ni el receptor ajeno ni la impresa de un XML cuentan. */
function cfdiDelMes(documentos: readonly DocumentoMedido[], pyme: string, mes: string): DocumentoMedido[] {
  const vistos = new Set<string>()
  return documentos.filter((d) => {
    if (d.pyme_id !== pyme || mesDe(d.recibido_en) !== mes || d.estado === 'receptor_ajeno' || d.estado === 'emparejada') return false
    const clave = d.uuid ?? d.id
    if (vistos.has(clave)) return false
    vistos.add(clave)
    return true
  })
}

/**
 * Las cifras agregadas, por pyme (con su seudónimo) y por mes. Una pyme que no consiente no aparece (RF-5). En el
 * mes previo los CFDI los declara el despacho; en el del piloto, los cuenta el buzón.
 */
export function cifras(pymes: readonly PymeMedida[], horas: readonly RegistroDeHoras[], documentos: readonly DocumentoMedido[]):
  { filas: CifraDelMes[]; pymesCompletas: number } {
  const consienten = new Map(pymes.filter((p) => p.consiente).map((p) => [p.id, p.seudonimo]))
  const filas: CifraDelMes[] = []
  for (const r of horas) {
    const pyme = consienten.get(r.pyme_id)
    if (!pyme) continue
    const mes = mesDe(r.mes)
    if (r.fase === 'previo') {
      filas.push({ pyme, mes, fase: 'previo', horas: r.horas, cfdi_recibidos: r.cfdi_recibidos, proporcion_pendientes: null })
      continue
    }
    const delMes = cfdiDelMes(documentos, r.pyme_id, mes)
    const cierre = finDeMes(mes)
    const pendientes = delMes.filter((d) => !d.confirmado_en || d.confirmado_en >= cierre).length
    filas.push({ pyme, mes, fase: 'piloto', horas: r.horas, cfdi_recibidos: delMes.length,
      proporcion_pendientes: delMes.length ? Math.round((pendientes / delMes.length) * 10000) / 10000 : null })
  }
  filas.sort((a, b) => a.pyme.localeCompare(b.pyme) || a.mes.localeCompare(b.mes))
  const fasesPorPyme = new Map<string, Set<Fase>>()
  for (const f of filas) fasesPorPyme.set(f.pyme, (fasesPorPyme.get(f.pyme) ?? new Set()).add(f.fase))
  const pymesCompletas = [...fasesPorPyme.values()].filter((s) => s.has('previo') && s.has('piloto')).length
  return { filas, pymesCompletas }
}

const RFC_SUELTO = new RegExp(RFC.source.replace(/^\^|\$$/g, ''), 'i')
const FOLIO = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const CORREO = /[^\s,"@]+@[^\s,"@]+\.[a-z]{2,}/i

/** Lo que no puede salir del despacho (RF-8). Devuelve qué se encontró; vacío = puede salir. */
export function sinFugas(texto: string): string[] {
  return [[RFC_SUELTO, 'algo con forma de RFC'], [FOLIO, 'algo con forma de folio fiscal'], [CORREO, 'un correo']]
    .filter(([patron]) => (patron as RegExp).test(texto)).map(([, que]) => que as string)
}

/** El CSV de cifras para el laboratorio: seudónimo y números. Si algo con forma de dato de una pyme se cuela, falla. */
export function cifrasACsv(filas: readonly CifraDelMes[]): string {
  const cuerpo = filas.map((f) => [f.pyme, f.mes, f.fase, f.horas, f.cfdi_recibidos ?? '', f.proporcion_pendientes ?? ''].join(','))
  const texto = ['pyme,mes,fase,horas,cfdi_recibidos,proporcion_pendientes', ...cuerpo].join('\r\n') + '\r\n'
  const fugas = sinFugas(texto)
  if (fugas.length) throw new Error(`las cifras no salen: llevan ${fugas.join(' y ')} (RF-8)`)
  return texto
}
