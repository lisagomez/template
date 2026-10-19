/**
 * La puerta de los canales REALES, UNA POR CANAL. Un adaptador que habla con Gmail, con la Bot API de Telegram o
 * con la Cloud API de WhatsApp se niega a construirse salvo que se cumplan DOS cosas a la vez:
 *
 *   1. el CODIGO declara la revision firmada de la C3 + AISIA que cubre ESE canal (`REVISIONES_FIRMADAS`): un diff
 *      revisable, no una variable que cualquiera pone; y
 *   2. el ENTORNO trae `CLINICA_GATE_<CANAL>` con exactamente ese id de revision.
 *
 * Hasta la v1 habia una sola variable (`CLINICA_C3_C4_FIRMADOS=1`) que abria Gmail y Telegram A LA VEZ: firmar un
 * canal abria todos. Ya no la lee nadie. Telegram y WhatsApp son canales de chat externos (superficie de entrada
 * no autenticada hacia un agente): AGENTS.md exige modelo de amenazas (C3), AISIA (C4) y gate humano. El correo
 * saca datos de salud de terceros del perimetro. Hoy NINGUN canal tiene revision firmada para el canal real (las
 * del 2026-10-16 cubren solo el laboratorio): todo va contra los simuladores.
 */
export type CanalReal = 'correo' | 'telegram' | 'whatsapp';

/** La revision firmada de C3 + AISIA que cubre el canal REAL. `null` = no hay: el canal no abre con ningun entorno. */
export const REVISIONES_FIRMADAS: Readonly<Record<CanalReal, string | null>> = {
  correo: null,
  telegram: null,
  whatsapp: null,
};

export const variableDeGate = (canal: CanalReal): string => `CLINICA_GATE_${canal.toUpperCase()}`;

export class GateCerrado extends Error {
  constructor(canal: CanalReal) {
    super(`el adaptador real de ${canal} exige su revision firmada de C3 y AISIA declarada en el codigo y ${variableDeGate(canal)} con ese id (gate humano): el canal queda contra el simulador`);
    this.name = 'GateCerrado';
  }
}

export type Entorno = Readonly<Record<string, string | undefined>>;

export function exigeGate(canal: CanalReal, env: Entorno, revisiones: Readonly<Record<CanalReal, string | null>> = REVISIONES_FIRMADAS): void {
  const firmada = revisiones[canal];
  if (!firmada || env[variableDeGate(canal)] !== firmada) throw new GateCerrado(canal);
}
