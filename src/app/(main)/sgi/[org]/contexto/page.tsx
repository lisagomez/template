import { contextoDePagina, type Busqueda } from '@/features/sgi/services/pagina';
import { Aviso, Insignia, Tarjeta } from '@/features/sgi/components/piezas';
import { PedirAgente, Fotografiar } from '@/features/sgi/components/boton-agente';

export const dynamic = 'force-dynamic';
const PAPEL: Record<string, string> = { desarrolla: 'La desarrolla', provee: 'La ofrece a otros', usa: 'La usa', integra: 'La integra en su operación' };

export default async function Contexto({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Busqueda }) {
  const { org } = await params;
  const { aviso, error } = await searchParams;
  const { sb, ctx } = await contextoDePagina(org);
  const pid = ctx.proyecto?.id ?? '';
  const [{ data: asuntos }, { data: partes }] = await Promise.all([
    sb.from('sgi_asunto').select('tipo, categoria, descripcion, efecto').eq('proyecto_id', pid).order('creado_en'),
    sb.from('sgi_parte_interesada').select('nombre, necesidades, se_atiende').eq('proyecto_id', pid).order('creado_en'),
  ]);
  const perfil = ctx.org.perfil as Record<string, string[]>;
  return (
    <>
      <Aviso aviso={aviso} error={error} />
      <div className="flex flex-wrap gap-2">
        <PedirAgente org={org} que="contexto" volver={`/sgi/${org}/contexto`}>Proponer contexto y partes interesadas</PedirAgente>
        <Fotografiar org={org} foto="contexto">Preparar versión para aprobar</Fotografiar>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Tarjeta titulo="Perfil de la empresa (lo que usan los agentes)">
          <dl className="space-y-1 text-sm">{['procesos', 'productos', 'puestos', 'clientesTipo', 'proveedoresClave'].map((k) => perfil[k]?.length ? <div key={k}><dt className="inline font-semibold">{k}:</dt> <dd className="inline">{perfil[k]!.join(', ')}</dd></div> : null)}</dl>
          <p className="mt-2 text-xs text-gray-500">Puestos, nunca nombres de personas: así los datos de empleados no salen hacia el proveedor del modelo.</p>
        </Tarjeta>
        {ctx.proyecto?.usa_ia && (
          <Tarjeta titulo={`Inventario de sistemas de IA (${ctx.sistemasIA.length})`}>
            <ul className="space-y-2 text-sm" data-prueba="inventario-ia">{ctx.sistemasIA.map((s) => (
              <li key={s.id} className="rounded-lg bg-gray-50 p-2"><p className="font-medium">{s.nombre} <Insignia tono="azul">{PAPEL[s.papel] ?? s.papel}</Insignia> <Insignia>{s.estado_ciclo}</Insignia></p>
                <p className="text-xs text-gray-700">{s.proposito}</p><p className="text-xs text-gray-500">Proveedor: {s.proveedor ?? '—'} · Datos: {s.datos}</p></li>
            ))}</ul>
          </Tarjeta>
        )}
        <Tarjeta titulo="Asuntos internos y externos">
          <ul className="space-y-1 text-sm" data-prueba="asuntos">{(asuntos ?? []).map((a, i) => <li key={i}><Insignia tono={a.efecto === 'positivo' ? 'verde' : 'ambar'}>{String(a.tipo)}</Insignia> {String(a.descripcion)}</li>)}{!asuntos?.length && <li className="text-gray-600">Aún no hay asuntos registrados.</li>}</ul>
        </Tarjeta>
        <Tarjeta titulo="Partes interesadas">
          <ul className="space-y-1 text-sm" data-prueba="partes">{(partes ?? []).map((p, i) => <li key={i}><span className="font-medium">{String(p.nombre)}:</span> {String(p.necesidades)}</li>)}{!partes?.length && <li className="text-gray-600">Aún no hay partes interesadas.</li>}</ul>
        </Tarjeta>
      </div>
    </>
  );
}
