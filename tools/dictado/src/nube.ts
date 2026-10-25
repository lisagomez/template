/**
 * Adaptadores de NUBE opcionales para la voz (Groq, LemonFox, ElevenLabs), detrás de la misma interfaz que el
 * motor local, y la cadena de transcripción que NO SE APAGA porque falte un proveedor opcional.
 *
 * APAGADOS POR DEFECTO. Ninguno se crea solo: quien los use (el servicio, con `DICTADO_NUBE`) los enciende uno por
 * uno, con su llave y con su C4. Cada ficha dice QUÉ sale de la máquina y A QUIÉN. Ninguno está medido aquí
 * (`medido: false`): se prueban contra un proveedor SIMULADO (`pruebas/nube.ts`), no contra el real. Nunca en un
 * producto con datos sensibles de terceros: esa regla la aplica la capa (`decideRanuraVoz`), no este archivo.
 *
 * PROCEDENCIA (Apache-2.0; atribución en el NOTICE del template). Arbrain v0.2.10, etiqueta firmada `v0.2.10`,
 * commit `829a9e99f0f6805325e24bd851eb5d1e88c3c67c`:
 *  - `arbrain/server/src/live/transcribe.ts` (blob `be4a1b32`) › `speechProviders`, `transcribe`, `TranscriptionError`:
 *    las URL de Groq y LemonFox, filtrar los proveedores sin llave («a missing optional Groq key must not disable
 *    configured STT»), dos intentos con 250 ms entre ellos, pasar al siguiente ante 401/429/5xx o sin red, y parar
 *    ante 400/413/415 (el audio es el malo: ningún proveedor lo leerá). Nunca se expone el cuerpo del proveedor.
 *  - `arbrain/tests/live/transcribe.test.ts` (blob `cf290794`) › «uses already configured Lemonfox when Groq is
 *    absent» y «authentication failure falls through to configured provider»: los dos casos están en las pruebas.
 *  - `arbrain/server/src/cliente/voz.ts` (blob `d934b8e0`) › `probarLlaveVoz` (GET /models: prueba la llave sin
 *    gastar cuota de audio) y `hablarLemonfox`.
 *  - `arbrain/src/features/live/server/elevenlabs.ts` (blob `2cabe152`) › `speakEleven`, `warmEleven`,
 *    `classifyFailure`: PCM a 24 kHz, modelo flash, y qué fallo descansa cuánto.
 *
 * QUÉ CAMBIÓ: el motor LOCAL va primero en la cadena (allí no había local); la base de cada proveedor se inyecta
 * (para el proveedor simulado; en producción, la real); el audio viaja en WAV PCM16 (lo que el servicio entiende);
 * a ElevenLabs NO se le manda `previous_text` (los 300 caracteres anteriores: menos texto fuera); y una prueba de
 * llave de un proveedor que no la ofrece sin gastar (LemonFox) lo dice en vez de gastar.
 */

export type QueSale = 'audio' | 'texto';
export type IdNube = 'groq' | 'lemonfox-stt' | 'lemonfox-tts' | 'elevenlabs';

export interface FichaNube {
  id: IdNube;
  tipo: 'stt' | 'tts';
  /** C4: qué sale de la máquina en cada uso, y a quién. */
  sale: QueSale;
  aQuien: string;
  /** La variable de entorno de su llave (el servicio la lee solo si el adaptador está encendido). */
  llave: string;
  base: string;
  /** Medido aquí contra el mismo corpus: ninguno. */
  medido: false;
  nota: string;
}

export const FICHAS_NUBE: readonly FichaNube[] = [
  { id: 'groq', tipo: 'stt', sale: 'audio', aQuien: 'Groq (whisper-large-v3-turbo)', llave: 'GROQ_API_KEY', base: 'https://api.groq.com', medido: false, nota: 'el audio de cada toma sale a Groq; su llave es gratuita' },
  { id: 'lemonfox-stt', tipo: 'stt', sale: 'audio', aQuien: 'LemonFox', llave: 'LEMONFOX_API_KEY', base: 'https://api.lemonfox.ai', medido: false, nota: 'el audio de cada toma sale a LemonFox; de pago' },
  { id: 'lemonfox-tts', tipo: 'tts', sale: 'texto', aQuien: 'LemonFox', llave: 'LEMONFOX_API_KEY', base: 'https://api.lemonfox.ai', medido: false, nota: 'el texto de cada respuesta que se lee sale a LemonFox; de pago (~1,6 s por oración según Arbrain, no medido aquí)' },
  { id: 'elevenlabs', tipo: 'tts', sale: 'texto', aQuien: 'ElevenLabs (Flash v2.5)', llave: 'ELEVENLABS_API_KEY', base: 'https://api.elevenlabs.io', medido: false, nota: 'el texto de cada frase sale a ElevenLabs; de pago (~400-700 ms según Arbrain, no medido aquí)' },
];

