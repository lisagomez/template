'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Props { pymeId: string; consiente: boolean }
interface Resultado { nombre: string; ok: boolean; texto: string }

/**
 * La zona de ingesta: XML (lo que manda) o su representación impresa (PDF o foto). Se suben de uno en uno, y cada
 * uno dice qué pasó con él. Sin consentimiento vigente no se sube nada (RF-1, RF-2).
 */
export function IngestaDocumentos({ pymeId, consiente }: Props) {
  const router = useRouter();
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  async function subir(form: FormData) {
    const archivos = form.getAll('archivos').filter((a): a is File => a instanceof File && a.size > 0);
    setSubiendo(true);
    const hechos: Resultado[] = [];
    for (const archivo of archivos) {
      const cuerpo = new FormData();
      cuerpo.set('pyme_id', pymeId);
      cuerpo.set('archivo', archivo);
      const r = await fetch('/api/buzon/documentos', { method: 'POST', body: cuerpo });
      const d = await r.json().catch(() => ({}));
      hechos.push(r.ok
        ? { nombre: archivo.name, ok: true, texto: [`entró (${d.estado})`, ...(d.avisos ?? [])].join(' · ') }
        : { nombre: archivo.name, ok: false, texto: d.error ?? 'no entró' });
      setResultados([...hechos]);
    }
    setSubiendo(false);
    router.refresh();
  }
  if (!consiente) {
    return <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900" data-prueba="sin-consentimiento">
      Esta pyme no tiene un consentimiento escrito vigente: sus documentos no se leen ni se guardan.</p>;
  }
  return (
    <form action={subir} className="space-y-2 rounded-xl bg-white p-4 shadow-sm" data-prueba="ingesta">
      <h2 className="font-semibold">Subir CFDI recibidos</h2>
      <input type="file" name="archivos" multiple accept=".xml,.pdf,.png,.jpg,.jpeg,.webp" className="block text-sm" data-prueba="archivos" />
      <button disabled={subiendo} className="rounded-lg bg-gray-900 px-4 py-2 text-white disabled:opacity-50" data-prueba="subir">{subiendo ? 'Leyendo…' : 'Subir y leer'}</button>
      <ul className="space-y-1 text-sm" data-prueba="resultados">
        {resultados.map((r) => <li key={r.nombre} className={r.ok ? 'text-gray-800' : 'text-red-700'}><b>{r.nombre}</b>: {r.texto}</li>)}
      </ul>
    </form>
  );
}
