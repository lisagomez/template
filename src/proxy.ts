import type { NextRequest } from 'next/server';
import { actualizaSesion } from '@/lib/supabase/proxy';

export async function proxy(peticion: NextRequest) {
  return actualizaSesion(peticion);
}

// Acotado a propósito: las cuentas protegen el reel y el sistema integrado (`/sgi`), nada más. `/dictar` (con su emparejamiento del
// celular), los laboratorios, `/estudio`, `/historial` y `/ajustes` no pasan por aquí.
export const config = {
  matcher: ['/reel/:path*', '/reel', '/cuenta/:path*', '/cuenta', '/api/reel/:path*', '/sgi/:path*', '/sgi', '/api/sgi/:path*', '/login', '/signup'],
};
