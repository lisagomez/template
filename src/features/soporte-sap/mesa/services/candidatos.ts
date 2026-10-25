/**
 * Los candidatos de la mesa: hipótesis que salen de sapstack, fijado por SHA, para que el experto diga si son ciertas.
 * Lo que dice se guarda como PROPUESTA en el almacén de la mesa, filtrado, y lo lee el laboratorio. La mesa no siembra:
 * una regla nace en `tools/conocimiento`, con su fuente citada y la firma del laboratorio, nunca aquí.
 *
 * El catálogo solo se carga si es el generado: su huella cuadra y su SHA es el del pin. Uno editado a mano no da
 * candidatos (y la pantalla dice por qué).
 */
import { createHash } from 'node:crypto'
import catalogoJson from '../fuentes/sapstack/candidatos-sapstack.json'
import fuenteJson from '../fuentes/sapstack/fuente.json'
import { Rechazo } from '../../services/rechazo'
import type { IdentidadMesa } from './acceso'
import type { Almacen } from './almacen'
import { datoPersonalEn } from './filtro'
import { enFila } from './fila'
import type { AccionValida, Candidato, CandidatosVista, FuenteVista, ValidacionCandidato } from './modelo-candidatos'

const PREFIJO = 'mesa/validaciones'
const claveDe = (usuario: string, candidato: string) => `${PREFIJO}/${usuario}--${candidato}.json`

export interface CatalogoGenerado {
  readonly fuente: { readonly repo: string; readonly sha: string }
  readonly huella: string
  readonly candidatos: readonly Candidato[]
}
type Pin = { readonly repo: string; readonly sha: string }

/** Los candidatos, solo si el catálogo es el generado para el pin: misma fuente y huella íntegra. Si no, el motivo. */
export function catalogoValido(c: CatalogoGenerado, pin: Pin): { readonly candidatos: readonly Candidato[]; readonly motivo: string | null } {
  if (c.fuente?.repo !== pin.repo || c.fuente?.sha !== pin.sha) return { candidatos: [], motivo: `el catálogo es de ${c.fuente?.repo ?? '?'}@${String(c.fuente?.sha ?? '?').slice(0, 12)} y el pin es ${pin.repo}@${pin.sha.slice(0, 12)}: hay que volver a extraer` }
  const huella = `sha256:${createHash('sha256').update(JSON.stringify(c.candidatos)).digest('hex')}`
  if (huella !== c.huella) return { candidatos: [], motivo: 'el catálogo no es el generado: su huella no cuadra (se editó a mano). Se regenera con extrae.mjs' }
  return { candidatos: c.candidatos, motivo: null }
}

const CATALOGO = catalogoValido(catalogoJson as unknown as CatalogoGenerado, fuenteJson)
const POR_ID = new Map(CATALOGO.candidatos.map((c) => [c.id, c]))
export const catalogo = (): readonly Candidato[] => CATALOGO.candidatos
export const fuente = (): FuenteVista => ({ ...fuenteJson, integro: CATALOGO.motivo === null, motivo: CATALOGO.motivo })

async function lee(a: Almacen, clave: string): Promise<ValidacionCandidato | null> {
  const t = await a.lee(clave)
  return t ? (JSON.parse(t) as ValidacionCandidato) : null
}

/**
 * Lo que dice el experto de un candidato. Corregir pide la corrección; lo que escribe pasa el filtro antes de guardarse
 * (el primero, el de la ruta, ya miró toda la acción). Queda como propuesta: la firma vive fuera de la mesa.
 */
export async function validaCandidato(a: Almacen, id: IdentidadMesa, x: AccionValida): Promise<ValidacionCandidato> {
  const cand = POR_ID.get(x.candidato)
  if (!cand) throw new Rechazo('ese candidato no está en el catálogo fijado')
  if (x.valoracion === 'corrige' && !x.correccion) throw new Rechazo('di cómo es lo correcto, en una o dos frases')
  const escrito = { comentario: x.comentario || null, correccion: x.valoracion === 'corrige' ? x.correccion || null : null }
  const forma = datoPersonalEn(escrito)
  if (forma) throw new Rechazo(forma)
  const clave = claveDe(id.usuario, cand.id)
  return enFila(clave, async () => {
    const ahora = new Date().toISOString()
    const v: ValidacionCandidato = {
      version: 1, candidato: cand.id, valoracion: x.valoracion, ...escrito, estado: 'propuesta',
      por: { usuario: id.usuario, correo: id.correo, prueba: id.prueba }, creado: (await lee(a, clave))?.creado ?? ahora, actualizado: ahora,
    }
    await a.escribe(clave, JSON.stringify(v))
    return v
  })
}

/** Todas las validaciones guardadas. Con retención, las que pasan de ella se borran al listar (como los casos). */
export async function todasLasValidaciones(a: Almacen, retencionDias: number | null): Promise<ValidacionCandidato[]> {
  const todas = (await Promise.all((await a.lista(PREFIJO)).map(async (k) => ({ k, v: await lee(a, k) })))).filter((x): x is { k: string; v: ValidacionCandidato } => x.v !== null)
  if (retencionDias === null) return todas.map((x) => x.v)
  const limite = Date.now() - retencionDias * 86_400_000
  for (const x of todas.filter((y) => Date.parse(y.v.actualizado) < limite)) await a.borra(x.k)
  return todas.filter((y) => Date.parse(y.v.actualizado) >= limite).map((x) => x.v)
}

/** Lo que ve una identidad: el catálogo y SOLO sus validaciones (las de otros, ni el laboratorio las ve aquí). */
export async function vistaCandidatos(a: Almacen, id: IdentidadMesa, retencionDias: number | null): Promise<CandidatosVista> {
  const suyas = (await todasLasValidaciones(a, retencionDias)).filter((v) => v.por.usuario === id.usuario)
  return { fuente: fuente(), candidatos: catalogo(), mias: Object.fromEntries(suyas.map((v) => [v.candidato, v])) }
}
