/**
 * La puerta de las rutas que tocan el pipeline de voz (C3): `Authorization: Bearer
 * <DICTADO_MOVIL_TOKEN>` comparado en tiempo constante. Sin token configurado en el servidor,
 * 503 y nada corre. Lo comparten `/api/dictado/movil` y `/api/laboratorio/*`.
 */
import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

export function autorizado(peticion: NextRequest): boolean | 'sin-token' {
  const token = process.env['DICTADO_MOVIL_TOKEN'];
  if (!token || token.length < 16) return 'sin-token';
  const cabecera = peticion.headers.get('authorization') ?? '';
  if (!cabecera.startsWith('Bearer ')) return false;
  const dado = Buffer.from(cabecera.slice(7));
  const bueno = Buffer.from(token);
  return dado.length === bueno.length && timingSafeEqual(dado, bueno);
}

/** La respuesta de rechazo, o `undefined` si la peticion puede pasar. */
export function rechazoSinToken(peticion: NextRequest): NextResponse | undefined {
  const auth = autorizado(peticion);
  if (auth === 'sin-token') return NextResponse.json({ error: 'el dictado movil no esta emparejado en el servidor (falta DICTADO_MOVIL_TOKEN)' }, { status: 503 });
  if (!auth) return NextResponse.json({ error: 'token invalido' }, { status: 401 });
  return undefined;
}
