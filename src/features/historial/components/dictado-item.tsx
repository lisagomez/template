'use client';

/** Un dictado: texto (con el termino resaltado), hora, motor, duracion y latencia; copiar, corregir en linea, pegar en la PC y borrar con confirmacion. */
import { useState } from 'react';
import { resalta } from '../services/busqueda.ts';
import type { Dictado } from '../services/tipos.ts';

const hora = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const motorCorto = (m: string) => (m.includes('parakeet') ? 'Parakeet' : m.includes('whisper') ? 'Whisper' : m.startsWith('remoto') ? 'motor residente' : m);

const botonSuave = 'rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800';

export function DictadoItem({ dictado, consulta, activo, alCopiar, alPegar, alCorregir, alBorrar, alAnadirAlDiccionario }: {
  dictado: Dictado;
  consulta: string;
  activo: boolean;
  alCopiar: (texto: string) => void;
  alPegar: (texto: string) => void;
  alCorregir: (id: string, texto: string) => Promise<string[]>;
  alBorrar: (id: string) => void;
  alAnadirAlDiccionario: (terminos: string[]) => Promise<void>;
}) {
  const [editando, setEditando] = useState<string | undefined>(undefined);
  const [confirmando, setConfirmando] = useState(false);
  const [candidatos, setCandidatos] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const segmentos = resalta(dictado.texto, consulta);

  const guarda = async () => {
    if (editando === undefined || editando.trim().length === 0) return;
    setOcupado(true);
    const c = await alCorregir(dictado.id, editando.trim());
    setCandidatos(c);
    setEditando(undefined);
    setOcupado(false);
  };

  return (
    <li className={`rounded-xl border p-3 transition ${activo ? 'border-neutral-900 ring-1 ring-neutral-900 dark:border-white dark:ring-white' : 'border-neutral-200 dark:border-neutral-800'}`} data-prueba="dictado" data-id={dictado.id}>
      {editando === undefined ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed" data-prueba="texto">
          {segmentos.map((s, i) => (s.coincide ? <mark key={i} className="rounded bg-amber-200 px-0.5 text-inherit dark:bg-amber-700">{s.texto}</mark> : <span key={i}>{s.texto}</span>))}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <textarea value={editando} onChange={(e) => setEditando(e.target.value)} rows={3} maxLength={5000} autoFocus className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900" data-prueba="editor" />
          <div className="flex gap-2">
            <button type="button" onClick={() => void guarda()} disabled={ocupado} className={`${botonSuave} bg-neutral-900 text-white dark:bg-white dark:text-neutral-900`}>Guardar corrección</button>
            <button type="button" onClick={() => setEditando(undefined)} className={botonSuave}>Cancelar</button>
          </div>
        </div>
      )}
      {dictado.textoCrudo ? <p className="mt-1 text-xs text-neutral-500" data-prueba="crudo">Antes de corregir: <span className="line-through">{dictado.textoCrudo}</span></p> : null}
      {candidatos.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1 text-xs" data-prueba="candidatos">
          <span className="text-neutral-500">Palabras nuevas en tu corrección:</span>
          {candidatos.map((c) => (
            <button key={c} type="button" onClick={() => void alAnadirAlDiccionario([c]).then(() => setCandidatos((xs) => xs.filter((x) => x !== c)))} className={botonSuave} title="Añadir al diccionario para que el motor la conozca">
              + {c}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
        <span className="tabular-nums">{hora(dictado.fecha)}</span>
        <span>{motorCorto(dictado.motor)}</span>
        <span>{(dictado.duracionMs / 1000).toFixed(1)} s de audio</span>
        {dictado.latenciaMs !== null ? <span className={dictado.latenciaMs >= 1500 ? 'text-amber-600 dark:text-amber-400' : ''}>{dictado.latenciaMs} ms hasta pegar</span> : null}
        <span className="ml-auto flex flex-wrap gap-1">
          <button type="button" onClick={() => alCopiar(dictado.texto)} className={botonSuave} data-prueba="copiar">Copiar</button>
          <button type="button" onClick={() => alPegar(dictado.texto)} className={botonSuave} title="Escribe este texto donde esté el cursor de Windows">Pegar en la PC</button>
          <button type="button" onClick={() => setEditando(dictado.texto)} className={botonSuave} data-prueba="corregir">Corregir</button>
          {confirmando ? (
            <span className="inline-flex items-center gap-1" data-prueba="confirmar-borrado">
              <span className="text-red-600 dark:text-red-400">¿Borrar este dictado?</span>
              <button type="button" onClick={() => { setConfirmando(false); alBorrar(dictado.id); }} className={`${botonSuave} border-red-300 text-red-700 dark:border-red-800 dark:text-red-300`} data-prueba="borrar-si">Sí, borrar</button>
              <button type="button" onClick={() => setConfirmando(false)} className={botonSuave}>No</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmando(true)} className={botonSuave} data-prueba="borrar">Borrar</button>
          )}
        </span>
      </div>
    </li>
  );
}
