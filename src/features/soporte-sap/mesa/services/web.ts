/**
 * La fuente web de BASIS en la mesa: los candidatos que salen del CVE List (notas de seguridad que SAP publica como CNA),
 * de KEV y de la documentación de SAP en SAP-docs, y el cruce con sapstack. La mesa NO sale a la web: lee el catálogo
 * generado y el pin, que están en el repo. Capturar y revisar lo hace el laboratorio en su máquina (`extrae.mjs`).
 *
 * El catálogo solo se carga si es el generado para el pin: su huella cuadra y sus SHA y su fecha de captura son los de
 * `pin.json`. Uno editado a mano o de otra captura no da candidatos, y la pantalla dice por qué.
 */
import { createHash } from 'node:crypto'
import catalogoFuentesJson from '../fuentes/web/catalogo.json'
import candidatosWebJson from '../fuentes/web/candidatos-web.json'
import pinJson from '../fuentes/web/pin.json'
import type { Candidato, Corroboracion, FuenteWebVista, ResumenWeb, RevisionWeb } from './modelo-candidatos'

export interface CatalogoWebGenerado {
  readonly pin: { readonly capturadoEl: string; readonly cvelist: string; readonly kev: string; readonly sapDocs: Readonly<Record<string, string>> }
  readonly huella: string
  readonly resumen: ResumenWeb
  readonly candidatos: readonly Candidato[]
  readonly corroboraciones: Readonly<Record<string, Corroboracion>>
}
export interface PinWeb {
  readonly capturadoEl: string
  readonly ventana: { readonly desde: string; readonly hasta: string }
  readonly ultimoPatchDay: string
  readonly cvelist: { readonly repo: string; readonly web: string; readonly sha: string; readonly licencia: string }
  readonly kev: { readonly repo: string; readonly web: string; readonly sha: string; readonly catalogVersion: string; readonly licencia: string }
  readonly sapDocs: ReadonlyArray<{ readonly id: string; readonly repo: string; readonly web: string; readonly sha: string; readonly guia: string; readonly licencia: string }>
  readonly revision?: RevisionWeb
}
type Valido = { readonly candidatos: readonly Candidato[]; readonly corroboraciones: Readonly<Record<string, Corroboracion>>; readonly motivo: string | null }

const pinDe = (p: PinWeb) => ({ capturadoEl: p.capturadoEl, cvelist: p.cvelist.sha, kev: p.kev.sha, sapDocs: Object.fromEntries(p.sapDocs.map((s) => [s.id, s.sha])) })

/** Los candidatos web, solo si el catálogo es el generado para el pin: misma captura y huella íntegra. Si no, el motivo. */
export function catalogoWebValido(c: CatalogoWebGenerado, pin: PinWeb): Valido {
  const nada = (motivo: string): Valido => ({ candidatos: [], corroboraciones: {}, motivo })
  if (JSON.stringify(c.pin) !== JSON.stringify(pinDe(pin))) return nada(`el catálogo web es de otra captura (${c.pin?.capturadoEl ?? '?'}, CVE List ${String(c.pin?.cvelist ?? '?').slice(0, 12)}) y el pin es del ${pin.capturadoEl} (${pin.cvelist.sha.slice(0, 12)}): hay que volver a extraer`)
  const huella = `sha256:${createHash('sha256').update(JSON.stringify({ candidatos: c.candidatos, corroboraciones: c.corroboraciones, resumen: c.resumen })).digest('hex')}`
  if (huella !== c.huella) return nada('el catálogo web no es el generado: su huella no cuadra (se editó a mano). Se regenera con extrae.mjs web')
  if (c.candidatos.some((x) => !x.captura || x.captura.fecha !== pin.capturadoEl)) return nada('hay un candidato web sin su captura fijada')
  return { candidatos: c.candidatos, corroboraciones: c.corroboraciones, motivo: null }
}

const PIN = pinJson as unknown as PinWeb
const CATALOGO = catalogoWebValido(candidatosWebJson as unknown as CatalogoWebGenerado, PIN)
const NOMBRES = new Map(catalogoFuentesJson.fuentes.map((f) => [f.id, f.nombre]))

export const catalogoWeb = (): readonly Candidato[] => CATALOGO.candidatos
export const corroboracionDe = (id: string): Corroboracion | undefined => CATALOGO.corroboraciones[id]

/** Lo que la pantalla enseña de la fuente web: sus pins, la captura, la última revisión y si el catálogo es íntegro. */
export function fuenteWeb(): FuenteWebVista {
  const pins = [
    { id: 'cvelist', nombre: NOMBRES.get('cvelist') ?? PIN.cvelist.repo, web: PIN.cvelist.web, sha: PIN.cvelist.sha, licencia: PIN.cvelist.licencia },
    { id: 'kev', nombre: NOMBRES.get('kev') ?? PIN.kev.repo, web: PIN.kev.web, sha: PIN.kev.sha, licencia: PIN.kev.licencia },
    ...PIN.sapDocs.map((s) => ({ id: s.id, nombre: NOMBRES.get(s.id) ?? s.repo, web: s.web, sha: s.sha, licencia: s.licencia })),
  ]
  const integro = CATALOGO.motivo === null
  return {
    capturadoEl: PIN.capturadoEl, ventana: PIN.ventana, ultimoPatchDay: PIN.ultimoPatchDay, pins, kevVersion: PIN.kev.catalogVersion,
    revision: PIN.revision ?? null, resumen: integro ? (candidatosWebJson as unknown as CatalogoWebGenerado).resumen : null, integro, motivo: CATALOGO.motivo,
  }
}
