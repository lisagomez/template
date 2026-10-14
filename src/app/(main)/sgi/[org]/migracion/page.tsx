import { migraEdicion } from '../../../../../../tools/sistema-integrado/dist/index.js';
import { requisito, CATALOGO, type IdEdicion } from '../../../../../../tools/sistema-integrado/dist/catalogo/index.js';
import { contextoDePagina } from '@/features/sgi/services/pagina';
import { Insignia, Tarjeta } from '@/features/sgi/components/piezas';
import { EDICION } from '@/features/sgi/components/textos';

export const dynamic = 'force-dynamic';

export default async function Migracion({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx, modo } = await contextoDePagina(org);
  const desde: IdEdicion = ctx.proyecto?.ediciones.includes('iso-9001:2026') ? 'iso-9001:2026' : 'iso-9001:2015+a1:2024';
  const hacia: IdEdicion = desde === 'iso-9001:2026' ? 'iso-9001:2015+a1:2024' : 'iso-9001:2026';
  const m = migraEdicion(desde, hacia, ctx.estado?.evidencias ?? []);
  const nota = CATALOGO.ediciones.find((e) => e.id === 'iso-9001:2026')?.nota;
  return (
    <>
      <Tarjeta titulo={`Migrar de ${EDICION[desde]} a ${EDICION[hacia]}: el diff, no rehacer el sistema`}>
        <div className="grid gap-3 md:grid-cols-4" data-prueba="migracion">
          <div className="rounded-lg bg-emerald-50 p-3"><p className="text-2xl font-bold">{m.siguen.length}</p><p className="text-xs">requisitos siguen igual</p></div>
          <div className="rounded-lg bg-sky-50 p-3"><p className="text-2xl font-bold">{m.remapeados.length}</p><p className="text-xs">cambian de número</p></div>
          <div className="rounded-lg bg-amber-50 p-3"><p className="text-2xl font-bold">{m.nuevos.length}</p><p className="text-xs">son nuevos (piden evidencia)</p></div>
          <div className="rounded-lg bg-gray-50 p-3"><p className="text-2xl font-bold">{m.evidenciasVigentes.length}</p><p className="text-xs">evidencias aprobadas que siguen valiendo ({m.evidenciasARevisar.length} a revisar)</p></div>
        </div>
        <p className="mt-3 text-xs text-amber-800">{nota}</p>
      </Tarjeta>
      <div className="grid gap-4 md:grid-cols-2">
        <Tarjeta titulo="Lo nuevo">
          <ul className="space-y-2 text-sm" data-prueba="nuevos">{m.nuevos.map((id) => <li key={id}><span className="text-xs text-gray-500">{id}</span><br />{modo === 'pyme' ? requisito(id)?.sencillo : requisito(id)?.pregunta}</li>)}{!m.nuevos.length && <li className="text-gray-600">Nada nuevo en esa dirección.</li>}</ul>
        </Tarjeta>
        <Tarjeta titulo="Lo que cambia de número">
          <ul className="space-y-1 text-sm" data-prueba="remapeados">{m.remapeados.map((r) => <li key={r.id}>{requisito(r.id)?.tema}: <Insignia>{r.de}</Insignia> → <Insignia tono="azul">{r.a}</Insignia></li>)}</ul>
        </Tarjeta>
      </div>
    </>
  );
}
