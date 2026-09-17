/**
 * Pruebas del entry point de Node y del transcriptor remoto, SIN modelos, sin microfono y sin
 * Windows: un hijo falso que habla el protocolo por lineas, un `fetch` falso, un WAV generado,
 * un almacen en una carpeta temporal y los gestos de la tecla con un reloj de mentira.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { creaAlmacenJsonl, creaGestosDeTecla, creaMotorPorProceso, creaMotorSherpa, creaVozSintetica, floatAPcm16, habla, leeAudio, type Altavoz } from '../dist/node/index.js';
import { creaTranscriptorRemoto } from '../dist/remoto/index.js';
import { parseaArgumentos } from '../dist/node/cli-config.js';

const HIJO_FALSO = `
process.stdout.write(JSON.stringify({ listo: true, motor: 'falso' }) + '\\n');
let resto = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => {
  resto += d;
  let i;
  while ((i = resto.indexOf('\\n')) !== -1) {
    const linea = resto.slice(0, i); resto = resto.slice(i + 1);
    const p = JSON.parse(linea);
    if (p.cierra) process.exit(0);
    if (p.calienta) { process.stdout.write(JSON.stringify({ id: p.id, texto: '', ms: 1, rssMb: 42 }) + '\\n'); continue; }
    if (p.pista === 'explota') { process.stdout.write(JSON.stringify({ id: p.id, error: 'boom' }) + '\\n'); continue; }
    const bytes = Buffer.from(p.pcm16, 'base64');
    process.stdout.write(JSON.stringify({ id: p.id, texto: 'oi ' + bytes.length + ' bytes a ' + p.hz + ' con pista ' + (p.pista ?? '-'), ms: 2, rssMb: 42 }) + '\\n');
  }
});
`;

test('motor por proceso: arranque, calentado, transcripcion, error como dato y cierre', async () => {
  const motor = creaMotorPorProceso({ id: 'falso', comando: process.execPath, argumentos: ['-e', HIJO_FALSO], admitePista: true, msEspera: 5_000 });
  await motor.calienta();
  assert.equal(motor.rssMb, 42);
  const r = await motor.transcribe(new Float32Array([0, 0.5, -0.5]), 16_000, { pista: 'Levy' });
  assert.equal(r.texto, 'oi 6 bytes a 16000 con pista Levy');
  assert.ok((r.ms ?? 0) >= 0);
  await assert.rejects(motor.transcribe(new Float32Array(2), 16_000, { pista: 'explota' }), /boom/);
  await motor.cierra();
});

test('motor por proceso: si el hijo muere antes de «listo», el arranque falla YA con su stderr', async () => {
  const motor = creaMotorPorProceso({ id: 'muerto', comando: process.execPath, argumentos: ['-e', 'console.error("sin modelo"); process.exit(3)'], msEsperaArranque: 10_000 });
  await assert.rejects(motor.transcribe(new Float32Array(2), 16_000), /termino con 3.*sin modelo/);
});

test('floatAPcm16 y leeAudio: un WAV generado vuelve como las mismas muestras', async () => {
  const hz = 16_000;
  const muestras = new Float32Array(hz);
  for (let i = 0; i < hz; i++) muestras[i] = Math.sin((2 * Math.PI * 440 * i) / hz) * 0.5;
  const pcm = floatAPcm16(muestras);
  assert.equal(pcm.length, hz * 2);
  const cabecera = Buffer.alloc(44);
  cabecera.write('RIFF', 0); cabecera.writeUInt32LE(36 + pcm.length, 4); cabecera.write('WAVE', 8);
  cabecera.write('fmt ', 12); cabecera.writeUInt32LE(16, 16); cabecera.writeUInt16LE(1, 20); cabecera.writeUInt16LE(1, 22);
  cabecera.writeUInt32LE(hz, 24); cabecera.writeUInt32LE(hz * 2, 28); cabecera.writeUInt16LE(2, 32); cabecera.writeUInt16LE(16, 34);
  cabecera.write('data', 36); cabecera.writeUInt32LE(pcm.length, 40);
  const carpeta = mkdtempSync(join(tmpdir(), 'dictado-'));
  const ruta = join(carpeta, 'tono.wav');
  writeFileSync(ruta, Buffer.concat([cabecera, pcm]));
  const audio = await leeAudio(ruta, hz);
  assert.equal(audio.frecuenciaHz, hz);
  assert.equal(Math.round(audio.duracionMs), 1000);
  assert.ok(Math.abs((audio.muestras[4] ?? 0) - (muestras[4] ?? 0)) < 1e-3);
  rmSync(carpeta, { recursive: true, force: true });
});

test('almacen JSONL: anade, ordena por fecha, busca, actualiza y sobrevive a una linea rota', async () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'dictado-'));
  const ruta = join(carpeta, 'sub', 'historial.jsonl');
  const almacen = creaAlmacenJsonl(ruta);
  assert.equal(await almacen.cuenta(), 0);
  const a = await almacen.agrega({ texto: 'uno', motor: 'm', duracionMs: 10, fecha: '2026-09-15T10:00:00.000Z' });
  await almacen.agrega({ texto: 'dos con Hermes', motor: 'm', duracionMs: 20, fecha: '2026-09-15T10:01:00.000Z' });
  writeFileSync(ruta, '{rota\n', { flag: 'a' });
  assert.deepEqual((await almacen.recientes(10)).map((e) => e.texto), ['dos con Hermes', 'uno']);
  assert.equal((await almacen.busca('hermes', 10)).length, 1);
  assert.equal((await almacen.actualiza(a.id, 'uno editado'))?.texto, 'uno editado');
  assert.equal(await almacen.actualiza('nadie', 'x'), undefined);
  assert.equal((await almacen.recientes(10))[1]?.texto, 'uno editado');
  rmSync(carpeta, { recursive: true, force: true });
});

test('gestos de tecla: mantener = hablar; dos toques = manos libres; un toque la apaga', () => {
  let reloj = 0;
  const eventos: string[] = [];
  const g = creaGestosDeTecla({
    ahora: () => reloj,
    alMantener: () => eventos.push('mantener'),
    alSoltar: () => eventos.push('soltar'),
    alManosLibres: (activo) => eventos.push(`manos:${activo}`),
  });
  g.abajo(); reloj += 900; g.arriba(); // mantener 900 ms
  assert.deepEqual(eventos, ['mantener', 'soltar']);
  eventos.length = 0;
  g.abajo(); reloj += 100; g.arriba(); reloj += 200; g.abajo(); reloj += 100; g.arriba(); // dos toques
  assert.deepEqual(eventos, ['mantener', 'soltar', 'mantener', 'soltar', 'manos:true']);
  eventos.length = 0;
  reloj += 5000; g.abajo(); reloj += 100; g.arriba(); // un toque en manos libres la apaga
  assert.deepEqual(eventos, ['manos:false']);
  eventos.length = 0;
  reloj += 5000; g.abajo(); reloj += 100; g.arriba(); reloj += 2000; g.abajo(); reloj += 100; g.arriba(); // dos toques lejanos: nada
  assert.deepEqual(eventos, ['mantener', 'soltar', 'mantener', 'soltar']);
});

test('transcriptor remoto: bearer, PCM16 en el cuerpo, pista en base64, errores con codigo', async () => {
  const peticiones: Array<{ url: string; init: RequestInit }> = [];
  const fetchFalso = (async (url: string | URL | Request, init?: RequestInit) => {
    peticiones.push({ url: String(url), init: init ?? {} });
    if (String(url).endsWith('/health')) return new Response('{"status":"ok"}', { status: 200 });
    const cabeceras = new Headers(init?.headers);
    if (cabeceras.get('authorization') !== 'Bearer 0123456789abcdef0123456789abcdef') return new Response('{"error":"no autorizado"}', { status: 401 });
    return new Response(JSON.stringify({ texto: ' hola ', ms: 7, motor: 'sherpa-x' }), { status: 200 });
  }) as typeof fetch;
  const remoto = creaTranscriptorRemoto({ url: 'http://127.0.0.1:8090/', token: '0123456789abcdef0123456789abcdef', fetch: fetchFalso });
  assert.equal(remoto.id, 'remoto:127.0.0.1:8090');
  assert.equal(await remoto.salud(), true);
  const r = await remoto.transcribe(new Float32Array([0, 1]), 16_000, { idioma: 'es', pista: 'Levy, Ñu' });
  assert.equal(r.texto, 'hola');
  const p = peticiones[1];
  assert.ok(p);
  assert.equal(p.url, 'http://127.0.0.1:8090/transcribir');
  const cab = new Headers(p.init.headers);
  assert.equal(cab.get('x-frecuencia-hz'), '16000');
  assert.equal(cab.get('x-idioma'), 'es');
  assert.equal(Buffer.from(cab.get('x-pista-base64') ?? '', 'base64').toString('utf8'), 'Levy, Ñu');
  assert.equal((p.init.body as Uint8Array).length, 4);
  assert.match(remoto.describe(), /token: presente \(largo 32\)/);
  assert.ok(!remoto.describe().includes('0123456789abcdef'));
  const malo = creaTranscriptorRemoto({ url: 'http://127.0.0.1:8090', token: 'x'.repeat(16), fetch: fetchFalso });
  await assert.rejects(malo.transcribe(new Float32Array(2), 16_000), /401/);
  assert.throws(() => creaTranscriptorRemoto({ url: '127.0.0.1', token: 'x'.repeat(16) }), /esquema/);
  assert.throws(() => creaTranscriptorRemoto({ url: 'http://a', token: 'corto' }), /corto/);
});

test('motor sherpa: una carpeta sin modelo falla al crear, no al transcribir', () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'dictado-'));
  const sherpaFalso = { OfflineRecognizer: class { createStream() { return { acceptWaveform() {} }; } decode() {} getResult() { return { text: '' }; } } };
  assert.throws(() => creaMotorSherpa({ sherpa: sherpaFalso, carpeta }), /no parece un modelo/);
  writeFileSync(join(carpeta, 'base-encoder.int8.onnx'), '');
  const motor = creaMotorSherpa({ sherpa: sherpaFalso, carpeta });
  assert.equal(motor.tipo, 'whisper');
  assert.match(motor.id, /^sherpa:dictado-.*-int8$/);
  rmSync(carpeta, { recursive: true, force: true });
});

test('argumentos del CLI: --clave valor, --clave=valor, banderas y posicionales', () => {
  const a = parseaArgumentos(['dictar', '--modo', 'manos-libres', '--tecla', '--pegar=teclear', 'extra', '--n', '5']);
  assert.equal(a.orden, 'dictar');
  assert.deepEqual(a.posicionales, ['extra']);
  assert.deepEqual(a.opciones, { modo: 'manos-libres', tecla: true, pegar: 'teclear', n: '5' });
  assert.equal(parseaArgumentos([]).orden, 'ayuda');
});

test('habla: cada frase suena en cuanto sale, y el resultado mide el primer audio y el total', async () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'dictado-'));
  writeFileSync(join(carpeta, 'voz.onnx'), '');
  writeFileSync(join(carpeta, 'tokens.txt'), '');
  const sherpaFalso = {
    OfflineTts: class {
      sampleRate = 22_050;
      numSpeakers = 1;
      async generateAsync(p: { text: string; onProgress?: (i: { samples: Float32Array; progress: number }) => void }) {
        const frases = p.text.split('. ').filter(Boolean);
        const todo: number[] = [];
        for (const [i, f] of frases.entries()) {
          const trozo = new Float32Array(f.length * 100).fill(0.1);
          p.onProgress?.({ samples: trozo, progress: (i + 1) / frases.length });
          todo.push(...trozo);
        }
        return { samples: Float32Array.from(todo), sampleRate: 22_050 };
      }
    },
  };
  const voz = creaVozSintetica({ sherpa: sherpaFalso, carpeta });
  assert.equal(voz.id, 'sherpa-tts:' + carpeta.split('/').pop());
  assert.equal(voz.frecuenciaHz, 22_050);
  const sonado: number[] = [];
  let terminado = false;
  const altavoz: Altavoz = { escribe: (m) => sonado.push(m.length), termina: async () => { terminado = true; } };
  const r = await habla(voz, 'Hola. Ya tengo voz', altavoz);
  assert.deepEqual(sonado, [400, 1200]);
  assert.equal(terminado, true);
  assert.equal(r.muestras.length, 1600);
  assert.ok(r.msPrimerAudio > 0 && r.msPrimerAudio <= r.msTotal);
  assert.ok(Math.abs(r.segundosAudio - 1600 / 22_050) < 1e-9);
  assert.throws(() => creaVozSintetica({ sherpa: sherpaFalso, carpeta: tmpdir() }), /ningun .onnx/);
  rmSync(carpeta, { recursive: true, force: true });
});
