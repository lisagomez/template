import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { cargaContexto } from '@/features/sgi/services/contexto';
import { guardarMarca, proponer } from '@/features/sgi/services/acciones';
import { avance, faseActual, puerta } from '../../../../../tools/sistema-integrado/dist/index.js';
import { Aviso, Barra, Insignia, Tarjeta } from '@/features/sgi/components/piezas';
import { Boton } from '@/features/sgi/components/boton';
import { FASE_EXPERTO, EDICION, NO_CERTIFICA } from '@/features/sgi/components/textos';

export const dynamic = 'force-dynamic';

export default async function Panel({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const { aviso, error } = await searchParams;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login?siguiente=/sgi/consultor');
  const { data: mem } = await sb.from('sgi_membresia').select('organizacion_id').eq('user_id', user.id).eq('rol', 'consultor');
  const clientes = (await Promise.all((mem ?? []).map((m) => cargaContexto(sb, String(m.organizacion_id))))).filter((c) => c !== null);
  const { data: desp } = await sb.from('sgi_despacho_miembro').select('despacho_id, sgi_despacho(id, nombre, marca)').eq('user_id', user.id).limit(1).maybeSingle();
  const despacho = desp?.sgi_despacho as unknown as { id: string; nombre: string; marca: Record<string, string> } | undefined;
  const { data: plantillas } = despacho ? await sb.from('sgi_plantilla').select('titulo, tipo').eq('despacho_id', despacho.id) : { data: [] };
  const marca = despacho?.marca ?? {};
  return (
    <div style={{ ['--sgi-primario' as string]: marca.color_primario ?? '#334155', ['--sgi-acento' as string]: marca.color_acento ?? '#b45309' }} className="min-h-screen bg-gray-50">
      <header className="border-b bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg font-bold text-white" style={{ background: 'var(--sgi-primario)' }}>{(marca.nombre_corto ?? 'SG').slice(0, 2).toUpperCase()}</span>
          <div><h1 className="text-xl font-bold" data-prueba="despacho">{despacho?.nombre ?? 'Panel del consultor'}</h1><p className="text-xs text-gray-600">{marca.lema}</p></div>
        </div>
        <Link href="/sgi" className="rounded-lg px-3 py-2 text-sm ring-1 ring-gray-300">Mis organizaciones</Link>
      </div></header>
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <Aviso aviso={aviso} error={error} />
        <Tarjeta titulo={`Tus clientes (${clientes.length})`}>
          <div className="overflow-x-auto"><table className="w-full text-sm" data-prueba="clientes">
            <thead><tr className="text-left text-xs text-gray-500"><th className="py-2">Cliente</th><th>Normas</th><th className="w-48">Avance global</th><th>Fase actual</th><th>Lo que traba</th><th /></tr></thead>
            <tbody>{clientes.map((c) => {
              if (!c.estado) return null;
              const a = avance(c.estado); const f = faseActual(c.estado); const p = puerta(c.estado, f);
              return (
                <tr key={c.org.id} className="border-t align-top">
                  <td className="py-3 font-medium"><Link className="underline" href={`/sgi/${c.org.id}`}>{c.org.nombre}</Link><p className="text-xs text-gray-500">{c.org.sector} · {c.org.empleados} personas</p></td>
                  <td className="text-xs">{c.proyecto?.ediciones.map((e) => EDICION[e]).join(' + ')}</td>
                  <td className="pr-4"><Barra pct={a.global.pct} />{Object.entries(a.porNorma).map(([e, x]) => <p key={e} className="text-xs text-gray-600">{EDICION[e]}: {x.pct}%</p>)}</td>
                  <td className="text-xs">{f}. {FASE_EXPERTO[f]}</td>
                  <td className="text-xs">{p.faltan.length ? <Insignia tono="ambar">{p.faltan.length} pendiente(s)</Insignia> : <Insignia tono="verde">puerta lista</Insignia>}</td>
                  <td><form action={proponer.bind(null, c.org.id)}><input type="hidden" name="que" value="reporte" /><input type="hidden" name="volver" value={`/sgi/${c.org.id}/documentos`} /><Boton variante="secundario" data-prueba={`reporte-${c.org.nombre}`} trabajando="Redactando…">Reporte de avance</Boton></form></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </Tarjeta>
        <div className="grid gap-4 md:grid-cols-2">
          <Tarjeta titulo="Tu marca (marca blanca)">
            {despacho ? (
              <form action={guardarMarca} className="grid grid-cols-2 gap-2 text-sm" data-prueba="form-marca">
                <input type="hidden" name="despacho" value={despacho.id} />
                <label className="col-span-2">Nombre corto<input name="nombre_corto" defaultValue={marca.nombre_corto} className="mt-1 w-full rounded border border-gray-300 px-2 py-1" /></label>
                <label className="col-span-2">Lema<input name="lema" defaultValue={marca.lema} className="mt-1 w-full rounded border border-gray-300 px-2 py-1" /></label>
                <label>Color principal<input type="color" name="color_primario" defaultValue={marca.color_primario ?? '#0f766e'} className="mt-1 block h-9 w-full" /></label>
                <label>Color de acento<input type="color" name="color_acento" defaultValue={marca.color_acento ?? '#b45309'} className="mt-1 block h-9 w-full" /></label>
                <div className="col-span-2"><Boton>Guardar marca</Boton></div>
              </form>
            ) : <p className="text-sm text-gray-600">No perteneces a un despacho.</p>}
          </Tarjeta>
          <Tarjeta titulo="Biblioteca de plantillas del despacho">
            <ul className="space-y-1 text-sm" data-prueba="plantillas">{(plantillas ?? []).map((p) => <li key={String(p.titulo)}>· {String(p.titulo)} <Insignia>{String(p.tipo)}</Insignia></li>)}</ul>
            <p className="mt-3 text-xs text-gray-500">Tus plantillas son punto de partida: el agente documental siempre las adapta con los datos de cada cliente, y un documento genérico no pasa a revisión.</p>
          </Tarjeta>
        </div>
        <p className="text-xs text-gray-500">{NO_CERTIFICA}</p>
      </div>
    </div>
  );
}
