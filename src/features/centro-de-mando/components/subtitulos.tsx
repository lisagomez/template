'use client';

/**
 * Subtítulos karaoke: lo que la máquina YA dijo, en blanco; lo que falta, tenue. La posición sale
 * del tiempo real del `<audio>` de cada frase (no de un reloj aparte), como en la fuente
 * (business-os `Subtitles.tsx`, MIT). El corte cae en un límite de palabra.
 */
import type { FraseKaraoke } from '../types/index.ts';

function parte(texto: string, fraccion: number): [string, string] {
  if (fraccion >= 1) return [texto, ''];
  if (fraccion <= 0) return ['', texto];
  const corte = Math.round(texto.length * fraccion);
  const espacio = texto.lastIndexOf(' ', corte);
  const i = espacio > 0 ? espacio : corte;
  return [texto.slice(0, i), texto.slice(i)];
}

/** La frase que suena y sus vecinas: una respuesta larga no llena la pantalla. */
function ventana(frases: FraseKaraoke[]): FraseKaraoke[] {
  const actual = Math.max(0, frases.findIndex((f) => f.fraccion < 1));
  const i = frases.every((f) => f.fraccion >= 1) ? frases.length - 1 : actual;
  return frases.slice(Math.max(0, i - 1), i + 2);
}

export function Subtitulos({ frases, oyendo, interrumpida }: { frases: FraseKaraoke[]; oyendo: string; interrumpida: boolean }) {
  return (
    <div className="flex min-h-[124px] w-full max-w-3xl flex-col items-center gap-2 text-center" data-prueba="subtitulos">
      {oyendo ? (
        <p className="font-mono text-sm text-white/40" data-prueba="oyendo">
          «{oyendo}»
        </p>
      ) : null}
      <p className="text-xl leading-snug sm:text-2xl" aria-live="polite">
        {ventana(frases).map((f) => {
          const [dicho, falta] = parte(f.texto, f.fraccion);
          return (
            <span key={f.indice} data-prueba="frase" data-fraccion={f.fraccion.toFixed(2)} data-acuse={f.acuse ? '1' : undefined} className={f.acuse ? 'italic' : undefined}>
              <span className="text-white [text-shadow:0_0_18px_rgba(255,255,255,0.35)]">{dicho}</span>
              <span className="text-white/25">{falta}</span>{' '}
            </span>
          );
        })}
        {interrumpida ? <span className="ml-1 rounded bg-red-500/20 px-1.5 py-0.5 align-middle text-xs font-semibold text-red-300">interrumpido</span> : null}
      </p>
    </div>
  );
}
