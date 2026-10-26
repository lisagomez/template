/**
 * La mejor voz LOCAL del dispositivo (adoptada de Arbrain v0.2.10, `chat-speech.ts › mejorVozEspanol`, filtrando por
 * `localService`): nunca una voz de red, el orden de calidad y región de allá, y `null` si no hay ninguna local.
 * `hablaConDispositivo` con una síntesis falsa: no cae a una de red y se corta con la señal.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hablaConDispositivo, mejorVozLocal, SinVozLocal, type VozDispositivo } from '../dist/navegador/voz-dispositivo.js';

const v = (name: string, lang: string, localService: boolean, extra: Partial<VozDispositivo> = {}): VozDispositivo => ({ name, lang, localService, ...extra });

test('nunca una voz de red: las «Online (Natural)» de Edge y las «Google» de Chrome no cuentan aunque «suenen mejor»', () => {
  const voces = [
    v('Microsoft Dalia Online (Natural) - Spanish (Mexico)', 'es-MX', false),
    v('Google español de Estados Unidos', 'es-US', false),
    v('Microsoft Sabina - Spanish (Mexico)', 'es-MX', true),
    v('Microsoft Helena - Spanish (Spain)', 'es-ES', true),
  ];
  assert.equal(mejorVozLocal(voces)?.name, 'Microsoft Sabina - Spanish (Mexico)');
});

test('el orden de Arbrain entre las locales: calidad (natural, mejorada) y luego región (es-MX, es-US/419, otras, es-ES)', () => {
  assert.equal(mejorVozLocal([v('Mónica', 'es-ES', true), v('Paulina', 'es_MX', true)])?.name, 'Paulina');
  assert.equal(mejorVozLocal([v('Paulina', 'es-MX', true), v('Jorge (mejorada)', 'es-ES', true)])?.name, 'Jorge (mejorada)');
  assert.equal(mejorVozLocal([v('Diego', 'es-AR', true), v('Ana', 'es-419', true), v('Mónica', 'es-ES', true)])?.name, 'Ana');
  assert.equal(mejorVozLocal([v('A', 'es-MX', true), v('B', 'es-MX', true, { default: true })])?.name, 'B', 'empate: la de defecto');
});

test('sin voz LOCAL en español: null (no se deja decidir al sistema, que puede escoger una de red)', () => {
  assert.equal(mejorVozLocal([v('Google español', 'es-ES', false), v('Samantha', 'en-US', true)]), null);
  assert.equal(mejorVozLocal([]), null);
});

/** Una síntesis falsa del navegador: anota lo que habló y termina sola, o se queda hablando hasta `cancel`. */
function sintesisFalsa(voces: VozDispositivo[], termina = true) {
  const dichas: { texto: string; voz?: string; lang?: string }[] = [];
  let actual: { onend?: () => void; onerror?: (e: { error: string }) => void } | undefined;
  const s = {
    getVoices: () => voces,
    addEventListener: () => undefined,
    speak(u: { text: string; voice?: VozDispositivo; lang?: string; onend?: () => void; onerror?: (e: { error: string }) => void }) {
      dichas.push({ texto: u.text, voz: u.voice?.name, lang: u.lang });
      actual = u;
      if (termina) queueMicrotask(() => u.onend?.());
    },
    cancel: () => actual?.onerror?.({ error: 'interrupted' }),
  };
  return { s: s as unknown as SpeechSynthesis, dichas };
}

test('hablaConDispositivo: lee con la mejor LOCAL; sin local, falla con SinVozLocal sin hablar; la señal la corta', async () => {
  class Enunciado { text: string; voice?: VozDispositivo; lang = ''; rate = 1; onend?: () => void; onerror?: (e: { error: string }) => void; constructor(t: string) { this.text = t; } }
  (globalThis as unknown as { SpeechSynthesisUtterance: typeof Enunciado }).SpeechSynthesisUtterance = Enunciado;
  const bien = sintesisFalsa([v('Google español', 'es-MX', false), v('Paulina', 'es-MX', true)]);
  await hablaConDispositivo('Así sueno.', new AbortController().signal, { sintesis: bien.s });
  assert.deepEqual(bien.dichas, [{ texto: 'Así sueno.', voz: 'Paulina', lang: 'es-MX' }]);
  const nube = sintesisFalsa([v('Google español', 'es-MX', false)]);
  await assert.rejects(hablaConDispositivo('Hola.', new AbortController().signal, { sintesis: nube.s, msEsperaVoces: 10 }), SinVozLocal);
  assert.equal(nube.dichas.length, 0, 'no habló con una voz de red');
  const larga = sintesisFalsa([v('Paulina', 'es-MX', true)], false);
  const c = new AbortController();
  const hablando = hablaConDispositivo('Una frase larga que se corta.', c.signal, { sintesis: larga.s });
  setTimeout(() => c.abort(), 5);
  await assert.rejects(hablando, { name: 'AbortError' });
});