export const fichaNube = (id: string): FichaNube | undefined => FICHAS_NUBE.find((f) => f.id === id);

/** Un fallo de proveedor, sin su cuerpo crudo (puede llevar detalles internos o la llave reflejada). */
export class ErrorNube extends Error {
  readonly codigo: 'sin-llave' | 'audio-invalido' | 'ocupado' | 'llave-invalida' | 'sin-red' | 'fallo' | 'respuesta-invalida';
  readonly estado: number;
  readonly proveedor: string;
  constructor(codigo: ErrorNube['codigo'], mensaje: string, estado: number, proveedor: string) {
    super(mensaje);
    this.name = 'ErrorNube';
    this.codigo = codigo;
    this.estado = estado;
    this.proveedor = proveedor;
  }
}

export interface PruebaLlave {
  ok: boolean;
  estado: number;
  /** `no-disponible`: el proveedor no ofrece una prueba que no gaste cuota (no se gasta para probar). */
  codigo?: 'sin-llave' | 'llave-invalida' | 'ocupado' | 'sin-red' | 'no-disponible' | 'fallo';
  ms?: number;
}

export interface OpcionesAdaptador {
  /** `undefined` o vacía = sin llave: el adaptador existe pero no está disponible (la cadena lo salta). */
  llave: string | undefined;
  /** Para el proveedor simulado de las pruebas; por defecto, la real de su ficha. */
  base?: string;
  fetch?: typeof fetch;
  msEspera?: number;
}

export interface SttNube {
  ficha: FichaNube;
  readonly disponible: boolean;
  transcribe(wav: Uint8Array, o?: { idioma?: string; senal?: AbortSignal }): Promise<string>;
  pruebaLlave(senal?: AbortSignal): Promise<PruebaLlave>;
}

export interface VozNube {
  audio: Uint8Array;
  /** `audio/wav`, o `audio/pcm` (PCM16LE mono) con su frecuencia. */
  tipo: 'audio/wav' | 'audio/pcm';
  frecuenciaHz?: number;
}

export interface TtsNube {
  ficha: FichaNube;
  readonly disponible: boolean;
  sintetiza(texto: string, o?: { voz?: string; velocidad?: number; senal?: AbortSignal }): Promise<VozNube>;
  pruebaLlave(senal?: AbortSignal): Promise<PruebaLlave>;
}

