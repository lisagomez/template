/**
 * Los adaptadores de NUBE (Groq, LemonFox, ElevenLabs) contra un proveedor SIMULADO, y la cadena de transcripción
 * que no se apaga si falta un proveedor opcional. Nada de esto toca la red: el «proveedor» es un servidor local que
 * anota lo que le llega (la prueba de qué sale de la máquina con cada uno). Ninguno queda medido: `medido: false`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adaptadoresPedidos, creaSttGroq, creaSttLemonfox, creaTtsElevenlabs, creaTtsLemonfox, describeNube, ErrorNube, FICHAS_NUBE, transcribeEnCadena, type EslabonStt,
} from '../dist/nube.js';
import { creaProveedorSimulado, pcmTono, wavDe } from './proveedor-simulado.ts';

const LLAVES = { groq: 'gsk_prueba_0123456789', lemonfox: 'lf_prueba_0123456789', elevenlabs: 'el_prueba_0123456789' };
const WAV = new Uint8Array(wavDe(pcmTono(16_000, 0.5), 16_000));

test('las fichas: apagadas por defecto, no medidas, y cada una dice qué sale y a quién (C4)', () => {
  assert.deepEqual(FICHAS_NUBE.map((f) => f.id), ['groq', 'lemonfox-stt', 'lemonfox-tts', 'elevenlabs']);
  for (const f of FICHAS_NUBE) {
    assert.equal(f.medido, false, `${f.id} no está medido`);
    assert.ok(f.aQuien.length > 0 && (f.sale === 'audio' || f.sale === 'texto'), f.id);
    assert.equal(f.sale, f.tipo === 'stt' ? 'audio' : 'texto', 'el STT manda audio; el TTS manda texto');
  }
  // Sin pedir nada, no se enciende nada y NO se lee ninguna llave del entorno.
  const leidas: string[] = [];
  const env = new Proxy({ GROQ_API_KEY: 'x', LEMONFOX_API_KEY: 'y' } as Record<string, string>, { get: (t, k) => (leidas.push(String(k)), t[String(k)]) });
  const nada = adaptadoresPedidos([], env);
  assert.equal(nada.stt.length + nada.tts.size, 0);
  assert.deepEqual(leidas, [], 'apagada: ni se miran las llaves');
  const algo = adaptadoresPedidos(['groq', 'inventado'], env);
  assert.equal(algo.stt.length, 1);
  assert.deepEqual(algo.desconocidos, ['inventado']);
  assert.deepEqual(leidas, ['GROQ_API_KEY'], 'solo la llave de lo encendido');
});

test('Groq: sale el AUDIO (multipart WAV, whisper-large-v3-turbo, es); vuelve el texto sin espacios', async () => {
  const p = await creaProveedorSimulado(LLAVES);
  try {
    const groq = creaSttGroq({ llave: LLAVES.groq, base: p.base });
    assert.equal(groq.disponible, true);
    const texto = await groq.transcribe(WAV, { idioma: 'es' });
    assert.equal(texto, `texto de groq (${WAV.length} bytes, es)`);
    const r = p.recibidos.at(-1);
    assert.equal(r?.sale, 'audio');
    assert.equal(r?.bytes, WAV.length, 'salió el audio entero, nada más');
    assert.deepEqual(r?.campos, { language: 'es', response_format: 'json', model: 'whisper-large-v3-turbo' });
    assert.deepEqual(r?.extra, []);
  } finally {
    await p.cierra();
  }
});

test('LemonFox STT: el idioma va por nombre («spanish»), y sin llave el adaptador existe pero no está disponible', async () => {
  const p = await creaProveedorSimulado(LLAVES);
  try {
    const lf = creaSttLemonfox({ llave: LLAVES.lemonfox, base: p.base });
    assert.match(await lf.transcribe(WAV), /texto de lemonfox-stt .* spanish/);
    const sin = creaSttLemonfox({ llave: '  ', base: p.base });
    assert.equal(sin.disponible, false);
    await assert.rejects(sin.transcribe(WAV), (e: unknown) => e instanceof ErrorNube && e.codigo === 'sin-llave');
  } finally {
    await p.cierra();
  }
});

test('probar la llave SIN gastar: Groq por /models; LemonFox lo dice en vez de gastar; sin llave, «sin-llave»', async () => {
  const p = await creaProveedorSimulado(LLAVES);
  try {
    assert.deepEqual({ ...(await creaSttGroq({ llave: LLAVES.groq, base: p.base }).pruebaLlave()), ms: 0 }, { ok: true, estado: 200, ms: 0 });
    assert.equal((await creaSttGroq({ llave: 'otra', base: p.base }).pruebaLlave()).codigo, 'llave-invalida');
    assert.equal((await creaSttGroq({ llave: undefined, base: p.base }).pruebaLlave()).codigo, 'sin-llave');
    assert.equal((await creaSttLemonfox({ llave: LLAVES.lemonfox, base: p.base }).pruebaLlave()).codigo, 'no-disponible');
    assert.equal((await creaTtsElevenlabs({ llave: LLAVES.elevenlabs, voz: 'v1', base: p.base }).pruebaLlave()).ok, true);
    assert.ok(p.recibidos.every((r) => r.sale === 'nada'), 'probar no mandó ni audio ni texto');
  } finally {
    await p.cierra();
  }
});

test('ElevenLabs: sale el TEXTO de la frase (sin previous_text), vuelve PCM a 24 kHz', async () => {
  const p = await creaProveedorSimulado(LLAVES);
  try {
    const el = creaTtsElevenlabs({ llave: LLAVES.elevenlabs, voz: 'voz-prueba', base: p.base });
    const r = await el.sintetiza('Hola, esto es una prueba.', { velocidad: 1.1 });
    assert.equal(r.tipo, 'audio/pcm');
    assert.equal(r.frecuenciaHz, 24_000);
    assert.equal(r.audio.length, 4800, '0,1 s a 24 kHz en PCM16');
    const rec = p.recibidos.at(-1);
    assert.equal(rec?.sale, 'texto');
    assert.equal(rec?.texto, 'Hola, esto es una prueba.');
    assert.deepEqual(rec?.extra, [], 'ni previous_text ni nada que no se declare');
    assert.deepEqual(rec?.campos, { voz: 'voz-prueba', formato: 'pcm_24000' });
  } finally {
    await p.cierra();
  }
});

test('LemonFox TTS: sale el texto y vuelve WAV', async () => {
  const p = await creaProveedorSimulado(LLAVES);
  try {
    const r = await creaTtsLemonfox({ llave: LLAVES.lemonfox, base: p.base }).sintetiza('Buenas tardes.');
    assert.equal(r.tipo, 'audio/wav');
    assert.equal(Buffer.from(r.audio.subarray(0, 4)).toString('ascii'), 'RIFF');
    assert.equal(p.recibidos.at(-1)?.texto, 'Buenas tardes.');
    assert.equal(p.recibidos.at(-1)?.campos['response_format'], 'wav');
  } finally {
    await p.cierra();
  }
});

const local = (resultado: () => Promise<string>, llamadas: string[]): EslabonStt => ({ id: 'parakeet-local', local: true, disponible: true, transcribe: () => (llamadas.push('local'), resultado()) });

test('la cadena: el LOCAL va primero y, si contesta, la nube ni se toca', async () => {
  const p = await creaProveedorSimulado(LLAVES);
  try {
    const llamadas: string[] = [];
    const groq = creaSttGroq({ llave: LLAVES.groq, base: p.base });
    const r = await transcribeEnCadena([local(async () => 'hola desde aquí', llamadas), { id: 'groq', local: false, disponible: groq.disponible, transcribe: (s) => groq.transcribe(WAV, { senal: s }) }]);
    assert.deepEqual(r, { texto: 'hola desde aquí', motor: 'parakeet-local', local: true, saltados: [] });
    assert.equal(p.recibidos.length, 0, 'nada salió de la máquina');
  } finally {
    await p.cierra();
  }
});

test('no se apaga si falta un proveedor opcional: sin la llave de Groq, contesta LemonFox (lo de Arbrain)', async () => {
  const p = await creaProveedorSimulado(LLAVES);
  try {
    const { stt } = adaptadoresPedidos(['groq', 'lemonfox-stt'], { LEMONFOX_API_KEY: LLAVES.lemonfox }, { bases: { groq: p.base, 'lemonfox-stt': p.base } });
    const llamadas: string[] = [];
    const eslabones: EslabonStt[] = [local(async () => { throw new Error('el motor local se cayó'); }, llamadas), ...stt.map((a) => ({ id: a.ficha.id, local: false, disponible: a.disponible, transcribe: (s: AbortSignal | undefined) => a.transcribe(WAV, { senal: s }) }))];
    const r = await transcribeEnCadena(eslabones);
    assert.equal(r.motor, 'lemonfox-stt');
    assert.deepEqual(r.saltados, [{ motor: 'parakeet-local', motivo: 'fallo del motor' }, { motor: 'groq', motivo: 'sin llave' }]);
    assert.deepEqual(llamadas, ['local'], 'el local se intentó una vez');
    assert.deepEqual(describeNube(stt), [
      'groq: sin llave (se salta) · sale audio a Groq (whisper-large-v3-turbo) · no medido',
      'lemonfox-stt: llave presente · sale audio a LemonFox · no medido',
    ]);
    assert.ok(!describeNube(stt).join(' ').includes(LLAVES.lemonfox), 'la llave nunca se enseña');
  } finally {
    await p.cierra();
  }
});

test('una llave rechazada pasa al siguiente sin filtrar el cuerpo del proveedor; un 500 se reintenta una vez', async () => {
  const p = await creaProveedorSimulado(LLAVES);
  try {
    const malo = creaSttGroq({ llave: 'llave-equivocada', base: p.base });
    const lf = creaSttLemonfox({ llave: LLAVES.lemonfox, base: p.base });
    const e = (a: typeof malo) => ({ id: a.ficha.id, local: false, disponible: a.disponible, transcribe: (s: AbortSignal | undefined) => a.transcribe(WAV, { senal: s }) });
    const r = await transcribeEnCadena([e(malo), e(lf)]);
    assert.equal(r.motor, 'lemonfox-stt');
    assert.deepEqual(r.saltados, [{ motor: 'groq', motivo: 'llave-invalida' }]);
    p.fallos['lemonfox-stt'] = [500];
    const r2 = await transcribeEnCadena([e(lf)]);
    assert.equal(r2.motor, 'lemonfox-stt', 'el segundo intento contestó');
    p.fallos.groq = [503, 503];
    p.fallos['lemonfox-stt'] = [];
    const bueno = creaSttGroq({ llave: LLAVES.groq, base: p.base });
    const r3 = await transcribeEnCadena([e(bueno), e(lf)]);
    assert.deepEqual([r3.motor, r3.saltados], ['lemonfox-stt', [{ motor: 'groq', motivo: 'fallo' }]]);
    await assert.rejects(creaSttGroq({ llave: 'x', base: p.base }).transcribe(WAV), (err: unknown) => err instanceof ErrorNube && !err.message.includes('secreto'));
  } finally {
    await p.cierra();
  }
});

test('audio que el proveedor no puede leer: la cadena se detiene (ningún otro lo leerá); abortar no sigue', async () => {
  const p = await creaProveedorSimulado(LLAVES);
  try {
    p.fallos.groq = [415];
    const groq = creaSttGroq({ llave: LLAVES.groq, base: p.base });
    const lf = creaSttLemonfox({ llave: LLAVES.lemonfox, base: p.base });
    const e = (a: typeof groq) => ({ id: a.ficha.id, local: false, disponible: a.disponible, transcribe: (s: AbortSignal | undefined) => a.transcribe(WAV, { senal: s }) });
    await assert.rejects(transcribeEnCadena([e(groq), e(lf)]), (err: unknown) => err instanceof ErrorNube && err.codigo === 'audio-invalido');
    assert.ok(!p.recibidos.some((r) => r.id === 'lemonfox-stt'), 'LemonFox no recibió nada');
    const corte = new AbortController();
    corte.abort();
    await assert.rejects(transcribeEnCadena([e(lf)], corte.signal), { name: 'AbortError' });
    await assert.rejects(transcribeEnCadena([{ id: 'groq', local: false, disponible: false, transcribe: async () => 'x' }]), /no hay ningún motor/);
  } finally {
    await p.cierra();
  }
});
