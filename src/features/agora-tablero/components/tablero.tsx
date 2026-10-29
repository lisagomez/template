'use client';

/**
 * El tablero de un workspace: tabla, kanban y Gantt sobre los mismos ítems, con las propuestas de los agentes a la
 * vista («por aprobar», punteadas) y el editor del tipo de cada campo. Mover algo en el kanban o el Gantt es lo mismo
 * que editarlo: directo si tu rol lo permite, propuesta si no, y la base vuelve a decidir.
 */
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useCapa } from '../../../../tools/capa/dist/react/index.js';
import type { ItemTablero } from '../../../../tools/agora/dist/index.js';
import { editaCampo, proponeCambio } from '@/features/agora/services/acciones';
import { recuerdaPreferencia } from '@/features/agora/services/preferencias';
import { Avatar } from '@/features/agora/components/insignia';
import type { DatosDelTablero } from '../services/lecturas';
import { modoDe } from '../services/reglas';
import { Editor, type Resultado } from './editor';
import { Gantt, Kanban, Tabla, type Abre, type Mueve } from './vistas';

type Vista = 'tabla' | 'kanban' | 'gantt';
const VISTAS: Array<[Vista, string]> = [['tabla', 'Tabla'], ['kanban', 'Kanban'], ['gantt', 'Gantt']];

