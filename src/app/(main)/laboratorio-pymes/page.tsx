import type { Metadata } from 'next';
import { LaboratorioPymes } from '@/features/laboratorio-pymes/components/laboratorio-pymes';
import { aprobadas, correLaboratorio, HERRAMIENTAS } from '@/features/laboratorio-pymes/services/catalogo';

export const metadata: Metadata = {
  title: 'Laboratorio pymes',
  description: 'Cada herramienta de marketing para pymes, probada caso por caso con su estado real.',
};

/** Los casos corren en cada visita: lo que se ve es la corrida de ahora, no una foto vieja. */
export const dynamic = 'force-dynamic';

export default async function PaginaLaboratorioPymes() {
  const corridos = await correLaboratorio({ llaveLlm: Boolean(process.env['OPENROUTER_API_KEY']) });
  const cuando = new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' });
  return <LaboratorioPymes corridos={corridos} herramientas={HERRAMIENTAS} aprobadas={aprobadas(corridos)} cuando={cuando} />;
}
