'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { EstadoDelPiloto } from '@/features/buzon-cfdi/services/cierre';

/**
 * Parar y cerrar el piloto. Parar se puede siempre (RF-25). Cerrar borra todo lo que el piloto generó (RF-27): antes
 * hay que descargar las cifras, porque después ya no hay de dónde sacarlas (RF-30).
 */
export function CierrePiloto({ estado }: { estado: EstadoDelPiloto }) {
  const router = useRouter();
  const [aviso, setAviso] = useState('');
  const [descargadas, setDescargadas] = useState(false);
  async function avanza(accion: 'parar' | 'cerrar', pregunta: string) {
    if (!window.confirm(pregunta)) return;
    const r = await fetch('/api/buzon/piloto', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setAviso(d.error ?? 'no se pudo');
    router.refresh();
  }
  if (estado === 'activo') {
    return (
      <div className="space-y-2" data-prueba="cierre-activo">
        <p className="text-sm">Parar el piloto deja de recibir documentos. Lo que no esté confirmado vuelve a captura manual con una lista: ningún CFDI se pierde.</p>
        <button onClick={() => avanza('parar', '¿Parar el piloto? Ya no entrará ningún documento nuevo.')} className="rounded-lg border border-amber-400 px-4 py-2 text-amber-900" data-prueba="parar">Parar el piloto</button>
        {aviso && <p role="alert" className="text-sm text-red-700">{aviso}</p>}
      </div>
    );
  }
  if (estado === 'parado') {
    return (
      <div className="space-y-2" data-prueba="cierre-parado">
        <p className="text-sm">El piloto está parado. Antes de cerrar, descarga las dos cosas: al cerrar se borra todo lo que el piloto generó.</p>
        <div className="flex flex-wrap gap-2 text-sm">
          <a href="/api/buzon/pendientes" className="rounded-lg border px-3 py-1" data-prueba="descargar-pendientes">Lista para captura manual (CSV)</a>
          <a href="/api/buzon/cifras" className="rounded-lg border px-3 py-1" data-prueba="descargar-cifras">Cifras para el laboratorio (CSV)</a>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={descargadas} onChange={(e) => setDescargadas(e.target.checked)} data-prueba="ya-descargue" />
          Ya descargué la lista y las cifras.
        </label>
        <button disabled={!descargadas} onClick={() => avanza('cerrar', 'Cerrar borra pymes, consentimientos, lecturas, horas y listados. No se puede deshacer. ¿Cerrar?')}
          className="rounded-lg bg-red-700 px-4 py-2 text-white disabled:opacity-40" data-prueba="cerrar">Cerrar el piloto y borrar todo</button>
        {aviso && <p role="alert" className="text-sm text-red-700">{aviso}</p>}
      </div>
    );
  }
  return null;
}
