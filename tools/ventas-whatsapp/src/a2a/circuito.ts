/**
 * El circuito del laboratorio con la fase 3 encendida: `pedidos` y `atribucion` viven detrás de la
 * pasarela A2A (SDK oficial, JSON-RPC, protocolo 1.0) y el bus de la plataforma les habla con el
 * cliente del SDK, verificando la firma de sus Agent Cards. Todo en proceso: el `fetch` del cliente
 * llama a la pasarela sin red.
 */
import { generateKeyPairSync } from 'node:crypto';
import { verifyAgentCardSignature } from '@a2a-js/sdk';
import { creaCircuito, type OpcionesCircuito } from '../laboratorio/circuito.js';
import { agentePedidos } from '../dominios/pedidos.js';
import { agenteAtribucion } from '../atribucion/dominio.js';
import { creaPasarelaA2A, emiteTokenA2A } from './pasarela.js';
import { destinoRemoto } from './cliente.js';

export const BASE_A2A = 'https://agentes.laboratorio.test';
export const KID_PLATAFORMA = 'plataforma-2026-10';

export function creaCircuitoA2A(o: Omit<OpcionesCircuito, 'remotos'> = {}) {
  const firma = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const secretoTokens = 'secreto-tokens-a2a-laboratorio';
  let pasarela: ReturnType<typeof creaPasarelaA2A> | null = null;
  const verificador = verifyAgentCardSignature(async (kid) => {
    if (kid !== KID_PLATAFORMA) throw new Error('llave desconocida');
    return firma.publicKey;
  });
  const circuito = creaCircuito({
    ...o,
    remotos: (deps) => {
      pasarela = creaPasarelaA2A({ base: BASE_A2A, agentes: [agentePedidos, agenteAtribucion], contexto: deps.contexto, bus: deps.bus, secretoTokens, llaveFirma: firma.privateKey, kid: KID_PLATAFORMA, reloj: deps.reloj });
      const p = pasarela;
      const enProceso: typeof fetch = async (entrada, init) => p.atiende(new Request(entrada, init));
      const token = (tenant: string) => emiteTokenA2A(secretoTokens, { tenant, dominios: ['pedidos', 'atribucion'], exp: deps.reloj() + 365 * 86_400_000 });
      return {
        pedidos: destinoRemoto({ dominio: 'pedidos', urlTarjeta: `${BASE_A2A}/a2a/pedidos/.well-known/agent-card.json`, fetch: enProceso, token, verificador }),
        atribucion: destinoRemoto({ dominio: 'atribucion', urlTarjeta: `${BASE_A2A}/a2a/atribucion/.well-known/agent-card.json`, fetch: enProceso, token, verificador }),
      };
    },
  });
  return Object.assign(circuito, { pasarela: () => pasarela!, secretoTokens, llavePublicaA2A: firma.publicKey, verificador });
}
