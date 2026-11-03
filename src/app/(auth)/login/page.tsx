import { FormularioCuenta } from '@/features/auth/components/formulario-cuenta';
import { destinoSeguro } from '@/features/auth/services/destino';

export const dynamic = 'force-dynamic';

export default async function Pagina({ searchParams }: { searchParams: Promise<{ siguiente?: string }> }) {
  const { siguiente } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Entra a tu cuenta</h1>
          <p className="mt-1 text-sm text-muted-foreground">{destinoSeguro(siguiente).startsWith('/sgi') ? 'Para tu sistema de gestión ISO 9001 + ISO/IEC 42001.' : 'Para revisar y aprobar tus reels desde el celular.'}</p>
        </div>
        <FormularioCuenta modo="entrar" siguiente={destinoSeguro(siguiente)} />
      </div>
    </main>
  );
}
