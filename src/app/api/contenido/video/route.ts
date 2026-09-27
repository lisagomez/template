/**
 * Render de una promo 9:16 a MP4 para el estudio. SOLO LOCAL (PRP-006, fase 10 bloqueada para
 * producción: Playwright es dependencia de desarrollo y la imagen no trae ffmpeg).
 * C3: solo el mismo origen (un POST desde otra página no dispara renders), entrada validada con Zod
 * (texto y colores, nunca URL ni archivos), una escena a la vez, y la página del render sin red.
 * Lo que entra es la pieza de marketing (producto, precio, marca), no datos personales.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { escenaDePromo, revisaEscena } from '../../../../../tools/pymes-marketing/dist/video/index.js';
import { MARCA_POR_DEFECTO } from '../../../../../tools/pymes-marketing/dist/marca/index.js';
import { renderizaVideo } from '@/features/estudio-pymes/services/servidor/render-video';

export const dynamic = 'force-dynamic';

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
const texto = (max: number) => z.string().trim().min(1).max(max).refine((s) => !/[<>]/.test(s), 'sin marcado');
const esquema = z.object({
  titular: texto(80),
  apoyo: texto(80).optional(),
  precio: z.string().regex(/^\$[\d,]{1,9}\.\d{2}$/).optional(),
  etiqueta: texto(32).optional(),
  semilla: z.string().trim().min(1).max(80),
  marca: z.object({
    nombre: texto(60),
    colores: z.object({ primario: hex, secundario: hex, fondo: hex, texto: hex }),
    tipografia: z.object({ titulos: z.string().max(120).regex(/^[\w\s,'-]+$/), cuerpo: z.string().max(120).regex(/^[\w\s,'-]+$/) }),
  }),
});

let enCurso: Promise<unknown> | null = null;

function mismoOrigen(p: NextRequest): boolean {
  const origen = p.headers.get('origin');
  return origen === null || new URL(origen).host === p.headers.get('host');
}

export async function POST(peticion: NextRequest): Promise<Response> {
  if (!mismoOrigen(peticion)) return NextResponse.json({ error: 'origen no permitido' }, { status: 403 });
  const cuerpo = esquema.safeParse(await peticion.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: 'pieza invalida' }, { status: 400 });
  if (enCurso) return NextResponse.json({ error: 'ya hay un video renderizandose; espera a que termine' }, { status: 429 });
  const { marca, ...datos } = cuerpo.data;
  const escena = escenaDePromo({ ...MARCA_POR_DEFECTO, ...marca, confirmado: true }, datos);
  const problemas = revisaEscena(escena);
  if (problemas.length) return NextResponse.json({ error: 'la escena no pasa la revision', problemas }, { status: 422 });
  try {
    const trabajo = renderizaVideo(escena);
    enCurso = trabajo;
    const v = await trabajo;
    return new Response(new Uint8Array(v.mp4), { headers: { 'content-type': 'video/mp4', 'x-huella': v.huella, 'x-cuadros': String(v.cuadros), 'x-ms': String(v.ms), 'cache-control': 'no-store' } });
  } catch (e) {
    const falta = e instanceof Error && /Executable doesn't exist|Cannot find module|ENOENT/.test(e.message);
    return NextResponse.json({ error: falta ? 'este servidor no tiene navegador sin ventana o ffmpeg: el render de video es local (PRP-006, fase 10)' : 'no se pudo renderizar' }, { status: falta ? 501 : 500 });
  } finally {
    enCurso = null;
  }
}
