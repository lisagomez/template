'use client';

/** Carruseles (láminas 4:5 con datos reales) y la promo en video 9:16 sin personas. */
import { useEffect, useRef, useState } from 'react';
import { Boton } from '@/features/laboratorio-voz/components/ui';
import { svgAPng } from '../../../../tools/pymes-marketing/dist/rasterizar.js';
import { escenaDePromo, cuadroSvg, revisaEscena } from '../../../../tools/pymes-marketing/dist/video/index.js';
import type { Carrusel } from '../../../../tools/pymes-marketing/dist/contenido/index.js';
import { useEstudio } from '../store/estudio.ts';
import { AreaDeTexto, Lista, Pastilla } from './ui-estudio.tsx';

export async function descargaPng(svg: string, nombre: string): Promise<void> {
  const [, w, h] = /viewBox="0 0 (\d+) (\d+)"/.exec(svg) ?? ['', '1080', '1350'];
  const blob = await svgAPng(svg, { ancho: Number(w), alto: Number(h) });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `${nombre}.png`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const dataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function TarjetaCarrusel({ c }: { c: Carrusel }) {
  return (
    <article className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800" data-prueba="carrusel">
      <p className="mb-2 text-sm font-semibold">{c.titulo} <Pastilla>{c.tipo}</Pastilla></p>
      {c.falta ? <p className="text-sm text-amber-800 dark:text-amber-300">Falta de ti: {c.falta}</p> : (
        <div className="flex gap-2 overflow-x-auto pb-2">{c.laminas.map((l) => (
          <figure key={l.indice} className="w-40 shrink-0 space-y-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- lámina generada aquí mismo */}
            <img src={dataUrl(l.svg)} alt={`Lámina ${l.indice}`} className="w-40 rounded-lg border border-neutral-200 dark:border-neutral-800" data-prueba="lamina" />
            <button type="button" className="text-xs underline" onClick={() => void descargaPng(l.svg, `${c.id}-${l.indice}`)}>PNG {l.indice}</button>
            {l.observaciones.map((o) => <p key={o.detalle} className="text-[11px] text-amber-700 dark:text-amber-300">{o.detalle}</p>)}
          </figure>))}
        </div>
      )}
      <Lista titulo="Avisos" elementos={c.avisos} />
    </article>
  );
}

export function SeccionCarruseles() {
  const { carruseles, generaCarruseles, generaCarruselDeTip, brief } = useEstudio();
  const [tema, setTema] = useState(''), [puntos, setPuntos] = useState('');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2"><Boton variante="primario" onClick={generaCarruseles} disabled={!brief}>Armar carruseles del brief</Boton>{!brief ? <span className="text-sm text-neutral-500">Primero el brief.</span> : null}</div>
      <div className="grid gap-2 md:grid-cols-[1fr_2fr_auto] md:items-end">
        <input className="rounded-lg border border-neutral-300 p-2 text-sm dark:border-neutral-700 dark:bg-neutral-950" placeholder="Tema del tip (p. ej. Cómo conservar el pan)" value={tema} onChange={(e) => setTema(e.target.value)} />
        <AreaDeTexto valor={puntos} cambia={setPuntos} filas={2} marcador="Tus puntos, uno por línea (de 2 a 4)" mono={false} />
        <Boton onClick={() => generaCarruselDeTip(tema, puntos.split('\n'))} disabled={!tema.trim()}>Carrusel de tip</Boton>
      </div>
      <div className="grid gap-3">{carruseles.map((c) => <TarjetaCarrusel key={c.id} c={c} />)}</div>
    </div>
  );
}

function VistaPrevia() {
  const { video, marca } = useEstudio();
  const [t, setT] = useState(0), [reproduce, setReproduce] = useState(true);
  const inicio = useRef<number | null>(null);
  const escena = video && marca ? escenaDePromo(marca, video.datos) : null;
  useEffect(() => {
    if (!escena || !reproduce) return;
    let id = 0;
    const paso = (ahora: number) => { inicio.current ??= ahora; setT(((ahora - inicio.current) / 1000) % escena.duracion); id = requestAnimationFrame(paso); };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [escena?.duracion, reproduce]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!escena) return null;
  const problemas = revisaEscena(escena);
  return (
    <div className="space-y-2" data-prueba="preview-video" data-t={t.toFixed(2)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- cuadro calculado aquí mismo */}
      <img src={dataUrl(cuadroSvg(escena, t))} alt="Vista previa de la promo" className="w-56 rounded-xl border border-neutral-200 dark:border-neutral-800" />
      <input type="range" min={0} max={escena.duracion} step={1 / escena.fps} value={t} aria-label="Instante del video" data-prueba="control-instante"
        onChange={(e) => { setReproduce(false); setT(Number(e.target.value)); }} className="w-56" />
      <p className="text-xs text-neutral-500">{t.toFixed(1)} s de {escena.duracion} s · 1080×1920 · 30 fps · sin personas{problemas.length ? ` · ${problemas.map((p) => p.detalle).join('; ')}` : ''}</p>
      <button type="button" className="text-xs underline" onClick={() => setReproduce(!reproduce)}>{reproduce ? 'Pausar' : 'Reproducir'}</button>
    </div>
  );
}

export function SeccionVideo() {
  const { video, renderizaVideo, preparaVideo, brief, marca } = useEstudio();
  const escena = video && marca ? escenaDePromo(marca, video.datos) : null;
  const portada = escena ? dataUrl(cuadroSvg(escena, escena.duracion - 1 / escena.fps)) : undefined;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Boton onClick={preparaVideo} disabled={!brief}>Preparar la promo del brief</Boton>
        <Boton variante="primario" onClick={() => void renderizaVideo()} disabled={!video || video.estado === 'renderizando'} data-prueba="genera-mp4">{video?.estado === 'renderizando' ? 'Generando MP4… (~20 s)' : 'Generar MP4'}</Boton>
      </div>
      <div className="flex flex-wrap gap-6">
        <VistaPrevia />
        {video?.url ? (
          <div className="space-y-1" data-prueba="mp4-listo">
            <video src={video.url} poster={portada} controls muted playsInline preload="none" className="w-56 rounded-xl border border-neutral-200 dark:border-neutral-800" />
            <p className="font-mono text-[11px]">huella {video.huella?.slice(0, 16)}… · {video.ms ? `${(video.ms / 1000).toFixed(1)} s de render` : ''}</p>
            <a className="text-xs underline" href={video.url} download="promo.mp4">Descargar MP4</a>
          </div>
        ) : null}
        {video?.estado === 'error' ? <p className="max-w-sm text-sm text-red-700 dark:text-red-300">{video.error}</p> : null}
      </div>
      <p className="text-xs text-neutral-500">El MP4 se genera en el servidor LOCAL (navegador sin ventana y ffmpeg). En producción esto está bloqueado hasta decidir la infraestructura.</p>
    </div>
  );
}
