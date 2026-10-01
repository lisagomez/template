/**
 * El lado cliente de la fase 3: el bus de la plataforma delega en `pedidos` y `atribucion`
 * REMOTOS con el cliente del SDK. Antes de delegar descarga la Agent Card y verifica su FIRMA
 * contra las llaves de confianza: una tarjeta falsa o alterada no recibe ni una tarea.
 */
import { Role, type AgentCard, type Task } from '@a2a-js/sdk';
import { ClientFactory, ClientFactoryOptions, JsonRpcTransportFactory, type Client } from '@a2a-js/sdk/client';
import type { AgentCardSignatureVerifier } from '@a2a-js/sdk';
import type { Destino, Solicitud } from '../agente/a2a-modelo.js';
import { deTaskSdk } from './pasarela.js';

export interface OpcionesDestinoRemoto {
  dominio: string;
  /** URL de la Agent Card del dominio. */
  urlTarjeta: string;
  fetch: typeof fetch;
  /** El token de cliente del inquilino (con sus dominios permitidos). */
  token: (tenant: string) => string;
  verificador: AgentCardSignatureVerifier;
}

export class TarjetaNoConfiable extends Error {}

export async function tarjetaVerificada(urlTarjeta: string, f: typeof fetch, verificador: AgentCardSignatureVerifier): Promise<AgentCard> {
  const r = await f(urlTarjeta);
  if (!r.ok) throw new TarjetaNoConfiable(`no se pudo leer la Agent Card (${r.status})`);
  const card = (await r.json()) as AgentCard;
  try { await verificador(card); } catch { throw new TarjetaNoConfiable('la firma de la Agent Card no verifica: no se delega'); }
  return card;
}

export function destinoRemoto(o: OpcionesDestinoRemoto): Destino {
  let tarjeta: Promise<AgentCard> | null = null;
  const clientes = new Map<string, Promise<Client>>();
  const clienteDe = (tenant: string) => {
    let c = clientes.get(tenant);
    if (!c) {
      tarjeta ??= tarjetaVerificada(o.urlTarjeta, o.fetch, o.verificador);
      const conToken: typeof fetch = (entrada, init) => {
        const cabeceras = new Headers(init?.headers);
        cabeceras.set('authorization', `Bearer ${o.token(tenant)}`);
        return o.fetch(entrada, { ...init, headers: cabeceras });
      };
      const fabrica = new ClientFactory(ClientFactoryOptions.createFrom(ClientFactoryOptions.default, { transports: [new JsonRpcTransportFactory({ fetchImpl: conToken })] }));
      c = tarjeta.then((card) => fabrica.createFromAgentCard(card));
      clientes.set(tenant, c);
    }
    return c;
  };
  return {
    tipo: 'remoto',
    async envia(s: Solicitud) {
      const cliente = await clienteDe(s.tenant);
      const r = await cliente.sendMessage({
        tenant: s.tenant,
        message: {
          messageId: s.messageId, contextId: s.contextId, taskId: '', role: Role.ROLE_USER,
          parts: [{ content: { $case: 'data', value: { skill: s.skill, datos: s.datos } }, metadata: undefined, filename: '', mediaType: 'application/json' }],
          metadata: undefined, extensions: [], referenceTaskIds: [],
        },
        configuration: undefined, metadata: undefined,
      });
      if (!('status' in r)) throw new Error('el agente respondió con un mensaje, se esperaba una tarea');
      return deTaskSdk(r as Task, s.tenant, o.dominio, s.skill);
    },
  };
}
