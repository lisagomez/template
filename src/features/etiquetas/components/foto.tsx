'use client';

/**
 * Una foto guardada, por su huella. Se pide con el codigo del dispositivo (no es una URL publica)
 * y se muestra como blob. `FotoArticulo` ensena la foto vigente de un articulo: responde, en el
 * anden, «¿es esto lo que tengo enfrente?».
 */
import { useEffect, useState } from 'react';
import { urlDeFoto, type EstadoCliente } from '../services/cliente.ts';
import type { VistaFoto } from '../services/nucleo.ts';

export function Foto({ huella, alt, className = '', marca }: { huella: string; alt: string; className?: string; marca?: readonly [number, number, number, number] }) {
  const [url, setUrl] = useState<string | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [falla, setFalla] = useState(false);
  useEffect(() => { let vivo = true; void urlDeFoto(huella).then((u) => { if (vivo) setUrl(u); }, () => { if (vivo) setFalla(true); }); return () => { vivo = false; }; }, [huella]);
  if (falla) return <div className={`grid place-items-center bg-neutral-100 text-xs text-neutral-500 dark:bg-neutral-800 ${className}`}>sin foto</div>;
  if (!url) return <div className={`animate-pulse bg-neutral-200 dark:bg-neutral-800 ${className}`} aria-label="cargando foto" />;
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- blob local, no una imagen del sitio */}
      <img src={url} alt={alt} className="h-full w-full object-contain" onLoad={(x) => setNat({ w: x.currentTarget.naturalWidth, h: x.currentTarget.naturalHeight })} data-prueba="foto" />
      {marca && nat ? (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${nat.w} ${nat.h}`} preserveAspectRatio="xMidYMid meet" data-prueba="zona-leida">
          <rect x={marca[0]} y={marca[1]} width={marca[2]} height={marca[3]} fill="none" stroke="#f59e0b" strokeWidth={Math.max(2, nat.w / 150)} rx="4" />
        </svg>
      ) : null}
    </div>
  );
}

export function fotoDe(est: EstadoCliente, sku: string, vista: VistaFoto = 'principal') {
  return est.fotos.find((f) => f.sku === sku && f.vista === vista);
}

export function FotoArticulo({ est, sku, className = 'h-16 w-16 rounded-lg', vista = 'principal' }: { est: EstadoCliente; sku: string; className?: string; vista?: VistaFoto }) {
  const f = fotoDe(est, sku, vista);
  if (!f) return <div className={`grid shrink-0 place-items-center border border-dashed border-neutral-300 bg-neutral-50 text-center text-[10px] leading-tight text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 ${className}`} data-prueba="sin-foto">sin foto</div>;
  return <Foto huella={f.miniatura ?? f.huella} alt={`Foto de ${sku}`} className={`shrink-0 bg-white dark:bg-neutral-900 ${className}`} />;
}
