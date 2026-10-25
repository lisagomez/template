/**
 * Un proveedor de voz en la nube SIMULADO (Groq, LemonFox y ElevenLabs en un solo servidor local), para probar los
 * adaptadores de `src/nube.ts` sin red y sin llaves reales. Anota todo lo que le llega: es la prueba de QUÉ sale de
 * la máquina con cada adaptador (audio o texto), que es lo que su C4 declara. No es un archivo de pruebas: lo usan
 * `nube.ts` y `openai.ts`.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export type IdSimulado = 'groq' | 'lemonfox-stt' | 'lemonfox-tts' | 'elevenlabs';

export interface Recibido {
  id: IdSimulado | 'modelos';
  ruta: string;
  /** Qué salió: el audio (bytes del archivo) o el texto. */
  sale: 'audio' | 'texto' | 'nada';
  bytes?: number;
  texto?: string;
  campos: Record<string, string>;
  /** Llegó algo más que lo declarado (p. ej. `previous_text`). */
  extra: string[];
}

export interface ProveedorSimulado {
  base: string;
  recibidos: Recibido[];
  /** Códigos que devolverá cada proveedor ANTES de contestar bien (uno por llamada). */
  fallos: Partial<Record<IdSimulado, number[]>>;
  cierra(): Promise<void>;
}

const leeTodo = (req: IncomingMessage) =>
  new Promise<Buffer>((resuelve) => {
    const trozos: Buffer[] = [];
    req.on('data', (d: Buffer) => trozos.push(d));
    req.on('end', () => resuelve(Buffer.concat(trozos)));
  });

/** 0,1 s de un tono, PCM16LE mono. */
export function pcmTono(hz: number, segundos = 0.1): Buffer {
  const n = Math.round(hz * segundos);
  const b = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / hz) * 8000), i * 2);
  return b;
}

export function wavDe(pcm: Buffer, hz: number): Buffer {
  const c = Buffer.alloc(44);
  c.write('RIFF', 0, 'ascii');
  c.writeUInt32LE(36 + pcm.length, 4);
  c.write('WAVEfmt ', 8, 'ascii');
  c.writeUInt32LE(16, 16);
  c.writeUInt16LE(1, 20);
  c.writeUInt16LE(1, 22);
  c.writeUInt32LE(hz, 24);
  c.writeUInt32LE(hz * 2, 28);
  c.writeUInt16LE(2, 32);
  c.writeUInt16LE(16, 34);
  c.write('data', 36, 'ascii');
  c.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([c, pcm]);
}

const responde = (res: ServerResponse, codigo: number, cuerpo: unknown, tipo = 'application/json') => {
  res.writeHead(codigo, { 'content-type': tipo });
  res.end(typeof cuerpo === 'string' || Buffer.isBuffer(cuerpo) ? cuerpo : JSON.stringify(cuerpo));
};

export async function creaProveedorSimulado(llaves: { groq?: string; lemonfox?: string; elevenlabs?: string }): Promise<ProveedorSimulado> {
  const recibidos: Recibido[] = [];
  const fallos: ProveedorSimulado['fallos'] = {};
  const falla = (id: IdSimulado, res: ServerResponse) => {
    const codigo = fallos[id]?.shift();
    if (codigo === undefined) return false;
    // Un cuerpo con «secreto» que nunca debe llegar al cliente del adaptador.
    responde(res, codigo, 'secreto-del-proveedor: detalle interno', 'text/plain');
    return true;
  };
  const multipart = async (req: IncomingMessage, cuerpo: Buffer) => new Request('http://x/', { method: 'POST', headers: { 'content-type': String(req.headers['content-type']) }, body: new Uint8Array(cuerpo) }).formData();

  const stt = async (id: 'groq' | 'lemonfox-stt', llave: string | undefined, req: IncomingMessage, res: ServerResponse) => {
    const cuerpo = await leeTodo(req);
    if (req.headers.authorization !== `Bearer ${llave}`) return responde(res, 401, { error: 'invalid key' });
    if (falla(id, res)) return;
    const f = await multipart(req, cuerpo);
    const archivo = f.get('file');
    const campos = Object.fromEntries([...f.entries()].filter(([, v]) => typeof v === 'string') as [string, string][]);
    const bytes = archivo && typeof archivo !== 'string' ? archivo.size : 0;
    recibidos.push({ id, ruta: req.url ?? '', sale: 'audio', bytes, campos, extra: Object.keys(campos).filter((k) => !['language', 'response_format', 'model'].includes(k)) });
    responde(res, 200, { text: `  texto de ${id} (${bytes} bytes, ${campos['language']})  ` });
  };

  const servidor = createServer(async (req, res) => {
    const ruta = new URL(req.url ?? '/', 'http://x').pathname;
    if (req.method === 'POST' && ruta === '/openai/v1/audio/transcriptions') return stt('groq', llaves.groq, req, res);
    if (req.method === 'POST' && ruta === '/v1/audio/transcriptions') return stt('lemonfox-stt', llaves.lemonfox, req, res);
    if (req.method === 'GET' && ruta === '/openai/v1/models') {
      recibidos.push({ id: 'modelos', ruta, sale: 'nada', campos: {}, extra: [] });
      return responde(res, req.headers.authorization === `Bearer ${llaves.groq}` ? 200 : 401, { data: [] });
    }
    if (req.method === 'GET' && ruta === '/v1/models') {
      recibidos.push({ id: 'modelos', ruta, sale: 'nada', campos: {}, extra: [] });
      return responde(res, req.headers['xi-api-key'] === llaves.elevenlabs ? 200 : 401, { models: [] });
    }
    if (req.method === 'POST' && ruta === '/v1/audio/speech') {
      const j = JSON.parse((await leeTodo(req)).toString('utf8')) as Record<string, unknown>;
      if (req.headers.authorization !== `Bearer ${llaves.lemonfox}`) return responde(res, 401, { error: 'invalid key' });
      if (falla('lemonfox-tts', res)) return;
      recibidos.push({ id: 'lemonfox-tts', ruta, sale: 'texto', texto: String(j['input']), campos: { voice: String(j['voice']), response_format: String(j['response_format']), language: String(j['language']) }, extra: Object.keys(j).filter((k) => !['input', 'voice', 'language', 'speed', 'response_format'].includes(k)) });
      return responde(res, 200, wavDe(pcmTono(24_000), 24_000), 'audio/wav');
    }
    const eleven = /^\/v1\/text-to-speech\/([^/]+)\/stream$/.exec(ruta);
    if (req.method === 'POST' && eleven) {
      const j = JSON.parse((await leeTodo(req)).toString('utf8')) as Record<string, unknown>;
      if (req.headers['xi-api-key'] !== llaves.elevenlabs) return responde(res, 401, { detail: 'invalid key' });
      if (falla('elevenlabs', res)) return;
      recibidos.push({ id: 'elevenlabs', ruta, sale: 'texto', texto: String(j['text']), campos: { voz: decodeURIComponent(eleven[1] ?? ''), formato: new URL(req.url ?? '', 'http://x').searchParams.get('output_format') ?? '' }, extra: Object.keys(j).filter((k) => !['text', 'model_id', 'language_code', 'voice_settings'].includes(k)) });
      return responde(res, 200, pcmTono(24_000), 'audio/pcm');
    }
    responde(res, 404, { error: 'no existe' });
  });
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
  const { port } = servidor.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, recibidos, fallos, cierra: () => new Promise<void>((r) => servidor.close(() => r())) };
}
