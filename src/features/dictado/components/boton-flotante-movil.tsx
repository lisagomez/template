'use client';

/**
 * El boton flotante movil: el gemelo de bolsillo del flotante de Windows. Arrastrable con el
 * dedo (recuerda su sitio), siempre encima DEL CONTENIDO DE LA APP — iOS y Android no dejan a
 * una PWA flotar sobre otras apps, y eso se dice, no se maquilla. Un toque graba (rojo
 * pulsante), otro termina y transcribe (ambar).
 */
import { useRef, useState } from 'react';

interface Props {
  grabando: boolean;
  transcribiendo: boolean;
  alTocar: () => void;
}

const POSICION_CLAVE = 'dictado.flotante';

function posicionGuardada(): { x: number; y: number } | undefined {
  try {
    const guardada = localStorage.getItem(POSICION_CLAVE);
    if (!guardada) return undefined;
    const [x, y] = guardada.split(',').map(Number);
    return Number.isFinite(x) && Number.isFinite(y) ? { x: x as number, y: y as number } : undefined;
  } catch {
    return undefined; // sin persistencia: posicion por defecto
  }
}

export function BotonFlotanteMovil({ grabando, transcribiendo, alTocar }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | undefined>(posicionGuardada);
  const arrastre = useRef<{ x0: number; y0: number; px: number; py: number; movio: boolean } | null>(null);

  const acota = (x: number, y: number) => ({
    x: Math.min(Math.max(x, 8), window.innerWidth - 84),
    y: Math.min(Math.max(y, 8), window.innerHeight - 84),
  });

  const alBajar = (e: React.PointerEvent<HTMLButtonElement>) => {
    const actual = pos ?? acota(window.innerWidth / 2 - 38, window.innerHeight - 140);
    arrastre.current = { x0: e.clientX, y0: e.clientY, px: actual.x, py: actual.y, movio: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const alMover = (e: React.PointerEvent<HTMLButtonElement>) => {
    const a = arrastre.current;
    if (!a) return;
    const dx = e.clientX - a.x0;
    const dy = e.clientY - a.y0;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) a.movio = true;
    if (a.movio) setPos(acota(a.px + dx, a.py + dy));
  };
  const alSoltar = () => {
    const a = arrastre.current;
    arrastre.current = null;
    if (!a) return;
    if (a.movio) {
      const p = pos;
      if (p) {
        try {
          localStorage.setItem(POSICION_CLAVE, `${Math.round(p.x)},${Math.round(p.y)}`);
        } catch {
          /* nada */
        }
      }
      return;
    }
    alTocar();
  };

  const estilo = pos ? { left: pos.x, top: pos.y } : { left: '50%', bottom: 56, transform: 'translateX(-50%)' };
  const cara = grabando
    ? 'bg-red-500 animate-pulse shadow-red-500/40'
    : transcribiendo
      ? 'bg-amber-500 shadow-amber-500/40'
      : 'bg-neutral-500 shadow-black/30';
  const texto = grabando ? 'Grabando: toca para terminar' : transcribiendo ? 'Transcribiendo' : 'Toca para dictar';

  return (
    <button
      type="button"
      aria-label={texto}
      title={texto}
      onPointerDown={alBajar}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      disabled={transcribiendo}
      className="fixed z-50 h-[76px] w-[76px] touch-none select-none rounded-full border-4 border-white/20 shadow-xl transition-colors disabled:opacity-80"
      style={estilo}
    >
      <span className={`absolute inset-1 rounded-full ${cara}`} />
      <svg viewBox="0 0 24 24" className="absolute inset-0 m-auto h-8 w-8 fill-white" aria-hidden>
        <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z" />
        <path d="M17 11a1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V20h2a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2h2v-2.07A7 7 0 0 1 5 11a1 1 0 1 1 2 0 5 5 0 0 0 10 0Z" />
      </svg>
    </button>
  );
}
