import { madurez, preguntasDiagnostico, type Respuesta } from '../../../../../../tools/sistema-integrado/dist/index.js';
import type { IdEdicion } from '../../../../../../tools/sistema-integrado/dist/catalogo/index.js';
import { contextoDePagina, type Busqueda } from '@/features/sgi/services/pagina';
import { generarInformeGap, guardarDiagnostico } from '@/features/sgi/services/acciones';
import { Aviso, Barra, Tarjeta } from '@/features/sgi/components/piezas';
import { Boton } from '@/features/sgi/components/boton';

export const dynamic = 'force-dynamic';
const OPCIONES: [Respuesta, string][] = [['si', 'Sí'], ['parcial', 'A medias'], ['no', 'No'], ['no-se', 'No sé']];

export default async function Diagnostico({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Busqueda }) {
  const { org } = await params;
  const { aviso, error } = await searchParams;
  const { ctx, modo } = await contextoDePagina(org);
  if (!ctx.proyecto) return null;
  const ed = ctx.proyecto.ediciones as IdEdicion[];
  const resp = ctx.proyecto.diagnostico as Record<string, Respuesta>;
  const preguntas = preguntasDiagnostico({ ediciones: ed, usaIA: ctx.proyecto.usa_ia, disena: ctx.proyecto.disena, respuestas: resp });
  const m = madurez(resp, ed);
  const porFase = new Map<number, typeof preguntas>();
  for (const p of preguntas) porFase.set(p.fase, [...(porFase.get(p.fase) ?? []), p]);
  return (
    <>
      <Aviso aviso={aviso} error={error} />
      <div className="grid gap-4 md:grid-cols-3">
        <Tarjeta titulo="Madurez (regla fija, 0 a 5)">
          <p className="text-3xl font-bold" data-prueba="madurez">{m.global} <span className="text-base font-normal text-gray-500">/ 5</span></p>
          <p className="mb-3 text-xs text-gray-600">{m.contestadas} de {preguntas.length} preguntas contestadas. Sí = 1, a medias = 0.5, no / no sé = 0. El puntaje lo calcula el motor, no un agente.</p>
          <div className="space-y-1">{Object.entries(m.porClausula).map(([k, v]) => <Barra key={k} pct={Math.round((v / 5) * 100)} etiqueta={`${k === 'Anexo A' ? 'Anexo A' : `Cláusula ${k}`}: ${v}`} />)}</div>
        </Tarjeta>
        <Tarjeta titulo="Informe de brechas (GAP)">
          <p className="mb-3 text-sm text-gray-700">El agente de diagnóstico redacta el informe con tus respuestas y el puntaje ya calculado. Cita solo requisitos del catálogo. Es un borrador: lo revisa y aprueba tu organización.</p>
          <form action={generarInformeGap.bind(null, org)}><Boton data-prueba="generar-gap" trabajando="Redactando el informe (30-60 s)…">Generar informe GAP</Boton></form>
          <p className="mt-2 text-xs text-gray-500">Adaptativo: {ctx.proyecto.usa_ia ? 'usa IA → incluye las preguntas de IA y del Anexo A' : 'no usa IA → sin preguntas de IA ni del Anexo A'}; {ctx.proyecto.disena ? 'diseña producto' : 'no diseña → sin preguntas de diseño'}.</p>
        </Tarjeta>
      </div>
      <form action={guardarDiagnostico.bind(null, org)} className="space-y-4" data-prueba="cuestionario">
        {[...porFase.entries()].map(([fase, ps]) => (
          <Tarjeta key={fase} titulo={`Fase ${fase}`}>
            <ol className="space-y-3">
              {ps.map((p) => (
                <li key={p.id} className="text-sm">
                  <p>{modo === 'pyme' ? p.sencillo : p.pregunta} <span className="text-xs text-gray-400">{p.id}</span></p>
                  <div className="mt-1 flex flex-wrap gap-3">{OPCIONES.map(([v, t]) => (
                    <label key={v} className="flex items-center gap-1 text-xs"><input type="radio" name={`r:${p.id}`} value={v} defaultChecked={resp[p.id] === v} />{t}</label>
                  ))}</div>
                </li>
              ))}
            </ol>
          </Tarjeta>
        ))}
        <div className="sticky bottom-2 flex items-center gap-3 rounded-xl bg-white p-3 shadow ring-1 ring-gray-200">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="completo" value="si" defaultChecked={ctx.proyecto.diagnostico_completo} />Diagnóstico completo</label>
          <Boton trabajando="Guardando…">Guardar respuestas</Boton>
        </div>
      </form>
    </>
  );
}
