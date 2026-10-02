/**
 * Lo que corre en el servidor de Next: las dos pymes SINTÉTICAS selladas (con el lector de CFDI
 * del extractor), el orquestador con agentes simulados, y la pasarela A2A si hay llave y secreto.
 * Sin LLM real (decisión del laboratorio): el adaptador real existe y dice «no medido».
 */
import { createPrivateKey } from 'node:crypto';
import { z } from 'zod';
import * as xml from '../../../../tools/extractor-documental/dist/xml/index.js';
import { construyeDe, preparaPyme } from '../../../../tools/crecimiento-demostrado/dist/laboratorio/index.js';
import { creaPasarela } from '../../../../tools/crecimiento-demostrado/dist/a2a/index.js';
import { creaOrquestador, NarradorSimulado, ProponenteSimulado, type Respuesta } from './nucleo';

export type IdDePyme = 'distribuidora' | 'tienda';

export const PYMES: Readonly<Record<IdDePyme, { readonly etiqueta: string; readonly modelo: string; readonly ejemplos: readonly string[] }>> = {
  distribuidora: {
    etiqueta: 'Distribuidora Sotavento', modelo: 'B2B · mayoreo en Veracruz',
    ejemplos: ['¿De dónde salió el crecimiento del trimestre?', '¿El 70 % del crecimiento viene de la expansión?', '¿Qué clientes perdí y cuánto me costaron?', '¿La caída de frecuencia de los mayoristas es real?', '¿Debo subir precios 5 %?', '¿De dónde salió el crecimiento del 1T 2026?'],
  },
  tienda: {
    etiqueta: 'Abarrotes La Esquina', modelo: 'B2C · caja de barrio en Xalapa',
    ejemplos: ['¿De dónde salió el crecimiento del trimestre?', '¿El ticket subió de verdad o es ruido?', '¿Subió el ticket promedio?', '¿La caída de visitas es real o ruido?', '¿Cómo se repartió entre transacciones y ticket? palancas', '¿Debo subir precios?'],
  },
};

export const esPyme = (x: unknown): x is IdDePyme => x === 'distribuidora' || x === 'tienda';

/** La entrada de la pantalla (query string), validada: lo que no encaja cae al valor por omisión. */
export const esquemaConsulta = z.object({
  pyme: z.enum(['distribuidora', 'tienda']).catch('distribuidora'),
  q: z.string().trim().min(3).max(500).optional().catch(undefined),
  replay: z.literal('1').optional().catch(undefined),
});
export const pymeLista = (id: IdDePyme) => preparaPyme(xml, id);

export async function responde(id: IdDePyme, pregunta: string): Promise<Respuesta> {
  const { pyme, gamma } = pymeLista(id);
  return creaOrquestador({ proponente: new ProponenteSimulado(), narrador: new NarradorSimulado() }).responde(pregunta, gamma, pyme.especificacion);
}

/** Replay: Γ reconstruido DESDE LAS FUENTES (otro objeto, sin caché de índice) y la misma pregunta. */
export async function replay(id: IdDePyme, pregunta: string): Promise<{ gamma: string; certificado: string | null }> {
  const c = construyeDe(xml, id);
  if (!c.ok) return { gamma: 'no sella', certificado: null };
  const r = await creaOrquestador({ proponente: new ProponenteSimulado(), narrador: new NarradorSimulado() }).responde(pregunta, c.gamma, pymeLista(id).pyme.especificacion);
  return { gamma: c.gamma.hash, certificado: r.veredicto?.estado === 'aceptada' ? r.veredicto.certificado.hash : null };
}

const TENANTS: Readonly<Record<string, IdDePyme>> = { 'distribuidora-sotavento': 'distribuidora', 'tienda-la-esquina': 'tienda' };
let pasarela: ReturnType<typeof creaPasarela> | null = null;

/**
 * La pasarela A2A del proceso. Apagada sin `CRECIMIENTO_A2A_SECRETO` y `CRECIMIENTO_A2A_LLAVE`
 * (PEM en base64): no hay secreto por omisión en el código. Local: exponerla es gate humano.
 */
export function pasarelaDelServidor(base: string): ReturnType<typeof creaPasarela> | null {
  if (pasarela) return pasarela;
  const secreto = process.env['CRECIMIENTO_A2A_SECRETO'];
  const llave = process.env['CRECIMIENTO_A2A_LLAVE'];
  if (!secreto || !llave) return null;
  pasarela = creaPasarela({
    base, secretoTokens: secreto, llaveFirma: createPrivateKey(Buffer.from(llave, 'base64').toString('utf8')), kid: 'crecimiento-local',
    contexto: async (t) => (TENANTS[t] ? { gamma: pymeLista(TENANTS[t]).gamma, especificacion: pymeLista(TENANTS[t]).pyme.especificacion } : null),
    agentes: () => ({ proponente: new ProponenteSimulado(), narrador: new NarradorSimulado() }),
  });
  return pasarela;
}
