/**
 * El cerebro del centro de mando, del lado del servidor: el modelo sale del routing (clase
 * `cerebro-de-voz`, pineado), la llave del entorno (nunca se imprime) y el tope del libro de gasto.
 * Responde NDJSON en flujo: `{"t":"token","x":…}` por token, `{"t":"uso",…}` al final, o
 * `{"t":"error","mensaje":…}`. Solo sale TEXTO hacia OpenRouter; el audio nunca pasa por aquí.
 *
 * CEREBRO SIMULADO, para medir la voz sin LLM: con `CEREBRO_SIMULADO_MS` en el entorno del servidor (fuera de
 * producción), la ruta contesta un texto FIJO tras ese retardo, sin llave, sin OpenRouter y sin anotar gasto (no hubo
 * llamada). La primera línea del flujo lo declara (`{"t":"cerebro","simulado":true}`) y la telemetría del HUD marca
 * el turno «cerebro simulado»: una cifra medida así nunca pasa por la de un modelo real. Sin la variable, nada cambia.
 */
import { creaCerebroCompat } from '../../../../../tools/bucle-voz/dist/openrouter.js';
import type { Mensaje } from '../../../../../tools/bucle-voz/dist/index.js';
import { modeloPara } from '../../../../lib/ai/routing.ts';
import { anotaGasto, estadoGasto } from './gasto';
import { PROMPT_CEREBRO } from './prompt-cerebro';

export class SinPresupuesto extends Error {}
export class SinLlave extends Error {}

/** Lo que dice la respuesta simulada: sin datos, para que nadie la tome por una del modelo. */
export const TEXTO_SIMULADO = 'Respuesta simulada para medir la voz: aquí hablaría el cerebro. No se llamó a ningún modelo.';

/** El retardo del cerebro simulado en ms, o `null` si no está encendido (siempre `null` en producción). */
export function retardoSimulado(env: Record<string, string | undefined> = process.env): number | null {
  const crudo = env['CEREBRO_SIMULADO_MS'];
  if (crudo === undefined || crudo.trim() === '' || env['NODE_ENV'] === 'production') return null;
  const ms = Number(crudo);
  return Number.isFinite(ms) && ms >= 0 && ms <= 30_000 ? Math.round(ms) : null;
}

export function modeloCerebro(): string {
  const simulado = retardoSimulado();
  return simulado === null ? modeloPara('cerebro-de-voz').modelo : `simulado/sin-llm-${simulado}ms`;
}

/** Comprueba llave y tope ANTES de abrir el flujo: un 4xx limpio en vez de un flujo que muere. */
export async function compruebaCerebro(): Promise<void> {
  if (retardoSimulado() !== null) return; // el simulado no llama a nadie: ni llave ni gasto
  if (!process.env['OPENROUTER_API_KEY']) throw new SinLlave('falta OPENROUTER_API_KEY en el servidor');
  const estado = await estadoGasto();
  if (estado.recomiendaCortar) throw new SinPresupuesto(`se acabó el presupuesto del cerebro (${estado.mensaje}); las órdenes locales siguen`);
}

/** El texto fijo tras el retardo, en trozos como un modelo, y cortado si la página corta (interrupción). */
export function flujoSimulado(retardoMs: number, senal: AbortSignal, texto = TEXTO_SIMULADO): ReadableStream<Uint8Array> {
  const cod = new TextEncoder();
  const espera = (ms: number) =>
    new Promise<void>((resuelve) => {
      if (senal.aborted) return resuelve();
      const id = setTimeout(resuelve, ms);
      senal.addEventListener('abort', () => { clearTimeout(id); resuelve(); }, { once: true });
    });
  return new ReadableStream<Uint8Array>({
    async start(c) {
      const linea = (o: unknown) => {
        try {
          c.enqueue(cod.encode(`${JSON.stringify(o)}\n`));
        } catch {
          /* el cliente cortó */
        }
      };
      linea({ t: 'cerebro', simulado: true, ms: retardoMs });
      await espera(retardoMs);
      for (const trozo of texto.match(/\S+\s*/g) ?? []) {
        if (senal.aborted) break;
        linea({ t: 'token', x: trozo });
        await espera(15);
      }
      if (!senal.aborted) linea({ t: 'uso', costoUsd: 0, simulado: true });
      try {
        c.close();
      } catch {
        /* el cliente ya se fue */
      }
    },
  });
}

export function flujoCerebro(mensajes: readonly Mensaje[], senal: AbortSignal): ReadableStream<Uint8Array> {
  const simulado = retardoSimulado();
  if (simulado !== null) return flujoSimulado(simulado, senal);
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
          else if (p.tipo === 'uso') {
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
