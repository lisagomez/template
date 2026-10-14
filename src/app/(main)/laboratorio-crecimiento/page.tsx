import type { Metadata } from 'next';
import * as xml from '../../../../tools/extractor-documental/dist/xml/index.js';
import { correSucios, correTrampas, cotejaConLaVerdad, hechosConInyeccion, replayDeGamma } from '../../../../tools/crecimiento-demostrado/dist/laboratorio/index.js';
import { Laboratorio } from '@/features/crecimiento-demostrado/components/laboratorio';

export const metadata: Metadata = {
  title: 'Laboratorio de crecimiento demostrado',
  description: 'Trampas, snapshots sucios, puente contra la verdad plantada, replay e inyección: lo que corrió al abrir la página.',
};

/** Los casos corren en cada visita: lo que se ve es la corrida de ahora, no una foto vieja. */
export const dynamic = 'force-dynamic';

export default async function PaginaLaboratorioCrecimiento() {
  const trampas = await correTrampas(xml);
  const cotejo = [...cotejaConLaVerdad(xml, 'distribuidora'), ...cotejaConLaVerdad(xml, 'tienda')];
  const cuando = new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' });
  return (
    <Laboratorio
      trampas={trampas} sucios={correSucios(xml)} cotejo={cotejo} cuando={cuando}
      replay={replayDeGamma(xml, 'tienda')} inyeccion={hechosConInyeccion(xml, 'distribuidora')}
    />
  );
}
