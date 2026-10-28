/**
 * Los socios SIMULADOS del laboratorio: cada agente externo ficticio con su par de llaves ES256 (derivado de una
 * semilla fija, así la llave es la misma en cada corrida) y su Agent Card firmada. La Puerta nunca los ve como
 * código: los ve como tokens y tarjetas, igual que vería a un socio real.
 */
import { firmaJwt, firmaTarjeta, huellaDeTarjeta, llavesDesde, type ParDeLlaves } from '../llaves.js'
import { AGENTES, type Agente } from './datos.js'
import { randomUUID } from 'node:crypto'

export interface Socio { agente: Agente; par: ParDeLlaves; tarjeta: Record<string, unknown>; huella: string }

export function tarjetaDe(a: Agente, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const skills = a.alcance.flatMap(([, s]) => s)
  return {
    protocolVersion: '0.3.0',
    name: a.nombre,
    description: a.descripcion,
    url: (a.url ?? '').replace('/.well-known/agent-card.json', '/a2a'),
    version: `v${a.version}`,
    provider: { organization: a.responsable },
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills: skills.map((id) => ({ id, name: id.replace(/_/g, ' '), description: `Skill ${id} del socio (ficticio).`, tags: ['agora'] })),
    securitySchemes: { idCard: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    security: [{ idCard: [] }],
    ...extra,
  }
}

export function socio(clave: string, semilla = `socio:${clave}`): Socio {
  const agente = AGENTES.find((a) => a.clave === clave && a.origen === 'externo')
  if (!agente || !agente.kid) throw new Error(`no hay socio simulado ${clave}`)
  const par = llavesDesde(semilla, agente.kid)
  const tarjeta = firmaTarjeta(tarjetaDe(agente), par)
  return { agente, par, tarjeta, huella: huellaDeTarjeta(tarjeta) }
}

/** Un token del socio para llamar a la Puerta: iss = su agente, aud = la organización, card_sha256 de su tarjeta, jti único. */
export function tokenDeSocio(s: Socio, org: string, o: { jti?: string; vidaS?: number; cardSha256?: string; ahora?: number; skill?: string } = {}): string {
  const ahora = Math.floor((o.ahora ?? Date.now()) / 1000)
  return firmaJwt({ iss: s.agente.clave, aud: `agora:${org}`, iat: ahora, nbf: ahora - 5, exp: ahora + (o.vidaS ?? 300), jti: o.jti ?? randomUUID(),
    card_sha256: o.cardSha256 ?? s.huella, ...(o.skill ? { skill: o.skill } : {}) }, s.par)
}
