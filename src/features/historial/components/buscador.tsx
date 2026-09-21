'use client';

/** El buscador y los filtros: texto (con o sin acentos), atajos de fecha, rango, motor, corregidos y latencia alta. */
import type { Filtros } from '../services/tipos.ts';

const hoy = (): Date => new Date();
const dia = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hace = (n: number): string => { const d = hoy(); d.setDate(d.getDate() - n); return dia(d); };

const claseEntrada = 'rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900';
const chip = (activo: boolean) => `rounded-full border px-3 py-1 text-xs transition ${activo ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900' : 'border-neutral-300 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800'}`;

export function Buscador({ filtros, motores, coinciden, total, alCambiar, entradaRef }: { filtros: Filtros; motores: string[]; coinciden: number | undefined; total: number | undefined; alCambiar: (f: Filtros) => void; entradaRef: React.RefObject<HTMLInputElement | null> }) {
  const pon = (parte: Partial<Filtros>) => alCambiar({ ...filtros, ...parte });
  const rango = (desde?: string, hasta?: string) => pon({ desde, hasta });
  const esRango = (desde?: string, hasta?: string) => filtros.desde === desde && filtros.hasta === hasta;
  const hayFiltros = Boolean(filtros.consulta || filtros.desde || filtros.hasta || filtros.motor || filtros.soloCorregidos || filtros.latenciaMinMs !== undefined);
  return (
    <section className="space-y-2" data-prueba="buscador">
      <div className="flex gap-2">
        <input ref={entradaRef} type="search" value={filtros.consulta ?? ''} onChange={(e) => pon({ consulta: e.target.value || undefined })} placeholder="Buscar en lo dictado (con o sin acentos)… pulsa / para venir aquí" className={`${claseEntrada} flex-1`} data-prueba="consulta" autoComplete="off" />
        {hayFiltros ? <button type="button" onClick={() => alCambiar({})} className="rounded-lg border border-neutral-300 px-3 text-sm dark:border-neutral-700">Limpiar</button> : null}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" className={chip(esRango(undefined, undefined))} onClick={() => rango(undefined, undefined)}>Todo</button>
        <button type="button" className={chip(esRango(hace(0), hace(0)))} onClick={() => rango(hace(0), hace(0))}>Hoy</button>
        <button type="button" className={chip(esRango(hace(6), hace(0)))} onClick={() => rango(hace(6), hace(0))}>Esta semana</button>
        <button type="button" className={chip(esRango(hace(29), hace(0)))} onClick={() => rango(hace(29), hace(0))}>Este mes</button>
        <label className="ml-1 flex items-center gap-1 text-xs text-neutral-500">
          de <input type="date" value={filtros.desde ?? ''} onChange={(e) => pon({ desde: e.target.value || undefined })} className={`${claseEntrada} !px-2 !py-1`} />
          a <input type="date" value={filtros.hasta ?? ''} onChange={(e) => pon({ hasta: e.target.value || undefined })} className={`${claseEntrada} !px-2 !py-1`} />
        </label>
        {motores.length > 1 ? (
          <select value={filtros.motor ?? ''} onChange={(e) => pon({ motor: e.target.value || undefined })} className={`${claseEntrada} max-w-full !px-2 !py-1 !text-xs sm:max-w-[16rem]`} title="Motor que transcribió">
            <option value="">Cualquier motor</option>
            {motores.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        ) : null}
        <button type="button" className={chip(Boolean(filtros.soloCorregidos))} onClick={() => pon({ soloCorregidos: filtros.soloCorregidos ? undefined : true })} title="Solo los que corregiste a mano">Corregidos</button>
        <button type="button" className={chip(filtros.latenciaMinMs !== undefined)} onClick={() => pon({ latenciaMinMs: filtros.latenciaMinMs === undefined ? 1500 : undefined })} title="Tardaron 1,5 s o más en pegarse">Lentos</button>
      </div>
      {coinciden !== undefined && total !== undefined ? (
        <p className="text-xs text-neutral-500" data-prueba="cuenta">{hayFiltros ? `${coinciden} de ${total} dictados` : `${total} dictados`}</p>
      ) : null}
    </section>
  );
}
