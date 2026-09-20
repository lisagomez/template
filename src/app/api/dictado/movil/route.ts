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
import { execFile, spawn } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

const ejecuta = promisify(execFile);
/**
 * La raíz de `tools/dictado` se arma con template strings, NO con `path.join` de literales:
 * Turbopack convierte un `join('...','tools','dictado')` en una referencia de directorio y
 * rastrea ese árbol como assets — tropieza con el symlink roto del venv de Python del banco.
 * El route invoca el CLI por ruta en runtime; no importa nada de ahí. DICTADO_RAIZ lo overridea.
 */
const RAIZ_DICTADO = process.env['DICTADO_RAIZ'] ?? `${process.cwd()}/tools/dictado`;
const CLI = `${RAIZ_DICTADO}/dist/node/cli.js`;
const BANCO = `${RAIZ_DICTADO}/medicion/banco`;
const MAX_AUDIO_BYTES = 15 * 1024 * 1024; // ~15 MB: minutos de opus, de sobra para una frase

const esquemaDestino = z.enum(['pc', 'pantalla', 'ambos']);

const entorno = () => ({
  ...process.env,
  DICTADO_MODELOS: process.env['DICTADO_MODELOS'] ?? join(BANCO, 'modelos'),
  DICTADO_RUNTIME: process.env['DICTADO_RUNTIME'] ?? BANCO,
  DICTADO_DATOS: process.env['DICTADO_DATOS'] ?? join(BANCO, 'datos'),
});

function autorizado(peticion: NextRequest): boolean | 'sin-token' {
  const token = process.env['DICTADO_MOVIL_TOKEN'];
  if (!token || token.length < 16) return 'sin-token';
  const cabecera = peticion.headers.get('authorization') ?? '';
  if (!cabecera.startsWith('Bearer ')) return false;
  const dado = Buffer.from(cabecera.slice(7));
  const bueno = Buffer.from(token);
  return dado.length === bueno.length && timingSafeEqual(dado, bueno);
}

/** El texto viaja por stdin: comillas y saltos de linea no pelean con la shell. */
function pegaEnPc(texto: string): Promise<void> {
  return new Promise((resuelve, rechaza) => {
    const hijo = spawn(process.execPath, [CLI, 'pega'], { env: entorno(), cwd: RAIZ_DICTADO, stdio: ['pipe', 'ignore', 'ignore'] });
    hijo.on('error', rechaza);
    hijo.on('close', (codigo) => (codigo === 0 ? resuelve() : rechaza(new Error('el pegado fallo'))));
    hijo.stdin.write(texto);
    hijo.stdin.end();
  });
}

function conAuth(peticion: NextRequest): NextResponse | undefined {
  const auth = autorizado(peticion);
  if (auth === 'sin-token') return NextResponse.json({ error: 'el dictado movil no esta emparejado en el servidor (falta DICTADO_MOVIL_TOKEN)' }, { status: 503 });
  if (!auth) return NextResponse.json({ error: 'token invalido' }, { status: 401 });
  return undefined;
}

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
    const t0 = performance.now();
    const { stdout } = await ejecuta(process.execPath, [CLI, 'archivo', ruta, '--motor', 'parakeet'], { env: entorno(), cwd: RAIZ_DICTADO, timeout: 60_000 });
    const ms = Math.round(performance.now() - t0);
    const texto = stdout.trim();
    if (texto.length > 0 && (destino === 'pc' || destino === 'ambos')) {
      await pegaEnPc(texto);
    }
    return NextResponse.json({ texto, ms, destino });
  } catch {
    return NextResponse.json({ error: 'no se pudo transcribir' }, { status: 500 });
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
}
