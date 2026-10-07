'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { pendientes } from '@/features/buzon-cfdi/services/lectura';
import type { DocumentoDelBuzon, Revision } from '@/features/buzon-cfdi/types';

const ESTADO: Record<DocumentoDelBuzon['estado'], string> = {
  en_revision: 'En revisión', receptor_ajeno: 'Receptor ajeno', emparejada: 'Impresa de un XML', confirmado: 'Confirmado',
};

/**
 * Un CFDI, campo por campo. Lo dudoso (evidencia solo de imagen, RF-11) y cada discrepancia con su XML (RF-14) se
 * revisan aquí; mientras quede algo, no se confirma (RF-17). Se confirma de uno en uno: no hay «confirmar todos».
 */
export function RevisionDocumento({ doc }: { doc: DocumentoDelBuzon }) {
  const router = useRouter();
  const [aviso, setAviso] = useState('');
  const faltan = pendientes(doc);
  const abierto = doc.estado === 'en_revision';
  async function manda(r: Revision) {
    setAviso('');
    const resp = await fetch(`/api/buzon/documentos/${doc.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r) });
    const d = await resp.json().catch(() => ({}));
    if (!resp.ok) return setAviso(d.error ?? 'no se pudo guardar');
    router.refresh();
  }
  return (
    <article className="space-y-2 rounded-xl bg-white p-4 shadow-sm" data-prueba="documento" data-estado={doc.estado} data-id={doc.id}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">{doc.nombre_archivo}</h3>
        <span className="text-sm text-gray-600">{doc.tipo === 'xml' ? 'XML' : 'Impresa'} · {ESTADO[doc.estado]}</span>
      </header>
      <p className="text-xs text-gray-600">Folio fiscal: {doc.uuid ?? 'no leído'} · <b data-prueba="sello">Sello no verificado</b>: leer bien no es autenticar.</p>
      <table className="w-full table-fixed text-sm">
        <tbody>
          {doc.campos.map((c) => (
            <tr key={c.clave} className={c.revisionHumana ? 'bg-amber-50' : ''} data-prueba={`campo-${c.clave}`}>
              <td className="w-48 pr-2 align-top text-gray-600">{c.clave}</td>
              <td className="break-all pr-2 align-top">
                {c.revisionHumana && abierto
                  ? <form action={(f) => manda({ accion: 'campo', clave: c.clave, valor: String(f.get('valor') ?? '') })} className="flex gap-1">
                      <input name="valor" defaultValue={c.valor} className="w-full rounded border px-2" data-prueba={`valor-${c.clave}`} />
                      <button className="shrink-0 whitespace-nowrap rounded border px-2" data-prueba={`guardar-${c.clave}`}>Guardar</button>
                    </form>
                  : c.valor}
              </td>
              <td className="w-20 align-top text-xs text-gray-500">{c.revisado ? 'revisado' : c.evidencia}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {doc.discrepancias.length > 0 && (
        <ul className="space-y-1 text-sm" data-prueba="discrepancias">
          {doc.discrepancias.map((d) => (
            <li key={d.clave} className={d.revisada ? 'text-gray-500' : 'text-amber-900'}>
              «{d.clave}»: el XML dice <b>{d.xml}</b> y la impresa <b>{d.impresa}</b>. Manda el XML.
              {!d.revisada && abierto && <button onClick={() => manda({ accion: 'discrepancia', clave: d.clave })} className="ml-2 rounded border px-2" data-prueba={`revisada-${d.clave}`}>Revisada</button>}
            </li>
          ))}
        </ul>
      )}
      {faltan.length > 0 && <ul className="list-disc pl-5 text-sm text-amber-900" data-prueba="pendientes">{faltan.map((f) => <li key={f}>{f}</li>)}</ul>}
      {abierto && (
        <button onClick={() => manda({ accion: 'confirmar' })} disabled={faltan.length > 0}
          className="rounded-lg bg-green-700 px-4 py-2 text-white disabled:opacity-40" data-prueba="confirmar">Confirmar este CFDI</button>
      )}
      {doc.confirmado_en && <p className="text-sm text-green-800">Confirmado el {doc.confirmado_en.slice(0, 10)}.</p>}
      {aviso && <p role="alert" className="text-sm text-red-700">{aviso}</p>}
    </article>
  );
}
