/**
 * Fabrica una grabacion de muestra con las voces sinteticas de la maquina: cada linea se
 * sintetiza y se junta en estereo (una voz por canal, como una llamada grabada) o en mono
 * (varias voces en una pista, como una reunion). Es ENTRADA de prueba, no un resultado.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { sintetiza, vocesDisponibles } from '@/features/laboratorio-voz/services/servidor/dictado-cli';
import { concatenaMono, escribeWavPcm16, leeWavPcm16, mezclaEstereo } from '@/features/laboratorio-voz/services/wav';
import { rechazoSinToken } from '@/shared/lib/token-dictado';

const esquema = z.object({
  lineas: z.array(z.object({ canal: z.enum(['izquierdo', 'derecho']), texto: z.string().trim().min(1).max(600) })).min(1).max(16),
  formato: z.enum(['estereo', 'mono']),
});

export async function POST(peticion: NextRequest): Promise<NextResponse> {
  const rechazo = rechazoSinToken(peticion);
  if (rechazo) return rechazo;
  const cuerpo = esquema.safeParse(await peticion.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: 'guion invalido' }, { status: 400 });
  const voces = await vocesDisponibles();
  if (voces.length === 0) return NextResponse.json({ error: 'no hay voces descargadas' }, { status: 409 });
  // Dos voces distintas si las hay (asi la separacion por voz tiene algo que separar); si no, la misma.
  const vozDe = (canal: 'izquierdo' | 'derecho') => (canal === 'izquierdo' ? voces[0] : voces[1] ?? voces[0]) as string;

  const carpeta = await mkdtemp(join(tmpdir(), 'laboratorio-muestra-'));
  try {
    const tramos: Array<{ canal: 'izquierdo' | 'derecho'; muestras: Int16Array; frecuenciaHz: number }> = [];
    for (const [i, linea] of cuerpo.data.lineas.entries()) {
      const rutaTexto = join(carpeta, `${i}.txt`);
      const rutaWav = join(carpeta, `${i}.wav`);
      await writeFile(rutaTexto, linea.texto, 'utf8');
      await sintetiza(rutaTexto, { voz: vozDe(linea.canal), velocidad: 1 }, rutaWav);
      const wav = leeWavPcm16(new Uint8Array(await readFile(rutaWav)));
      tramos.push({ canal: linea.canal, muestras: wav.muestras, frecuenciaHz: wav.frecuenciaHz });
    }
    const frecuenciaHz = tramos[0]?.frecuenciaHz ?? 22_050;
    if (tramos.some((t) => t.frecuenciaHz !== frecuenciaHz)) return NextResponse.json({ error: 'las voces no comparten frecuencia' }, { status: 500 });
    const estereo = cuerpo.data.formato === 'estereo';
    // Mono: 1 s entre lineas, para que el detector de voz cierre cada turno (el lote cierra a 500 ms
    // de silencio); con 500 ms de hueco toda la reunion salia como UN turno (visto el 2026-09-20).
    const muestras = estereo ? mezclaEstereo(tramos, frecuenciaHz, 500) : concatenaMono(tramos.map((t) => t.muestras), frecuenciaHz, 1_000);
    const salida = escribeWavPcm16(muestras, frecuenciaHz, estereo ? 2 : 1);
    const segundos = Math.round((muestras.length / (estereo ? 2 : 1) / frecuenciaHz) * 10) / 10;
    return new NextResponse(new Uint8Array(salida), { headers: { 'content-type': 'audio/wav', 'x-metricas': encodeURIComponent(JSON.stringify({ segundosAudio: segundos, lineas: tramos.length, formato: cuerpo.data.formato })) } });
  } catch {
    return NextResponse.json({ error: 'no se pudo fabricar la muestra' }, { status: 500 });
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
}
