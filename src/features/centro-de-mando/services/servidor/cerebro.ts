/**
 * El cerebro del centro de mando, del lado del servidor: el modelo sale del routing (clase
 * `cerebro-de-voz`, pineado), la llave del entorno (nunca se imprime) y el tope del libro de gasto.
 * Responde NDJSON en flujo: `{"t":"token","x":…}` por token, `{"t":"uso",…}` al final, o
 * `{"t":"error","mensaje":…}`. Solo sale TEXTO hacia OpenRouter; el audio nunca pasa por aquí.
 */
import { creaCerebroCompat } from '../../../../../tools/bucle-voz/dist/openrouter.js';
import type { Mensaje } from '../../../../../tools/bucle-voz/dist/index.js';
import { modeloPara } from '../../../../lib/ai/routing.ts';
import { anotaGasto, estadoGasto } from './gasto';
import { PROMPT_CEREBRO } from './prompt-cerebro';

export class SinPresupuesto extends Error {}
export class SinLlave extends Error {}

export function modeloCerebro(): string {
  return modeloPara('cerebro-de-voz').modelo;
}

/** Comprueba llave y tope ANTES de abrir el flujo: un 4xx limpio en vez de un flujo que muere. */
export async function compruebaCerebro(): Promise<void> {
  if (!process.env['OPENROUTER_API_KEY']) throw new SinLlave('falta OPENROUTER_API_KEY en el servidor');
  const estado = await estadoGasto();
  if (estado.recomiendaCortar) throw new SinPresupuesto(`se acabó el presupuesto del cerebro (${estado.mensaje}); las órdenes locales siguen`);
}

export function flujoCerebro(mensajes: readonly Mensaje[], senal: AbortSignal): ReadableStream<Uint8Array> {
  const { modelo, precio } = modeloPara('cerebro-de-voz');
  const cerebro = creaCerebroCompat({
    llave: process.env['OPENROUTER_API_KEY'] ?? '',
    modelo,
    sistema: PROMPT_CEREBRO,
    fetch,
    precio,
    maxTokens: 160,
    cabeceras: { 'X-Title': 'centro-de-mando-voz' },
  });
  const cod = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(c) {
      const linea = (o: unknown) => {
        try {
          c.enqueue(cod.encode(`${JSON.stringify(o)}\n`));
        } catch {
          /* el cliente cortó: lo que quede por decir ya no tiene a quién */
        }
      };
      let anotada = false;
      try {
        for await (const p of cerebro.piensa(mensajes, senal)) {
          if (p.tipo === 'token') linea({ t: 'token', x: p.texto });
          else {
            anotada = true;
            await anotaGasto(p.tokens ?? null, p.costoUsd);
            linea({ t: 'uso', costoUsd: p.costoUsd });
          }
        }
      } catch (e) {
        if (!senal.aborted) linea({ t: 'error', mensaje: e instanceof Error ? e.message : 'el cerebro falló' });
      } finally {
        // Una llamada abortada (interrupción, especulación descartada) o fallida también ocurrió y pudo costar: se
        // anota con coste `null`, nunca se omite ni se cuenta como cero (regla de `src/lib/ai/contabilidad.ts`).
        if (!anotada) await anotaGasto(null, null).catch(() => undefined);
        try {
          c.close();
        } catch {
          /* el cliente ya se fue */
        }
      }
    },
  });
}
