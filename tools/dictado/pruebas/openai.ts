/**
 * Contrato del enchufe COMPATIBLE CON OPENAI del servicio de dictado (`servicio/openai.mjs`), contra el manejador
 * REAL del servicio (`servicio/rutas.mjs`) con un motor y una voz falsos: sin modelos, sin red, sin micrófono.
 *
 *  - `/v1/audio/transcriptions`, `/v1/audio/speech` y `/v1/models` con un cliente cualquiera (fetch + FormData, como
 *    lo haría un SDK de OpenAI) y con el cliente de la capa (`creaClienteAudio`), tal cual;
 *  - el token: sin él, 401 en la forma de OpenAI; `/v1/models` lo prueba sin mover ningún motor;
 *  - lo que no hay (mp3, srt, voces que no están) se dice con su código, no se adivina;
 *  - la nube detrás de la misma interfaz: apagada por defecto; encendida, contesta cuando el local falla y su C4 se
 *    ve en lo que recibe el proveedor simulado.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { codificaWav, leeWav, pcm16aFloat, preparaParaModelo } from '../node_modules/@tu-scope/voz/dist/node/index.js';
import { floatAPcm16 } from '../dist/node/index.js';
import { adaptadoresPedidos } from '../dist/nube.js';
import { creaManejador } from '../servicio/rutas.mjs';
import { creaProveedorSimulado } from './proveedor-simulado.ts';

const TOKEN = 'token-de-prueba-del-servicio-0123456789';
const AUDIO = { pcm16aFloat, leeWav, preparaParaModelo, floatAPcm16, codificaWav };

interface Motor { id: string; transcribe(m: Float32Array, hz: number, o: { idioma?: string; pista?: string }): Promise<{ texto: string }> }

function motorFalso(llamadas: { segundos: number; hz: number; idioma?: string; pista?: string }[], falla = false): Motor {
  return {
    id: 'sherpa:falso-stt-int8',
    async transcribe(m, hz, o) {
      llamadas.push({ segundos: Math.round((m.length / hz) * 100) / 100, hz, idioma: o.idioma, pista: o.pista });
      if (falla) throw new Error('el motor local se cayó');
      return { texto: `oí ${(m.length / hz).toFixed(2)} s en ${o.idioma}` };
    },
  };
}

/** Dos «frases» de 0,1 s a 22 050 Hz, como las entrega sherpa: cada una por el callback. */
const vozFalsa = (frases: string[]) => ({
  frecuenciaHz: 22_050,
  async sintetiza(texto: string, cb: (m: Float32Array) => boolean, o: { velocidad?: number }) {
    frases.push(`${texto}@${o.velocidad ?? 1}`);
    for (let i = 0; i < 2; i++) if (!cb(new Float32Array(2205).fill(0.25))) return;
  },
});

interface Montaje { base: string; llamadas: Parameters<typeof motorFalso>[0]; frases: string[]; cierra(): Promise<void> }

async function monta(extra: Record<string, unknown> = {}, falla = false): Promise<Montaje> {
  const llamadas: Montaje['llamadas'] = [];
  const frases: string[] = [];
  const configuracion = {
    token: TOKEN, motor: motorFalso(llamadas, falla), respaldo: null, idioma: 'es',
    voces: new Map([['es_MX-prueba-high', vozFalsa(frases)], ['es_ES-prueba-medium', vozFalsa(frases)]]),
    nube: { stt: [], tts: new Map() }, bytesMaximos: 10 * 1024 * 1024, enVuelo: 1, caracteresMaximos: 2000,
    ...extra,
  };
  const servidor: Server = createServer(creaManejador(configuracion, AUDIO));
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
  const { port } = servidor.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, llamadas, frases, cierra: () => new Promise<void>((r) => servidor.close(() => r())) };
}

