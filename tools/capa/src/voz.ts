/**
 * La ranura de voz: la experiencia de Arbrain (dictar en el chat, «Escuchar» cada respuesta, Modo
 * conversación, Ajustes › Voz con «Probar») con NUESTROS motores locales por defecto. El audio no sale de la
 * máquina salvo que un producto encienda un adaptador de nube, con su C4, y nunca si guarda datos sensibles
 * de terceros.
 *
 * El enchufe de motor es el de la industria, compatible con OpenAI: `/v1/audio/transcriptions` y
 * `/v1/audio/speech`. Es la forma que usan en Arbrain v0.2.10 Groq y LemonFox (`arbrain/server/src/live/transcribe.ts`)
 * y Kokoro (`KOKORO_TTS_URL`, en `arbrain/server/src/voice.ts` y `config.ts`; la edición cliente no lo lee), y la que
 * atiende el servicio de `tools/dictado`.
 */

export type Sale = 'nada' | 'audio' | 'texto'
export type TipoMotor = 'stt' | 'tts' | 'vad'

export interface FichaMotor {
  id: string
  tipo: TipoMotor
  local: boolean
  /** Qué sale de la máquina al usarlo, y a quién. */
  sale: Sale
  aQuien: string | null
  /** Medido aquí, contra el mismo corpus. Un adaptador sin medir se dice «no medido». */
  medido: boolean
  nota: string
}

export const MOTORES_LOCALES: readonly FichaMotor[] = [
  { id: 'parakeet', tipo: 'stt', local: true, sale: 'nada', aQuien: null, medido: true, nota: 'Parakeet int8 (tools/dictado), p50 532 ms por toma' },
  { id: 'silero', tipo: 'vad', local: true, sale: 'nada', aQuien: null, medido: true, nota: 'Silero VAD (tools/voz), también en el navegador' },
  { id: 'energia', tipo: 'vad', local: true, sale: 'nada', aQuien: null, medido: true, nota: 'detector por energía calibrada (tools/voz)' },
  { id: 'piper', tipo: 'tts', local: true, sale: 'nada', aQuien: null, medido: true, nota: 'Piper es_MX (tools/dictado)' },
  { id: 'dispositivo', tipo: 'tts', local: true, sale: 'nada', aQuien: null, medido: false, nota: 'la mejor voz LOCAL del dispositivo (speechSynthesis con localService); respaldo donde no hay Piper. Las voces de red del navegador no cuentan' },
]

/** Los motores de Arbrain en la nube: adaptadores opcionales, apagados por defecto, detrás de la misma interfaz. */
export const ADAPTADORES_NUBE: readonly FichaMotor[] = [
  { id: 'groq', tipo: 'stt', local: false, sale: 'audio', aQuien: 'Groq (whisper-large-v3-turbo)', medido: false, nota: 'llave gratuita; el audio de cada toma sale a Groq' },
  { id: 'lemonfox-stt', tipo: 'stt', local: false, sale: 'audio', aQuien: 'LemonFox', medido: false, nota: 'de pago; el audio de cada toma sale a LemonFox' },
  { id: 'lemonfox-tts', tipo: 'tts', local: false, sale: 'texto', aQuien: 'LemonFox', medido: false, nota: 'de pago, ~1,6 s por oración según Arbrain; el texto de cada respuesta sale' },
  { id: 'elevenlabs', tipo: 'tts', local: false, sale: 'texto', aQuien: 'ElevenLabs (Flash v2.5)', medido: false, nota: 'de pago, ~400–700 ms según Arbrain; el texto de cada respuesta sale' },
  { id: 'navegador-stt', tipo: 'stt', local: false, sale: 'audio', aQuien: 'el proveedor del navegador (en Chrome, Google)', medido: false, nota: 'el reconocimiento del navegador cuenta como nube' },
]

export const fichaMotor = (id: string): FichaMotor | undefined => [...MOTORES_LOCALES, ...ADAPTADORES_NUBE].find((m) => m.id === id)

export interface ComposicionVoz { stt: string; tts: string; vad: string; nube: readonly string[] }

export interface RanuraVoz {
  visible: boolean
  /** Por qué se ve o por qué no: el botón lo dice en vez de desaparecer en silencio. */
  motivo: string
  puede: { dictar: boolean; escuchar: boolean; conversar: boolean }
  sale: Array<{ que: Sale; aQuien: string; motor: string }>
  problemas: string[]
}