export function Tablero({ d, vista: inicial, cat }: { d: DatosDelTablero; vista: Vista; cat: string | null }) {
  const router = useRouter();
  const { memoria } = useCapa();
  const [vista, setVista] = useState<Vista>(inicial);
  const [abierto, setAbierto] = useState<{ item: ItemTablero; columna: string; x: number; y: number } | null>(null);
  const [aviso, setAviso] = useState<Resultado | null>(null);
  const [, empieza] = useTransition();
  const items = useMemo(() => (cat ? d.items.filter((i) => i.categoria === cat) : d.items), [d.items, cat]);
  const filtro = cat ? d.categorias.filter((c) => c.id === cat) : d.categorias;
  const datos = { ...d, categorias: filtro };
  const cambiaVista = (v: Vista) => {
    setVista(v);
    void recuerdaPreferencia(memoria, 'vista-tablero', v).catch(() => undefined);
    const u = new URL(window.location.href);
    u.searchParams.set('vista', v);
    window.history.replaceState(null, '', u.toString());
  };
  const abre: Abre = (item, columna, r) => setAbierto({ item, columna, x: Math.min(r.left, window.innerWidth - 330), y: Math.min(r.bottom + 4, window.innerHeight - 360) });
  const mueve: Mueve = (item, cambio) => empieza(async () => {
    const c = d.categorias.find((x) => x.id === item.categoria);
    const col = cambio.campo === 'estado' ? 'estado' : 'cronograma';
    const modo = modoDe(item, col, c, d.yo);
    if (modo.modo === 'no') { setAviso({ tono: 'mal', texto: `No te toca: ${modo.porque}.` }); return; }
    if (cambio.campo === 'estado') {
      const r = modo.modo === 'directo' ? await editaCampo({ item: item.id, campo: 'estado', valor: cambio.valor }) : null;
      setAviso(r?.ok ? { tono: 'bien', texto: `«${item.nombre}» pasó a ${cambio.valor}.` } : { tono: 'mal', texto: `La base no lo permitió: ${r ? (r as { motivo: string }).motivo : modo.modo === 'propuesta' ? modo.porque : ''}` });
      return;
    }
    if (modo.modo === 'directo') {
      let sucesores: string[] = [];
      for (const [campo, valor] of [['inicio', cambio.inicio], ['fin', cambio.fin]] as const) {
        if ((item as unknown as Record<string, unknown>)[campo] === valor) continue;
        const r = await editaCampo({ item: item.id, campo, valor });
        if (!r.ok) { setAviso({ tono: 'mal', texto: `La base no lo permitió: ${r.motivo}` }); return; }
        sucesores = (r.valor as { sucesores?: string[] | null }).sucesores ?? sucesores;
      }
      setAviso(sucesores.length ? { tono: 'propuesta', texto: `Moviste «${item.nombre}». El coordinador propuso mover ${sucesores.length} sucesor(es) que empezaban antes: están en su hilo.` } : { tono: 'bien', texto: `Moviste «${item.nombre}».` });
      return;
    }
    const r = await proponeCambio({ payload: { version: 1, clase: 'mover_fecha', categoria: item.categoria, cambios: [
      ...(cambio.inicio !== item.inicio ? [{ item: item.id, campo: 'inicio', antes: item.inicio, despues: cambio.inicio }] : []),
      { item: item.id, campo: 'fin', antes: item.fin, despues: cambio.fin }] }, resumen: `Mover «${item.nombre}» al ${cambio.fin}` });
    setAviso(!r.ok ? { tono: 'mal', texto: r.motivo } : r.valor.id ? { tono: 'propuesta', texto: 'Quedó como propuesta en su hilo: lo aprueba quien edita.' } : { tono: 'mal', texto: `El supervisor lo frenó: ${r.valor.veredicto.motivo}` });
  });
  const pendientes = d.propuestas.length;
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4" data-agora-tablero={d.workspace.id}>
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Workspace
            <select value={d.workspace.id} onChange={(e) => router.push(`/agora/tablero?ws=${e.target.value}&vista=${vista}`)} className="ml-2 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[12px] normal-case tracking-normal text-slate-800">
              {d.workspaces.map((w) => <option key={w.id} value={w.id}>{w.nombre}</option>)}
            </select>
          </label>
          <h1 className="text-xl font-semibold text-slate-900">{d.workspace.nombre}{cat ? <span className="text-slate-500"> › {filtro[0]?.nombre}</span> : null}</h1>
        </div>
        <div role="tablist" aria-label="Vista" className="ml-auto inline-flex overflow-hidden rounded-lg border border-slate-300">
          {VISTAS.map(([v, n]) => <button key={v} role="tab" type="button" aria-selected={vista === v} onClick={() => cambiaVista(v)} data-vista-boton={v} className={`px-3 py-1.5 text-[13px] ${vista === v ? 'bg-slate-900 font-semibold text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{n}</button>)}
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <button type="button" onClick={() => router.push(`/agora/tablero?ws=${d.workspace.id}&vista=${vista}`)} className={`rounded-full border px-2.5 py-0.5 ${!cat ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300'}`}>Todo</button>
        {d.categorias.map((c) => <button key={c.id} type="button" onClick={() => router.push(`/agora/tablero?ws=${d.workspace.id}&cat=${c.id}&vista=${vista}`)} className={`rounded-full border px-2.5 py-0.5 ${cat === c.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-700'}`}>{c.nombre}</button>)}
        <span className="ml-auto flex items-center gap-3 text-[11.5px] text-slate-500">
          <span className="flex items-center gap-1"><Avatar tipo="humano" iniciales="P" chico />persona</span>
          <span className="flex items-center gap-1"><Avatar tipo="interno" iniciales="A" chico />agente interno</span>
          <span className="flex items-center gap-1"><Avatar tipo="externo" iniciales="S" chico />socio externo</span>
          {pendientes ? <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800" data-pendientes-tablero={pendientes}>{pendientes} propuesta(s) de agentes por aprobar</span> : null}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {vista === 'tabla' ? <Tabla d={datos} items={items} abre={abre} /> : vista === 'kanban' ? <Kanban d={datos} items={items} abre={abre} mueve={mueve} /> : <Gantt d={datos} items={items} abre={abre} mueve={mueve} />}
      </div>
      {abierto ? <div className="fixed z-50" style={{ left: abierto.x, top: abierto.y }}><Editor item={abierto.item} columna={abierto.columna} d={d} cierra={() => setAbierto(null)} avisa={setAviso} /></div> : null}
      {aviso ? (
        <div role="status" data-aviso-tablero={aviso.tono} className={`fixed bottom-5 left-1/2 z-50 max-w-[560px] -translate-x-1/2 rounded-lg px-4 py-2.5 text-[13px] shadow-lg ${aviso.tono === 'bien' ? 'bg-slate-900 text-white' : aviso.tono === 'propuesta' ? 'bg-amber-600 text-white' : 'bg-rose-700 text-white'}`}>
          {aviso.texto} <button type="button" className="ml-2 underline" onClick={() => setAviso(null)}>cerrar</button>
        </div>
      ) : null}
    </div>
  );
}