const auth = (t = TOKEN) => ({ authorization: `Bearer ${t}` });
const wav = (segundos: number, hz = 16_000, canales = 1) => {
  const m = new Float32Array(Math.round(segundos * hz)).map((_, i) => Math.sin(i / 7) * 0.2);
  const w = codificaWav(m, hz);
  if (canales === 1) return w;
  // Estéreo a mano: el servicio tiene que bajarlo a mono a 16 kHz.
  const pcm = Buffer.from(w.subarray(44));
  const est = Buffer.alloc(pcm.length * 2);
  for (let i = 0; i < pcm.length / 2; i++) { est.writeInt16LE(pcm.readInt16LE(i * 2), i * 4); est.writeInt16LE(pcm.readInt16LE(i * 2), i * 4 + 2); }
  const c = Buffer.from(w.subarray(0, 44));
  c.writeUInt32LE(36 + est.length, 4); c.writeUInt16LE(2, 22); c.writeUInt32LE(hz * 4, 28); c.writeUInt16LE(4, 32); c.writeUInt32LE(est.length, 40);
  return new Uint8Array(Buffer.concat([c, est]));
};
const form = (archivo: Uint8Array | null, campos: Record<string, string> = {}, tipo = 'audio/wav') => {
  const f = new FormData();
  if (archivo) f.set('file', new Blob([new Uint8Array(archivo)], { type: tipo }), 'toma.wav');
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

test('GET /v1/models: prueba el token sin mover ningún motor (401 en la forma de OpenAI sin él)', async () => {
  const m = await monta();
  try {
    const sin = await fetch(`${m.base}/v1/models`);
    assert.equal(sin.status, 401);
    assert.deepEqual(await sin.json(), { error: { message: 'no autorizado', type: 'invalid_request_error', code: 'invalid_api_key' } });
    assert.equal((await fetch(`${m.base}/v1/models`, { headers: auth('otro-token-de-la-misma-longitud-000000') })).status, 401);
    const r = await fetch(`${m.base}/v1/models`, { headers: auth() });
    assert.equal(r.status, 200);
    const j = (await r.json()) as { object: string; data: { id: string; tipo: string; owned_by: string }[] };
    assert.equal(j.object, 'list');
    assert.deepEqual(j.data.map((d) => [d.id, d.tipo, d.owned_by]), [['sherpa:falso-stt-int8', 'stt', 'local'], ['es_MX-prueba-high', 'tts', 'local'], ['es_ES-prueba-medium', 'tts', 'local']]);
    assert.equal(m.llamadas.length + m.frases.length, 0, 'probar no gastó nada');
    assert.equal((await fetch(`${m.base}/health`)).status, 200, '/health sigue sin token');
  } finally {
    await m.cierra();
  }
});

test('POST /v1/audio/transcriptions: multipart como un SDK de OpenAI → { text } y nada más; quién contestó va en cabeceras', async () => {
  const m = await monta();
  try {
    const r = await fetch(`${m.base}/v1/audio/transcriptions`, { method: 'POST', headers: auth(), body: form(wav(1), { model: 'whisper-1', language: 'spanish', response_format: 'json', prompt: 'margen bruto' }) });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { text: 'oí 1.00 s en es' });
    assert.equal(r.headers.get('x-motor'), 'sherpa:falso-stt-int8');
    assert.equal(r.headers.get('x-local'), '1');
    assert.deepEqual(m.llamadas.at(-1), { segundos: 1, hz: 16_000, idioma: 'es', pista: 'margen bruto' });
    const texto = await fetch(`${m.base}/v1/audio/transcriptions`, { method: 'POST', headers: auth(), body: form(wav(0.5), { response_format: 'text', language: 'es-MX' }) });
    assert.equal(texto.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.equal(await texto.text(), 'oí 0.50 s en es');
    // 48 kHz estéreo: el motor recibe 16 kHz mono, la misma duración.
    await fetch(`${m.base}/v1/audio/transcriptions`, { method: 'POST', headers: auth(), body: form(wav(1, 48_000, 2)) });
    assert.deepEqual(m.llamadas.at(-1), { segundos: 1, hz: 16_000, idioma: 'es', pista: undefined });
  } finally {
    await m.cierra();
  }
});

test('transcripción: lo que no hay se dice con su código (sin token, sin multipart, sin archivo, mp3, srt)', async () => {
  const m = await monta();
  try {
    const pide = (body: BodyInit, cab: Record<string, string> = auth()) => fetch(`${m.base}/v1/audio/transcriptions`, { method: 'POST', headers: cab, body });
    assert.equal((await pide(form(wav(1)), {})).status, 401);
    assert.equal((await pide('hola', { ...auth(), 'content-type': 'text/plain' })).status, 400);
    assert.equal((await pide(form(null, { model: 'whisper-1' }))).status, 400);
    const mp3 = await pide(form(new Uint8Array(Buffer.concat([Buffer.from('ID3'), Buffer.alloc(2000)])), {}, 'audio/mpeg'));
    assert.equal(mp3.status, 415);
    assert.equal(((await mp3.json()) as { error: { code: string } }).error.code, 'unsupported_audio');
    assert.equal((await pide(form(wav(1), { response_format: 'srt' }))).status, 400);
    assert.equal((await pide(form(wav(1), { model: 'respaldo' }))).status, 400, 'sin respaldo configurado');
    assert.equal(m.llamadas.length, 0, 'ningún error llegó al motor');
  } finally {
    await m.cierra();
  }
});

test('POST /v1/audio/speech: WAV entero con tamaños exactos, o PCM en flujo con su frecuencia; voz por prefijo', async () => {
  const m = await monta();
  try {
    const pide = (cuerpo: Record<string, unknown>) => fetch(`${m.base}/v1/audio/speech`, { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
    const r = await pide({ model: 'piper', input: 'Buenas tardes.', voice: 'es_MX', response_format: 'wav', speed: 0.9 });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'audio/wav');
    assert.equal(r.headers.get('x-voz'), 'es_MX-prueba-high', '«es_MX» elige la primera voz es_MX cargada');
    const bytes = Buffer.from(await r.arrayBuffer());
    assert.equal(bytes.readUInt32LE(4), bytes.length - 8, 'RIFF con su tamaño (no 0xFFFFFFFF)');
    assert.equal(bytes.readUInt32LE(40), bytes.length - 44, 'data con su tamaño');
    const leido = leeWav(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    assert.equal(leido.frecuenciaHz, 22_050);
    assert.equal(leido.canales[0]?.length, 4410, 'las dos frases enteras');
    assert.deepEqual(m.frases, ['Buenas tardes.@0.9']);
    const pcm = await pide({ input: 'Hola.', voice: 'es_ES-prueba-medium', response_format: 'pcm' });
    assert.equal(pcm.headers.get('content-type'), 'audio/pcm');
    assert.equal(pcm.headers.get('x-frecuencia-hz'), '22050');
    assert.equal((await pcm.arrayBuffer()).byteLength, 4410 * 2);
    const sinFormato = await pide({ input: 'Hola.' });
    assert.equal(sinFormato.headers.get('content-type'), 'audio/wav', 'sin response_format: WAV (aquí no hay mp3)');
    await sinFormato.arrayBuffer();
  } finally {
    await m.cierra();
  }
});

test('voz: mp3 se rechaza (no hay codificador), la voz que no está se nombra, y velocidad e input se validan', async () => {
  const m = await monta();
  try {
    const pide = (cuerpo: Record<string, unknown>) => fetch(`${m.base}/v1/audio/speech`, { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
    const mp3 = await pide({ input: 'Hola.', response_format: 'mp3' });
    assert.equal(mp3.status, 400);
    assert.match(((await mp3.json()) as { error: { message: string } }).error.message, /no codifica mp3/);
    const voz = await pide({ input: 'Hola.', voice: 'alloy' });
    assert.equal(voz.status, 400);
    assert.match(((await voz.json()) as { error: { message: string } }).error.message, /es_MX-prueba-high, es_ES-prueba-medium/);
    assert.equal((await pide({ input: 'Hola.', speed: 3 })).status, 400);
    assert.equal((await pide({ input: '   ' })).status, 400);
    assert.equal((await pide({ input: 'Hola.', model: 'elevenlabs' })).status, 400, 'la nube está apagada por defecto');
    assert.equal(m.frases.length, 0);
  } finally {
    await m.cierra();
  }
});

test('el cliente de la capa (`creaClienteAudio`) le habla tal cual: transcribe, sintetiza y prueba la llave', async (t) => {
  let creaClienteAudio: ((o: { base: string; token?: string }) => {
    transcribe(a: Blob): Promise<{ texto: string }>;
    sintetiza(texto: string): Promise<{ audio: ArrayBuffer; tipo: string }>;
    pruebaLlave(): Promise<{ ok: boolean; estado: number }>;
  }) | undefined;
  try {
    ({ creaClienteAudio } = await import('../../capa/src/voz.ts'));
  } catch {
    t.skip('tools/capa no está junto a este paquete (instalado fuera del monorepo)');
    return;
  }
  const m = await monta();
  try {
    const cliente = creaClienteAudio({ base: `${m.base}/`, token: TOKEN });
    assert.deepEqual(await cliente.transcribe(new Blob([new Uint8Array(wav(0.75))], { type: 'audio/wav' })), { texto: 'oí 0.75 s en es' });
    const voz = await cliente.sintetiza('Va, déjame pensarlo.');
    assert.equal(voz.tipo, 'audio/wav');
    assert.equal(Buffer.from(voz.audio.slice(0, 4)).toString('ascii'), 'RIFF');
    assert.deepEqual(await cliente.pruebaLlave(), { ok: true, estado: 200 });
    assert.deepEqual(await creaClienteAudio({ base: m.base, token: 'no-es-el-token' }).pruebaLlave(), { ok: false, estado: 401 });
  } finally {
    await m.cierra();
  }
});

test('la nube detrás de la misma interfaz: si el local falla, contesta la encendida con llave; su C4 se ve en el proveedor', async () => {
  const p = await creaProveedorSimulado({ lemonfox: 'lf-0123456789', elevenlabs: 'el-0123456789' });
  const nube = adaptadoresPedidos(['groq', 'lemonfox-stt', 'elevenlabs'], { LEMONFOX_API_KEY: 'lf-0123456789', ELEVENLABS_API_KEY: 'el-0123456789', ELEVENLABS_VOZ: 'voz-x' }, { bases: { groq: p.base, 'lemonfox-stt': p.base, elevenlabs: p.base } });
  const m = await monta({ nube }, true);
  try {
    const r = await fetch(`${m.base}/v1/audio/transcriptions`, { method: 'POST', headers: auth(), body: form(wav(0.5)) });
    assert.equal(r.status, 200);
    assert.match(((await r.json()) as { text: string }).text, /texto de lemonfox-stt/);
    assert.equal(r.headers.get('x-motor'), 'lemonfox-stt');
    assert.equal(r.headers.get('x-local'), '0');
    assert.equal(r.headers.get('x-saltados'), 'sherpa:falso-stt-int8:fallo del motor,groq:sin llave');
    assert.equal(p.recibidos.filter((x) => x.sale === 'audio').length, 1, 'el audio salió UNA vez, a LemonFox');
    const v = await fetch(`${m.base}/v1/audio/speech`, { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify({ model: 'elevenlabs', input: 'Hola desde la nube.', response_format: 'wav' }) });
    assert.equal(v.status, 200);
    assert.equal(v.headers.get('x-motor'), 'elevenlabs');
    assert.equal(v.headers.get('x-frecuencia-hz'), '24000');
    await v.arrayBuffer();
    assert.deepEqual(p.recibidos.filter((x) => x.sale === 'texto').map((x) => x.texto), ['Hola desde la nube.'], 'a ElevenLabs salió el texto, y nada más');
    const lista = (await (await fetch(`${m.base}/v1/models?probar=1`, { headers: auth() })).json()) as { data: { id: string; disponible?: boolean; prueba?: { codigo?: string; ok: boolean } }[] };
    const de = (id: string) => lista.data.find((d) => d.id === id);
    assert.equal(de('groq')?.disponible, false);
    assert.equal(de('groq')?.prueba?.codigo, 'sin-llave');
    assert.equal(de('lemonfox-stt')?.prueba?.codigo, 'no-disponible', 'LemonFox no se prueba gastando');
    assert.equal(de('elevenlabs')?.prueba?.ok, true);
  } finally {
    await m.cierra();
    await p.cierra();
  }
});

test('con la nube apagada (por defecto), pedir un motor de nube se rechaza y al proveedor no le llega nada', async () => {
  const p = await creaProveedorSimulado({ groq: 'gsk-0123456789' });
  const m = await monta({}, true);
  try {
    const r = await fetch(`${m.base}/v1/audio/transcriptions`, { method: 'POST', headers: auth(), body: form(wav(0.5), { model: 'groq' }) });
    assert.equal(r.status, 400);
    assert.match(((await r.json()) as { error: { message: string } }).error.message, /apagado/);
    const local = await fetch(`${m.base}/v1/audio/transcriptions`, { method: 'POST', headers: auth(), body: form(wav(0.5)) });
    assert.equal(local.status, 503, 'el local cayó y no hay a quién pasar: se dice, no se inventa');
    assert.equal(p.recibidos.length, 0);
  } finally {
    await m.cierra();
    await p.cierra();
  }
});
