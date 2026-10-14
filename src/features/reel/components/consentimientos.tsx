'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export interface ConsentimientoDeSala { id: string; alias: string; rol: string; alcance: string; vigenteHasta: string; retirado: boolean; vencido: boolean }

const CAMPO = 'w-full rounded-lg border border-gray-300 p-2 text-sm';

/**
 * Los consentimientos de quien sale o se oye (AISIA §7): se registran con el documento firmado y se retiran.
 * Retirar no borra la fila (queda constancia), borra el documento, revoca lo aprobado y dice la verdad: lo
 * publicado no se recupera, y su voz e imagen siguen en el clip original hasta borrar el proyecto.
 */
export function Consentimientos({ proyecto, lista }: { proyecto: string; lista: ConsentimientoDeSala[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function registra(form: HTMLFormElement) {
    setOcupado(true); setAviso(null);
    const r = await fetch(`/api/reel/${proyecto}/consentimientos`, { method: 'POST', body: new FormData(form) });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    setOcupado(false);
    if (!r.ok) { setAviso(j.error ?? 'No se pudo registrar'); return; }
    form.reset(); router.refresh();
  }
  async function retira(c: ConsentimientoDeSala) {
    if (!window.confirm(`¿Retirar el consentimiento de ${c.alias}? Se borra su documento y lo aprobado queda revocado.`)) return;
    setOcupado(true); setAviso(null);
    const r = await fetch(`/api/reel/${proyecto}/consentimientos`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ consentimiento: c.id }) });
    const j = (await r.json().catch(() => ({}))) as { aviso?: string; error?: string };
    setOcupado(false);
    setAviso([j.aviso, j.error].filter(Boolean).join(' ') || (r.ok ? null : 'No se pudo retirar'));
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-xl bg-white p-4 shadow-sm" data-prueba="consentimientos">
      <h2 className="font-semibold">Consentimientos</h2>
      <p className="text-xs text-gray-600">De cada persona que sale o se oye, además de ti, con su formato firmado. Menores, nunca.</p>
      <ul className="space-y-2 text-sm">
        {lista.map((c) => (
          <li key={c.id} className={`flex items-center justify-between gap-2 ${c.retirado || c.vencido ? 'text-gray-400' : ''}`}>
            <span>{c.alias} · {c.rol} · <span className="whitespace-nowrap">hasta {c.vigenteHasta}</span>{c.retirado ? ' · retirado' : ''}{c.vencido ? ' · vencido' : ''}</span>
            {!c.retirado && !c.vencido && <button type="button" className="rounded-lg border border-red-300 px-3 py-1 text-red-700" disabled={ocupado} data-prueba="retirar-consentimiento" onClick={() => void retira(c)}>Retirar</button>}
          </li>
        ))}
        {!lista.length && <li className="text-gray-500">Ninguno registrado.</li>}
      </ul>
      {lista.filter((c) => c.vencido).map((c) => <p key={c.id} className="rounded-lg bg-amber-50 p-2 text-xs" data-prueba="consentimiento-vencido">El consentimiento de {c.alias} venció el {c.vigenteHasta}: si el reel sigue publicado, bájalo de tus redes. Su documento se borra solo.</p>)}
      <form className="space-y-2" data-prueba="alta-consentimiento" onSubmit={(e) => { e.preventDefault(); void registra(e.currentTarget); }}>
        <input name="alias" required maxLength={60} placeholder="Alias (p. ej. «Empleada 1»; el nombre va en el documento)" className={CAMPO} />
        <select name="rol" className={CAMPO} defaultValue="empleado"><option value="empleado">Empleado</option><option value="cliente">Cliente</option></select>
        <input name="alcance" required maxLength={200} placeholder="Para qué video y qué redes" className={CAMPO} />
        <label className="block text-xs text-gray-600">Vigente hasta <input name="vigenteHasta" type="date" required className={CAMPO} /></label>
        <label className="block text-xs text-gray-600">Documento firmado <input name="documento" type="file" required className={CAMPO} /></label>
        <button type="submit" disabled={ocupado} className="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">Registrar consentimiento</button>
      </form>
      {ocupado && <p className="text-sm text-gray-700">Preparando la versión nueva en el servidor…</p>}
      {aviso && <p role="alert" className="text-sm text-red-700" data-prueba="aviso-consentimiento">{aviso}</p>}
    </section>
  );
}
