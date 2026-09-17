/**
 * El camino de vuelta: texto → voz, local, por `sherpa-onnx-node` (Piper/VITS), y al altavoz de
 * Windows. Existe porque la duena pidio que el agente tambien hable (2026-09-16); nada sale de la
 * maquina y la voz son 79 MB pineados por URL.
 *
 * Se reproduce MIENTRAS se sintetiza: sherpa entrega el audio frase a frase (`onProgress`) y cada
 * frase suena en cuanto existe, asi la primera se oye antes de que exista la ultima. La cifra que
 * importa es `msPrimerAudio`: lo que tarda en empezar a oirse.
 *
 * Dos altavoces. **Windows** (`windows/altavoz.ps1`, PowerShell persistente + `SoundPlayer`): suena
 * a tiempo real. **Pulse** (ffmpeg → PulseAudio de WSLg): el camino obvio, y NO sirve — medido el
 * 2026-09-16, 6,9 s de audio tardaron 25-31 s en sonar. Se conserva para poder volver a medirlo.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escribeWav } from './audio.js';
import { creaHijoPorLineas, type MensajeHijo } from './hijo-por-lineas.js';

export interface GeneradorSherpa {
  readonly sampleRate: number;
  readonly numSpeakers: number;
  generateAsync(peticion: { text: string; sid: number; speed: number; onProgress?: (info: { samples: Float32Array; progress: number }) => void }): Promise<{ samples: Float32Array; sampleRate: number }>;
}

/** Lo que este modulo usa de `sherpa-onnx-node`; se declara aqui para no depender de sus tipos. */
export interface ModuloSherpaTts {
  OfflineTts: new (config: Record<string, unknown>) => GeneradorSherpa;
}

export interface OpcionesVozSintetica {
  sherpa: ModuloSherpaTts;
  /** Carpeta del modelo tal como la deja el tarball de sherpa-onnx (`*.onnx`, `tokens.txt`, `espeak-ng-data/`). */
  carpeta: string;
  hilos?: number;
  /** 1 = la velocidad del modelo; 1,2 habla mas rapido. */
  velocidad?: number;
  /** Id del hablante para voces con varios; Piper suele traer uno. */
  hablante?: number;
}

export interface AudioSintetizado {
  muestras: Float32Array;
  frecuenciaHz: number;
  /** Lo que tardo el modelo en total. */
  ms: number;
}

export interface VozSintetica {
  readonly id: string;
  readonly frecuenciaHz: number;
  /** Sintetiza todo y lo devuelve. `alTrozo` recibe cada frase segun sale, para reproducirla ya. */
  sintetiza(texto: string, alTrozo?: (muestras: Float32Array) => void): Promise<AudioSintetizado>;
}

export function creaVozSintetica(opciones: OpcionesVozSintetica): VozSintetica {
  const { carpeta } = opciones;
  const modelo = readdirSync(carpeta).find((f) => f.endsWith('.onnx'));
  if (!modelo) throw new Error(`${carpeta}: no hay ningun .onnx; ¿es una voz de sherpa-onnx (Piper/VITS)?`);
  const datos = join(carpeta, 'espeak-ng-data');
  const tts = new opciones.sherpa.OfflineTts({
    model: {
      vits: { model: join(carpeta, modelo), tokens: join(carpeta, 'tokens.txt'), ...(existsSync(datos) ? { dataDir: datos } : {}) },
      numThreads: opciones.hilos ?? 4,
      provider: 'cpu',
      debug: 0,
    },
    // Una frase por trozo: es lo que hace que la primera suene mientras se sintetiza el resto.
    maxNumSentences: 1,
  });
  return {
    id: `sherpa-tts:${basename(carpeta).replace(/^vits-piper-/, '')}`,
    frecuenciaHz: tts.sampleRate,
    async sintetiza(texto, alTrozo) {
      const t0 = performance.now();
      const r = await tts.generateAsync({
        text: texto,
        sid: opciones.hablante ?? 0,
        speed: opciones.velocidad ?? 1,
        ...(alTrozo ? { onProgress: (info) => alTrozo(info.samples) } : {}),
      });
      return { muestras: r.samples, frecuenciaHz: r.sampleRate, ms: performance.now() - t0 };
    },
  };
}

export interface Altavoz {
  /** Encola audio flotante a la frecuencia declarada al abrir el altavoz. Vuelve sin esperar. */
  escribe(muestras: Float32Array): void;
  /** Espera a que todo lo encolado haya sonado y cierra. */
  termina(): Promise<void>;
}

const RUTA_ALTAVOZ_PS1 = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'windows', 'altavoz.ps1');

