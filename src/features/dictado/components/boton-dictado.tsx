'use client';

/**
 * El boton de dictado de la app: el gemelo web del boton flotante de Windows. Mismo lenguaje
 * visual (gris hueco = desconectado, gris = en espera, rojo = ESCUCHANDO, ambar =
 * transcribiendo) y mismo gesto: un click enciende manos libres, otro lo apaga.
 * Todo el estado vive en el store global `useDictado` (shared/stores): montar este boton en
 * varias partes de la app muestra y controla EL MISMO dictado.
 */
import { useEffect } from 'react';
import { useDictado, type EstadoDictado } from '@/shared/stores/dictado';

const ESTILOS: Record<EstadoDictado, { punto: string; texto: string }> = {
  desconectado: { punto: 'border-2 border-neutral-400 bg-transparent', texto: 'Dictado apagado' },
  inactivo: { punto: 'bg-neutral-400', texto: 'En espera — click para dictar' },
  escuchando: { punto: 'bg-red-500 animate-pulse', texto: 'ESCUCHANDO — click para apagar' },
  transcribiendo: { punto: 'bg-amber-500', texto: 'Transcribiendo…' },
  pegando: { punto: 'bg-amber-500', texto: 'Pegando…' },
};

export function BotonDictado() {
  const { estado, ocupado, sondea, alterna } = useDictado();

  useEffect(() => {
    void sondea();
    const reloj = setInterval(() => void sondea(), 2_000);
    return () => clearInterval(reloj);
  }, [sondea]);

  const estilo = ESTILOS[estado];
  return (
    <button
      type="button"
      onClick={() => void alterna()}
      disabled={ocupado}
      title={estilo.texto}
      aria-label={estilo.texto}
      className="flex items-center gap-2 rounded-full border border-neutral-300 bg-white/80 px-3 py-1.5 text-sm text-neutral-700 shadow-sm transition hover:shadow disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-200"
    >
      <span className={`h-3 w-3 rounded-full ${estilo.punto}`} />
      <span>{estado === 'escuchando' ? 'Dictando' : 'Dictado'}</span>
    </button>
  );
}
