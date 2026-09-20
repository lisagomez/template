/**
 * Audio del navegador → texto, con el pipeline local. Tres modos por cabecera `x-modo`:
 * `rapido` (solo texto), `tiempos` (turnos con tiempos, y hablantes si se piden) y `canales`
 * (estereo: una persona por canal). C3: Bearer obligatorio. C4: temporal borrado siempre.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { picoDb, razonSinTexto, transcribeConTiempos, transcribePorCanales, transcribeRapido } from '@/features/laboratorio-voz/services/servidor/dictado-cli';
import { rechazoSinToken } from '@/shared/lib/token-dictado';

const MAX_AUDIO_BYTES = 200 * 1024 * 1024;
const esquemaModo = z.enum(['rapido', 'tiempos', 'canales']);
const esquemaHablantes = z.coerce.number().int().min(1).max(8);

export async function POST(peticion: NextRequest): Promise<NextResponse> {
  const rechazo = rechazoSinToken(peticion);
  if (rechazo) return rechazo;
  const modo = esquemaModo.catch('rapido').parse(peticion.headers.get('x-modo'));
  const hablantes = esquemaHablantes.safeParse(peticion.headers.get('x-hablantes'));
  const etiquetas = (peticion.headers.get('x-etiquetas') ?? 'Agente,Cliente').split(',').map((e) => e.trim().slice(0, 30) || 'Voz');
  const audio = Buffer.from(await peticion.arrayBuffer());
  if (audio.length === 0) return NextResponse.json({ error: 'sin audio' }, { status: 400 });
  if (audio.length > MAX_AUDIO_BYTES) return NextResponse.json({ error: 'audio demasiado grande' }, { status: 413 });

  const carpeta = await mkdtemp(join(tmpdir(), 'laboratorio-voz-'));
  try {
    const ruta = join(carpeta, 'toma.audio');
    await writeFile(ruta, audio);
    const r =
      modo === 'canales'
        ? await transcribePorCanales(ruta, carpeta, [etiquetas[0] ?? 'Agente', etiquetas[1] ?? 'Cliente'])
        : modo === 'tiempos'
          ? await transcribeConTiempos(ruta, hablantes.success ? { hablantes: hablantes.data } : {})
          : await transcribeRapido(ruta);
    if (r.texto.length === 0) return NextResponse.json({ ...r, razon: razonSinTexto(audio.length, await picoDb(ruta)) });
    return NextResponse.json(r);
  } catch {
    return NextResponse.json({ error: 'no se pudo transcribir' }, { status: 500 });
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
}
