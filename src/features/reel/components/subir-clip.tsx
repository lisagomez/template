'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const CAMPO = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-base';

/** Subir el clip del celular. El archivo va al servidor de la fábrica; nada sale a otra nube. */
export function SubirClip() {
  const router = useRouter();
  const [estado, setEstado] = useState<{ enviando: boolean; error: string | null }>({ enviando: false, error: null });
  async function envia(form: FormData) {
    setEstado({ enviando: true, error: null });
    const r = await fetch('/api/reel/proyectos', { method: 'POST', body: form });
    const j = (await r.json().catch(() => ({}))) as { id?: string; error?: string };
    if (j.id) { router.push(`/reel/${j.id}`); router.refresh(); return; }
    setEstado({ enviando: false, error: j.error ?? 'No se pudo subir el clip' });
  }
  return (
    <form action={envia} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm" data-prueba="subir-clip">
      <h2 className="text-lg font-semibold">Nuevo reel</h2>
      <label className="block text-sm font-medium">Tu clip (vertical, de 15 a 60 s)
        <input name="archivo" type="file" accept="video/*" required className="mt-1 block w-full text-sm" data-prueba="archivo" />
      </label>
      <label className="block text-sm font-medium">Título
        <input name="titulo" required maxLength={120} defaultValue="Pan de muerto" className={CAMPO} />
      </label>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <label className="block text-sm font-medium">Tu negocio
          <input name="negocio" required maxLength={60} defaultValue="Panadería La Espiga" className={CAMPO} />
        </label>
        <label className="block text-sm font-medium">Color
          <input name="primario" type="color" defaultValue="#7a4a1e" className="mt-1 h-11 w-16 rounded-lg border border-gray-300" />
        </label>
      </div>
      <label className="block text-sm font-medium">Tu catálogo (uno por línea: producto = precio)
        <textarea name="catalogo" rows={3} maxLength={2000} defaultValue={'pan de muerto = 45\nconcha = 12'} className={CAMPO} />
      </label>
      <label className="block text-sm font-medium">Nombres que el transcriptor escribe mal (oído = correcto)
        <textarea name="diccionario" rows={2} maxLength={1000} defaultValue="spica = Espiga" className={CAMPO} />
      </label>
      {estado.error && <p role="alert" className="text-sm text-red-700">{estado.error}</p>}
      <button type="submit" disabled={estado.enviando} data-prueba="enviar-clip" className="w-full rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white disabled:opacity-50">
        {estado.enviando ? 'Procesando en el servidor… (≈ 1 minuto)' : 'Subir y preparar el reel'}
      </button>
      <p className="text-xs text-gray-500">Se procesa aquí, en el servidor de la fábrica: tu video no se manda a ningún otro servicio.</p>
    </form>
  );
}
