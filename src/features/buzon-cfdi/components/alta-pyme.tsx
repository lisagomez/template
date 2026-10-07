'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Alta de una pyme del despacho. Lo suyo no entra al buzón hasta que haya su consentimiento escrito. */
export function AltaPyme() {
  const router = useRouter();
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);
  async function enviar(form: FormData) {
    setEnviando(true);
    setAviso('');
    const r = await fetch('/api/buzon/pymes', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rfc: form.get('rfc'), nombre: form.get('nombre') }),
    });
    const datos = await r.json().catch(() => ({}));
    setEnviando(false);
    if (!r.ok) return setAviso(datos.error ?? 'no se pudo dar de alta');
    router.refresh();
  }
  return (
    <form action={enviar} className="space-y-2 rounded-xl bg-white p-4 shadow-sm" data-prueba="alta-pyme">
      <h2 className="font-semibold">Dar de alta una pyme</h2>
      <input name="rfc" required placeholder="RFC" className="w-full rounded-lg border px-3 py-2 uppercase" data-prueba="rfc" />
      <input name="nombre" required placeholder="Nombre o razón social" className="w-full rounded-lg border px-3 py-2" data-prueba="nombre" />
      <button disabled={enviando} className="rounded-lg bg-gray-900 px-4 py-2 text-white disabled:opacity-50" data-prueba="dar-de-alta">Dar de alta</button>
      {aviso && <p role="alert" className="text-sm text-red-700">{aviso}</p>}
    </form>
  );
}
