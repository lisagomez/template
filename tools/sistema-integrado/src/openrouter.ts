/**
 * Modelo por cualquier API compatible con OpenAI (OpenRouter incluido). Subpath aparte porque importarlo
 * COMPROMETE a algo: una salida de red y un costo. El proyecto:
 *   - elige el modelo por su routing (C8) y lo pasa pineado: aquí no hay modelo por defecto;
 *   - inyecta `fetch` y la llave (nunca se leen del entorno aquí, nunca se imprimen);
 *   - registra el `uso` de cada llamada; si el proveedor no lo reporta llega `null` (nunca cero).
 */
import type { ModeloLLM, Uso } from './agentes/tipos.js';

export interface OpcionesOpenAiCompat {
  readonly url?: string;
  readonly llave: string;
  readonly modelo: string;
  readonly fetch: typeof fetch;
  readonly temperatura?: number;
  /** Cabeceras extra que pide el proveedor (p. ej. X-Title en OpenRouter). */
  readonly cabeceras?: Readonly<Record<string, string>>;
  /** Tope de tokens para RAZONAR, aparte del de la respuesta. Hay modelos que razonan por omisión (Opus 5) y ese
   * razonamiento cuenta dentro de `max_tokens`: sin tope propio se come el presupuesto y el JSON nunca sale
   * (medido el 2026-10-01: 3,500 de 3,500 tokens razonando en el diagnóstico, respuesta vacía). */
  readonly razonamiento?: { readonly maxTokens: number };
}

export function modeloOpenAiCompat(o: OpcionesOpenAiCompat): ModeloLLM {
  if (!o.llave) throw new Error('falta la llave del proveedor (se inyecta, no se lee del entorno)');
  if (!o.modelo || /latest/i.test(o.modelo)) throw new Error('el modelo va pineado: nada de «latest» (C1)');
  const url = o.url ?? 'https://openrouter.ai/api/v1/chat/completions';
  return {
    id: o.modelo,
    async completa({ sistema, usuario, maxTokens }) {
      const r = await o.fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${o.llave}`, ...(o.cabeceras ?? {}) },
        body: JSON.stringify({
          model: o.modelo, max_tokens: maxTokens + (o.razonamiento?.maxTokens ?? 0), temperature: o.temperatura ?? 0.2,
          ...(o.razonamiento ? { reasoning: { max_tokens: o.razonamiento.maxTokens } } : {}),
          messages: [{ role: 'system', content: sistema }, { role: 'user', content: usuario }],
        }),
      });
      const cuerpo = await r.text();
      if (!r.ok) throw new Error(`el proveedor respondió ${r.status}: ${cuerpo.slice(0, 300).replaceAll(o.llave, '‹llave›')}`);
      const j = JSON.parse(cuerpo) as { choices?: { message?: { content?: string }; finish_reason?: string }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } };
      const texto = j.choices?.[0]?.message?.content ?? '';
      const u = j.usage;
      const uso: Uso | null = u && typeof u.prompt_tokens === 'number' && typeof u.completion_tokens === 'number'
        ? { entrada: u.prompt_tokens, salida: u.completion_tokens, cacheados: u.prompt_tokens_details?.cached_tokens ?? 0 }
        : null;
      return { texto, uso, truncada: j.choices?.[0]?.finish_reason === 'length' };
    },
  };
}
