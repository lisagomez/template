/**
 * Anclaje: lo que convierte la cadena en prueba. Cada periodo (la noche, u opcionalmente cada hora)
 * el sitio calcula la raiz de Merkle (RFC 6962) de los eventos nuevos, la firma con SU llave y la
 * manda al central, que la guarda donde la sucursal no escribe. El central solo acepta un ancla
 * con firma valida y continua con la anterior.
 *
 * Con eso, quien audita detecta sin confiar en la sucursal:
 *  - un evento viejo alterado: su hash deja de cuadrar (cadena) o, si recalcularon todo, la raiz
 *    del periodo ya no es la anclada;
 *  - un evento borrado despues de anclar: el ancla dice hasta que secuencia llegaba;
 *  - una sucursal reescrita entera: sus raices recalculadas no son las firmadas.
 * Lo que queda sin anclar es la ventana de riesgo, y se reporta como tal.
 *
 * La firma se INYECTA (`VerificaFirma`): el nucleo no importa node:crypto; `firma.ts` la da en Node.
 */
import { canonico } from './jcs.js'
import { bytesDeHash, comoHash, utf8 } from './sha256.js'
import { genesis, hashDe, verificaCadena, type Evento, type Rotura } from './cadena.js'
import { pruebaInclusion, raizMerkle, verificaInclusion } from './merkle.js'

export interface Ancla {
  readonly v: 1
  readonly sitio: string
  /** `AAAA-MM-DD` (o con hora si se ancla por hora). */
  readonly periodo: string
  readonly desdeSeq: number
  readonly hastaSeq: number
  readonly n: number
  readonly raiz: string
  /** Hash del ultimo evento cubierto: une el ancla con la cadena. */
  readonly cabeza: string
  /** Hash del ancla anterior del sitio (genesis del sitio en la primera). */
  readonly anclaAnterior: string
  readonly creada: string
}

export interface AnclaFirmada {
  readonly ancla: Ancla
  /** Ed25519 sobre los bytes JCS del ancla, en base64. */
  readonly firma: string
  /** Identificador de la llave publica del sitio. */
  readonly llave: string
}

export type VerificaFirma = (mensaje: Uint8Array, firmaB64: string, llave: string) => boolean

/**
 * Testigo de cabeza: el sitio avisa al central de su cabeza (secuencia y hash) cada vez que la
 * cadena crece, sin esperar a la noche. Cierra el hueco del anclaje diario: borrar el ULTIMO
 * evento antes de anclar deja la cadena coherente, pero el central ya vio esa cabeza y el ancla
 * siguiente (o la auditoria) no la encuentra. La ventana que queda es la del aviso, no la del dia.
 */
export interface Testigo {
  readonly seq: number
  readonly cabeza: string
  readonly fecha: string
}

export const mensajeDeAncla = (a: Ancla): Uint8Array => utf8(canonico(a))
export const hashAncla = (a: Ancla): string => hashDe(a)

/** El ancla para los eventos que siguen a la ultima anclada (null si no hay nada nuevo). */
export function preparaAncla(sitio: string, eventos: readonly Evento[], previas: readonly AnclaFirmada[], periodo: string, creada: string): Ancla | null {
  const ultima = previas.at(-1)?.ancla
  const desde = (ultima?.hastaSeq ?? 0) + 1
  const nuevos = eventos.filter((e) => e.seq >= desde)
  if (nuevos.length === 0) return null
  return {
    v: 1, sitio, periodo, desdeSeq: desde, hastaSeq: nuevos.at(-1)!.seq, n: nuevos.length,
    raiz: comoHash(raizMerkle(nuevos.map((e) => bytesDeHash(e.hash)))), cabeza: nuevos.at(-1)!.hash,
    anclaAnterior: ultima ? hashAncla(ultima) : genesis(sitio), creada,
  }
}

export type RechazoAncla = { readonly ok: false; readonly motivo: string } | { readonly ok: true }

/** Lo que el central comprueba ANTES de guardar un ancla: firma y continuidad. */
export function aceptaAncla(af: AnclaFirmada, previas: readonly AnclaFirmada[], llaveDelSitio: string, verifica: VerificaFirma, testigos: readonly Testigo[] = []): RechazoAncla {
  if (af.llave !== llaveDelSitio) return { ok: false, motivo: 'firmada con una llave que no es la registrada para el sitio' }
  if (!verifica(mensajeDeAncla(af.ancla), af.firma, af.llave)) return { ok: false, motivo: 'la firma no es válida' }
  const ultima = previas.at(-1)?.ancla
  if (af.ancla.anclaAnterior !== (ultima ? hashAncla(ultima) : genesis(af.ancla.sitio))) return { ok: false, motivo: 'no continúa el ancla anterior' }
  if (af.ancla.desdeSeq !== (ultima?.hastaSeq ?? 0) + 1) return { ok: false, motivo: 'deja un hueco de secuencias con el ancla anterior' }
  const visto = testigos.reduce<Testigo | undefined>((m, t) => (!m || t.seq > m.seq ? t : m), undefined)
  if (visto && af.ancla.hastaSeq < visto.seq) return { ok: false, motivo: `la cadena retrocedió: el central vio el evento #${visto.seq} y el ancla llega hasta #${af.ancla.hastaSeq}` }
  const mismo = testigos.find((t) => t.seq === af.ancla.hastaSeq)
  if (mismo && mismo.cabeza !== af.ancla.cabeza) return { ok: false, motivo: `el evento #${mismo.seq} no es el que vio el central` }
  return { ok: true }
}

