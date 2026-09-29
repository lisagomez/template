import { FormularioCuenta } from '@/features/auth/components/formulario-cuenta';
import { destinoSeguro } from '@/features/auth/services/destino';

export const dynamic = 'force-dynamic';

export default async function Pagina({ searchParams }: { searchParams: Promise<{ siguiente?: string }> }) {
  const { siguiente } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold">Crea tu cuenta</h1>
          <p className="mt-1 text-sm text-gray-600">Con ella apruebas tus reels y queda constancia de qué aprobaste.</p>
        </div>
        <FormularioCuenta modo="crear" siguiente={destinoSeguro(siguiente)} />
      </div>
    </main>
  );
}
