'use client';

/**
 * La bandeja «por confirmar»: lo que quedo pendiente. Lo MIO se retoma y se confirma (la caducidad
 * la confirma quien registro); lo de otros se ve con su antiguedad y, si ya no tiene sentido, se
 * descarta con su motivo. Debajo, la medicion en uso: cuantas lecturas se confirmaron tal cual.
 */
import { useCallback, useEffect, useState } from 'react';
import type { Etiquetas } from '../hooks/use-etiquetas.ts';
import { accion } from '../services/cliente.ts';
import type { Propuesta } from '../services/nucleo.ts';
import { Foto } from './foto.tsx';
import { boton, campo, tarjeta } from './marco.tsx';
import type { RevisionAbierta } from './revision-caducidad.tsx';

export interface Pendiente {
  readonly sitio: string; readonly folio: string; readonly sku: string; readonly descripcion: string; readonly cajas: number; readonly desde: string; readonly antiguedad: string;
  readonly mia: boolean; readonly revision: string; readonly fotos: { completa: string; recortes: string[] };
  readonly propuesta: { estado: Propuesta['estado']; fecha?: string; lote?: string; opciones: Propuesta['opciones']; lotesPosibles: string[]; loteDifiere?: string[]; textoLeido: string[]; coinciden?: boolean; motor: string; ms: number[] };
}
interface Bandeja { abiertas: Pendiente[]; medicion: { motor: string; formato: string; tal: number; corregidas: number }[]; motor: string | null }

/** Lo que guarda la cadena (compacto) de vuelta a la forma de la pantalla de revision. */
export function desdeCadena(p: Pendiente): RevisionAbierta {
  const x = p.propuesta;
  return {
    sitio: p.sitio, sku: p.sku, cajas: p.cajas, revision: p.revision, folio: p.folio, completa: p.fotos.completa, recortes: p.fotos.recortes,
    propuesta: { ...x, mensaje: `Retomada (${p.antiguedad}): ${x.fecha ? 'confirma la fecha propuesta o corrígela' : 'elige o teclea la fecha'}.`, lotesPosibles: x.lotesPosibles.map((valor) => ({ valor, rotulado: false })), avisos: [] },
  };
}

export function BandejaRevisiones({ e, alRetomar, version }: { e: Etiquetas; alRetomar: (r: RevisionAbierta) => void; version: number }) {
  const [b, setB] = useState<Bandeja | null>(null);
  const [motivo, setMotivo] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<string | null>(null);
  // Leer la bandeja no recarga el estado entero (con `accion`, no con `e.ejecuta`): si no, cada
  // lectura provocaria otra carga y otra lectura.
  const carga = useCallback(() => void accion<Bandeja>({ accion: 'revisiones' }).then(setB, (x: unknown) => setAviso(x instanceof Error ? x.message : String(x))), []);
  useEffect(() => { carga(); }, [carga, version]);
  const descarta = (p: Pendiente) => void e.ejecuta<{ ok: boolean; motivo?: string }>({ accion: 'revision-descarta', sitio: p.sitio, revision: p.revision, motivo: motivo[p.revision] ?? '' }).then((r) => { setAviso(r.ok ? `Descartada ${p.folio}.` : r.motivo ?? 'no se pudo'); carga(); });
  if (!b) return null;
  return (
    <div className={`${tarjeta} space-y-3`} data-prueba="bandeja">
      <h2 className="font-semibold">Por confirmar ({b.abiertas.length})</h2>
      {b.abiertas.length === 0 ? <p className="text-sm text-neutral-500">Nada pendiente.</p> : null}
      <ul className="space-y-2">
        {b.abiertas.map((p) => (
          <li key={p.revision} className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm dark:border-amber-800 dark:bg-amber-950" data-prueba="pendiente" data-mia={p.mia}>
            <Foto huella={p.fotos.recortes[0] ?? p.fotos.completa} alt={`Caducidad de ${p.descripcion}`} className="h-12 w-28 rounded bg-neutral-900" />
            <span className="min-w-0 flex-1"><b>{p.descripcion}</b> · {p.cajas} caja(s) en recibo de {p.sitio} · <span data-prueba="antiguedad">{p.antiguedad}</span> · folio {p.folio}{p.propuesta.fecha ? ` · propuesta ${p.propuesta.fecha}` : ''}</span>
            {p.mia ? <button type="button" className={boton} onClick={() => alRetomar(desdeCadena(p))} data-prueba="retomar">Confirmar</button> : (
              <span className="flex gap-1"><input className={`${campo} w-40`} placeholder="motivo para descartar" value={motivo[p.revision] ?? ''} onChange={(x) => setMotivo({ ...motivo, [p.revision]: x.target.value })} /><button type="button" className={boton} disabled={(motivo[p.revision] ?? '').trim().length < 3} onClick={() => descarta(p)}>Descartar</button></span>
            )}
          </li>
        ))}
      </ul>
      {aviso ? <p className="text-sm" role="status">{aviso}</p> : null}
      <details className="text-sm" data-prueba="medicion-uso">
        <summary className="cursor-pointer font-medium">Cómo va el motor en uso ({b.motor ?? 'sin motor instalado'})</summary>
        <table className="mt-1 w-full text-left text-xs"><thead className="text-neutral-500"><tr><th>Motor</th><th>Formato</th><th>Tal cual</th><th>Corregidas</th></tr></thead>
          <tbody>{b.medicion.map((m) => <tr key={`${m.motor}${m.formato}`} className="border-t border-neutral-200 dark:border-neutral-800"><td className="py-0.5">{m.motor}</td><td>{m.formato}</td><td>{m.tal}</td><td>{m.corregidas}</td></tr>)}</tbody>
        </table>
        {b.medicion.length === 0 ? <p className="text-xs text-neutral-500">Todavía no hay recepciones confirmadas por foto.</p> : null}
      </details>
    </div>
  );
}
