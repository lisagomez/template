'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Props { pymeId: string; vigenteDesde: string | null }

/**
 * El consentimiento escrito de una pyme (RF-1): se registra con su documento firmado, del que solo se guarda la
 * huella. Revocarlo borra todo lo que el piloto generó con sus documentos y deja constancia (RF-3, RF-4).
 */
export function ConsentimientoPyme({ pymeId, vigenteDesde }: Props) {
  const router = useRouter();
  const [aviso, setAviso] = useState('');
  async function registrar(form: FormData) {
    form.set('pyme_id', pymeId);
    const r = await fetch('/api/buzon/consentimientos', { method: 'POST', body: form });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) return setAviso(datos.error ?? 'no se pudo registrar');
    router.refresh();
  }
  async function revocar() {
    if (!window.confirm('Revocar borra todo lo que el piloto generó con los documentos de esta pyme. ¿Seguro?')) return;
    const r = await fetch(`/api/buzon/consentimientos?pyme=${pymeId}`, { method: 'DELETE' });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) return setAviso(datos.error ?? 'no se pudo revocar');
    setAviso(`Consentimiento revocado: ${datos.borrados} documento(s) borrados, con constancia.`);
    router.refresh();
  }
  if (vigenteDesde) {
    return (
      <div className="flex items-center justify-between gap-2 text-sm" data-prueba="consentimiento-vigente">
        <span className="text-green-800">Consiente desde el {vigenteDesde}</span>
        <button onClick={revocar} className="rounded-lg border border-red-300 px-3 py-1 text-red-700" data-prueba="revocar">Revocar</button>
        {aviso && <p role="status" className="text-sm">{aviso}</p>}
      </div>
    );
  }
  return (
    <form action={registrar} className="space-y-2 text-sm" data-prueba="registrar-consentimiento">
      <p className="text-amber-800">Sin consentimiento: sus documentos no se leen ni se guardan.</p>
      <label className="block">Documento firmado <input type="file" name="archivo" required className="block" data-prueba="consentimiento-archivo" /></label>
      <label className="block">Firmado el <input type="date" name="firmado_en" required className="rounded border px-2 py-1" data-prueba="consentimiento-fecha" /></label>
      <button className="rounded-lg bg-gray-900 px-3 py-1 text-white" data-prueba="registrar">Registrar consentimiento</button>
      {aviso && <p role="alert" className="text-red-700">{aviso}</p>}
    </form>
  );
}
