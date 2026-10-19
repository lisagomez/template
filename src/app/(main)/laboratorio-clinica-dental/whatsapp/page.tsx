import { CLINICAS } from '../../../../../tools/clinica-dental/dist/index.js';
import { WhatsappSimulado } from '@/features/clinica-dental/components/laboratorio/whatsapp';
import { esLaboratorio } from '@/features/clinica-dental/services/servidor/datos';

export const dynamic = 'force-dynamic';

/**
 * El WhatsApp simulado de un paciente sintético: `?clinica=maguey#numero=5215500001001&texto=…` (el enlace `wa.me` del
 * portal). El número y el texto van en el fragmento: el navegador no los manda al servidor, así que no quedan en su log.
 */
export default async function PaginaWhatsapp({ searchParams }: { searchParams: Promise<{ clinica?: string }> }) {
  if (!esLaboratorio()) return <p className="p-8">Solo laboratorio.</p>;
  const q = await searchParams;
  const c = CLINICAS.find((x) => x.id === q.clinica) ?? CLINICAS[0]!;
  return (
    <div lang="es-MX" className="mx-auto max-w-5xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">WhatsApp simulado</h1>
      <p className="text-sm text-slate-700">El celular de una persona sintética frente al número de WhatsApp de {c.nombre} (coexistencia: la recepción usa el mismo número). Meta está simulada: webhooks firmados, plantillas aprobadas, Flows cifrados, ventana de 24 h y precios de México. Nada sale hacia Meta.</p>
      <WhatsappSimulado key={c.id} clinica={c.id} nombreClinica={c.nombre} />
    </div>
  );
}
