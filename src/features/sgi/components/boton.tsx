'use client';
import { useFormStatus } from 'react-dom';

/** Botón de envío que dice qué está pasando mientras la acción corre (un agente tarda de 10 a 60 s). */
export function Boton({ children, trabajando = 'Trabajando…', variante = 'primario', ...resto }: React.ButtonHTMLAttributes<HTMLButtonElement> & { trabajando?: string; variante?: 'primario' | 'secundario' | 'peligro' }) {
  const { pending } = useFormStatus();
  const estilo = {
    primario: 'bg-[var(--sgi-primario)] text-white hover:opacity-90',
    secundario: 'bg-white text-gray-800 ring-1 ring-gray-300 hover:bg-gray-50',
    peligro: 'bg-white text-red-700 ring-1 ring-red-300 hover:bg-red-50',
  }[variante];
  return (
    <button type="submit" disabled={pending} aria-busy={pending} {...resto}
      className={`rounded-lg px-3 py-2 text-sm font-medium disabled:cursor-wait disabled:opacity-60 ${estilo} ${resto.className ?? ''}`}>
      {pending ? trabajando : children}
    </button>
  );
}
