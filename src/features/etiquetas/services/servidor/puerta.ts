/**
 * La puerta de /api/etiquetas (C3): `Authorization: Bearer <ETIQUETAS_TOKEN>` comparado en
 * tiempo constante, y `x-operador` para la traza (quien asigno, quien imprimio, quien recibio).
 * Sin token configurado en el servidor: 503 y nada corre.
 */
import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

export function puerta(peticion: NextRequest): { operador: string } | NextResponse {
  const token = process.env['ETIQUETAS_TOKEN'];
  if (!token || token.length < 16) return NextResponse.json({ error: 'el sistema de etiquetas no está configurado en el servidor (falta ETIQUETAS_TOKEN)' }, { status: 503 });
  const cabecera = peticion.headers.get('authorization') ?? '';
  const dado = Buffer.from(cabecera.startsWith('Bearer ') ? cabecera.slice(7) : '');
  const bueno = Buffer.from(token);
  if (dado.length !== bueno.length || !timingSafeEqual(dado, bueno)) return NextResponse.json({ error: 'código del dispositivo inválido' }, { status: 401 });
  let operador = '';
  try { operador = decodeURIComponent(peticion.headers.get('x-operador') ?? '').trim(); } catch { operador = ''; }
  if (!/^[\p{L}\p{N} ._-]{2,60}$/u.test(operador)) return NextResponse.json({ error: 'falta el nombre de quien opera (x-operador)' }, { status: 400 });
  return { operador };
}
