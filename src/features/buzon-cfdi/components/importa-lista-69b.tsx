'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Props { vigente: { fuente: string; actualizada_al: string; registros: number; descartados: number } | null }

/**
 * El listado 69-B del SAT: la máquina del despacho no sale a internet, así que el operador lo baja fuera y lo
 * importa aquí. La fecha la pone el propio listado; lo que no tiene RFC válido se cuenta, no se esconde.
 */
export function ImportaLista69B({ vigente }: Props) {
  const router = useRouter();
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);
  async function importar(form: FormData) {
    setEnviando(true);
    setAviso('');
    const r = await fetch('/api/buzon/lista-69b', { method: 'POST', body: form });
    const d = await r.json().catch(() => ({}));
    setEnviando(false);
    if (!r.ok) return setAviso(d.error ?? 'no se pudo importar');
    setAviso(`Importado: ${d.registros} registros, actualizado al ${d.actualizadaAl}${d.descartados ? `; ${d.descartados} fila(s) sin RFC válido, descartadas` : ''}.`);
    router.refresh();
  }
  return (
    <section className="space-y-2 rounded-xl bg-white p-4 shadow-sm" data-prueba="lista-69b">
      <h2 className="font-semibold">Listado 69-B del SAT</h2>
      {vigente
        ? <p className="text-sm text-gray-700" data-prueba="lista-vigente">Vigente: actualizado al {vigente.actualizada_al} · {vigente.registros} registros
            {vigente.descartados ? ` (${vigente.descartados} filas descartadas por RFC no válido)` : ''} · fuente: {vigente.fuente}</p>
        : <p className="text-sm text-amber-800">Sin listado importado: los CFDI no muestran banderas del SAT.</p>}
      <form action={importar} className="space-y-2 text-sm">
        <input type="file" name="archivo" accept=".csv" required className="block" data-prueba="lista-archivo" />
        <input name="fuente" required defaultValue="SAT, Listado completo del artículo 69-B del CFF (omawww.sat.gob.mx)" className="w-full rounded border px-2 py-1" data-prueba="lista-fuente" />
        <button disabled={enviando} className="rounded-lg bg-gray-900 px-3 py-1 text-white disabled:opacity-50" data-prueba="importar-lista">{enviando ? 'Importando…' : 'Importar listado'}</button>
      </form>
      {aviso && <p role="status" className="text-sm" data-prueba="lista-aviso">{aviso}</p>}
    </section>
  );
}
