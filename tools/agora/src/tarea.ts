/**
 * El token de tarea de un agente: lo firma Ágora con su secreto y lo VERIFICA la base (`agora_priv.agente_de_tarea`),
 * con el formato de la sala A2A: base64url(JSON).hmac-sha256-base64url. Vive minutos; sin él, el rol de agente no
 * ve ni escribe nada.
 */
import { createHmac } from 'node:crypto'

export interface ClaimsTarea { org: string; agente: string; rol: 'agora_agente'; exp: number; tarea?: string }

export function firmaTarea(secreto: string, c: Omit<ClaimsTarea, 'rol' | 'exp'> & { exp?: number }, ahora = Date.now()): string {
  if (secreto.length < 32) throw new Error('el secreto de tareas tiene al menos 32 caracteres')
  const cuerpo = Buffer.from(JSON.stringify({ ...c, rol: 'agora_agente', exp: c.exp ?? ahora + 5 * 60_000 })).toString('base64url')
  return `${cuerpo}.${createHmac('sha256', secreto).update(cuerpo).digest('base64url')}`
}
