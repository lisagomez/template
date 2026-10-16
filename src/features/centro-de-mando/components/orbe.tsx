'use client';

/**
 * El orbe: una esfera de partículas (Fibonacci) que respira en reposo, se contrae al escuchar,
 * late al pensar y se expande con la voz al hablar. Concepto y colores portados de business-os
 * (`Orb.tsx`, MIT © 2026 Daniel Carreón, ver LICENSE-FUENTE); el dibujo es nuevo y más ligero
 * (600 partículas, un solo canvas, sin sprites). Respeta `prefers-reduced-motion`: un solo cuadro.
 */
import { useEffect, useRef } from 'react';
import type { EstadoBucle } from '../../../../tools/bucle-voz/dist/index.js';
import { COLOR_ESTADO, rgb } from './colores.ts';

const N = 600;
const PUNTOS = Array.from({ length: N }, (_, i) => {
  const y = 1 - (2 * (i + 0.5)) / N;
  const r = Math.sqrt(1 - y * y);
  const t = i * Math.PI * (3 - Math.sqrt(5));
  return { x: Math.cos(t) * r, y, z: Math.sin(t) * r };
});

interface Props {
  estado: EstadoBucle;
  /** 0..1, leído en cada cuadro (micrófono al escuchar, voz al hablar). */
  nivel: () => number;
}

export function Orbe({ estado, nivel }: Props) {
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
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let color = [...COLOR_ESTADO[estadoRef.current]];
    let suave = 0;
    let giro = 0;
    let cuadro = 0;
    const dibuja = (t: number) => {
      const lado = c.clientWidth;
      if (c.width !== Math.round(lado * dpr)) {
        c.width = Math.round(lado * dpr);
        c.height = Math.round(lado * dpr);
      }
      const e = estadoRef.current;
      const meta = COLOR_ESTADO[e];
      color = color.map((v, i) => v + ((meta[i] ?? v) - v) * 0.07);
      suave += (nivel() - suave) * 0.18;
      const respira = e === 'reposo' ? 0.03 * Math.sin(t / 900) : e === 'pensando' ? 0.05 * Math.sin(t / 160) : 0;
      const escala = e === 'escuchando' ? 1 - suave * 0.12 : 1 + suave * 0.32;
      giro += quieto ? 0 : 0.004 + suave * 0.03 + (e === 'pensando' ? 0.01 : 0);
      const w = c.width;
      const cx = w / 2;
      const r = w * 0.3 * (escala + respira);
      ctx.clearRect(0, 0, w, w);
      // El halo se apaga ANTES del borde del lienzo y se pinta en círculo: con un rectángulo se veía el cuadrado.
      const halo = ctx.createRadialGradient(cx, cx, r * 0.2, cx, cx, Math.min(r * 1.9, cx));
      halo.addColorStop(0, rgb(color, 0.35 + suave * 0.3));
      halo.addColorStop(1, rgb(color, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cx, cx, 0, Math.PI * 2);
      ctx.fill();
      const cos = Math.cos(giro);
      const sin = Math.sin(giro);
      for (const p of PUNTOS) {
        const x = p.x * cos - p.z * sin;
        const z = p.x * sin + p.z * cos;
        const onda = 1 + (e === 'hablando' ? suave * 0.12 * Math.sin(p.y * 9 + t / 120) : 0);
        const prof = (z + 1.4) / 2.4;
        ctx.fillStyle = rgb(color, 0.25 + prof * 0.75);
        ctx.beginPath();
        ctx.arc(cx + x * r * onda, cx + p.y * r * onda, (0.6 + prof * 1.4) * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = rgb(color, 0.18);
      ctx.lineWidth = dpr;
      for (const k of [1.18, 1.34]) {
        ctx.beginPath();
        ctx.arc(cx, cx, r * k, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (!quieto) cuadro = requestAnimationFrame(dibuja);
    };
    cuadro = requestAnimationFrame(dibuja);
    return () => cancelAnimationFrame(cuadro);
  }, [nivel]);

  return <canvas ref={lienzo} className="aspect-square w-full max-w-[460px]" aria-label={`orbe: ${estado}`} data-prueba="orbe" data-estado={estado} />;
}
