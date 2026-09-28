'use client';

/**
 * El codigo del proveedor no esta en el catalogo: se VINCULA a un articulo existente, que se busca
 * por su descripcion viendo las fotos. Es un cambio de catalogo con traza y los mismos conflictos
 * que el importador (el GTIN ya es de otro, marca propia con prefijo ajeno...). Nunca se asigna solo.
 */
import { useState } from 'react';
import type { Etiquetas } from '../hooks/use-etiquetas.ts';
import { TEXTO_FORMATO, type FormatoCodigo } from '../services/nucleo.ts';
import { gtinLegible } from '../services/presenta.ts';
import { FotoArticulo } from './foto.tsx';
import { botonPrimario, campo } from './marco.tsx';

export function VincularGtin({ e, gtin, formato, alVincular }: { e: Etiquetas; gtin: string; formato?: FormatoCodigo; alVincular: (sku: string) => void }) {
  const est = e.estado!;
  const [busca, setBusca] = useState('');
  const [sku, setSku] = useState('');
  const [nivel, setNivel] = useState<'unidad' | 'caja'>(formato === 'itf-14' ? 'caja' : 'unidad');
  const [aviso, setAviso] = useState<string | null>(null);
  const q = busca.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const lista = est.articulos.filter((a) => !q || `${a.sku} ${a.descripcion}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q)).slice(0, 8);
  const vincula = () => void e.ejecuta<{ ok: boolean; motivo?: string }>({ accion: 'vincula-gtin', sku, gtin, nivel }).then(
    (r) => { if (r.ok) alVincular(sku); else setAviso(r.motivo ?? 'no se pudo'); },
    (x: unknown) => setAviso(x instanceof Error ? x.message : String(x)),
  );
  return (
    <div className="space-y-2 rounded-xl border-2 border-violet-500 p-3" data-prueba="vincular">
      <p className="font-semibold">Ese código ({formato ? TEXTO_FORMATO[formato] : 'GTIN'} {gtinLegible(gtin)}) no está en el catálogo.</p>
      <p className="text-sm">Búscalo por su nombre y mira la foto: si es el mismo producto, vincúlalo. Queda en la traza del catálogo con tu nombre.</p>
      <input className={campo} placeholder="Buscar por descripción o SKU" value={busca} onChange={(x) => setBusca(x.target.value)} data-prueba="buscar-articulo" />
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {lista.map((a) => (
          <li key={a.sku}>
            <label className={`flex cursor-pointer items-center gap-2 rounded-lg border p-1.5 text-sm ${sku === a.sku ? 'border-violet-600 bg-violet-50 dark:bg-violet-950' : 'border-neutral-200 dark:border-neutral-800'}`} data-prueba="candidato">
              <input type="radio" name="vincular" checked={sku === a.sku} onChange={() => setSku(a.sku)} />
              <FotoArticulo est={est} sku={a.sku} className="h-12 w-12 rounded" />
              <span><span className="block font-medium">{a.descripcion}</span><span className="font-mono text-xs text-neutral-500">{a.sku}</span></span>
            </label>
          </li>
        ))}
      </ul>
      <label className="block text-sm">El código es de
        <select className={campo} value={nivel} onChange={(x) => setNivel(x.target.value as 'unidad' | 'caja')} data-prueba="nivel-vincular"><option value="unidad">la pieza (lo que se vende suelto)</option><option value="caja">la caja (el corrugado)</option></select>
      </label>
      <button type="button" className={botonPrimario} disabled={!sku} onClick={vincula} data-prueba="vincular-confirmar">Vincular a {sku || '…'}</button>
      {aviso ? <p className="text-sm text-red-700" role="alert" data-prueba="aviso-vincular">{aviso}</p> : null}
    </div>
  );
}