export interface VeredictoAncla {
  readonly periodo: string
  readonly desdeSeq: number
  readonly hastaSeq: number
  readonly ok: boolean
  readonly motivo?: string
}

export interface InformeIntegridad {
  readonly sitio: string
  readonly ok: boolean
  readonly eventos: number
  readonly cadena: { readonly ok: boolean; readonly rotura?: Rotura }
  readonly anclas: readonly VeredictoAncla[]
  /** Testigos de cabeza que el almacen ya no respalda (evento borrado o cambiado). */
  readonly testigos: readonly { readonly seq: number; readonly motivo: string }[]
  /** Eventos posteriores a la ultima ancla: la ventana todavia sin prueba externa. */
  readonly sinAnclar: number
  readonly primerFallo?: string
}

/**
 * Lo que hace quien audita: la cadena local y, ancla por ancla, firma, continuidad, raiz y cabeza
 * recalculadas desde los eventos que hay HOY en el almacen.
 */
export function verificaSitio(sitio: string, eventos: readonly Evento[], anclas: readonly AnclaFirmada[], llaveDelSitio: string, verifica: VerificaFirma, testigos: readonly Testigo[] = []): InformeIntegridad {
  const c = verificaCadena(sitio, eventos)
  const veredictos: VeredictoAncla[] = []
  let anterior = genesis(sitio)
  let esperado = 1
  for (const af of anclas) {
    const a = af.ancla
    const mal = (motivo: string) => veredictos.push({ periodo: a.periodo, desdeSeq: a.desdeSeq, hastaSeq: a.hastaSeq, ok: false, motivo })
    if (af.llave !== llaveDelSitio || !verifica(mensajeDeAncla(a), af.firma, af.llave)) { mal('firma inválida o de otra llave'); continue }
    if (a.anclaAnterior !== anterior || a.desdeSeq !== esperado) { mal('rompe la continuidad con el ancla anterior'); continue }
    anterior = hashAncla(a)
    esperado = a.hastaSeq + 1
    const tramo = eventos.filter((e) => e.seq >= a.desdeSeq && e.seq <= a.hastaSeq)
    const faltan = a.n - tramo.length
    if (faltan !== 0) { mal(`el ancla cubre ${a.n} eventos (#${a.desdeSeq}-#${a.hastaSeq}) y en el almacén hay ${tramo.length}: ${faltan > 0 ? `falta${faltan === 1 ? '' : 'n'} ${faltan} evento${faltan === 1 ? '' : 's'}` : 'sobran eventos'}`); continue }
    const raiz = comoHash(raizMerkle(tramo.map((e) => bytesDeHash(e.hash))))
    if (raiz !== a.raiz) { mal('la raíz de Merkle recalculada no es la anclada: se reescribió algún evento del periodo'); continue }
    if (tramo.at(-1)!.hash !== a.cabeza) { mal('la cabeza de la cadena no es la anclada'); continue }
    veredictos.push({ periodo: a.periodo, desdeSeq: a.desdeSeq, hastaSeq: a.hastaSeq, ok: true })
  }
  const sinAnclar = eventos.filter((e) => e.seq >= esperado).length
  const fallaAncla = veredictos.find((v) => !v.ok)
  const porSeq = new Map(eventos.map((e) => [e.seq, e]))
  const malTestigos = testigos.flatMap((t) => {
    const e = porSeq.get(t.seq)
    if (!e) return [{ seq: t.seq, motivo: `el central vio el evento #${t.seq} y en el almacén ya no está` }]
    return e.hash === t.cabeza ? [] : [{ seq: t.seq, motivo: `el evento #${t.seq} no es el que vio el central` }]
  })
  const primerFallo = !c.ok ? `evento #${c.rotura.seq}: ${c.rotura.detalle}`
    : fallaAncla ? `ancla del ${fallaAncla.periodo}: ${fallaAncla.motivo}`
      : malTestigos[0]?.motivo
  return {
    sitio, ok: c.ok && !fallaAncla && malTestigos.length === 0, eventos: eventos.length, cadena: c.ok ? { ok: true } : { ok: false, rotura: c.rotura },
    anclas: veredictos, testigos: malTestigos, sinAnclar, ...(primerFallo ? { primerFallo } : {}),
  }
}

export interface PruebaEvento {
  readonly periodo: string
  readonly indice: number
  readonly tamano: number
  readonly ruta: readonly string[]
  readonly raiz: string
}

/** Prueba de inclusion de un evento en la raiz anclada de su periodo (undefined si aun no se anclo). */
export function pruebaDeEvento(e: Evento, eventos: readonly Evento[], anclas: readonly AnclaFirmada[]): PruebaEvento | undefined {
  const af = anclas.find((x) => e.seq >= x.ancla.desdeSeq && e.seq <= x.ancla.hastaSeq)
  if (!af) return undefined
  const hojas = eventos.filter((x) => x.seq >= af.ancla.desdeSeq && x.seq <= af.ancla.hastaSeq).map((x) => bytesDeHash(x.hash))
  const indice = e.seq - af.ancla.desdeSeq
  return { periodo: af.ancla.periodo, indice, tamano: hojas.length, ruta: pruebaInclusion(indice, hojas).map(comoHash), raiz: af.ancla.raiz }
}

export function verificaPruebaEvento(e: Evento, p: PruebaEvento): boolean {
  return verificaInclusion(bytesDeHash(e.hash), p.indice, p.tamano, p.ruta.map(bytesDeHash), bytesDeHash(p.raiz))
}