const ficha = (id: IdNube) => fichaNube(id) as FichaNube;
const limpiaLlave = (l: string | undefined) => (l ?? '').trim();
const sinBarra = (s: string) => s.replace(/\/+$/, '');
const conTope = (senal: AbortSignal | undefined, ms: number) => (senal ? AbortSignal.any([senal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms));

/** Qué error es una respuesta fallida (sin leer su cuerpo: se cancela). Lo de Arbrain, con nombres nuestros. */
async function falloDe(r: Response, proveedor: string): Promise<ErrorNube> {
  await r.body?.cancel().catch(() => undefined);
  if (r.status === 400 || r.status === 413 || r.status === 415 || r.status === 422) return new ErrorNube('audio-invalido', `${proveedor} no pudo leer esta entrada`, 422, proveedor);
  if (r.status === 401 || r.status === 403) return new ErrorNube('llave-invalida', `${proveedor} no reconoce la llave`, 502, proveedor);
  if (r.status === 429) return new ErrorNube('ocupado', `${proveedor} está ocupado`, 429, proveedor);
  return new ErrorNube('fallo', `${proveedor} respondió ${r.status}`, 502, proveedor);
}

function sinLlave(proveedor: string): ErrorNube {
  return new ErrorNube('sin-llave', `${proveedor} no tiene llave en este servidor`, 503, proveedor);
}

async function pruebaPorModelos(url: string, cabeceras: Record<string, string> | null, f: typeof fetch, senal?: AbortSignal): Promise<PruebaLlave> {
  if (!cabeceras) return { ok: false, estado: 0, codigo: 'sin-llave' };
  const t0 = Date.now();
  try {
    const r = await f(url, { headers: cabeceras, signal: conTope(senal, 10_000) });
    await r.body?.cancel().catch(() => undefined);
    if (r.ok) return { ok: true, estado: r.status, ms: Date.now() - t0 };
    return { ok: false, estado: r.status, codigo: r.status === 401 || r.status === 403 ? 'llave-invalida' : r.status === 429 ? 'ocupado' : 'fallo' };
  } catch {
    return { ok: false, estado: 0, codigo: 'sin-red' };
  }
}

interface ConfigStt { id: 'groq' | 'lemonfox-stt'; ruta: string; modelos: string | null; idioma: (i: string) => string; modelo?: string }

function creaSttCompatible(c: ConfigStt, o: OpcionesAdaptador): SttNube {
  const f = o.fetch ?? fetch;
  const base = sinBarra(o.base ?? ficha(c.id).base);
  const llave = limpiaLlave(o.llave);
  const nombre = ficha(c.id).aQuien;
  return {
    ficha: ficha(c.id),
    disponible: llave.length > 0,
    async transcribe(wav, op = {}) {
      if (!llave) throw sinLlave(nombre);
      const cuerpo = new FormData();
      cuerpo.set('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'toma.wav');
      cuerpo.set('language', c.idioma(op.idioma ?? 'es'));
      cuerpo.set('response_format', 'json');
      if (c.modelo) cuerpo.set('model', c.modelo);
      let r: Response;
      try {
        r = await f(`${base}${c.ruta}`, { method: 'POST', headers: { authorization: `Bearer ${llave}` }, body: cuerpo, signal: conTope(op.senal, o.msEspera ?? 30_000) });
      } catch (e) {
        op.senal?.throwIfAborted();
        throw e instanceof ErrorNube ? e : new ErrorNube('sin-red', `no se pudo conectar con ${nombre}`, 503, nombre);
      }
      if (!r.ok) throw await falloDe(r, nombre);
      const j = (await r.json().catch(() => null)) as { text?: unknown } | null;
      if (typeof j?.text !== 'string') throw new ErrorNube('respuesta-invalida', `${nombre} respondió sin «text»`, 502, nombre);
      return j.text.trim();
    },
    pruebaLlave: (senal) =>
      c.modelos === null ? Promise.resolve({ ok: false, estado: 0, codigo: llave ? 'no-disponible' : 'sin-llave' }) : pruebaPorModelos(`${base}${c.modelos}`, llave ? { authorization: `Bearer ${llave}` } : null, f, senal),
  };
}

/** Groq, compatible con OpenAI (`/openai/v1/audio/transcriptions`). Sale el AUDIO de cada toma. */
export const creaSttGroq = (o: OpcionesAdaptador): SttNube =>
  creaSttCompatible({ id: 'groq', ruta: '/openai/v1/audio/transcriptions', modelos: '/openai/v1/models', idioma: (i) => i, modelo: 'whisper-large-v3-turbo' }, o);

/** LemonFox (idioma por nombre: «spanish»). Sale el AUDIO. Su prueba de llave sin gastar no se conoce: se dice. */
const NOMBRE_IDIOMA: Readonly<Record<string, string>> = { es: 'spanish', en: 'english', pt: 'portuguese', fr: 'french' };
export const creaSttLemonfox = (o: OpcionesAdaptador): SttNube =>
  creaSttCompatible({ id: 'lemonfox-stt', ruta: '/v1/audio/transcriptions', modelos: null, idioma: (i) => NOMBRE_IDIOMA[i] ?? i }, o);

/** LemonFox TTS, compatible con OpenAI (`/v1/audio/speech`). Sale el TEXTO. Se le pide WAV (sin verificar contra el real). */
export function creaTtsLemonfox(o: OpcionesAdaptador & { voz?: string }): TtsNube {
  const f = o.fetch ?? fetch;
  const base = sinBarra(o.base ?? ficha('lemonfox-tts').base);
  const llave = limpiaLlave(o.llave);
  return {
    ficha: ficha('lemonfox-tts'),
    disponible: llave.length > 0,
    async sintetiza(texto, op = {}) {
      if (!llave) throw sinLlave('LemonFox');
      const velocidad = Math.min(3, Math.max(0.5, op.velocidad ?? 1));
      let r: Response;
      try {
        r = await f(`${base}/v1/audio/speech`, {
          method: 'POST',
          headers: { authorization: `Bearer ${llave}`, 'content-type': 'application/json' },
          body: JSON.stringify({ input: texto, voice: op.voz ?? o.voz ?? 'alex', language: 'es', speed: velocidad, response_format: 'wav' }),
          signal: conTope(op.senal, o.msEspera ?? 45_000),
        });
      } catch {
        op.senal?.throwIfAborted();
        throw new ErrorNube('sin-red', 'no se pudo conectar con LemonFox', 503, 'LemonFox');
      }
      if (!r.ok) throw await falloDe(r, 'LemonFox');
      return { audio: new Uint8Array(await r.arrayBuffer()), tipo: 'audio/wav' };
    },
    pruebaLlave: () => Promise.resolve({ ok: false, estado: 0, codigo: llave ? 'no-disponible' : 'sin-llave' }),
  };
}

/** ElevenLabs Flash v2.5, PCM a 24 kHz en flujo. Sale el TEXTO de cada frase (sin `previous_text`). */
export function creaTtsElevenlabs(o: OpcionesAdaptador & { voz: string; modelo?: string }): TtsNube {
  const f = o.fetch ?? fetch;
  const base = sinBarra(o.base ?? ficha('elevenlabs').base);
  const llave = limpiaLlave(o.llave);
  return {
    ficha: ficha('elevenlabs'),
    disponible: llave.length > 0 && o.voz.trim().length > 0,
    async sintetiza(texto, op = {}) {
      if (!llave) throw sinLlave('ElevenLabs');
      const voz = encodeURIComponent(op.voz ?? o.voz);
      const velocidad = Math.min(1.2, Math.max(0.7, op.velocidad ?? 1));
      let r: Response;
      try {
        r = await f(`${base}/v1/text-to-speech/${voz}/stream?output_format=pcm_24000`, {
          method: 'POST',
          headers: { 'xi-api-key': llave, 'content-type': 'application/json' },
          body: JSON.stringify({ text: texto, model_id: o.modelo ?? 'eleven_flash_v2_5', language_code: 'es', voice_settings: { stability: 0.5, similarity_boost: 0.8, speed: velocidad } }),
          signal: conTope(op.senal, o.msEspera ?? 15_000),
        });
      } catch {
        op.senal?.throwIfAborted();
        throw new ErrorNube('sin-red', 'no se pudo conectar con ElevenLabs', 503, 'ElevenLabs');
      }
      if (!r.ok) throw await falloDe(r, 'ElevenLabs');
      return { audio: new Uint8Array(await r.arrayBuffer()), tipo: 'audio/pcm', frecuenciaHz: 24_000 };
    },
    pruebaLlave: (senal) => pruebaPorModelos(`${base}/v1/models`, llave ? { 'xi-api-key': llave } : null, f, senal),
  };
}

// --- La cadena de transcripción: el local primero, y la nube que esté ENCENDIDA y CON LLAVE ----------------------

export interface EslabonStt {
  id: string;
  local: boolean;
  /** Un eslabón sin llave se salta: no tumba la cadena. */
  disponible: boolean;
  transcribe(senal: AbortSignal | undefined): Promise<string>;
}

export interface ResultadoCadena {
  texto: string;
  /** Quién contestó. */
  motor: string;
  local: boolean;
  /** Los que se intentaron antes y por qué no contestaron (sin cuerpos de proveedor). */
  saltados: { motor: string; motivo: string }[];
}

const espera = (ms: number, senal?: AbortSignal) =>
  new Promise<void>((resuelve, rechaza) => {
    const id = setTimeout(resuelve, ms);
    senal?.addEventListener('abort', () => { clearTimeout(id); rechaza(senal.reason); }, { once: true });
  });

/**
 * Prueba los eslabones en orden. Lo LOCAL va primero (un intento: si falla, es el motor, no la red). Un eslabón de
 * nube sin llave se salta; con llave tiene dos intentos ante «ocupado», 5xx o sin red; ante llave inválida pasa al
 * siguiente; ante audio inválido para la cadena entera (ningún otro lo leerá). Abortar corta sin seguir.
 */
export async function transcribeEnCadena(eslabones: readonly EslabonStt[], senal?: AbortSignal): Promise<ResultadoCadena> {
  const saltados: ResultadoCadena['saltados'] = [];
  let ultimo: unknown = new ErrorNube('fallo', 'no hay ningún motor de transcripción disponible', 503, 'cadena');
  for (const e of eslabones) {
    if (!e.disponible) {
      saltados.push({ motor: e.id, motivo: 'sin llave' });
      continue;
    }
    for (let intento = 0; intento < (e.local ? 1 : 2); intento++) {
      senal?.throwIfAborted();
      try {
        return { texto: await e.transcribe(senal), motor: e.id, local: e.local, saltados };
      } catch (error) {
        senal?.throwIfAborted();
        ultimo = error;
        if (error instanceof ErrorNube && error.codigo === 'audio-invalido') throw error;
        const reintenta = !e.local && intento === 0 && !(error instanceof ErrorNube && (error.codigo === 'llave-invalida' || error.codigo === 'sin-llave'));
        if (!reintenta) {
          saltados.push({ motor: e.id, motivo: error instanceof ErrorNube ? error.codigo : 'fallo del motor' });
          break;
        }
        await espera(250, senal);
      }
    }
  }
  throw ultimo;
}

/** Lo que se le enseña a una persona: quién está encendido, con o sin llave. Nunca el valor de una llave. */
export function describeNube(adaptadores: readonly { ficha: FichaNube; disponible: boolean }[]): string[] {
  return adaptadores.map((a) => `${a.ficha.id}: ${a.disponible ? 'llave presente' : 'sin llave (se salta)'} · sale ${a.ficha.sale} a ${a.ficha.aQuien} · no medido`);
}

export interface AdaptadoresEncendidos {
  stt: SttNube[];
  tts: Map<string, TtsNube>;
  /** Lo pedido que no existe (se avisa y se omite). */
  desconocidos: string[];
}

/**
 * Los adaptadores que el servicio ENCIENDE: solo los nombrados en `pedidos` (de `DICTADO_NUBE`), cada uno con su
 * llave del entorno. Un pedido sin llave queda «sin llave» (la cadena lo salta); nada se enciende por defecto.
 * `bases` solo existe para el proveedor simulado de las pruebas.
 */
export function adaptadoresPedidos(pedidos: readonly string[], env: Readonly<Record<string, string | undefined>>, o: { fetch?: typeof fetch; bases?: Partial<Record<IdNube, string>> } = {}): AdaptadoresEncendidos {
  const salida: AdaptadoresEncendidos = { stt: [], tts: new Map(), desconocidos: [] };
  const comun = (id: IdNube) => ({ llave: env[ficha(id).llave], ...(o.fetch ? { fetch: o.fetch } : {}), ...(o.bases?.[id] ? { base: o.bases[id] } : {}) });
  for (const id of new Set(pedidos.map((p) => p.trim()).filter(Boolean))) {
    if (id === 'groq') salida.stt.push(creaSttGroq(comun('groq')));
    else if (id === 'lemonfox-stt') salida.stt.push(creaSttLemonfox(comun('lemonfox-stt')));
    else if (id === 'lemonfox-tts') salida.tts.set(id, creaTtsLemonfox({ ...comun('lemonfox-tts'), ...(env['LEMONFOX_VOZ'] ? { voz: env['LEMONFOX_VOZ'] } : {}) }));
    else if (id === 'elevenlabs') salida.tts.set(id, creaTtsElevenlabs({ ...comun('elevenlabs'), voz: env['ELEVENLABS_VOZ'] ?? '' }));
    else salida.desconocidos.push(id);
  }
  return salida;
}
