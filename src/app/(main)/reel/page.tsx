import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SubirClip } from '@/features/reel/components/subir-clip';
import { salir } from '@/features/auth/services/acciones';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const ETIQUETA: Record<string, string> = { subido: 'Subido', procesando: 'Procesando', bloqueado: 'Bloqueado', borrador: 'Listo para revisar', aprobado: 'Aprobado' };

export default async function Pagina() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?siguiente=/reel');
  const { data: proyectos } = await supabase.from('reel_proyectos').select('id, titulo, estado, creado_en').order('creado_en', { ascending: false }).limit(30);
  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tus reels</h1>
          <p className="text-sm text-gray-600" data-prueba="cuenta">{user.email}</p>
        </div>
        <form action={salir}><button type="submit" data-prueba="salir" className="rounded-lg border border-gray-300 px-3 py-2 text-sm">Salir</button></form>
      </header>
      <ul className="space-y-2" data-prueba="proyectos">
        {(proyectos ?? []).map((p) => (
          <li key={String(p.id)}>
            <Link href={`/reel/${String(p.id)}`} className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
              <span className="font-medium">{String(p.titulo)}</span>
              <span className="text-sm text-gray-600">{ETIQUETA[String(p.estado)] ?? String(p.estado)}</span>
            </Link>
          </li>
        ))}
        {!proyectos?.length && <li className="text-sm text-gray-600">Aún no tienes reels.</li>}
      </ul>
      <SubirClip />
    </main>
  );
}
