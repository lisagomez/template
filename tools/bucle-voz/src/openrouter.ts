/**
 * Cerebro por cualquier API compatible con OpenAI en FLUJO (OpenRouter incluido): cada token sale
 * en cuanto llega, para que la voz empiece con la primera frase y no con la respuesta entera.
 *
 * Subpath aparte porque importarlo compromete a algo: una salida de red y un costo. Quien lo usa:
 *  - elige el modelo por su routing (C8) y lo pasa PINEADO (aquí no hay modelo por defecto, y un
 *    alias que cambia solo se rechaza);
 *  - inyecta `fetch` y la llave (nunca se leen del entorno aquí, nunca salen en un error);
 *  - recibe el costo de cada llamada (`uso`); si el proveedor no lo da, llega `null`, nunca cero.
 */
import type { Cerebro, Mensaje, PiezaCerebro, TokensUso } from './tipos.js';

export interface OpcionesCerebroCompat {
  llave: string;
  modelo: string;
  /** El prompt de sistema (es CDC: se revisa como código). */
  sistema: string;
  fetch: typeof fetch;
  url?: string;
  maxTokens?: number;
  temperatura?: number;
  cabeceras?: Readonly<Record<string, string>>;
  /** Preferencias de proveedor de OpenRouter (`provider`), p. ej. `{ sort: 'latency' }`. */
  proveedor?: Readonly<Record<string, unknown>>;
  /** Precio por millón (entrada, salida) para estimar si el proveedor no reporta `cost`. */
  precio?: { entrada: number; salida: number };
}

const ALIAS_FLOTANTE = /(^|[/@:-])(latest|preview|nightly|edge)$/i;

/** Las cargas (`data:`) de un flujo SSE, en orden; ignora comentarios y `[DONE]`. */
export async function* leeSse(cuerpo: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const lector = cuerpo.getReader();
  const decodificador = new TextDecoder();
  let resto = '';
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      resto += decodificador.decode(value, { stream: true });
      let i: number;
      while ((i = resto.indexOf('\n')) >= 0) {
        const linea = resto.slice(0, i).replace(/\r$/, '');
        resto = resto.slice(i + 1);
        if (!linea.startsWith('data:')) continue;
        const dato = linea.slice(5).trim();
        if (dato && dato !== '[DONE]') yield dato;
      }
    }
  } finally {
    lector.releaseLock();
  }
}

interface Trozo {
  choices?: { delta?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number; prompt_tokens_details?: { cached_tokens?: number } };
  error?: { message?: string };
}

function tokensDe(uso: NonNullable<Trozo['usage']>): TokensUso | undefined {
  if (typeof uso.prompt_tokens !== 'number' || typeof uso.completion_tokens !== 'number') return undefined;
  return { entrada: uso.prompt_tokens, salida: uso.completion_tokens, cacheados: uso.prompt_tokens_details?.cached_tokens ?? 0 };
}

function costoDe(uso: NonNullable<Trozo['usage']>, precio: OpcionesCerebroCompat['precio']): number | null {
  if (typeof uso.cost === 'number') return uso.cost;
  if (precio && typeof uso.prompt_tokens === 'number' && typeof uso.completion_tokens === 'number') {
    return (uso.prompt_tokens * precio.entrada + uso.completion_tokens * precio.salida) / 1_000_000;
  }
  return null;
}

export function creaCerebroCompat(o: OpcionesCerebroCompat): Cerebro {
  if (!o.llave) throw new Error('falta la llave del proveedor (se inyecta, no se lee del entorno)');
  if (!o.modelo || ALIAS_FLOTANTE.test(o.modelo)) throw new Error('el modelo va pineado: nada de alias que cambian solos (C1)');
  const url = o.url ?? 'https://openrouter.ai/api/v1/chat/completions';
  const limpia = (s: string) => s.replaceAll(o.llave, '‹llave›');

  return {
    async *piensa(mensajes: readonly Mensaje[], senal: AbortSignal): AsyncGenerator<PiezaCerebro> {
      const r = await o.fetch(url, {
        method: 'POST',
        signal: senal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${o.llave}`, ...(o.cabeceras ?? {}) },
        body: JSON.stringify({
          model: o.modelo,
          stream: true,
          max_tokens: o.maxTokens ?? 220,
          temperature: o.temperatura ?? 0.3,
          usage: { include: true },
          reasoning: { enabled: false },
          ...(o.proveedor ? { provider: o.proveedor } : {}),
          messages: [{ role: 'system', content: o.sistema }, ...mensajes.map((m) => ({ role: m.rol === 'usuario' ? 'user' : 'assistant', content: m.texto }))],
        }),
      });
      if (!r.ok || !r.body) throw new Error(`el proveedor respondió ${r.status}: ${limpia((await r.text().catch(() => '')).slice(0, 200))}`);
      let costo: number | null = null;
      let tokens: TokensUso | undefined;
      for await (const dato of leeSse(r.body)) {
        let trozo: Trozo;
        try {
          trozo = JSON.parse(dato) as Trozo;
        } catch {
          continue;
        }
        if (trozo.error) throw new Error(`el proveedor cortó el flujo: ${limpia(trozo.error.message ?? 'sin detalle')}`);
        const texto = trozo.choices?.[0]?.delta?.content;
        if (texto) yield { tipo: 'token', texto };
        if (trozo.usage) {
          costo = costoDe(trozo.usage, o.precio);
          tokens = tokensDe(trozo.usage);
        }
      }
      yield tokens ? { tipo: 'uso', costoUsd: costo, tokens } : { tipo: 'uso', costoUsd: costo };
    },
  };
}
