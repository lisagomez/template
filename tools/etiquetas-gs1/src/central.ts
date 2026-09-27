/**
 * El central: donde viven las anclas firmadas, las llaves PUBLICAS de cada sitio y los
 * incidentes. La sucursal no escribe aqui; solo le PIDE al central que acepte un ancla, y el
 * central la acepta si la firma es de la llave registrada del sitio y continua la anterior.
 *
 * Puro: el almacen del central se inyecta igual que el de los sitios (archivo en
 * `./almacenes/central`, tabla `eti_ancla` en la propuesta del ERP).
 */
import { aceptaAncla, verificaSitio, type AnclaFirmada, type InformeIntegridad, type Testigo, type VerificaFirma } from './anclaje.js'
import { verificaTransferencias, type Evento } from './cadena.js'

export interface LlaveSitio {
  /** Huella (`ed25519:...`). */
  readonly id: string
  /** SPKI DER en base64. Publica: puede mostrarse. */
  readonly publica: string
  readonly registrada: string
}

export type OrigenIncidente = 'agente' | 'auditoria' | 'anclaje'

export interface Incidente {
  readonly id: string
  readonly fecha: string
  readonly sitio: string
  readonly origen: OrigenIncidente
  readonly motivo: string
}

export interface EstadoCentral {
  readonly v: 1
  readonly llaves: Readonly<Record<string, LlaveSitio>>
  readonly anclas: Readonly<Record<string, readonly AnclaFirmada[]>>
  /** Cabezas que cada sitio aviso al crecer su cadena. */
  readonly testigos: Readonly<Record<string, readonly Testigo[]>>
  readonly incidentes: readonly Incidente[]
}

export const centralVacio = (): EstadoCentral => ({ v: 1, llaves: {}, anclas: {}, testigos: {}, incidentes: [] })

/**
 * El sitio avisa su cabeza. Si retrocede (una secuencia menor que la ya vista) o cambia (la misma
 * secuencia con otro hash), el central no la acepta y abre un incidente.
 */
export function recibeTestigo(c: EstadoCentral, sitio: string, t: Testigo): { central: EstadoCentral; ok: boolean; motivo?: string } {
  const vistos = c.testigos?.[sitio] ?? []
  const ultimo = vistos.at(-1)
  const motivo = ultimo && t.seq < ultimo.seq ? `la cadena retrocedió: el central vio el evento #${ultimo.seq} y ahora la cabeza es #${t.seq}`
    : vistos.some((v) => v.seq === t.seq && v.cabeza !== t.cabeza) ? `el evento #${t.seq} cambió después de avisarse al central` : undefined
  if (motivo) return { central: abreIncidente(c, { fecha: t.fecha, sitio, origen: 'anclaje', motivo }), ok: false, motivo }
  if (ultimo?.seq === t.seq) return { central: c, ok: true }
  return { central: { ...c, testigos: { ...c.testigos, [sitio]: [...vistos, t] } }, ok: true }
}

/** Alta de la llave publica de un sitio. Cambiarla despues es rotacion: queda como incidente. */
export function registraLlave(c: EstadoCentral, sitio: string, llave: LlaveSitio, cuando: string): EstadoCentral {
  const previa = c.llaves[sitio]
  if (previa?.id === llave.id) return c
  const incidentes = previa ? [...c.incidentes, { id: `inc-${c.incidentes.length + 1}`, fecha: cuando, sitio, origen: 'anclaje' as const, motivo: `rotación de llave: ${previa.id} → ${llave.id}` }] : c.incidentes
  return { ...c, llaves: { ...c.llaves, [sitio]: llave }, incidentes }
}

/** El central recibe un ancla: la guarda si es valida; si no, la rechaza y abre un incidente. */
export function recibeAncla(c: EstadoCentral, af: AnclaFirmada, verifica: VerificaFirma, cuando: string): { central: EstadoCentral; ok: boolean; motivo?: string } {
  const sitio = af.ancla.sitio
  const llave = c.llaves[sitio]
  if (!llave) return { central: c, ok: false, motivo: `el sitio ${sitio} no tiene llave registrada en el central` }
  const previas = c.anclas[sitio] ?? []
  const r = aceptaAncla(af, previas, llave.id, verifica, c.testigos?.[sitio] ?? [])
  if (!r.ok) return { central: abreIncidente(c, { fecha: cuando, sitio, origen: 'anclaje', motivo: `ancla rechazada: ${r.motivo}` }), ok: false, motivo: r.motivo }
  return { central: { ...c, anclas: { ...c.anclas, [sitio]: [...previas, af] } }, ok: true }
}

export function abreIncidente(c: EstadoCentral, i: Omit<Incidente, 'id'>): EstadoCentral {
  if (c.incidentes.some((x) => x.sitio === i.sitio && x.motivo === i.motivo && x.fecha.slice(0, 10) === i.fecha.slice(0, 10))) return c
  return { ...c, incidentes: [...c.incidentes, { id: `inc-${c.incidentes.length + 1}`, ...i }] }
}

export interface Auditoria {
  readonly sitios: readonly InformeIntegridad[]
  readonly transferencias: readonly { readonly sitio: string; readonly seq: number; readonly detalle: string }[]
  readonly ok: boolean
}

/** Lo que hace quien audita desde el central: cada sitio contra sus anclas, y los enlaces entre sitios. */
export function audita(cadenas: Readonly<Record<string, readonly Evento[]>>, c: EstadoCentral, verifica: VerificaFirma, sitios: readonly string[]): Auditoria {
  const informes = sitios.map((s) => verificaSitio(s, cadenas[s] ?? [], c.anclas[s] ?? [], c.llaves[s]?.id ?? '', verifica, c.testigos?.[s] ?? []))
  const transferencias = verificaTransferencias(cadenas)
  return { sitios: informes, transferencias, ok: informes.every((i) => i.ok) && transferencias.length === 0 }
}
