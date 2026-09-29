/**
 * Clips SINTÉTICOS para el laboratorio del reel: escena por código (un retrato al óleo de dominio público
 * hace de dueño a cámara), voz local Piper es_MX y una etiqueta de ubicación falsa en el archivo. Cada
 * trampa firmada (respuesta 14) es una variante. Nadie grabó a nadie.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RECURSOS, voz } from './motores.ts';

export const GUION = [
  { texto: 'Hola, soy Lupita, de la Panadería La Espiga.', pausa: 0.35 },
  { texto: 'Hoy sacamos el pan de muerto recién horneado.', pausa: 0.3 },
  { texto: 'Hoy sacamos el pan de muerto recién horneado, con azúcar y ajonjolí.', pausa: 1.6 },
  { texto: 'El pan de muerto cuesta cuarenta y cinco pesos la pieza.', pausa: 0.35 },
  { texto: 'Apártalo por mensaje y pasa por él mañana temprano.', pausa: 0.35 },
  { texto: 'Te esperamos en la panadería, aquí en tu colonia.', pausa: 0.6 },
];

export type Caso = 'limpio' | 'cliente-al-fondo' | 'ticket-telefono' | 'precio-no-coincide' | 'horizontal' | 'musica-ajena' | 'dos-hablantes';
export const CASOS: readonly Caso[] = ['limpio', 'cliente-al-fondo', 'ticket-telefono', 'precio-no-coincide', 'horizontal', 'musica-ajena', 'dos-hablantes'];

const ff = (args: string[]) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);

function wav(muestras: Float32Array, hz: number, ruta: string): void {
  const b = Buffer.alloc(44 + muestras.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + muestras.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(hz, 24); b.writeUInt32LE(hz * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(muestras.length * 2, 40);
  muestras.forEach((v, i) => b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), 44 + i * 2));
  writeFileSync(ruta, b);
}

function audioDelCaso(caso: Caso, ruta: string): number {
  const claude = voz('claude-high'), ald = voz('ald-medium');
  const trozos: Float32Array[] = []; let hz = 22_050;
  const guion = GUION.map((g) => (caso === 'precio-no-coincide' ? { ...g, texto: g.texto.replace('cuarenta y cinco', 'cincuenta') } : g));
  guion.forEach((g, i) => {
    const r = claude(g.texto); hz = r.sampleRate; trozos.push(r.samples, new Float32Array(Math.round(g.pausa * hz)));
    if (caso === 'dos-hablantes' && i === 3) { const o = ald('Y yo te atiendo en la caja, con gusto.'); trozos.push(remuestra(o.samples, o.sampleRate, hz), new Float32Array(Math.round(0.4 * hz))); }
  });
  const total = new Float32Array(trozos.reduce((s, x) => s + x.length, 0)); let o = 0; for (const x of trozos) { total.set(x, o); o += x.length; }
  wav(total, hz, ruta);
  return total.length / hz;
}
const remuestra = (m: Float32Array, de: number, a: number) => Float32Array.from({ length: Math.floor((m.length * a) / de) }, (_, i) => m[Math.floor((i * de) / a)] ?? 0);

/** La escena como imagen: fondo, el «dueño» (retrato 1) y, según el caso, el cliente al fondo o el ticket. */
function escena(caso: Caso, ruta: string): void {
  const fuente = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  const filtros = ['[0]format=rgb24[f]', `[1]scale=640:-1[a]`, '[f][a]overlay=220:560[s]'];
  let ultimo = '[s]';
  const entradas = ['-f', 'lavfi', '-i', 'color=c=0xf3e6d3:s=1080x1920', '-i', join(RECURSOS, 'retrato-1.jpg')];
  if (caso === 'cliente-al-fondo') { entradas.push('-i', join(RECURSOS, 'retrato-2.jpg')); filtros.push('[2]scale=170:-1[b]', `${ultimo}[b]overlay=850:170[c]`); ultimo = '[c]'; }
  if (caso === 'ticket-telefono') {
    filtros.push(`${ultimo}drawbox=x=60:y=1400:w=560:h=300:color=white@1:t=fill,drawtext=fontfile=${fuente}:text='PANADERÍA LA ESPIGA':x=90:y=1430:fontsize=40:fontcolor=black,drawtext=fontfile=${fuente}:text='Tel. 55 0000 1234':x=90:y=1510:fontsize=46:fontcolor=black,drawtext=fontfile=${fuente}:text='Total\\: $45.00':x=90:y=1600:fontsize=40:fontcolor=black[c]`);
    ultimo = '[c]';
  }
  filtros.push(`${ultimo}copy`);
  ff([...entradas, '-filter_complex', filtros.join(';'), '-frames:v', '1', ruta]);
}

/** El bruto del caso, como lo mandaría un celular: MP4 con la ubicación en sus metadatos. */
export function generaCaso(caso: Caso, carpeta: string): { bruto: string; segundos: number } {
  mkdirSync(carpeta, { recursive: true });
  const img = join(carpeta, 'escena.png'), voz_ = join(carpeta, 'voz.wav'), bruto = join(carpeta, 'bruto.mp4');
  escena(caso, img);
  const segundos = audioDelCaso(caso, voz_);
  const video = caso === 'horizontal' ? 'scale=-2:1080,pad=1920:1080:(ow-iw)/2:0:color=0xf3e6d3' : 'scale=1080:1920';
  const audio = caso === 'musica-ajena'
    ? ['-filter_complex', `[1]aresample=48000[v];sine=f=220:d=${segundos}:r=48000,volume=0.35[m1];sine=f=277:d=${segundos}:r=48000,volume=0.3[m2];sine=f=330:d=${segundos}:r=48000,volume=0.3[m3];[v][m1][m2][m3]amix=inputs=4:normalize=0[a]`, '-map', '0:v', '-map', '[a]']
    : ['-map', '0:v', '-map', '1:a'];
  ff(['-loop', '1', '-framerate', '30', '-i', img, '-i', voz_, ...audio, '-vf', video, '-t', segundos.toFixed(2), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000',
    '-metadata', 'location=+19.4326-099.1332/', '-metadata', 'com.apple.quicktime.location.ISO6709=+19.4326-099.1332+2240.000/', '-movflags', 'use_metadata_tags', bruto]);
  return { bruto, segundos };
}
