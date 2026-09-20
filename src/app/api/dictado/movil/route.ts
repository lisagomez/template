/**
 * Microfono remoto del celular (PWA) → pipeline propio de `tools/dictado`.
 *
 * POST: audio del telefono en el cuerpo (webm/opus de Android, mp4/aac de iPhone, lo que de
 * MediaRecorder: ffmpeg lo traga via `leeAudio`), se transcribe LOCAL con `dictado archivo`
 * (parakeet, carga medida en ~0,1 s) y, segun `x-destino`, el texto se pega donde este el
 * cursor de Windows (`dictado pega`), se devuelve a la pantalla del cel, o ambos.
 * GET: comprobar el emparejamiento (200/401) sin transcribir nada.
 *
 * C3: superficie autenticada SI o SI — `Authorization: Bearer <DICTADO_MOVIL_TOKEN>` en tiempo
 * constante; sin token configurado, 503 y nada corre. C4: el audio va a un temporal que se
 * borra SIEMPRE, no se guarda ni sale de esta maquina; ningun error lleva texto ni rutas.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { rechazoSinToken as conAuth } from '@/shared/lib/token-dictado';
import { pegaEnPc, picoDb, razonSinTexto, transcribeRapido } from '@/shared/lib/transcriptor-local';

const MAX_AUDIO_BYTES = 15 * 1024 * 1024; // ~15 MB: minutos de opus, de sobra para una frase

const esquemaDestino = z.enum(['pc', 'pantalla', 'ambos']);

export function GET(peticion: NextRequest): NextResponse {
  return conAuth(peticion) ?? NextResponse.json({ emparejado: true });
}

export async function POST(peticion: NextRequest): Promise<NextResponse> {
  const rechazo = conAuth(peticion);
  if (rechazo) return rechazo;
  const destino = esquemaDestino.catch('pantalla').parse(peticion.headers.get('x-destino'));
  const audio = Buffer.from(await peticion.arrayBuffer());
  if (audio.length === 0) return NextResponse.json({ error: 'sin audio' }, { status: 400 });
  if (audio.length > MAX_AUDIO_BYTES) return NextResponse.json({ error: 'audio demasiado grande' }, { status: 413 });

  const carpeta = await mkdtemp(join(tmpdir(), 'dictado-movil-'));
  try {
    const ruta = join(carpeta, 'toma.audio');
    await writeFile(ruta, audio);
    const r = await transcribeRapido(ruta);
    if (r.texto.length === 0) {
      // Diagnostico: distinguir grabacion muda de audio-sin-habla, para que el aviso sea util.
      const pico = await picoDb(ruta);
      return NextResponse.json({ texto: '', ms: r.ms, destino, via: r.via, razon: razonSinTexto(audio.length, pico), bytes: audio.length, picoDb: Number.isFinite(pico) ? Math.round(pico) : null });
    }
    if (destino === 'pc' || destino === 'ambos') {
      await pegaEnPc(r.texto);
    }
    return NextResponse.json({ texto: r.texto, ms: r.ms, msMotor: r.msMotor, via: r.via, motor: r.motor, destino, bytes: audio.length });
  } catch {
    return NextResponse.json({ error: 'no se pudo transcribir' }, { status: 500 });
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
}
