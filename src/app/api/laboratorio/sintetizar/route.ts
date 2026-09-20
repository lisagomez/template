/**
 * Texto → voz (WAV) con Piper local. Solo voces YA descargadas: una peticion web jamas baja
 * pesos. El texto viaja por archivo temporal (comillas y saltos no pelean con la shell).
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { sintetiza, vocesDisponibles } from '@/features/laboratorio-voz/services/servidor/dictado-cli';
import { rechazoSinToken } from '@/shared/lib/token-dictado';

const esquema = z.object({
  texto: z.string().trim().min(1).max(6_000),
  voz: z.string().max(60).optional(),
  velocidad: z.number().min(0.6).max(1.6).optional(),
});

export async function POST(peticion: NextRequest): Promise<NextResponse> {
  const rechazo = rechazoSinToken(peticion);
  if (rechazo) return rechazo;
  const cuerpo = esquema.safeParse(await peticion.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: 'texto invalido (1 a 6000 caracteres)' }, { status: 400 });
  const voces = await vocesDisponibles();
  const voz = cuerpo.data.voz ?? voces[0];
  if (!voz || !voces.includes(voz)) return NextResponse.json({ error: 'esa voz no esta descargada en esta maquina' }, { status: 409 });

  const carpeta = await mkdtemp(join(tmpdir(), 'laboratorio-tts-'));
  try {
    const rutaTexto = join(carpeta, 'texto.txt');
    const rutaWav = join(carpeta, 'voz.wav');
    await writeFile(rutaTexto, cuerpo.data.texto, 'utf8');
    const metricas = await sintetiza(rutaTexto, { voz, velocidad: cuerpo.data.velocidad ?? 1 }, rutaWav);
    const wav = await readFile(rutaWav);
    return new NextResponse(new Uint8Array(wav), { headers: { 'content-type': 'audio/wav', 'x-metricas': encodeURIComponent(JSON.stringify(metricas)) } });
  } catch {
    return NextResponse.json({ error: 'no se pudo generar la voz' }, { status: 500 });
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
}
