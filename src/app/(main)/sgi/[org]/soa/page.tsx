import { controlesAnexoA } from '../../../../../../tools/sistema-integrado/dist/catalogo/index.js';
import { contextoDePagina, type Busqueda } from '@/features/sgi/services/pagina';
import { Aviso, Insignia, Tarjeta } from '@/features/sgi/components/piezas';
import { PedirAgente, Fotografiar } from '@/features/sgi/components/boton-agente';

export const dynamic = 'force-dynamic';

export default async function Soa({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Busqueda }) {
  const { org } = await params;
  const { aviso, error } = await searchParams;
  const { sb, ctx, modo } = await contextoDePagina(org);
  const { data: filas } = await sb.from('sgi_control_soa').select('control, requisito_id, aplica, justificacion, estado_impl').eq('proyecto_id', ctx.proyecto?.id ?? '');
  const por = new Map((filas ?? []).map((f) => [String(f.requisito_id), f]));
  const decididos = (filas ?? []).length;
  return (
    <>
      <Aviso aviso={aviso} error={error} />
      <Tarjeta titulo={modo === 'pyme' ? 'Los cuidados de IA que sugiere la norma' : 'Declaración de aplicabilidad (Anexo A de ISO/IEC 42001)'} accion={<Insignia tono={decididos === 38 ? 'verde' : 'ambar'}>{decididos} de 38 decididos</Insignia>}>
        <p className="mb-3 text-sm text-gray-700">{modo === 'pyme' ? 'Para cada cuidado: sí o no, y por qué. Lo firma la alta dirección.' : 'Para cada control: si aplica, su justificación y su estado. Los que no aplican (con razón) salen del avance.'} El agente de riesgos e IA propone; la alta dirección aprueba la versión.</p>
        <div className="mb-3 flex flex-wrap gap-2">
          <PedirAgente org={org} que="soa" volver={`/sgi/${org}/soa`}>Proponer la SoA</PedirAgente>
          <Fotografiar org={org} foto="soa">SoA → versión para aprobar</Fotografiar>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-sm" data-prueba="soa">
          <thead><tr className="text-left text-xs text-gray-500"><th className="py-2">Control</th><th>Tema (paráfrasis propia)</th><th>¿Aplica?</th><th>Justificación</th><th>Estado</th></tr></thead>
          <tbody>{controlesAnexoA().map((c) => {
            const f = por.get(c.id);
            return (
              <tr key={c.id} className="border-t align-top">
                <td className="py-2 text-xs text-gray-600">{c.refs[0]!.clausula}</td>
                <td>{modo === 'pyme' ? c.sencillo : c.tema}</td>
                <td>{f ? <Insignia tono={f.aplica ? 'verde' : 'gris'}>{f.aplica ? 'Sí' : 'No'}</Insignia> : <Insignia tono="ambar">sin decidir</Insignia>}</td>
                <td className="text-xs text-gray-700">{f ? String(f.justificacion) : ''}</td>
                <td className="text-xs">{f ? String(f.estado_impl).replace('_', ' ') : ''}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </Tarjeta>
    </>
  );
}
