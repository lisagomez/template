import { contextoDePagina, type Busqueda } from '@/features/sgi/services/pagina';
import { Aviso, Insignia, Tarjeta } from '@/features/sgi/components/piezas';
import { PedirAgente, Fotografiar } from '@/features/sgi/components/boton-agente';

export const dynamic = 'force-dynamic';

export default async function Kpis({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Busqueda }) {
  const { org } = await params;
  const { aviso, error } = await searchParams;
  const { sb, ctx } = await contextoDePagina(org);
  const pid = ctx.proyecto?.id ?? '';
  const [{ data: inds }, { data: meds }, { data: objs }] = await Promise.all([
    sb.from('sgi_indicador').select('id, nombre, formula, meta, unidad, sentido, frecuencia').eq('proyecto_id', pid).order('creado_en'),
    sb.from('sgi_medicion').select('indicador_id, periodo, valor').eq('organizacion_id', org).order('periodo'),
    sb.from('sgi_objetivo').select('descripcion, meta, plazo').eq('proyecto_id', pid),
  ]);
  return (
    <>
      <Aviso aviso={aviso} error={error} />
      <div className="flex flex-wrap gap-2">
        <PedirAgente org={org} que="kpis" volver={`/sgi/${org}/kpis`}>Proponer indicadores</PedirAgente>
        <Fotografiar org={org} foto="objetivos">Objetivos → versión para aprobar</Fotografiar>
      </div>
      <div className="grid gap-4 md:grid-cols-2" data-prueba="indicadores">
        {(inds ?? []).map((i) => {
          const serie = (meds ?? []).filter((m) => m.indicador_id === i.id).map((m) => ({ p: String(m.periodo), v: Number(m.valor) }));
          const ultimo = serie.at(-1)?.v;
          const cumple = ultimo === undefined ? null : i.sentido === 'menor' ? ultimo <= Number(i.meta) : ultimo >= Number(i.meta);
          const max = Math.max(Number(i.meta), ...serie.map((x) => x.v), 1);
          return (
            <Tarjeta key={String(i.id)} titulo={String(i.nombre)} accion={cumple === null ? <Insignia>sin datos</Insignia> : <Insignia tono={cumple ? 'verde' : 'rojo'}>{cumple ? 'en meta' : 'fuera de meta'}</Insignia>}>
              <p className="text-xs text-gray-600">{String(i.formula)} · meta {String(i.meta)} {String(i.unidad)} ({i.sentido === 'menor' ? 'menos es mejor' : 'más es mejor'}) · {String(i.frecuencia)}</p>
              <div className="mt-3 flex h-24 items-end gap-2">{serie.map((x) => (
                <div key={x.p} className="flex flex-1 flex-col items-center gap-1"><span className="text-[10px] tabular-nums">{x.v}</span><div className="w-full rounded-t" style={{ height: `${(x.v / max) * 70}px`, background: 'var(--sgi-primario)' }} /><span className="text-[10px] text-gray-500">{x.p.slice(5)}</span></div>
              ))}</div>
            </Tarjeta>
          );
        })}
      </div>
      <Tarjeta titulo="Objetivos">
        <ul className="space-y-1 text-sm">{(objs ?? []).map((o, i) => <li key={i}>· {String(o.descripcion)} — meta: {String(o.meta)}{o.plazo ? ` (para ${String(o.plazo)})` : ''}</li>)}{!objs?.length && <li className="text-gray-600">Aún no hay objetivos.</li>}</ul>
      </Tarjeta>
    </>
  );
}
