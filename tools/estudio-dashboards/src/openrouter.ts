/**
 * `./openrouter`: el modelo del agente por la API de OpenRouter (compatible con OpenAI). Subpath aparte porque
 * importarlo COMPROMETE a una salida de red y a un costo. Reglas de la casa (como `tools/sistema-integrado`):
 *   - el modelo llega pineado desde el routing (C8): aquí no hay modelo por defecto, y `latest` se rechaza;
 *   - la llave y `fetch` se inyectan: nunca se leen del entorno aquí, nunca se imprimen (un error la tacha);
 *   - cada llamada devuelve su uso y su costo; si el proveedor no los reporta, llegan `null`, nunca cero.
 * El prefijo estable (sistema) se marca para la caché de prefijo: leerlo cuesta la décima parte.
 */
import type { ModeloEstudio, Mensaje, RespuestaModelo } from './agente/tipos.js'

export interface OpcionesOpenRouter {
  readonly llave: string
  readonly modelo: string
  readonly fetch: typeof fetch
  readonly url?: string
  readonly temperatura?: number
  readonly cabeceras?: Readonly<Record<string, string>>
  /** Tope de pared por llamada. */
  readonly tiempoMs?: number
  /**
   * Razonamiento: hay modelos que razonan por omisión y ese razonamiento cuenta dentro de `max_tokens` (medido el
   * 2026-10-20 con Haiku 5.5: 1,182 de 1,200 tokens razonando, el JSON truncado). `{ maxTokens }` le da un tope PROPIO,
   * aparte de la respuesta; `'apagado'` lo desactiva. Sin esto, decide el proveedor.
   */
  readonly razonamiento?: { readonly maxTokens: number } | 'apagado'
  /**
   * Preferencia de ruteo de OpenRouter entre los proveedores que sirven el mismo modelo pineado (Anthropic, Bedrock,
   * Vertex, Azure): `'latencia'` pide el de menor latencia. Con datos reales, a qué nube va el dato es decisión C4.
   */
  readonly proveedor?: 'latencia' | 'throughput'
}

interface Cuerpo {
  choices?: { message?: { content?: string }; finish_reason?: string }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number; prompt_tokens_details?: { cached_tokens?: number } }
}

export function modeloOpenRouter(o: OpcionesOpenRouter): ModeloEstudio {
  if (!o.llave) throw new Error('falta la llave del proveedor (se inyecta, no se lee del entorno)')
  if (!o.modelo || /latest/i.test(o.modelo)) throw new Error('el modelo va pineado: nada de «latest» (C1)')
  const url = o.url ?? 'https://openrouter.ai/api/v1/chat/completions'
  const tacha = (s: string) => s.replaceAll(o.llave, '‹llave›')
  return {
    id: o.modelo,
    async completa({ sistema, mensajes, maxTokens }: { sistema: string; mensajes: readonly Mensaje[]; maxTokens: number }): Promise<RespuestaModelo> {
      const t = performance.now()
      const control = new AbortController()
      const reloj = setTimeout(() => control.abort(), o.tiempoMs ?? 60_000)
      try {
        const r = await o.fetch(url, {
          method: 'POST',
          signal: control.signal,
          headers: { 'content-type': 'application/json', authorization: `Bearer ${o.llave}`, ...(o.cabeceras ?? {}) },
          body: JSON.stringify({
            model: o.modelo, temperature: o.temperatura ?? 0,
            max_tokens: maxTokens + (typeof o.razonamiento === 'object' ? o.razonamiento.maxTokens : 0),
            ...(o.razonamiento === 'apagado' ? { reasoning: { enabled: false } } : o.razonamiento ? { reasoning: { max_tokens: o.razonamiento.maxTokens } } : {}),
            ...(o.proveedor ? { provider: { sort: o.proveedor === 'latencia' ? 'latency' : 'throughput' } } : {}),
            usage: { include: true },
            messages: [{ role: 'system', content: [{ type: 'text', text: sistema, cache_control: { type: 'ephemeral' } }] }, ...mensajes],
          }),
        })
        const texto = await r.text()
        if (!r.ok) throw new Error(`el proveedor respondió ${r.status}: ${tacha(texto.slice(0, 300))}`)
        const j = JSON.parse(texto) as Cuerpo
        const u = j.usage
        const uso = u && typeof u.prompt_tokens === 'number' && typeof u.completion_tokens === 'number'
          ? { entrada: u.prompt_tokens, salida: u.completion_tokens, cacheados: u.prompt_tokens_details?.cached_tokens ?? 0 }
          : null
        return { texto: j.choices?.[0]?.message?.content ?? '', uso, costoUsd: typeof u?.cost === 'number' ? u.cost : null, truncada: j.choices?.[0]?.finish_reason === 'length', ms: performance.now() - t }
      } catch (e) {
        throw new Error(tacha(e instanceof Error ? e.message : String(e)))
      } finally {
        clearTimeout(reloj)
      }
    },
  }
}

/** Saldo de la cuenta (para medir antes y después): `total_credits − total_usage`, en USD. */
export async function saldoOpenRouter(llave: string, f: typeof fetch): Promise<{ creditos: number; uso: number; saldo: number }> {
  const r = await f('https://openrouter.ai/api/v1/credits', { headers: { authorization: `Bearer ${llave}` } })
  if (!r.ok) throw new Error(`no se pudo leer el saldo (${r.status})`)
  const j = (await r.json()) as { data?: { total_credits?: number; total_usage?: number } }
  const [creditos, uso] = [Number(j.data?.total_credits ?? NaN), Number(j.data?.total_usage ?? NaN)]
  return { creditos, uso, saldo: creditos - uso }
}
