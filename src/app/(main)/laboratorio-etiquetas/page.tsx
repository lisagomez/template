import type { Metadata } from 'next';
import { LaboratorioEtiquetas } from '@/features/laboratorio-etiquetas/components/laboratorio-etiquetas';
import { aprobadas, HERRAMIENTAS } from '@/features/laboratorio-etiquetas/services/catalogo';
import { contextoDelServidor, correYGuarda } from '@/features/etiquetas/services/servidor/laboratorio';

export const metadata: Metadata = {
  title: 'Laboratorio de etiquetas',
  description: 'La herramienta de etiquetas GS1 y caducidades, probada caso por caso con su estado real.',
};

/** Los casos corren en cada visita: lo que se ve es la corrida de ahora, y la app de /etiquetas usa este veredicto. */
export const dynamic = 'force-dynamic';

export default async function PaginaLaboratorioEtiquetas() {
  const ctx = contextoDelServidor();
  const corridos = await correYGuarda();
  const cuando = new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' });
  return <LaboratorioEtiquetas corridos={corridos} herramientas={HERRAMIENTAS} aprobadas={aprobadas(corridos)} cuando={cuando} maquina={{ motor: ctx.motor?.modelo ?? null, corpusReal: Boolean(ctx.corpusReal) }} />;
}
