'use client';

/** Un navegador se empareja UNA vez con el token del servidor (el de /dictar). Nunca se muestra. */
import { useState } from 'react';
import { Aviso, Boton, claseEntrada } from './ui.tsx';

export function Emparejar({ empareja, error }: { empareja: (token: string) => Promise<boolean>; error: string | undefined }) {
  const [token, setToken] = useState('');
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950" data-prueba="emparejar">
      <h2 className="text-base font-semibold">Antes de probar con audio: empareja este navegador</h2>
      <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
        Es la misma llave que usa el celular. Se teclea una sola vez, no se muestra y no viaja a ningún tercero. Los casos que no usan audio se pueden probar sin esto.
      </p>
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void empareja(token.trim());
        }}
      >
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="token de emparejamiento" autoComplete="off" className={`${claseEntrada} font-mono`} />
        <Boton type="submit" variante="primario" disabled={token.trim().length < 16}>
          Emparejar
        </Boton>
      </form>
      {error ? (
        <div className="mt-2">
          <Aviso tipo="error">{error}</Aviso>
        </div>
      ) : null}
    </section>
  );
}
