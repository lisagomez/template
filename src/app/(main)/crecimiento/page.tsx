import type { Metadata } from 'next';
import { PaginaPregunta } from '@/features/crecimiento-demostrado/components/pagina-pregunta';
import { esquemaConsulta, pymeLista, replay, responde } from '@/features/crecimiento-demostrado/services/servidor';

export const metadata: Metadata = {
  title: 'Crecimiento demostrado',
  description: 'Analítica de growth revenue para pymes: cada cifra con su prueba, o un «no se puede afirmar».',
};

/** Cada visita corre el pipeline completo en el servidor: plan, motor, kernel y narración. */
export const dynamic = 'force-dynamic';

export default async function PaginaCrecimiento({ searchParams }: { searchParams: Promise<{ pyme?: string; q?: string; replay?: string }> }) {
  const { pyme, q, replay: pideReplay } = esquemaConsulta.parse(await searchParams);
  const lista = pymeLista(pyme);
  const pregunta = q ?? null;
  const respuesta = pregunta ? await responde(pyme, pregunta) : null;
  const repeticion = pregunta && pideReplay ? await replay(pyme, pregunta) : null;
  return (
    <PaginaPregunta
      pyme={pyme} gamma={lista.gamma.hash} transacciones={lista.gamma.contenido.transacciones.length} especificacion={lista.pyme.especificacion}
      pregunta={pregunta} respuesta={respuesta} replay={repeticion}
    />
  );
}
