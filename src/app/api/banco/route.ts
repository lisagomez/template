import { API_BANCO } from '@/features/banco/services/servidor/api';

/** GET: las funciones del banco con su descriptor (bloques, ejemplos y JSON Schema). 404 fuera del laboratorio. */
export const dynamic = 'force-dynamic';

export function GET(peticion: Request) {
  return API_BANCO.lista(peticion);
}
