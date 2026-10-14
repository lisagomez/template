import { requisitosDe, requisito, edicionesDe, type IdEdicion } from '../../../../../../tools/sistema-integrado/dist/catalogo/index.js';
import { tieneInstruccionIncrustada } from '../../../../../../tools/sistema-integrado/dist/agentes/index.js';
import { contextoDePagina, type Busqueda } from '@/features/sgi/services/pagina';
import { subirEvidencia } from '@/features/sgi/services/acciones';
import { Aviso, Insignia, Tarjeta } from '@/features/sgi/components/piezas';
import { Boton } from '@/features/sgi/components/boton';
import { FormAprobar } from '@/features/sgi/components/aprobar';
import { EDICION } from '@/features/sgi/components/textos';

export const dynamic = 'force-dynamic';

export default async function Evidencias({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Busqueda }) {
  const { org } = await params;
  const { aviso, error } = await searchParams;
  const { sb, ctx, modo } = await contextoDePagina(org);
  const pid = ctx.proyecto?.id ?? '';
  const [{ data: evs }, { data: est }, { data: vin }] = await Promise.all([
    sb.from('sgi_evidencia').select('id, titulo, tipo, contenido, huella, origen, creado_en').eq('proyecto_id', pid).order('creado_en', { ascending: false }),
    sb.from('sgi_evidencia_estado').select('id, aprobada').eq('proyecto_id', pid),
    sb.from('sgi_evidencia_requisito').select('evidencia_id, requisito_id').eq('organizacion_id', org),
  ]);
  const aprobada = new Map((est ?? []).map((x) => [String(x.id), Boolean(x.aprobada)]));
  const reqs = (id: string) => (vin ?? []).filter((x) => x.evidencia_id === id).map((x) => String(x.requisito_id));
  const aplicables = requisitosDe((ctx.proyecto?.ediciones ?? []) as IdEdicion[]);
  return (
    <>
      <Aviso aviso={aviso} error={error} />
      <Tarjeta titulo="Evidencias (una puede cubrir las dos normas)">
        <ul className="space-y-3" data-prueba="evidencias">{(evs ?? []).map((e) => {
          const rs = reqs(String(e.id));
          const normas = [...new Set(rs.flatMap((id) => { const r = requisito(id); return r ? edicionesDe(r) : []; }))].filter((ed) => ctx.proyecto?.ediciones.includes(ed));
          const ok = aprobada.get(String(e.id));
          return (
            <li key={String(e.id)} className="rounded-xl bg-gray-50 p-3" data-prueba={`evidencia-${String(e.titulo)}`}>
              <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{String(e.titulo)}</p><Insignia tono={ok ? 'verde' : 'ambar'}>{ok ? 'Aprobada' : 'Propuesta'}</Insignia>
                {normas.map((n) => <Insignia key={n} tono="azul">{EDICION[n]}</Insignia>)}
                {tieneInstruccionIncrustada(String(e.contenido)) && <Insignia tono="rojo">trae instrucciones escondidas: se trata como dato</Insignia>}</div>
              <p className="mt-1 line-clamp-3 text-xs text-gray-700">{String(e.contenido)}</p>
              <p className="mt-1 text-xs text-gray-500">{rs.map((id) => (modo === 'pyme' ? `${requisito(id)?.tema} (${id})` : id)).join(' · ')}</p>
              {!ok && e.origen === 'subida' && <div className="mt-2"><FormAprobar org={org} tipo="evidencia" objeto={String(e.id)} huella={String(e.huella)} roles={ctx.roles} volver={`/sgi/${org}/evidencias`} /></div>}
            </li>
          );
        })}</ul>
      </Tarjeta>
      <Tarjeta titulo="Registrar una evidencia">
        <form action={subirEvidencia.bind(null, org)} className="grid gap-2 text-sm md:grid-cols-2" data-prueba="form-evidencia">
          <label>Título<input name="titulo" required className="mt-1 w-full rounded border border-gray-300 px-2 py-1" /></label>
          <label>Tipo<select name="tipo" className="mt-1 w-full rounded border-gray-300"><option value="registro">Registro</option><option value="acta">Acta</option><option value="documento">Documento</option><option value="foto">Foto (descripción)</option><option value="otro">Otro</option></select></label>
          <label className="md:col-span-2">Contenido (texto; los archivos llegan en una fase posterior)<textarea name="contenido" rows={4} className="mt-1 w-full rounded border border-gray-300 px-2 py-1" /></label>
          <label className="md:col-span-2">Requisitos que cubre<select name="requisitos" multiple size={8} className="mt-1 w-full rounded border-gray-300 text-xs">{aplicables.map((r) => <option key={r.id} value={r.id}>{r.id} · {r.tema}</option>)}</select></label>
          <div><Boton>Registrar evidencia</Boton></div>
        </form>
      </Tarjeta>
    </>
  );
}
