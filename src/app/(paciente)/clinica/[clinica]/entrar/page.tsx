import { redirect } from 'next/navigation';
import { FormularioEntrar } from '@/features/clinica-dental/components/cuenta/entrar';
import { usuarioActual } from '@/features/clinica-dental/services/servidor/sesion';

export default async function Entrar({ params, searchParams }: { params: Promise<{ clinica: string }>; searchParams: Promise<{ siguiente?: string }> }) {
  const { clinica } = await params;
  const { siguiente } = await searchParams;
  if (await usuarioActual()) redirect(`/clinica/${clinica}/mis-citas`);
  return (
    <div className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h1 className="text-2xl font-bold">Entrar</h1>
      <p className="mb-4 mt-1 text-sm text-slate-600">Con tu correo y contraseña ves y cambias tus citas.</p>
      <FormularioEntrar clinica={clinica} siguiente={siguiente ?? null} />
    </div>
  );
}
