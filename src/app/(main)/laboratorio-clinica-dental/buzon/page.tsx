import { Buzon } from '@/features/clinica-dental/components/laboratorio/buzon';
import { esLaboratorio } from '@/features/clinica-dental/services/servidor/datos';
import { runtime } from '@/features/clinica-dental/services/servidor/runtime';

export const dynamic = 'force-dynamic';

export default async function PaginaBuzon({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  if (!esLaboratorio()) return <p className="p-8">Solo laboratorio.</p>;
  const rt = await runtime();
  return (
    <div lang="es-MX" className="mx-auto max-w-6xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">Buzón de salida simulado</h1>
      <p className="text-sm text-slate-700">Los correos del portal, tal como salieron hacia el puerto de correo (Gmail en producción). En el laboratorio no sale ninguno: se guardan aquí como <code>.eml</code>.</p>
      <Buzon enviados={rt.buzon.enviados} elegido={(await searchParams).id ?? null} />
    </div>
  );
}
