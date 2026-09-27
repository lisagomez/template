/**
 * La puerta de /api/etiquetas (C3): `Authorization: Bearer <codigo>` comparado en tiempo
 * constante, y `x-operador` para la traza (quien asigno, quien imprimio, quien recibio).
 * El codigo decide el ROL (`roles.ts`): `ETIQUETAS_TOKEN` es operacion y `ETIQUETAS_TOKEN_CONTEO`
 * es un dispositivo de conteo, que solo cuenta y no ve cantidades.
 * Sin codigo de operacion configurado en el servidor: 503 y nada corre.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { rolDeToken, type Rol } from './roles.ts';

export function puerta(peticion: NextRequest): { operador: string; rol: Rol } | NextResponse {
  const token = process.env['ETIQUETAS_TOKEN'];
  if (!token || token.length < 16) return NextResponse.json({ error: 'el sistema de etiquetas no está configurado en el servidor (falta ETIQUETAS_TOKEN)' }, { status: 503 });
  const cabecera = peticion.headers.get('authorization') ?? '';
  const rol = rolDeToken(cabecera.startsWith('Bearer ') ? cabecera.slice(7) : '', { operacion: token, conteo: process.env['ETIQUETAS_TOKEN_CONTEO'] });
  if (!rol) return NextResponse.json({ error: 'código del dispositivo inválido' }, { status: 401 });
  let operador = '';
  try { operador = decodeURIComponent(peticion.headers.get('x-operador') ?? '').trim(); } catch { operador = ''; }
  if (!/^[\p{L}\p{N} ._-]{2,60}$/u.test(operador)) return NextResponse.json({ error: 'falta el nombre de quien opera (x-operador)' }, { status: 400 });
  return { operador, rol };
}
