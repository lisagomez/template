/**
 * `dictado di "<texto>"`: el agente habla. Voz Piper en espanol por sherpa-onnx, local, al
 * altavoz de Windows por WSLg. Si la voz no esta en la carpeta de modelos, se descarga de su URL
 * pineada y se dice.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { escribeWav } from './audio.js';
import type { Configuracion } from './cli-config.js';
import { cargaRuntime } from './cli-motores.js';
import { abreAltavozPulse, abreAltavozWindows, creaVozSintetica, habla, type ModuloSherpaTts } from './habla.js';

/** Voces conocidas, pineadas por URL exacta (C1). La de defecto es la que se midio el 2026-09-16. */
export const VOCES: Record<string, { carpeta: string; url: string; que: string }> = {
  'es_MX-claude-high': { carpeta: 'vits-piper-es_MX-claude-high', url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-es_MX-claude-high.tar.bz2', que: 'Piper es_MX «claude», calidad high, 79 MB' },
  'es_ES-davefx-medium': { carpeta: 'vits-piper-es_ES-davefx-medium', url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-es_ES-davefx-medium.tar.bz2', que: 'Piper es_ES «davefx», calidad medium, 64 MB' },
  'es_MX-ald-medium': { carpeta: 'vits-piper-es_MX-ald-medium', url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-es_MX-ald-medium.tar.bz2', que: 'Piper es_MX «ald», calidad medium, 64 MB' },
};

function preparaVoz(config: Configuracion, nombre: string): string {
  const voz = VOCES[nombre];
  if (!voz) {
    if (existsSync(nombre)) return nombre; // una carpeta cualquiera con una voz de sherpa
    throw new Error(`voz desconocida «${nombre}». Conocidas: ${Object.keys(VOCES).join(', ')}, o la ruta a una carpeta de voz de sherpa-onnx`);
  }
  const carpeta = join(config.modelos, voz.carpeta);
  if (existsSync(carpeta)) return carpeta;
  console.error(`descargando la voz ${nombre} — ${voz.que} — de ${voz.url}`);
  mkdirSync(config.modelos, { recursive: true });
  const tar = `${carpeta}.tar.bz2`;
  execFileSync('curl', ['-sSL', '--fail', '-o', tar, voz.url], { stdio: ['ignore', 'ignore', 'inherit'] });
  execFileSync('tar', ['-xjf', tar, '-C', config.modelos]);
  execFileSync('rm', [tar]);
  return carpeta;
}

function leeTexto(posicionales: string[], opciones: Record<string, string | boolean>): string {
  if (typeof opciones['archivo'] === 'string') return readFileSync(opciones['archivo'], 'utf8');
  if (posicionales.length > 0) return posicionales.join(' ');
  return readFileSync(0, 'utf8'); // stdin
}

export async function ordenDi(config: Configuracion, posicionales: string[], opciones: Record<string, string | boolean>): Promise<void> {
  const texto = leeTexto(posicionales, opciones).trim();
  if (texto.length === 0) throw new Error('uso: dictado di "<texto>"  |  dictado di --archivo nota.txt  |  echo texto | dictado di');
  const nombre = typeof opciones['voz'] === 'string' ? opciones['voz'] : 'es_MX-claude-high';
  const carpeta = preparaVoz(config, nombre);
  const sherpa = await cargaRuntime<ModuloSherpaTts>('sherpa-onnx-node', config);
  const t0 = performance.now();
  const voz = creaVozSintetica({ sherpa, carpeta, hilos: config.hilos, velocidad: typeof opciones['velocidad'] === 'string' ? Number(opciones['velocidad']) : 1 });
  const carga = performance.now() - t0;
  // Por defecto suena desde Windows: el PulseAudio de WSLg reproduce a un cuarto de la velocidad (medido).
  const altavoz = opciones['sin-sonido'] === true ? null : opciones['altavoz'] === 'pulse' ? abreAltavozPulse(voz.frecuenciaHz) : abreAltavozWindows(voz.frecuenciaHz);
  const r = await habla(voz, texto, altavoz);
  if (typeof opciones['guarda'] === 'string') await escribeWav(opciones['guarda'], r.muestras, voz.frecuenciaHz);
  console.error(`voz=${voz.id} carga=${carga.toFixed(0)}ms primer-audio=${r.msPrimerAudio.toFixed(0)}ms sintesis=${r.msSintesis.toFixed(0)}ms total=${r.msTotal.toFixed(0)}ms audio=${r.segundosAudio.toFixed(1)}s rtf=${(r.msSintesis / 1000 / r.segundosAudio).toFixed(3)}${typeof opciones['guarda'] === 'string' ? ` guardado=${opciones['guarda']}` : ''}`);
}