/**
 * Altavoz de Windows: cada trozo se escribe como WAV en el temporal de Windows y `SoundPlayer`
 * lo reproduce en orden, uno tras otro. Los WAV se borran al terminar.
 */
export function abreAltavozWindows(frecuenciaHz: number, opciones: { powershell?: string; msEspera?: number } = {}): Altavoz {
  const script = readFileSync(RUTA_ALTAVOZ_PS1, 'utf8');
  const hijo = creaHijoPorLineas<MensajeHijo & { b64?: string }>({
    nombre: 'altavoz de Windows',
    comando: opciones.powershell ?? 'powershell.exe',
    argumentos: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    msEspera: opciones.msEspera ?? 120_000,
    msEsperaArranque: 15_000,
    despedida: null,
  });
  const sesion = `${Date.now().toString(36)}-${process.pid}`;
  let n = 0;
  const escritos: string[] = [];
  let temporal: Promise<{ windows: string; wsl: string }> | undefined;
  const carpetaTemporal = () => {
    temporal ??= hijo.pide({ op: 'temporal' }).then((r) => {
      const windows = Buffer.from(r.b64 ?? '', 'base64').toString('utf8').replace(/[\\/]+$/, '');
      const wsl = execFileSync('wslpath', ['-u', windows], { encoding: 'utf8' }).trim();
      return { windows, wsl };
    });
    return temporal;
  };
  let cola: Promise<void> = Promise.resolve();
  return {
    escribe(muestras) {
      const indice = n++;
      cola = cola
        .then(async () => {
          const { windows, wsl } = await carpetaTemporal();
          const nombre = `dictado-voz-${sesion}-${indice}.wav`;
          const rutaWsl = join(wsl, nombre);
          await escribeWav(rutaWsl, muestras, frecuenciaHz);
          escritos.push(rutaWsl);
          await hijo.pide({ op: 'suena', ruta: `${windows}\\${nombre}` });
        })
        .catch((e: unknown) => console.error(`altavoz: ${e instanceof Error ? e.message : String(e)}`));
    },
    async termina() {
      await cola;
      await hijo.cierra();
      const { rm } = await import('node:fs/promises');
      await Promise.all(escritos.map((r) => rm(r, { force: true })));
    },
  };
}

/** Altavoz por ffmpeg → PulseAudio de WSLg. Medido lento (ver cabecera); queda para volver a medir. */
export function abreAltavozPulse(frecuenciaHz: number, opciones: { ffmpeg?: string; dispositivo?: string } = {}): Altavoz {
  const proceso = spawn(opciones.ffmpeg ?? 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'f32le', '-ar', String(frecuenciaHz), '-ac', '1', '-i', '-', '-f', 'pulse', opciones.dispositivo ?? 'default'], { stdio: ['pipe', 'ignore', 'pipe'] });
  let errores = '';
  proceso.stderr.setEncoding('utf8');
  proceso.stderr.on('data', (d: string) => (errores += d));
  const terminado = new Promise<void>((resuelve, rechaza) => {
    proceso.on('error', (e) => rechaza(new Error(`no se pudo lanzar ffmpeg para sonar: ${e.message}`)));
    proceso.on('close', (codigo) => (codigo === 0 ? resuelve() : rechaza(new Error(`el altavoz (ffmpeg) termino con ${codigo}: ${errores.trim() || 'sin detalle'}`))));
  });
  return {
    escribe(muestras) {
      proceso.stdin.write(Buffer.from(muestras.buffer, muestras.byteOffset, muestras.byteLength));
    },
    termina() {
      proceso.stdin.end();
      return terminado;
    },
  };
}

export interface ResultadoHabla {
  /** Del principio a que la primera frase estuvo lista para sonar. */
  msPrimerAudio: number;
  msSintesis: number;
  /** Hasta que termino de sonar (o de sintetizar, sin altavoz). */
  msTotal: number;
  segundosAudio: number;
}

/** Sintetiza y suena a la vez. Con `altavoz` en `null` solo sintetiza (para guardar o medir). */
export async function habla(voz: VozSintetica, texto: string, altavoz: Altavoz | null): Promise<ResultadoHabla & { muestras: Float32Array }> {
  const t0 = performance.now();
  let msPrimerAudio = 0;
  const r = await voz.sintetiza(texto, (trozo) => {
    if (msPrimerAudio === 0) msPrimerAudio = performance.now() - t0;
    altavoz?.escribe(trozo);
  });
  const msSintesis = performance.now() - t0;
  if (altavoz) await altavoz.termina();
  return { muestras: r.muestras, msPrimerAudio: msPrimerAudio || msSintesis, msSintesis, msTotal: performance.now() - t0, segundosAudio: r.muestras.length / r.frecuenciaHz };
}
