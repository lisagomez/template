'use client';

/**
 * /historial: la casa de todo lo dictado. Emparejamiento como /dictar; buscador y filtros; la
 * lista por dia con el termino resaltado; teclado (/ busca, ↑↓ se mueve, Enter copia, Esc
 * suelta); «Como me va» plegable; exportar y borrar por rango. Se actualiza sola cuando llega
 * un dictado nuevo (vivo por huella, ver el hook).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Emparejar } from '@/features/laboratorio-voz/components/emparejar';
import { hoyLocal, useHistorial } from '../hooks/use-historial.ts';
import { agregaAlDiccionario } from '../services/cliente.ts';
import { agrupaPorDia, etiquetaDia } from '../services/busqueda.ts';
import { Buscador } from './buscador.tsx';
import { Cifras } from './cifras.tsx';
import { DictadoItem } from './dictado-item.tsx';
import { Herramientas } from './herramientas.tsx';

export function Historial() {
  const h = useHistorial();
  const [activo, setActivo] = useState<number>(-1);
  const [verCifras, setVerCifras] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | undefined>(undefined);
  const [avisoLocal, setAvisoLocal] = useState<string | undefined>(undefined);
  const entradaBusqueda = useRef<HTMLInputElement | null>(null);
  const hoy = useMemo(() => hoyLocal(), []);
  const grupos = useMemo(() => agrupaPorDia(h.entradas), [h.entradas]);
  const token = h.token;
  const { cargaCifras } = h;

  useEffect(() => {
    if (verCifras) void cargaCifras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verCifras, h.pagina?.huella]);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const enCampo = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      if (e.key === '/' && !enCampo) {
        e.preventDefault();
        entradaBusqueda.current?.focus();
        return;
      }
      if (e.key === 'Escape' && enCampo) {
        (e.target as HTMLElement).blur();
        return;
      }
      if (enCampo) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActivo((i) => Math.min(h.entradas.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActivo((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter' && activo >= 0) {
        const d = h.entradas[activo];
        if (d) void h.copia(d.texto);
      }
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [h, activo]);

  useEffect(() => {
    if (activo < 0) return;
    document.querySelector(`[data-prueba="dictado"][data-id="${h.entradas[activo]?.id ?? ''}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activo, h.entradas]);

  const avisa = (t: string) => {
    setAvisoLocal(t);
    setTimeout(() => setAvisoLocal(undefined), 1_800);
  };
  const aviso = h.aviso ?? avisoLocal;
  const error = h.error ?? errorLocal;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-24 pt-6">
      <header className="mb-4">
        <p className="text-xs uppercase tracking-widest text-neutral-500">Dictado</p>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold">Historial</h1>
          <nav className="flex gap-3 text-sm">
            <a href="/dictar" className="underline">Dictar desde el celular</a>
            <a href="/laboratorio-voz" className="underline">Laboratorio de voz</a>
          </nav>
        </div>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">Todo lo que has dictado, en esta computadora. Busca, copia, corrige, borra o sácalo en un archivo. El audio nunca se guarda.</p>
      </header>

      {!token ? (
        <Emparejar empareja={h.movil.empareja} error={h.movil.error} />
      ) : (
        <div className="space-y-4">
          <Buscador filtros={h.filtros} motores={h.pagina?.motores ?? []} coinciden={h.pagina?.coinciden} total={h.pagina?.total} alCambiar={(f) => { h.setFiltros(f); setActivo(-1); }} entradaRef={entradaBusqueda} />

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button type="button" onClick={() => setVerCifras((v) => !v)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700" data-prueba="ver-cifras">{verCifras ? 'Ocultar cómo me va' : 'Cómo me va'}</button>
            <span className="text-neutral-400">Teclado: <kbd>/</kbd> buscar · <kbd>↑</kbd><kbd>↓</kbd> moverse · <kbd>Enter</kbd> copiar</span>
            {h.nuevos > 0 ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" data-prueba="nuevos">{h.nuevos} nuevo{h.nuevos === 1 ? '' : 's'}</span> : null}
            {aviso ? <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-white dark:bg-white dark:text-neutral-900" data-prueba="aviso" role="status">{aviso}</span> : null}
          </div>
          {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300" role="alert">{error}</p> : null}

          {verCifras && h.cifras ? <Cifras e={h.cifras} /> : null}

          {h.cargando && h.entradas.length === 0 ? <p className="text-sm text-neutral-500">Leyendo el historial…</p> : null}
          {!h.cargando && h.pagina && h.entradas.length === 0 ? (
            <p className="rounded-lg border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800" data-prueba="vacio">{h.pagina.total === 0 ? 'Todavía no hay dictados. Dicta algo y aparecerá aquí.' : 'Nada coincide con esos filtros.'}</p>
          ) : null}

          <div className="space-y-5" data-prueba="lista">
            {grupos.map((g) => (
              <section key={g.dia} data-prueba="dia" data-dia={g.dia}>
                <h2 className="sticky top-0 z-10 bg-white/90 py-1 text-sm font-semibold backdrop-blur dark:bg-neutral-950/90">{etiquetaDia(g.dia, hoy)} <span className="font-normal text-neutral-400">· {g.entradas.length}</span></h2>
                <ul className="mt-1 space-y-2">
                  {g.entradas.map((d) => (
                    <DictadoItem
                      key={d.id}
                      dictado={d}
                      consulta={h.filtros.consulta ?? ''}
                      activo={h.entradas[activo]?.id === d.id}
                      alCopiar={(t) => void h.copia(t)}
                      alPegar={(t) => void h.pega(t)}
                      alCorregir={h.corrigeUno}
                      alBorrar={(id) => void h.borra(id)}
                      alAnadirAlDiccionario={async (ts) => { try { await agregaAlDiccionario(token, ts); avisa(`«${ts.join(', ')}» en el diccionario`); } catch (e) { setErrorLocal(e instanceof Error ? e.message : 'no se pudo añadir'); } }}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
          {h.masPaginas ? (
            <button type="button" onClick={h.cargaMas} disabled={h.cargando} className="w-full rounded-lg border border-neutral-300 py-2 text-sm dark:border-neutral-700" data-prueba="mas">
              {h.cargando ? 'Cargando…' : `Ver más (${h.entradas.length} de ${h.pagina?.coinciden ?? 0})`}
            </button>
          ) : null}

          <Herramientas token={token} filtros={h.filtros} hoy={hoy} alBorrarAnteriores={h.borraAnteriores} alAviso={avisa} alError={setErrorLocal} />
          <footer className="pt-4 text-center">
            <button type="button" onClick={() => h.movil.olvida()} className="text-xs text-neutral-400 underline">Olvidar emparejamiento</button>
          </footer>
        </div>
      )}
    </main>
  );
}
