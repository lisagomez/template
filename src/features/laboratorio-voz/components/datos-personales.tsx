'use client';

/**
 * Tus datos de dictado sin abrir una terminal: el diccionario (nombres y jerga que el motor no
 * conoce), los snippets («mi correo» → lo que definas) y el historial, donde corregir un
 * dictado propone palabras nuevas para el diccionario (el lazo de aprendizaje de sflow).
 * Todo vive en esta computadora; la ruta exige el mismo emparejamiento que el dictado.
 */
import { useEffect, useState } from 'react';
import { leeDatos, ordenaDatos, type DatosPersonales, type OrdenDatos } from '../services/cliente.ts';
import { Aviso, Boton, claseEntrada, Ocupado } from './ui.tsx';

export function DatosPersonalesPanel({ token }: { token: string }) {
  const [datos, setDatos] = useState<DatosPersonales | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [ocupado, setOcupado] = useState(false);
  const [termino, setTermino] = useState('');
  const [disparador, setDisparador] = useState('');
  const [expansion, setExpansion] = useState('');
  const [editando, setEditando] = useState<{ id: string; texto: string } | undefined>(undefined);
  const [candidatos, setCandidatos] = useState<string[]>([]);

  const recarga = async () => {
    try {
      setDatos(await leeDatos(token));
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    }
  };
  useEffect(() => {
    void leeDatos(token).then(setDatos).catch((e: unknown) => setError(e instanceof Error ? e.message : 'error'));
  }, [token]);

  const ordena = async (orden: OrdenDatos) => {
    setOcupado(true);
    setError(undefined);
    try {
      const r = await ordenaDatos(token, orden);
      if (orden.orden === 'historial-corrige') setCandidatos(r.candidatos ?? []);
      await recarga();
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
      return undefined;
    } finally {
      setOcupado(false);
    }
  };

  if (!datos && !error) return <Ocupado texto="Leyendo tus datos de dictado…" />;
  return (
    <div className="grid gap-4 lg:grid-cols-3" data-prueba="datos-personales">
      <section className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800" data-prueba="diccionario">
        <h3 className="text-sm font-semibold">Diccionario <span className="text-xs font-normal text-neutral-500">({datos?.diccionario.length ?? 0})</span></h3>
        <p className="text-xs text-neutral-500">Nombres, siglas y jerga que el motor no conoce. Se usan como pista al transcribir.</p>
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (termino.trim()) { void ordena({ orden: 'diccionario-agrega', terminos: [termino.trim()] }); setTermino(''); } }}>
          <input value={termino} onChange={(e) => setTermino(e.target.value)} placeholder="Nuevo término" className={claseEntrada} maxLength={200} />
          <Boton type="submit" variante="primario" disabled={ocupado || !termino.trim()}>Añadir</Boton>
        </form>
        <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-sm">
          {(datos?.diccionario ?? []).map((t) => (
            <li key={t} className="flex items-center justify-between gap-2">
              <span>{t}</span>
              <button type="button" className="text-xs text-neutral-400 underline" onClick={() => void ordena({ orden: 'diccionario-quita', termino: t })}>quitar</button>
            </li>
          ))}
          {datos && datos.diccionario.length === 0 ? <li className="text-neutral-400">Vacío. Añade un nombre propio y dicta una frase con él.</li> : null}
        </ul>
      </section>
      <section className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800" data-prueba="snippets">
        <h3 className="text-sm font-semibold">Snippets <span className="text-xs font-normal text-neutral-500">({datos?.snippets.length ?? 0})</span></h3>
        <p className="text-xs text-neutral-500">Dices el disparador y se pega la expansión: «mi correo» → tu dirección.</p>
        <form className="mt-2 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (disparador.trim() && expansion.trim()) { void ordena({ orden: 'snippets-agrega', disparador: disparador.trim(), expansion }); setDisparador(''); setExpansion(''); } }}>
          <input value={disparador} onChange={(e) => setDisparador(e.target.value)} placeholder="Disparador: mi correo" className={claseEntrada} maxLength={200} />
          <div className="flex gap-2">
            <input value={expansion} onChange={(e) => setExpansion(e.target.value)} placeholder="Expansión: ana@ejemplo.mx" className={claseEntrada} maxLength={2000} />
            <Boton type="submit" variante="primario" disabled={ocupado || !disparador.trim() || !expansion.trim()}>Añadir</Boton>
          </div>
        </form>
        <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-sm">
          {(datos?.snippets ?? []).map((s) => (
            <li key={s.disparador} className="flex items-center justify-between gap-2">
              <span>«{s.disparador}» → {s.expansion} <span className="text-xs text-neutral-400">({s.usos} usos)</span></span>
              <button type="button" className="text-xs text-neutral-400 underline" onClick={() => void ordena({ orden: 'snippets-quita', disparador: s.disparador })}>quitar</button>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800" data-prueba="historial">
        <h3 className="text-sm font-semibold">Historial <span className="text-xs font-normal text-neutral-500">({datos?.total ?? 0} dictados)</span></h3>
        <p className="text-xs text-neutral-500">Corrige un dictado y las palabras nuevas se proponen para el diccionario.</p>
        <ul className="mt-2 max-h-64 space-y-2 overflow-auto text-sm">
          {(datos?.historial ?? []).map((h) => (
            <li key={h.id} className="rounded-lg border border-neutral-100 p-2 dark:border-neutral-800">
              <p className="text-[11px] text-neutral-400">{new Date(h.fecha).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })} · {(h.duracionMs / 1000).toFixed(1)} s{h.latenciaMs !== null ? ` · ${h.latenciaMs} ms` : ''}</p>
              {editando?.id === h.id ? (
                <form className="mt-1 flex flex-col gap-1" onSubmit={(e) => { e.preventDefault(); void ordena({ orden: 'historial-corrige', id: h.id, texto: editando.texto }).then(() => setEditando(undefined)); }}>
                  <textarea value={editando.texto} onChange={(e) => setEditando({ id: h.id, texto: e.target.value })} rows={2} className={claseEntrada} />
                  <div className="flex gap-2">
                    <Boton type="submit" variante="primario" disabled={ocupado}>Guardar corrección</Boton>
                    <Boton onClick={() => setEditando(undefined)}>Cancelar</Boton>
                  </div>
                </form>
              ) : (
                <p className="mt-1">{h.texto} <button type="button" className="ml-1 text-xs text-neutral-400 underline" onClick={() => setEditando({ id: h.id, texto: h.texto })}>corregir</button></p>
              )}
            </li>
          ))}
          {datos && datos.historial.length === 0 ? <li className="text-neutral-400">Sin dictados todavía.</li> : null}
        </ul>
        {candidatos.length > 0 ? (
          <div className="mt-2" data-prueba="candidatos">
            <Aviso tipo="ok">
              Palabras nuevas en tu corrección: {candidatos.map((c) => (
                <button key={c} type="button" className="ml-1 rounded-full border border-emerald-400 px-2 py-0.5 text-xs" onClick={() => void ordena({ orden: 'diccionario-agrega', terminos: [c] }).then(() => setCandidatos((l) => l.filter((x) => x !== c)))}>
                  + {c}
                </button>
              ))}
            </Aviso>
          </div>
        ) : null}
      </section>
      {error ? <div className="lg:col-span-3"><Aviso tipo="error">{error}</Aviso></div> : null}
    </div>
  );
}
