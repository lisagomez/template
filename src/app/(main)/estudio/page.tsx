import type { Metadata } from 'next';
import { Estudio } from '@/features/estudio-pymes/components/estudio';
import { aprobadas, correLaboratorio } from '@/features/laboratorio-pymes/services/catalogo';

export const metadata: Metadata = {
  title: 'Estudio de marketing',
  description: 'Marca, brief, calendario con piezas, reseñas, visibilidad, anuncios y el brief del lunes, en borrador.',
};

/** La compuerta se calcula en cada visita: si una herramienta deja de pasar su laboratorio, aquí se apaga. */
export const dynamic = 'force-dynamic';

export default async function PaginaEstudio() {
  const corridos = await correLaboratorio({ llaveLlm: Boolean(process.env['OPENROUTER_API_KEY']) });
  return <Estudio aprobadas={aprobadas(corridos)} />;
}
