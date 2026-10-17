/**
 * Las guardas de borde de las rutas del portal: solo laboratorio, y para lo que gasta CPU de la maquina (la voz)
 * o mueve el estado del laboratorio, MISMO ORIGEN (una pagina ajena no puede usar el ASR y el TTS locales). Un
 * limite simple por proceso frena el abuso; el modelo de amenazas (C3) dice lo que falta para produccion.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { esLaboratorio } from './datos';

export function rechazoDeBorde(p: NextRequest, mismoOrigen: boolean): NextResponse | null {
  if (!esLaboratorio()) return NextResponse.json({ error: 'portal solo de laboratorio' }, { status: 503 });
  if (mismoOrigen) {
    const origen = p.headers.get('origin');
    if (origen && new URL(origen).host !== p.headers.get('host')) return NextResponse.json({ error: 'origen no permitido' }, { status: 403 });
  }
  return null;
}

const ventanas = new Map<string, { desde: number; n: number }>();
/** `n` peticiones por minuto por clave (ip + ruta). En memoria del proceso: suficiente para el laboratorio. */
export function excedeLimite(clave: string, n: number): boolean {
  const ahora = Date.now();
  const v = ventanas.get(clave);
  if (!v || ahora - v.desde > 60_000) {
    ventanas.set(clave, { desde: ahora, n: 1 });
    return false;
  }
  v.n++;
  return v.n > n;
}

export const ipDe = (p: NextRequest) => p.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
