import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { salir } from '@/features/auth/services/acciones';
import { Aviso } from '@/features/sgi/components/piezas';
import { ROL, NO_CERTIFICA } from '@/features/sgi/components/textos';
import type { Rol } from '../../../../tools/sistema-integrado/dist/index.js';

export const dynamic = 'force-dynamic';

export default async function MisOrganizaciones({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login?siguiente=/sgi');
  const { data: mem } = await sb.from('sgi_membresia').select('rol, organizacion_id, sgi_organizacion(nombre, es_casa)').eq('user_id', user.id);
  const orgs = new Map<string, { nombre: string; roles: Rol[]; casa: boolean }>();
  for (const m of mem ?? []) {
    const o = m.sgi_organizacion as unknown as { nombre: string; es_casa: boolean } | null;
    const prev = orgs.get(String(m.organizacion_id));
    orgs.set(String(m.organizacion_id), { nombre: o?.nombre ?? '—', casa: Boolean(o?.es_casa), roles: [...(prev?.roles ?? []), m.rol as Rol] });
  }
  const esConsultor = [...orgs.values()].some((o) => o.roles.includes('consultor'));
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sistema integrado ISO 9001 + ISO/IEC 42001</h1>
          <p className="text-sm text-gray-600" data-prueba="cuenta">{user.email}</p>
        </div>
        <form action={salir}><button className="rounded-lg border border-gray-300 px-3 py-2 text-sm">Salir</button></form>
      </header>
      <Aviso error={error} />
      {esConsultor && <Link href="/sgi/consultor" className="block rounded-xl bg-gray-900 p-4 text-white" data-prueba="ir-panel">Panel del consultor →</Link>}
      <ul className="space-y-2" data-prueba="organizaciones">
        {[...orgs.entries()].map(([id, o]) => (
          <li key={id}><Link href={`/sgi/${id}`} className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
            <span className="font-medium">{o.nombre}{o.casa && <span className="ml-2 text-xs text-gray-500">(la app misma)</span>}</span>
            <span className="text-xs text-gray-600">{o.roles.map((r) => ROL[r]).join(', ')}</span>
          </Link></li>
        ))}
        {!orgs.size && <li className="text-sm text-gray-600">Aún no perteneces a ninguna organización.</li>}
      </ul>
      <p className="text-xs text-gray-500">{NO_CERTIFICA}</p>
    </main>
  );
}