const NADA = { dictar: false, escuchar: false, conversar: false }

/**
 * Decide qué ofrece la ranura de voz de un producto. Un motor de nube solo cuenta si el producto lo encendió
 * en `nube` (con su C4), y nunca con datos sensibles de terceros. Sin motor local no hay botón: se explica.
 */
export function decideRanuraVoz(v: ComposicionVoz | null, o: { datosSensibles: boolean }): RanuraVoz {
  if (!v) return { visible: false, motivo: 'este producto no declara voz', puede: NADA, sale: [], problemas: [] }
  const problemas: string[] = []
  const usable = (id: string, tipo: TipoMotor) => {
    const f = fichaMotor(id)
    if (!f || f.tipo !== tipo) { problemas.push(`motor ${tipo} desconocido: ${id}`); return null }
    if (f.local) return f
    if (!v.nube.includes(id)) { problemas.push(`${id} es de nube y el producto no lo encendió: la ranura no se llena sola con la nube`); return null }
    if (o.datosSensibles) { problemas.push(`${id} es de nube y el producto guarda datos sensibles de terceros: nunca`); return null }
    return f
  }
  const stt = usable(v.stt, 'stt'), tts = usable(v.tts, 'tts'), vad = usable(v.vad, 'vad')
  const puede = { dictar: Boolean(stt), escuchar: Boolean(tts), conversar: Boolean(stt && tts && vad) }
  const sale = [stt, tts, vad].filter((f): f is FichaMotor => Boolean(f && !f.local)).map((f) => ({ que: f.sale, aQuien: f.aQuien ?? '¿?', motor: f.id }))
  const visible = puede.dictar || puede.escuchar
  const motivo = visible
    ? sale.length ? `con nube encendida: ${sale.map((s) => `${s.que} a ${s.aQuien}`).join('; ')}` : 'motores locales: el audio no sale de la máquina'
    : `sin motor local declarado: ${problemas.join('; ') || 'nada que usar'}`
  return { visible, motivo, puede, sale, problemas }
}

// --- El Modo conversación: estados y transiciones (la interfaz la llena el módulo de voz) -------------------

export type EstadoConversacion = 'apagado' | 'pidiendo-permiso' | 'escuchando' | 'pensando' | 'hablando'

export type EventoConversacion =
  | { tipo: 'enciende' }
  | { tipo: 'permiso'; concedido: boolean }
  | { tipo: 'fin-de-habla' }
  | { tipo: 'responde' }
  | { tipo: 'termina-de-hablar' }
  | { tipo: 'habla-encima' }
  | { tipo: 'apaga' }

/** La máquina de estados del botón. Apagar gana siempre y cierra el micrófono al instante. */
export function transicion(e: EstadoConversacion, ev: EventoConversacion): EstadoConversacion {
  if (ev.tipo === 'apaga') return 'apagado'
  switch (e) {
    case 'apagado': return ev.tipo === 'enciende' ? 'pidiendo-permiso' : e
    case 'pidiendo-permiso': return ev.tipo === 'permiso' ? (ev.concedido ? 'escuchando' : 'apagado') : e
    case 'escuchando': return ev.tipo === 'fin-de-habla' ? 'pensando' : e
    case 'pensando': return ev.tipo === 'responde' ? 'hablando' : ev.tipo === 'habla-encima' ? 'escuchando' : e
    case 'hablando': return ev.tipo === 'termina-de-hablar' || ev.tipo === 'habla-encima' ? 'escuchando' : e
  }
}

export const microfonoAbierto = (e: EstadoConversacion): boolean => e === 'escuchando' || e === 'pensando' || e === 'hablando'

export interface AvisoConversacion {
  estado: EstadoConversacion
  /** Lo que dijo la persona en el último turno, ya transcrito. */
  turno?: string
  /** Lo que se le respondió (y se leyó en voz alta). */
  respuesta?: string
  interrumpida?: boolean
  error?: string
}

/** Lo que el módulo de voz implementa para el botón. La capa no sabe qué motor hay detrás. */
export interface ControlConversacion {
  estado(): EstadoConversacion
  /** Al primer clic pide el micrófono. */
  enciende(): Promise<{ ok: true } | { ok: false; motivo: string }>
  /** Cierra el micrófono AL INSTANTE (pistas detenidas antes de volver). */
  apaga(): void
  suscribe(fn: (a: AvisoConversacion) => void): () => void
}

