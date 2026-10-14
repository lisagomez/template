import { requisito } from '../../../../../../tools/sistema-integrado/dist/catalogo/index.js';
import { contextoDePagina, type Busqueda } from '@/features/sgi/services/pagina';
import { agenteAuditoria, agregarAccion, crearNc, marcarHecha, marcarRealizada, nuevaAuditoria } from '@/features/sgi/services/acciones';
import { Aviso, Insignia, Tarjeta } from '@/features/sgi/components/piezas';
import { Boton } from '@/features/sgi/components/boton';
import { FormAprobar } from '@/features/sgi/components/aprobar';

export const dynamic = 'force-dynamic';

export default async function Auditoria({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Busqueda }) {
  const { org } = await params;
  const { aviso, error } = await searchParams;
  const { sb, ctx } = await contextoDePagina(org);
  const pid = ctx.proyecto?.id ?? '';
  const [{ data: auds }, { data: hs }, { data: ncs }, { data: acs }] = await Promise.all([
    sb.from('sgi_auditoria').select('id, tipo, alcance, fecha, estado, checklist').eq('proyecto_id', pid).order('fecha', { ascending: false }),
    sb.from('sgi_hallazgo').select('id, auditoria_id, requisito_id, clasificacion, descripcion, evidencia_observada, huella, estado').eq('organizacion_id', org).order('creado_en'),
    sb.from('sgi_no_conformidad').select('id, hallazgo_id, requisito_id, descripcion, correccion, causa, estado').eq('proyecto_id', pid).order('creado_en'),
    sb.from('sgi_accion_correctiva').select('id, no_conformidad_id, accion, responsable_puesto, vence, huella, estado').eq('organizacion_id', org).order('creado_en'),
  ]);
  const volver = `/sgi/${org}/auditoria`;
  return (
    <>
      <Aviso aviso={aviso} error={error} />
      <Tarjeta titulo="Programar una auditoría o un simulacro">
        <form action={nuevaAuditoria.bind(null, org)} className="flex flex-wrap items-end gap-2 text-sm">
          <select name="tipo" className="rounded border-gray-300"><option value="interna">Auditoría interna</option><option value="simulacro">Simulacro de auditoría de certificación</option></select>
          <input name="alcance" placeholder="Alcance" required className="flex-1 rounded border border-gray-300 px-2 py-1.5" />
          <input type="date" name="fecha" required className="rounded border border-gray-300 px-2 py-1.5" />
          <Boton>Programar</Boton>
        </form>
        <p className="mt-2 text-xs text-gray-500">El simulacro sigue las prácticas de auditoría de ISO 19011:2026 (guía). No sustituye la auditoría del organismo acreditado.</p>
      </Tarjeta>
      {(auds ?? []).map((a) => (
        <Tarjeta key={String(a.id)} titulo={`${a.tipo === 'simulacro' ? 'Simulacro' : 'Auditoría interna'} · ${String(a.fecha)}`} accion={<Insignia tono={a.estado === 'realizada' ? 'verde' : 'ambar'}>{String(a.estado)}</Insignia>}>
          <p className="text-sm text-gray-700">Alcance: {String(a.alcance)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={agenteAuditoria.bind(null, org)}><input type="hidden" name="auditoria" value={String(a.id)} /><Boton variante="secundario" data-prueba="agente-checklist" trabajando="Preparando (30-90 s)…">Lista de verificación y muestreo (agente)</Boton></form>
            {a.estado !== 'realizada' && <form action={marcarRealizada.bind(null, org)}><input type="hidden" name="auditoria" value={String(a.id)} /><Boton variante="secundario">Marcar realizada</Boton></form>}
          </div>
          {Array.isArray(a.checklist) && a.checklist.length > 0 && (
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm" data-prueba="checklist">{(a.checklist as { titulo: string; tipo: string; requisitos: string[] }[]).map((c, i) => <li key={i}>{c.titulo} <span className="text-xs text-gray-500">{c.tipo === 'muestra' ? '(muestra) ' : ''}{c.requisitos.join(', ')}</span></li>)}</ol>
          )}
          <form action={agenteAuditoria.bind(null, org)} className="mt-3 space-y-2">
            <input type="hidden" name="auditoria" value={String(a.id)} />
            <textarea name="notas" rows={2} placeholder="Notas del auditor (lo que viste): el agente las redacta como hallazgos en borrador" className="w-full rounded border border-gray-300 px-2 py-1 text-sm" data-prueba="notas" />
            <Boton variante="secundario" data-prueba="agente-hallazgos" trabajando="Redactando hallazgos…">Redactar hallazgos (agente)</Boton>
          </form>
          <ul className="mt-3 space-y-2" data-prueba="hallazgos">{(hs ?? []).filter((h) => h.auditoria_id === a.id).map((h) => (
            <li key={String(h.id)} className="rounded-lg bg-gray-50 p-3 text-sm">
              <p><Insignia tono={String(h.clasificacion).startsWith('no_conformidad') ? 'rojo' : 'ambar'}>{String(h.clasificacion).replaceAll('_', ' ')}</Insignia> <Insignia tono={h.estado === 'firmado' ? 'verde' : 'gris'}>{String(h.estado)}</Insignia> {String(h.descripcion)}</p>
              <p className="text-xs text-gray-600">{String(h.requisito_id)} · {requisito(String(h.requisito_id))?.tema} · Evidencia: {String(h.evidencia_observada)}</p>
              {h.estado === 'borrador' && <div className="mt-2"><FormAprobar org={org} tipo="hallazgo" objeto={String(h.id)} huella={String(h.huella)} roles={ctx.roles} volver={volver} etiqueta="Firmar hallazgo" /></div>}
              {h.estado === 'firmado' && String(h.clasificacion).startsWith('no_conformidad') && !(ncs ?? []).some((n) => n.hallazgo_id === h.id) && (
                <form action={crearNc.bind(null, org)} className="mt-2"><input type="hidden" name="hallazgo" value={String(h.id)} /><Boton variante="secundario" data-prueba="abrir-nc">Abrir no conformidad</Boton></form>
              )}
            </li>
          ))}</ul>
        </Tarjeta>
      ))}
      <Tarjeta titulo="No conformidades y acciones correctivas (CAPA)">
        <ul className="space-y-3" data-prueba="ncs">{(ncs ?? []).map((n) => (
          <li key={String(n.id)} className="rounded-lg bg-gray-50 p-3 text-sm">
            <p><Insignia tono={n.estado === 'cerrada' ? 'verde' : 'rojo'}>{String(n.estado).replace('_', ' ')}</Insignia> {String(n.descripcion)}</p>
            {n.causa && <p className="text-xs text-gray-600">Causa: {String(n.causa)}</p>}
            <ul className="mt-2 space-y-2">{(acs ?? []).filter((c) => c.no_conformidad_id === n.id).map((c) => (
              <li key={String(c.id)} className="rounded bg-white p-2">
                <p><Insignia tono={c.estado === 'eficaz' ? 'verde' : c.estado === 'no_eficaz' ? 'rojo' : 'ambar'}>{String(c.estado).replace('_', ' ')}</Insignia> {String(c.accion)} <span className="text-xs text-gray-500">· {String(c.responsable_puesto)} · vence {String(c.vence ?? '—')}</span></p>
                {c.estado === 'pendiente' && <form action={marcarHecha.bind(null, org)} className="mt-1"><input type="hidden" name="accion" value={String(c.id)} /><Boton variante="secundario">Marcar hecha</Boton></form>}
                {c.estado === 'hecha' && <div className="mt-1"><FormAprobar org={org} tipo="eficacia_accion" objeto={String(c.id)} huella={String(c.huella)} roles={ctx.roles} volver={volver} etiqueta="Verificar: fue eficaz" /></div>}
              </li>
            ))}</ul>
            {n.estado !== 'cerrada' && (
              <form action={agregarAccion.bind(null, org)} className="mt-2 flex flex-wrap gap-2">
                <input type="hidden" name="nc" value={String(n.id)} />
                <input name="accion" placeholder="Acción correctiva" className="flex-1 rounded border border-gray-300 px-2 py-1" />
                <input name="responsable" placeholder="Puesto responsable" className="rounded border border-gray-300 px-2 py-1" />
                <input type="date" name="vence" className="rounded border border-gray-300 px-2 py-1" />
                <Boton variante="secundario">Agregar acción</Boton>
              </form>
            )}
          </li>
        ))}{!ncs?.length && <li className="text-sm text-gray-600">Sin no conformidades.</li>}</ul>
      </Tarjeta>
    </>
  );
}
