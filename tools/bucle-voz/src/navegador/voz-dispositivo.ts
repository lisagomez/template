/**
 * La MEJOR VOZ LOCAL del dispositivo, como respaldo donde no hay Piper (el navegador de un teléfono, una pestaña sin
 * el servicio de voz). Nunca una voz de red: el texto que se lee no sale de la máquina.
 *
 * PROCEDENCIA (Apache-2.0; atribución en el NOTICE del template): Arbrain v0.2.10, etiqueta firmada `v0.2.10`,
 * commit `829a9e99f0f6805325e24bd851eb5d1e88c3c67c`, `arbrain/src/features/chat/lib/chat-speech.ts` (blob `fb7d208b`)
 * › `mejorVozEspanol`: el orden por calidad («natural», «neural», «mejorada», «premium» primero) y por región (es-MX,
 * luego es-US y es-419, otras de Latinoamérica y es-ES al final), con la voz por defecto como desempate.
 *
 * QUÉ CAMBIÓ: solo cuentan las voces con `localService === true`. Allí el orden ponía «online» entre las mejores y
 * «google» después: las «… Online (Natural)» de Edge y las «Google …» de Chrome son voces de RED, que mandan el texto
 * a un tercero (hallazgo 6 del mapa de adopción); `localService` estaba en su firma y no se usaba. Sin voz LOCAL en
 * español no se habla con otra (`null`): allí el sistema decidía con `lang = 'es-MX'`, que puede ser una de red.
 */

export interface VozDispositivo {
  name: string;
  lang: string;
  localService?: boolean;
  default?: boolean;
}

const CALIDAD = /(natural|neural|wavenet|enhanced|mejorad|premium)/i;

/** La mejor voz LOCAL en español, o `null` si no hay ninguna. Pura: se prueba sin navegador. */
export function mejorVozLocal<V extends VozDispositivo>(voces: readonly V[]): V | null {
  const locales = voces.filter((v) => v.localService === true && /^es([-_]|$)/i.test(v.lang));
  if (locales.length === 0) return null;
  const calidad = (v: V) => (CALIDAD.test(v.name) ? 0 : 1);
  const region = (v: V) => {
    const l = v.lang.toLowerCase().replace('_', '-');
    return l === 'es-mx' ? 0 : l === 'es-us' || l === 'es-419' ? 1 : l === 'es-es' ? 3 : 2;
  };
  return [...locales].sort((a, b) => calidad(a) - calidad(b) || region(a) - region(b) || Number(Boolean(b.default)) - Number(Boolean(a.default)))[0] ?? null;
}

/** Las voces del sistema; en Chrome llegan tarde (`voiceschanged`), así que se esperan hasta `msEspera`. */
function voces(s: SpeechSynthesis, msEspera: number): Promise<SpeechSynthesisVoice[]> {
  const ya = s.getVoices();
  if (ya.length > 0) return Promise.resolve(ya);
  return new Promise((resuelve) => {
    const listo = () => resuelve(s.getVoices());
    s.addEventListener('voiceschanged', listo, { once: true });
    setTimeout(listo, msEspera);
  });
}

export class SinVozLocal extends Error {}

/**
 * Lee `texto` con la mejor voz LOCAL del dispositivo. Rechaza con `SinVozLocal` si no hay ninguna (nunca cae a una
 * de red) y con `AbortError` si se corta.
 */
export async function hablaConDispositivo(texto: string, senal: AbortSignal, o: { velocidad?: number; sintesis?: SpeechSynthesis; msEsperaVoces?: number } = {}): Promise<void> {
  const s = o.sintesis ?? (typeof speechSynthesis === 'undefined' ? undefined : speechSynthesis);
  if (!s) throw new SinVozLocal('este navegador no tiene síntesis de voz');
  const voz = mejorVozLocal(await voces(s, o.msEsperaVoces ?? 800));
  if (!voz) throw new SinVozLocal('no hay una voz LOCAL en español en este dispositivo (las de red no cuentan)');
  senal.throwIfAborted();
  await new Promise<void>((resuelve, rechaza) => {
    const u = new SpeechSynthesisUtterance(texto);
    u.voice = voz;
    u.lang = voz.lang;
    u.rate = o.velocidad ?? 1;
    u.onend = () => resuelve();
    u.onerror = (e) => (e.error === 'interrupted' || e.error === 'canceled' ? rechaza(new DOMException('cortado', 'AbortError')) : rechaza(new Error(`la voz del dispositivo falló: ${e.error}`)));
    senal.addEventListener('abort', () => s.cancel(), { once: true });
    s.speak(u);
  });
}
