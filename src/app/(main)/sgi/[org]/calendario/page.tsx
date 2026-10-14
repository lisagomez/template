import { contextoDePagina } from '@/features/sgi/services/pagina';
import { Insignia, Tarjeta } from '@/features/sgi/components/piezas';

export const dynamic = 'force-dynamic';

export default async function Calendario({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { sb, ctx } = await contextoDePagina(org);
  const pid = ctx.proyecto?.id ?? '';
  const [{ data: t }, { data: a }, { data: p }, { data: c }] = await Promise.all([
    sb.from('sgi_tarea').select('titulo, vence, hecha, responsable_puesto').eq('proyecto_id', pid),
    sb.from('sgi_auditoria').select('tipo, fecha, estado, alcance').eq('proyecto_id', pid),
    sb.from('sgi_proveedor').select('nombre, reevaluar_en').eq('organizacion_id', org).not('reevaluar_en', 'is', null),
    sb.from('sgi_accion_correctiva').select('accion, vence, estado').eq('organizacion_id', org).not('vence', 'is', null),
  ]);
  const hoy = new Date().toISOString().slice(0, 10);
  const eventos = [
    ...(t ?? []).filter((x) => x.vence).map((x) => ({ fecha: String(x.vence), que: String(x.titulo), tipo: 'Tarea', hecho: Boolean(x.hecha), quien: String(x.responsable_puesto ?? '') })),
    ...(a ?? []).map((x) => ({ fecha: String(x.fecha), que: `${x.tipo === 'simulacro' ? 'Simulacro' : 'Auditoría interna'}: ${String(x.alcance)}`, tipo: 'Auditoría', hecho: x.estado === 'realizada', quien: '' })),
    ...(p ?? []).map((x) => ({ fecha: String(x.reevaluar_en), que: `Reevaluar a ${String(x.nombre)}`, tipo: 'Proveedor', hecho: false, quien: '' })),
    ...(c ?? []).map((x) => ({ fecha: String(x.vence), que: `Acción correctiva: ${String(x.accion)}`, tipo: 'CAPA', hecho: x.estado === 'eficaz', quien: '' })),
  ].sort((x, y) => x.fecha.localeCompare(y.fecha));
  return (
    <Tarjeta titulo="Calendario: auditorías, revisiones y vencimientos">
      <ul className="divide-y text-sm" data-prueba="calendario">{eventos.map((e, i) => (
        <li key={i} className="flex items-center gap-3 py-2">
          <span className="w-24 tabular-nums text-gray-600">{e.fecha}</span><Insignia tono="azul">{e.tipo}</Insignia>
          <span className="flex-1">{e.que}{e.quien ? <span className="text-xs text-gray-500"> · {e.quien}</span> : null}</span>
          {e.hecho ? <Insignia tono="verde">hecho</Insignia> : e.fecha < hoy ? <Insignia tono="rojo">vencido</Insignia> : null}
        </li>
      ))}</ul>
      <p className="mt-2 text-xs text-gray-500">No se envían correos ni invitaciones: conectar un calendario o el correo es una fase aparte que firma el laboratorio.</p>
    </Tarjeta>
  );
}
