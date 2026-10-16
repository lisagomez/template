'use client';

/**
 * La onda: 36 barras que siguen el nivel (el micrófono al escuchar, la voz al hablar), con
 * suavizado y un suelo en reposo. Parámetros de la fuente (business-os `Waveform.tsx`, MIT).
 * A diferencia de la fuente, respeta `prefers-reduced-motion` (allí no).
 */
import { useEffect, useRef } from 'react';
import type { EstadoBucle } from '../../../../tools/bucle-voz/dist/index.js';
import { COLOR_ESTADO, rgb } from './colores.ts';

const BARRAS = 36;

export function Onda({ estado, nivel }: { estado: EstadoBucle; nivel: () => number }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const estadoRef = useRef(estado);
  useEffect(() => {
    estadoRef.current = estado;
  }, [estado]);

  useEffect(() => {
    const c = lienzo.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return undefined;
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const alturas = new Array<number>(BARRAS).fill(0.06);
    let cuadro = 0;
    const dibuja = (t: number) => {
      c.width = Math.round(c.clientWidth * dpr);
      c.height = Math.round(c.clientHeight * dpr);
      const e = estadoRef.current;
      const n = e === 'escuchando' || e === 'hablando' ? nivel() : 0;
      const ancho = c.width / BARRAS;
      ctx.clearRect(0, 0, c.width, c.height);
      for (let i = 0; i < BARRAS; i++) {
        const forma = 0.55 + 0.45 * Math.sin(i * 0.5 + t / 140);
        const meta = Math.max(0.06, n * forma);
        alturas[i] = (alturas[i] ?? 0) + (meta - (alturas[i] ?? 0)) * 0.25;
        const h = Math.max(2 * dpr, (alturas[i] ?? 0) * c.height);
        ctx.fillStyle = rgb(COLOR_ESTADO[e], 0.35 + (alturas[i] ?? 0) * 0.65);
        ctx.fillRect(i * ancho + ancho * 0.2, (c.height - h) / 2, ancho * 0.6, h);
      }
      if (!quieto) cuadro = requestAnimationFrame(dibuja);
    };
    cuadro = requestAnimationFrame(dibuja);
    return () => cancelAnimationFrame(cuadro);
  }, [nivel]);

  return <canvas ref={lienzo} className="h-9 w-full max-w-[300px]" aria-hidden data-prueba="onda" />;
}
