'use client';

/** Lo que la persona deja tras probar: funciono / a medias / no, con una nota. Queda guardado en la maquina. */
import { useState } from 'react';
import type { EstadoCaso, ResultadoVeredicto, Veredicto } from '../types/index.ts';
import { Aviso, Boton, claseEntrada } from './ui.tsx';

const OPCIONES: Array<{ valor: ResultadoVeredicto; nombre: string; activo: string }> = [
  { valor: 'funciono', nombre: 'Funcionó', activo: 'bg-emerald-600 text-white' },
  { valor: 'a-medias', nombre: 'A medias', activo: 'bg-amber-500 text-white' },
  { valor: 'no', nombre: 'No funcionó', activo: 'bg-red-600 text-white' },
];

export function PanelVeredicto({ caso, estado, previos, token, ocupado, guarda }: { caso: number; estado: EstadoCaso; previos: Veredicto[]; token: string | undefined; ocupado: boolean; guarda: (v: { caso: number; resultado: ResultadoVeredicto; nota: string; estado: EstadoCaso }) => Promise<boolean> }) {
  const [resultado, setResultado] = useState<ResultadoVeredicto | undefined>(undefined);
  const [nota, setNota] = useState('');
  const [guardado, setGuardado] = useState(false);
  const ultimo = previos.at(-1);

  const enviar = async () => {
    if (!resultado) return;
    if (await guarda({ caso, resultado, nota: nota.trim(), estado })) {
      setGuardado(true);
      setNota('');
      setResultado(undefined);
      setTimeout(() => setGuardado(false), 2_500);
    }
  };

  return (
    <div className="rounded-xl border border-dashed border-neutral-300 p-3 dark:border-neutral-700" data-prueba={`veredicto-${caso}`}>
      <p className="text-sm font-medium">Tu veredicto</p>
      {ultimo ? (
        <p className="mt-1 text-xs text-neutral-500">
          Último: <strong>{OPCIONES.find((o) => o.valor === ultimo.resultado)?.nombre}</strong> · {new Date(ultimo.fecha).toLocaleString('es-MX')}
          {ultimo.nota ? ` · «${ultimo.nota}»` : ''} ({previos.length} en total)
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {OPCIONES.map((o) => (
          <button key={o.valor} type="button" onClick={() => setResultado(o.valor)} className={`rounded-full px-3 py-1 text-sm transition ${resultado === o.valor ? o.activo : 'border border-neutral-300 dark:border-neutral-700'}`}>
            {o.nombre}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Una nota (qué viste, qué falló)" className={claseEntrada} maxLength={1000} />
        <Boton variante="primario" onClick={() => void enviar()} disabled={!resultado || ocupado || !token} title={token ? undefined : 'Empareja el navegador para guardar'}>
          Guardar
        </Boton>
      </div>
      {guardado ? (
        <div className="mt-2">
          <Aviso tipo="ok">Veredicto guardado en esta computadora.</Aviso>
        </div>
      ) : null}
      {!token ? <p className="mt-1 text-xs text-neutral-400">Para guardar hace falta emparejar el navegador (arriba).</p> : null}
    </div>
  );
}
