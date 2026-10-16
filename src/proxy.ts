import type { NextRequest } from 'next/server';
import { actualizaSesion } from '@/lib/supabase/proxy';

export async function proxy(peticion: NextRequest) {
  return actualizaSesion(peticion);
}

// Acotado a propósito: las cuentas protegen el reel, las páginas del buzón (spec 015) y el sistema integrado
// (`/sgi`). `/dictar` (con su emparejamiento del celular), los laboratorios, `/estudio`, `/historial` y `/ajustes`
// no pasan por aquí. `/api/buzon` tampoco: Next 16 corta el cuerpo a 10 MB SIN error y un CFDI puede pesar 20, así
// que cada ruta del buzón comprueba la sesión por su cuenta (`src/features/buzon-cfdi/services/servidor/ruta.ts`).
export const config = {
  matcher: [
    '/reel/:path*', '/reel', '/buzon/:path*', '/buzon', '/cuenta/:path*', '/cuenta', '/api/reel/:path*',
    '/sgi/:path*', '/sgi', '/api/sgi/:path*', '/login', '/signup',
    // El portal del paciente (goal clinica-dental): solo refresca la sesión; cada página decide si la exige.
    '/clinica/:path*',
  ],
};
