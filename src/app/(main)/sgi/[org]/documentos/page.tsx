import Link from 'next/link';
import { contextoDePagina, type Busqueda } from '@/features/sgi/services/pagina';
import { redactarDocumento } from '@/features/sgi/services/acciones';
import { Aviso, Insignia, Tarjeta } from '@/features/sgi/components/piezas';
import { Boton } from '@/features/sgi/components/boton';
import { ESTADO_DOC } from '@/features/sgi/components/textos';

export const dynamic = 'force-dynamic';

/** Pedidos frecuentes al agente documental, con los requisitos que atiende cada documento. */
const PEDIDOS = [
  { tipo: 'politica', titulo: 'Política de IA', requisitos: 'SGI-C-5.2-01 SGI-IA-5.2-03 SGI-A-2.2-01 SGI-A-2.3-01 SGI-A-9.2-01', ia: true },
  { tipo: 'procedimiento', titulo: 'Procedimiento de control de documentos', requisitos: 'SGI-C-7.5-01 SGI-C-7.5-02 SGI-C-7.5-03', ia: false },
  { tipo: 'procedimiento', titulo: 'Procedimiento de producto no conforme', requisitos: 'SGI-Q-8.7-01 SGI-C-10.2-01', ia: false },
  { tipo: 'procedimiento', titulo: 'Procedimiento de uso responsable de los sistemas de IA', requisitos: 'SGI-A-9.2-01 SGI-A-9.4-01 SGI-A-8.2-01 SGI-A-6.2.6-01', ia: true },
];

export default async function Documentos({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Busqueda }) {
  const { org } = await params;
  const { aviso, error } = await searchParams;
  const { sb, ctx } = await contextoDePagina(org);
  const { data: docs } = await sb.from('sgi_documento').select('id, tipo, titulo, requisitos, sgi_documento_version(id, numero, estado, generico, creado_en)').eq('proyecto_id', ctx.proyecto?.id ?? '').order('creado_en', { ascending: false });
  return (
    <>
      <Aviso aviso={aviso} error={error} />
      <Tarjeta titulo="Pedir un borrador al agente documental">
        <p className="mb-3 text-sm text-gray-700">El agente redacta con los datos de {ctx.org.nombre} (procesos, productos, puestos, sistemas de IA). Si el borrador sale genérico, no pasa a revisión.</p>
        <div className="grid gap-2 md:grid-cols-2">
          {PEDIDOS.filter((p) => ctx.proyecto?.usa_ia || !p.ia).map((p) => (
            <form key={p.titulo} action={redactarDocumento.bind(null, org)} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 p-3">
              <input type="hidden" name="tipo" value={p.tipo} /><input type="hidden" name="titulo" value={p.titulo} /><input type="hidden" name="requisitos" value={p.requisitos} />
              <span className="text-sm">{p.titulo}<br /><span className="text-xs text-gray-500">{p.requisitos}</span></span>
              <Boton data-prueba={`redactar-${p.titulo}`} trabajando="Redactando (30-60 s)…">Redactar</Boton>
            </form>
          ))}
        </div>
      </Tarjeta>
      <Tarjeta titulo="Documentos del sistema">
        <table className="w-full text-sm" data-prueba="documentos"><thead><tr className="text-left text-xs text-gray-500"><th className="py-2">Documento</th><th>Tipo</th><th>Versiones</th><th>Requisitos</th></tr></thead>
          <tbody>{(docs ?? []).map((d) => {
            const vs = ((d.sgi_documento_version ?? []) as { id: string; numero: number; estado: string; generico: boolean }[]).sort((a, b) => b.numero - a.numero);
            return (
              <tr key={String(d.id)} className="border-t align-top">
                <td className="py-2 font-medium">{String(d.titulo)}</td><td className="text-xs">{String(d.tipo)}</td>
                <td className="space-x-1">{vs.map((v) => <Link key={v.id} href={`/sgi/${org}/documentos/${v.id}`}><Insignia tono={v.estado === 'aprobado' ? 'verde' : v.generico ? 'rojo' : v.estado === 'en_revision' ? 'ambar' : 'gris'}>v{v.numero} · {v.generico ? 'genérico' : ESTADO_DOC[v.estado]}</Insignia></Link>)}</td>
                <td className="text-xs text-gray-600">{((d.requisitos ?? []) as string[]).join(', ')}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </Tarjeta>
    </>
  );
}
