'use client';

/** «Ver como»: en el LABORATORIO se elige una persona ficticia para probar cada rol. En producción es la sesión. */
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { cambiaPersona } from '../services/acciones';
import { useAgora } from './contexto';

export function VerComo() {
  const datos = useAgora();
  const router = useRouter();
  const [ocupado, empieza] = useTransition();
  if (datos.apagada) return null;
  return (
    <label className="flex items-center gap-2 text-xs text-slate-600" data-agora-ver-como>
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">Laboratorio · datos ficticios</span>
      <span>Ver como</span>
      <select className="max-w-[230px] rounded border border-slate-300 bg-white px-1.5 py-1 text-xs" value={datos.persona} disabled={ocupado} aria-label="Ver como"
        onChange={(e) => { const clave = e.target.value; empieza(async () => { await cambiaPersona(clave); router.refresh() }) }}>
        {datos.personas.map((p) => <option key={p.clave} value={p.clave}>{p.nombre} — {p.titulo}</option>)}
      </select>
    </label>
  );
}
