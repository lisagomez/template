import { FormularioRecuperar } from '@/features/clinica-dental/components/cuenta/entrar';

export default async function Recuperar({ params }: { params: Promise<{ clinica: string }> }) {
  const { clinica } = await params;
  return (
    <div className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h1 className="text-2xl font-bold">Recuperar contraseña</h1>
      <p className="mb-4 mt-1 text-sm text-slate-600">Te mandamos un enlace para elegir una nueva.</p>
      <FormularioRecuperar clinica={clinica} />
    </div>
  );
}