// --- El enchufe de motor, compatible con OpenAI -----------------------------------------------------------

export interface OpcionesTranscripcion { modelo?: string; idioma?: string; senal?: AbortSignal }
export interface OpcionesVoz { modelo?: string; voz?: string; formato?: 'wav' | 'pcm' | 'mp3'; velocidad?: number; senal?: AbortSignal }

export interface ClienteAudio {
  /** POST /v1/audio/transcriptions (multipart: file, model, language, response_format=json) → { text }. */
  transcribe(audio: Blob, o?: OpcionesTranscripcion): Promise<{ texto: string }>
  /** POST /v1/audio/speech ({ model, input, voice, response_format, speed }) → audio. */
  sintetiza(texto: string, o?: OpcionesVoz): Promise<{ audio: ArrayBuffer; tipo: string }>
  /** GET /v1/models: prueba la llave SIN gastar cuota de transcripción (lo importado de Arbrain). */
  pruebaLlave(senal?: AbortSignal): Promise<{ ok: boolean; estado: number }>
}

export function creaClienteAudio(o: { base: string; token?: string; fetch?: typeof fetch }): ClienteAudio {
  const f = o.fetch ?? fetch
  const base = o.base.replace(/\/+$/, '')
  const cabeceras = (extra: Record<string, string> = {}) => (o.token ? { Authorization: `Bearer ${o.token}`, ...extra } : extra)
  const exige = async (r: Response, que: string) => {
    if (!r.ok) throw new Error(`${que}: ${r.status}`)
    return r
  }
  return {
    async transcribe(audio, op = {}) {
      const cuerpo = new FormData()
      cuerpo.append('file', audio, 'toma.wav')
      cuerpo.append('model', op.modelo ?? 'parakeet')
      cuerpo.append('response_format', 'json')
      if (op.idioma) cuerpo.append('language', op.idioma)
      const r = await exige(await f(`${base}/v1/audio/transcriptions`, { method: 'POST', headers: cabeceras(), body: cuerpo, signal: op.senal }), 'transcripción')
      const j = (await r.json()) as { text?: unknown }
      if (typeof j.text !== 'string') throw new Error('transcripción: la respuesta no trae «text»')
      return { texto: j.text }
    },
    async sintetiza(texto, op = {}) {
      const cuerpo = JSON.stringify({ model: op.modelo ?? 'piper', input: texto, voice: op.voz ?? 'es_MX', response_format: op.formato ?? 'wav', speed: op.velocidad ?? 1 })
      const r = await exige(await f(`${base}/v1/audio/speech`, { method: 'POST', headers: cabeceras({ 'Content-Type': 'application/json' }), body: cuerpo, signal: op.senal }), 'voz')
      return { audio: await r.arrayBuffer(), tipo: r.headers.get('content-type') ?? 'audio/wav' }
    },
    async pruebaLlave(senal) {
      const r = await f(`${base}/v1/models`, { headers: cabeceras(), signal: senal })
      return { ok: r.ok, estado: r.status }
    },
  }
}

// --- Lo que un módulo de voz le da a la ranura ----------------------------------------------------------------

/** Lo que el producto responde a un turno hablado: el texto que se lee en voz alta y si quedó frenado. */
export interface RespuestaDeTurno { texto: string; frenada: boolean }

/**
 * El enchufe de un módulo de voz en la ranura. Cada parte es opcional: la ranura ofrece solo lo que hay, y la
 * capa no sabe qué motor hay detrás. `creaControl` recibe la conversación de la capa como cerebro del turno: así
 * el Modo conversación pasa por la misma intención y el mismo freno que el chat escrito.
 */
export interface ModuloDeVoz {
  creaControl?: (o: { responde: (texto: string, senal: AbortSignal) => Promise<RespuestaDeTurno> }) => ControlConversacion
  /** Graba una toma hasta que la persona calla y la devuelve transcrita. */
  dicta?: (senal: AbortSignal) => Promise<string>
  /** Lee un texto en voz alta («Escuchar» y «Probar»). */
  lee?: (texto: string, senal: AbortSignal) => Promise<void>
  /** Qué motor suena y qué sale, para Ajustes › Voz. */
  describe?: () => { stt: string; tts: string; vad: string; sale: string }
}
