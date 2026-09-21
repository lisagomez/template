'use client';

/** Exportar lo que se ve (Markdown, CSV, JSON) y borrar por rango con doble confirmacion. */
import { useState } from 'react';
import { exportaArchivo } from '../services/cliente.ts';
import type { Formato } from '../services/exporta.ts';
import type { Filtros } from '../services/tipos.ts';

const boton = 'rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800';

export function Herramientas({ token, filtros, hoy, alBorrarAnteriores, alAviso, alError }: { token: string; filtros: Filtros; hoy: string; alBorrarAnteriores: (antesDe: string) => Promise<number>; alAviso: (t: string) => void; alError: (t: string) => void }) {
  const [antesDe, setAntesDe] = useState('');
  const [paso, setPaso] = useState<0 | 1 | 2>(0);
  const [exportando, setExportando] = useState<Formato | undefined>(undefined);
  const [ultimaExportacion, setUltimaExportacion] = useState<string | undefined>(undefined);

  const exporta = async (formato: Formato) => {
    setExportando(formato);
    try {
      const { blob, nombre, entradas } = await exportaArchivo(token, filtros, formato, hoy);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      a.click();
      URL.revokeObjectURL(url);
      setUltimaExportacion(`${nombre} · ${entradas} dictados · ${(blob.size / 1024).toFixed(1)} KB`);
      alAviso('Archivo descargado');
    } catch (e) {
      alError(e instanceof Error ? e.message : 'no se pudo exportar');
    } finally {
      setExportando(undefined);
    }
  };

  return (
    <section className="grid gap-4 md:grid-cols-2" data-prueba="herramientas">
      <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
        <h3 className="text-sm font-semibold">Sacar en un archivo</h3>
        <p className="text-xs text-neutral-500">Lo que se ve ahora (con los filtros puestos). Nada sale de esta computadora: es una descarga.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(['md', 'csv', 'json'] as const).map((f) => (
            <button key={f} type="button" onClick={() => void exporta(f)} disabled={exportando !== undefined} className={boton} data-prueba={`exporta-${f}`}>
              {exportando === f ? 'Preparando…' : f === 'md' ? 'Markdown' : f.toUpperCase()}
            </button>
          ))}
        </div>
        {ultimaExportacion ? <p className="mt-2 text-xs text-neutral-500" data-prueba="exportado">{ultimaExportacion}</p> : null}
      </div>
      <div className="rounded-xl border border-red-200 p-3 dark:border-red-900" data-prueba="borrar-rango">
        <h3 className="text-sm font-semibold">Borrar lo anterior a un día</h3>
        <p className="text-xs text-neutral-500">Igual que <code>dictado historial --borra --antes</code>. No se puede deshacer: se pide dos veces.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input type="date" value={antesDe} onChange={(e) => { setAntesDe(e.target.value); setPaso(0); }} max={hoy} className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
          {paso === 0 ? (
            <button type="button" disabled={!antesDe} onClick={() => setPaso(1)} className={boton}>Borrar lo anterior…</button>
          ) : paso === 1 ? (
            <>
              <span className="text-sm text-red-600 dark:text-red-400">¿Borrar todos los dictados anteriores al {antesDe}?</span>
              <button type="button" onClick={() => setPaso(2)} className={`${boton} border-red-300 text-red-700 dark:border-red-800 dark:text-red-300`}>Sí, quiero borrarlos</button>
              <button type="button" onClick={() => setPaso(0)} className={boton}>No</button>
            </>
          ) : (
            <>
              <span className="text-sm text-red-600 dark:text-red-400">Última vez: no se puede deshacer.</span>
              <button type="button" onClick={() => { setPaso(0); void alBorrarAnteriores(antesDe); }} className={`${boton} bg-red-600 text-white dark:bg-red-700`} data-prueba="borrar-rango-si">Borrar definitivamente</button>
              <button type="button" onClick={() => setPaso(0)} className={boton}>Cancelar</button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
