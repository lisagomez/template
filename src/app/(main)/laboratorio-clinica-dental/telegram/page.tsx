import { Telegram, type EntradaHistorial } from '@/features/clinica-dental/components/laboratorio/telegram';
import { esLaboratorio } from '@/features/clinica-dental/services/servidor/datos';
import { runtime } from '@/features/clinica-dental/services/servidor/runtime';

export const dynamic = 'force-dynamic';

export default async function PaginaTelegram({ searchParams }: { searchParams: Promise<{ chat?: string }> }) {
  if (!esLaboratorio()) return <p className="p-8">Solo laboratorio.</p>;
  const rt = await runtime();
  return (
    <div lang="es-MX" className="mx-auto max-w-5xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">Telegram simulado</h1>
      <p className="text-sm text-slate-700">La Bot API simulada: un bot no puede escribir primero (403), la vinculación es por deep link de un solo uso y la confirmación lleva el reel por <code>sendVideo</code>. Nada sale hacia Telegram.</p>
      <Telegram historial={rt.telegram.historial as EntradaHistorial[]} elegido={(await searchParams).chat ?? null} />
    </div>
  );
}
