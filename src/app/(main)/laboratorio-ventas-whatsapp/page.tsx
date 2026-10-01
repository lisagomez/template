import type { Metadata } from 'next';
import { LaboratorioVentas } from '@/features/ventas-whatsapp/components/laboratorio-ventas';
import { GUIONES, PLANTILLAS_META, costosDeGuion, correCasos, mideLaboratorio, mideOptimizacion, presupuestoLaboratorio, roadmapDeCostos, transcribe } from '../../../../tools/ventas-whatsapp/dist/laboratorio/index.js';
import entrega from '../../../../tools/ventas-whatsapp/flows/entrega.json';
import reserva from '../../../../tools/ventas-whatsapp/flows/reserva.json';
import lead from '../../../../tools/ventas-whatsapp/flows/lead.json';
import checkout from '../../../../tools/ventas-whatsapp/flows/checkout.json';

export const metadata: Metadata = {
  title: 'Laboratorio del vendedor en WhatsApp',
  description: 'Fases 0 a 3 contra el simulador de Meta: casos, compuertas y conversaciones de punta a punta.',
};

/** Los casos corren en cada visita: lo que se ve es la corrida de ahora, no una foto vieja. */
export const dynamic = 'force-dynamic';

export default async function PaginaLaboratorioVentas() {
  const flows = { entrega, reserva, lead, checkout } as Record<string, Record<string, unknown>>;
  const [casos, metricas, transcripciones, optimizacion] = await Promise.all([correCasos({ flows }), mideLaboratorio({ flows }), transcribe({ flows }), mideOptimizacion({ flows })]);
  const cuando = new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' });
  const guiones = GUIONES.map((g) => ({ ...g, costos: costosDeGuion(g) }));
  return (
    <LaboratorioVentas
      casos={casos} metricas={metricas.filas} transcripciones={transcripciones} cuando={cuando} optimizacion={optimizacion}
      costos={roadmapDeCostos()} presupuesto={presupuestoLaboratorio()} guiones={guiones} plantillas={PLANTILLAS_META}
    />
  );
}
