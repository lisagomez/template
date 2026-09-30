import Link from 'next/link';
import { avance, puerta, FASES, faseActual, ROL_CIERRE } from '../../../../../tools/sistema-integrado/dist/index.js';
import { planDeTareas, AGENTES } from '../../../../../tools/sistema-integrado/dist/agentes/index.js';
import { requisito } from '../../../../../tools/sistema-integrado/dist/catalogo/index.js';
import { contextoDePagina, type Busqueda } from '@/features/sgi/services/pagina';
import { cerrarFase } from '@/features/sgi/services/acciones';
import { Aviso, Barra, Insignia, Tarjeta } from '@/features/sgi/components/piezas';
import { Boton } from '@/features/sgi/components/boton';
import { nombreFase, nombreEdicion, ROL } from '@/features/sgi/components/textos';

export const dynamic = 'force-dynamic';

export default async function Roadmap({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Busqueda }) {
  const { org } = await params;
  const { aviso, error } = await searchParams;
  const { sb, ctx, modo } = await contextoDePagina(org);
  if (!ctx.proyecto || !ctx.estado) return <Tarjeta titulo="Sin proyecto">Esta organización todavía no tiene proyecto.</Tarjeta>;
  const a = avance(ctx.estado);
  const actual = faseActual(ctx.estado);
  const { data: tareas } = await sb.from('sgi_tarea').select('titulo, vence, hecha, requisitos').eq('proyecto_id', ctx.proyecto.id);
  const plan = planDeTareas(ctx.estado, (tareas ?? []).map((t) => ({ titulo: String(t.titulo), vence: String(t.vence ?? '9999-12-31'), hecha: Boolean(t.hecha) })), new Date().toISOString().slice(0, 10));
  return (
    <>
      <Aviso aviso={aviso} error={error} />
      <div className="grid gap-4 md:grid-cols-3">
        <Tarjeta titulo={modo === 'pyme' ? '¿Cuánto llevamos?' : 'Avance'}>
          <div className="space-y-3" data-prueba="avance">
            <Barra pct={a.global.pct} etiqueta={modo === 'pyme' ? 'Todo el sistema' : 'Global'} />
            {Object.entries(a.porNorma).map(([ed, p]) => <Barra key={ed} pct={p.pct} etiqueta={nombreEdicion(ed, modo)} color="var(--sgi-acento)" />)}
            <p className="text-xs text-gray-500">{a.global.cubiertos} de {a.global.total} requisitos con evidencia aprobada. Los requisitos comunes a las dos normas cuentan una vez en el global y en cada norma.</p>
          </div>
        </Tarjeta>
        <Tarjeta titulo={modo === 'pyme' ? 'Por tema' : 'Por cláusula'}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2" data-prueba="por-clausula">
            {Object.entries(a.porClausula).map(([ed, cl]) => (
              <div key={ed} className="space-y-1">
                <p className="text-xs font-semibold text-gray-700">{nombreEdicion(ed, modo)}</p>
                {cl.map((c) => <Barra key={c.clausula} pct={c.pct} etiqueta={c.clausula === 'Anexo A' ? 'Anexo A' : `${modo === 'pyme' ? 'Tema' : 'Cl.'} ${c.clausula}`} />)}
              </div>
            ))}
          </div>
        </Tarjeta>
        <Tarjeta titulo={modo === 'pyme' ? 'Lo que sigue' : `Orquestador · fase ${plan.fase}`}>
          <p className="mb-2 text-xs text-gray-600">{AGENTES.orquestador.descripcion}</p>
          <ul className="space-y-2 text-sm" data-prueba="plan">
            {plan.tareas.slice(0, 6).map((t) => (
              <li key={t.requisito} className="rounded-lg bg-gray-50 p-2">
                <p className="font-medium">{modo === 'pyme' ? requisito(t.requisito)?.sencillo : t.tema}</p>
                <p className="text-xs text-gray-600">{t.requisito} · agente sugerido: {AGENTES[t.agente].nombre}</p>
              </li>
            ))}
            {!plan.tareas.length && <li className="text-gray-600">Nada pendiente en los obligatorios de esta fase.</li>}
          </ul>
          {plan.recordatorios.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs" data-prueba="recordatorios">
              {plan.recordatorios.map((r) => <li key={r.titulo}><Insignia tono={r.estado === 'vencida' ? 'rojo' : 'ambar'}>{r.estado === 'vencida' ? 'Vencida' : 'Por vencer'}</Insignia> {r.titulo} · {r.vence}</li>)}
            </ul>
          )}
        </Tarjeta>
      </div>
      <Tarjeta titulo={modo === 'pyme' ? 'El camino, paso a paso' : 'Roadmap: 9 fases con puerta'}>
        <ol className="grid gap-3 md:grid-cols-3" data-prueba="roadmap">
          {FASES.map((f) => {
            const p = puerta(ctx.estado!, f);
            const pf = a.porFase[f];
            const estado = p.cerrada ? 'cerrada' : f === actual ? 'actual' : f < actual ? 'abierta' : 'pendiente';
            return (
              <li key={f} className={`rounded-xl p-4 ring-1 ${estado === 'actual' ? 'bg-amber-50 ring-amber-300' : estado === 'cerrada' ? 'bg-emerald-50 ring-emerald-200' : 'bg-white ring-gray-200'}`} data-prueba={`fase-${f}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{f}. {nombreFase(f, modo)}</p>
                  <Insignia tono={estado === 'cerrada' ? 'verde' : estado === 'actual' ? 'ambar' : 'gris'}>{estado === 'cerrada' ? 'Puerta cerrada' : estado === 'actual' ? 'En curso' : 'Pendiente'}</Insignia>
                </div>
                {pf.total > 0 && <div className="mt-2"><Barra pct={pf.pct} /></div>}
                {!p.cerrada && f === actual && (
                  <div className="mt-3 space-y-2 text-xs">
                    <p className="font-medium text-gray-700">{p.puedeCerrarse ? 'La puerta puede cerrarse.' : `Falta${p.faltan.length === 1 ? '' : 'n'} ${p.faltan.length}:`}</p>
                    <ul className="space-y-1" data-prueba="faltan">{p.faltan.slice(0, 5).map((x) => <li key={x.id}>· {modo === 'pyme' && x.tipo === 'requisito' ? requisito(x.id)?.sencillo : x.motivo} <span className="text-gray-500">{x.tipo === 'requisito' ? x.id : ''}</span></li>)}</ul>
                    <form action={cerrarFase.bind(null, org)} className="flex items-center gap-2">
                      <input type="hidden" name="fase" value={f} />
                      <input type="hidden" name="rol" value={ROL_CIERRE[f]} />
                      <Boton variante="secundario" data-prueba={`cerrar-fase-${f}`} trabajando="Cerrando…">Cerrar puerta ({ROL[ROL_CIERRE[f]]})</Boton>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </Tarjeta>
      <p className="text-xs text-gray-500">¿Quieres ver cómo cambia el sistema con la edición nueva de 9001? <Link className="underline" href={`/sgi/${org}/migracion`}>Migración de edición</Link></p>
    </>
  );
}
