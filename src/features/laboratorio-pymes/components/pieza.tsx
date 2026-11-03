'use client';

/** Lo único propio de una tarjeta de este laboratorio: el video, la pieza contra su referencia o la pieza sola. El resto lo pinta la tarjeta del banco. */
import type { ResultadoDeCaso } from '../services/tipos.ts';
import { ComparaVisual } from './compara-visual.tsx';

export function PiezaPymes({ resultado }: { resultado: ResultadoDeCaso }) {
  if (resultado.video) {
    return (
      <div className="flex gap-2" data-prueba="video-caso">
        {/* Hay casos que solo tienen hoja de cuadros (el reel de un caso bloqueado no se reproduce): sin `src` vacío. */}
        {resultado.video.mp4 ? <video src={resultado.video.mp4} controls muted playsInline preload="metadata" width={180} className="rounded border border-border" /> : null}
        {/* eslint-disable-next-line @next/next/no-img-element -- hoja de cuadros generada por ffmpeg del MP4 real */}
        <img src={resultado.video.hoja} alt="Hoja de cuadros del video" width={300} className="rounded border border-border" />
      </div>
    );
  }
  if (resultado.pieza && resultado.referencia) return <ComparaVisual svg={resultado.pieza} referencia={resultado.referencia} />;
  if (!resultado.pieza) return null;
  // eslint-disable-next-line @next/next/no-img-element -- SVG generado aquí, en data URL: nada que optimizar ni que descargar
  return <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(resultado.pieza)}`} alt="Pieza generada por el caso" width={180} className="rounded-lg border border-border" />;
}
