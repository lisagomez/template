'use client';

/**
 * Referencia contra actual, a la vista: las dos imágenes lado a lado y el porcentaje de píxeles que
 * cambian, calculado aquí con canvas (nada sale de la página). Un píxel cuenta como distinto si algún
 * canal difiere en más de 16 de 255: el suavizado de bordes entre navegadores no se cuenta como cambio.
 */
import { useEffect, useState } from 'react';

const ANCHO = 216;

/**
 * Las dos imágenes siguen EL MISMO camino: se dibujan a tamaño completo y luego se reducen. Si la
 * actual se dibujara directo a tamaño chico, el suavizado del texto diferiría del de la referencia
 * (que se rasterizó grande) y saldría «distinto» sin que la pieza cambiara.
 */
async function pixeles(src: string, anchoCompleto: number, altoCompleto: number, ancho: number, alto: number): Promise<Uint8ClampedArray> {
  const img = new Image();
  await new Promise<void>((listo, falla) => { img.onload = () => listo(); img.onerror = () => falla(new Error('no cargó')); img.src = src; });
  const grande = document.createElement('canvas');
  grande.width = anchoCompleto;
  grande.height = altoCompleto;
  grande.getContext('2d')!.drawImage(img, 0, 0, anchoCompleto, altoCompleto);
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(grande, 0, 0, ancho, alto);
  return ctx.getImageData(0, 0, ancho, alto).data;
}

export function ComparaVisual({ svg, referencia }: { svg: string; referencia: string }) {
  const [diferencia, setDiferencia] = useState<number | null>(null);
  const actual = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const [, w, h] = /viewBox="0 0 (\d+) (\d+)"/.exec(svg) ?? ['', '1080', '1350'];
  const alto = Math.round((ANCHO * Number(h)) / Number(w));
  useEffect(() => {
    let vivo = true;
    void Promise.all([pixeles(actual, Number(w), Number(h), ANCHO, alto), pixeles(referencia, Number(w), Number(h), ANCHO, alto)]).then(([a, b]) => {
      let distintos = 0;
      for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i]! - b[i]!) > 16 || Math.abs(a[i + 1]! - b[i + 1]!) > 16 || Math.abs(a[i + 2]! - b[i + 2]!) > 16) distintos++;
      if (vivo) setDiferencia((100 * distintos) / (a.length / 4));
    }).catch(() => vivo && setDiferencia(-1));
    return () => { vivo = false; };
  }, [actual, referencia, alto, w, h]);
  const tono = diferencia === null ? 'text-neutral-500' : diferencia < 0 ? 'text-red-600' : diferencia <= 1 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300';
  return (
    <figure className="space-y-1" data-prueba="compara-visual" data-diferencia={diferencia === null ? '' : diferencia.toFixed(2)}>
      <div className="flex gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- imagen de referencia versionada, se compara píxel a píxel */}
        <img src={referencia} alt="Referencia aprobada" width={ANCHO} height={alto} className="rounded border border-neutral-200 dark:border-neutral-800" />
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG generado aquí mismo */}
        <img src={actual} alt="Pieza actual" width={ANCHO} height={alto} className="rounded border border-neutral-200 dark:border-neutral-800" />
      </div>
      <figcaption className={`text-xs ${tono}`}>
        referencia · actual — {diferencia === null ? 'comparando…' : diferencia < 0 ? 'no se pudo comparar' : `${diferencia.toFixed(2)} % de píxeles distintos${diferencia <= 1 ? ' (igual)' : ' (revisar)'}`}
      </figcaption>
    </figure>
  );
}
