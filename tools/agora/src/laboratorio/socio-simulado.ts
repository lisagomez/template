/**
 * El socio SIMULADO: llama a la Puerta como lo haría un agente externo real (token ES256 con su kid, su card_sha256 y
 * un jti nuevo), sin red. Los escenarios del laboratorio (y de la evidencia) salen de aquí: una llamada válida, la
 * tarjeta re-firmada con skills nuevas, otro kid, el mismo jti dos veces, fuera de alcance, sobre el tope y revocado.
 */
import { randomUUID } from 'node:crypto'
import type { Base } from '../base/tipos.js'
import { puerta, type RespuestaPuerta } from '../puerta.js'
import { firmaTarjeta, huellaDeTarjeta, llavesDesde } from '../llaves.js'
import { nodo } from './datos.js'
import { socio, tarjetaDe, tokenDeSocio } from './socios.js'

export interface LlamadaDeSocio { org?: string; skill?: string; categoria?: string; texto?: string; propuesta?: { resumen: string; payload: unknown }; jti?: string; token?: string; messageId?: string }

export async function llamaComoSocio(base: Base, secreto: string, clave: string, l: LlamadaDeSocio = {}): Promise<RespuestaPuerta & { jti: string }> {
  const s = socio(clave)
  const jti = l.jti ?? randomUUID()
  const org = l.org ?? 'golfo-norte'
  const token = l.token ?? tokenDeSocio(s, org, { jti })
  const [cat, skills] = s.agente.alcance[0]!
  const parts: Array<Record<string, unknown>> = [{ kind: 'text', text: l.texto ?? 'Hola desde el socio simulado.' }]
  if (l.propuesta) parts.push({ kind: 'data', data: { propuesta: l.propuesta } })
  const r = await puerta(base, secreto, { org, version: '1.0', autorizacion: `Bearer ${token}`, cuerpo: { jsonrpc: '2.0', id: 1, method: 'SendMessage', params: {
    message: { messageId: l.messageId ?? randomUUID(), role: 'user', parts, metadata: { categoria: l.categoria ?? nodo(cat), skill: l.skill ?? skills[0] } } } } })
  return { ...r, jti }
}

/** Una tarjeta re-firmada con capacidades nuevas: su firma es válida, pero su huella ya no es la aprobada. */
export function tokenConTarjetaRefirmada(clave: string, org = 'golfo-norte'): string {
  const s = socio(clave)
  const nueva = firmaTarjeta(tarjetaDe(s.agente, { skills: [{ id: 'mover_dinero', name: 'mover dinero', description: 'nueva', tags: [] }] }), s.par)
  return tokenDeSocio(s, org, { cardSha256: huellaDeTarjeta(nueva) })
}

/** Un token firmado con OTRA llave (otro kid): la Puerta no la tiene fijada. */
export function tokenConOtraLlave(clave: string, org = 'golfo-norte'): string {
  const s = socio(clave)
  const otra = { ...s, par: llavesDesde(`otra:${clave}`, `${s.agente.kid}-b`) }
  return tokenDeSocio(otra, org)
}

/** Un token firmado con otra llave pero declarando el kid fijado (firma inválida). */
export function tokenConFirmaAjena(clave: string, org = 'golfo-norte'): string {
  const s = socio(clave)
  const otra = { ...s, par: { ...llavesDesde(`ajena:${clave}`, s.agente.kid!), kid: s.agente.kid! } }
  return tokenDeSocio(otra, org)
}
