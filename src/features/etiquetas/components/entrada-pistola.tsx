'use client';

/**
 * Campo para pistola USB en modo teclado (o para escribir a mano). El separador GS no se puede
 * teclear: se acepta Ctrl+] o F8 (lo que mandan algunas pistolas) y se muestra como ␝; el nucleo
 * acepta ademas los sustitutos habituales (<GS>, |, ~) y el texto con parentesis.
 */
import { useState } from 'react';
import { GS } from '../services/nucleo.ts';
import { boton, campo, tarjeta } from './marco.tsx';

export function EntradaPistola({ alLeer, className = '' }: { alLeer: (texto: string) => void; className?: string }) {
  const [entrada, setEntrada] = useState('');
  return (
    <form className={`${tarjeta} space-y-2 ${className}`} onSubmit={(x) => { x.preventDefault(); if (entrada) { alLeer(entrada); setEntrada(''); } }}>
      <label className="block text-sm font-medium" htmlFor="pistola">Pistola o teclado</label>
      <p className="text-xs text-neutral-500">Enfoca el campo y dispara. Acepta <code>]C1</code>, el separador GS (Ctrl+] o F8 si tu pistola lo manda así, o sustituido por ␝, &lt;GS&gt;, |, ~) y el texto con paréntesis.</p>
      <input id="pistola" className={`${campo} font-mono`} value={entrada.replace(new RegExp(GS, 'g'), '␝')} autoComplete="off" data-prueba="pistola"
        onChange={(x) => setEntrada(x.target.value.replace(/␝/g, GS))}
        onKeyDown={(x) => { if ((x.ctrlKey && x.key === ']') || x.key === 'F8') { x.preventDefault(); setEntrada((v) => v + GS); } }} />
      <button type="submit" className={boton}>Leer</button>
    </form>
  );
}
