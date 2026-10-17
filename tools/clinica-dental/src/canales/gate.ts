/**
 * La puerta de los canales REALES (el patron de `ventas-whatsapp`): un adaptador que habla con Gmail o con la
 * Bot API de Telegram se niega a construirse sin `CLINICA_C3_C4_FIRMADOS === '1'`. Telegram es un canal de
 * chat externo (superficie de entrada no autenticada hacia un agente): AGENTS.md exige modelo de amenazas (C3),
 * AISIA (C4) y gate humano antes de conectarlo. El correo saca datos de salud de terceros del perimetro.
 * En el laboratorio esa variable no existe: todo va contra los simuladores.
 */
export class GateCerrado extends Error {
  constructor(canal: string) {
    super(`el adaptador real de ${canal} exige C3 y C4 firmados y gate humano (CLINICA_C3_C4_FIRMADOS=1): el canal queda contra el simulador`);
    this.name = 'GateCerrado';
  }
}

export type Entorno = Readonly<Record<string, string | undefined>>;

export function exigeGate(canal: string, env: Entorno): void {
  if (env['CLINICA_C3_C4_FIRMADOS'] !== '1') throw new GateCerrado(canal);
}
