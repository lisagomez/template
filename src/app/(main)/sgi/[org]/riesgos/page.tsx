import { contextoDePagina, type Busqueda } from '@/features/sgi/services/pagina';
import { Aviso, Insignia, Tarjeta } from '@/features/sgi/components/piezas';
import { PedirAgente, Fotografiar } from '@/features/sgi/components/boton-agente';

export const dynamic = 'force-dynamic';

export default async function Riesgos({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Busqueda }) {
  const { org } = await params;
  const { aviso, error } = await searchParams;
  const { sb, ctx } = await contextoDePagina(org);
  const pid = ctx.proyecto?.id ?? '';
  const [{ data: rs }, { data: imp }] = await Promise.all([
    sb.from('sgi_riesgo').select('id, tipo, descripcion, probabilidad, impacto, nivel, tratamiento, sistema_ia_id, requisitos').eq('proyecto_id', pid).order('nivel', { ascending: false }),
    sb.from('sgi_evaluacion_impacto').select('sistema_ia_id, afectados, descripcion, severidad, medidas').eq('proyecto_id', pid),
  ]);
  const celda = (p: number, i: number) => (rs ?? []).filter((r) => r.probabilidad === p && r.impacto === i).length;
  const color = (n: number) => (n >= 15 ? 'bg-red-200' : n >= 8 ? 'bg-amber-200' : 'bg-emerald-100');
  const nombreIA = (id: unknown) => ctx.sistemasIA.find((s) => s.id === id)?.nombre ?? '';
  return (
    <>
      <Aviso aviso={aviso} error={error} />
      <div className="flex flex-wrap gap-2">
        <PedirAgente org={org} que="riesgos" volver={`/sgi/${org}/riesgos`}>Proponer riesgos (calidad e IA)</PedirAgente>
        {ctx.proyecto?.usa_ia && <PedirAgente org={org} que="impacto" volver={`/sgi/${org}/riesgos`}>Proponer evaluación de impacto de IA</PedirAgente>}
        <Fotografiar org={org} foto="riesgos">Matriz → versión para aprobar</Fotografiar>
        {ctx.proyecto?.usa_ia && <Fotografiar org={org} foto="evaluacion_impacto">Impacto → versión para aprobar</Fotografiar>}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Tarjeta titulo="Mapa de calor (probabilidad × impacto)">
          <table className="text-center text-xs" data-prueba="mapa-calor"><tbody>
            {[5, 4, 3, 2, 1].map((p) => <tr key={p}><th className="pr-2 text-gray-500">P{p}</th>{[1, 2, 3, 4, 5].map((i) => <td key={i} className={`h-9 w-9 rounded ${color(p * i)} font-semibold`}>{celda(p, i) || ''}</td>)}</tr>)}
            <tr><td />{[1, 2, 3, 4, 5].map((i) => <th key={i} className="pt-1 text-gray-500">I{i}</th>)}</tr>
          </tbody></table>
          <p className="mt-2 text-xs text-gray-500">La probabilidad y el impacto que propone un agente los confirma la persona responsable.</p>
        </Tarjeta>
        <div className="lg:col-span-2"><Tarjeta titulo={`Riesgos y oportunidades (${rs?.length ?? 0})`}>
          <ul className="space-y-2 text-sm" data-prueba="riesgos">{(rs ?? []).map((r) => (
            <li key={String(r.id)} className="rounded-lg bg-gray-50 p-2"><Insignia tono={r.tipo === 'oportunidad' ? 'verde' : r.tipo === 'riesgo_ia' ? 'azul' : 'ambar'}>{r.tipo === 'riesgo_ia' ? `riesgo de IA${r.sistema_ia_id ? ` · ${nombreIA(r.sistema_ia_id)}` : ''}` : String(r.tipo)}</Insignia> <strong>{String(r.nivel)}</strong> = {String(r.probabilidad)}×{String(r.impacto)} · {String(r.descripcion)}
              <p className="text-xs text-gray-600">Tratamiento: {String(r.tratamiento) || 'por definir'} · {((r.requisitos ?? []) as string[]).join(', ')}</p></li>
          ))}</ul>
        </Tarjeta></div>
      </div>
      {ctx.proyecto?.usa_ia && (
        <Tarjeta titulo="Evaluación de impacto de los sistemas de IA">
          <ul className="space-y-2 text-sm" data-prueba="impacto">{(imp ?? []).map((x, i) => (
            <li key={i} className="rounded-lg bg-gray-50 p-2"><p className="font-medium">{nombreIA(x.sistema_ia_id)} <Insignia tono={x.severidad === 'alta' ? 'rojo' : x.severidad === 'media' ? 'ambar' : 'verde'}>severidad {String(x.severidad)}</Insignia></p>
              <p className="text-xs">{String(x.descripcion)}</p><p className="text-xs text-gray-600">Afectados: {String(x.afectados)} · Medidas: {String(x.medidas)}</p></li>
          ))}{!imp?.length && <li className="text-gray-600">Aún no hay evaluaciones de impacto.</li>}</ul>
        </Tarjeta>
      )}
    </>
  );
}
