import { API_BANCO } from '@/features/banco/services/servidor/api';

/** POST { entrada }: corre la función con el MISMO esquema que pinta la pantalla. 404 fuera del laboratorio. */
export const dynamic = 'force-dynamic';

export async function POST(peticion: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return API_BANCO.ejecuta(peticion, id);
}
