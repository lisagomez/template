'use client';

/**
 * Un ajuste: etiqueta, ayuda, su valor con el origen, y el control que le toca (interruptor,
 * desplegable o caja). Una caja guarda al perder el foco o con Enter; el error de validacion
 * del servidor se queda pegado al campo. Lo «sin proveedor» se ve en gris y no se puede encender.
 */
import { useState } from 'react';
import { avisoDeAplicacion, avisoDeCapa, etiquetaOrigen, opcionesDe, valorParaEditar } from '../services/presenta.ts';
import type { Campo, Valor, ValorResuelto } from '../services/tipos.ts';

const caja = 'rounded-lg border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900';
const botonChico = 'rounded-md border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800';

export interface PropsCampo {
  campo: Campo;
  valor: ValorResuelto;
  motoresInstalados: string[];
  error: string | undefined;
  guardando: boolean;
  alGuardar: (valor: Valor) => Promise<boolean>;
  alQuitar: () => Promise<void>;
}

export function CampoAjuste({ campo, valor, motoresInstalados, error, guardando, alGuardar, alQuitar }: PropsCampo) {
  const origen = valor.origen;
  const capa = avisoDeCapa(origen, campo);
  return (
    <li className={`rounded-xl border p-3 ${campo.sinProveedor ? 'border-neutral-200 opacity-60 dark:border-neutral-800' : 'border-neutral-200 dark:border-neutral-800'}`} data-prueba={`campo-${campo.clave}`} data-origen={origen}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <label htmlFor={`ajuste-${campo.clave}`} className="text-sm font-semibold">{campo.etiqueta}</label>
          <p className="text-xs text-neutral-500">{campo.ayuda}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Control campo={campo} valor={valor.valor} motoresInstalados={motoresInstalados} guardando={guardando} alGuardar={alGuardar} />
          {origen === 'ajustes' ? <button type="button" onClick={() => void alQuitar()} disabled={guardando} className={botonChico} data-prueba={`quitar-${campo.clave}`} title="Volver al defecto">↺</button> : null}
        </div>
      </div>
      <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-neutral-400">
        <span data-prueba={`origen-${campo.clave}`}>{campo.sinProveedor ? `apagado: ${campo.sinProveedor}` : etiquetaOrigen(origen, campo)}</span>
        {!campo.sinProveedor ? <span>{avisoDeAplicacion(campo)}</span> : null}
      </p>
      {capa ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-400" data-prueba={`capa-${campo.clave}`}>{capa}</p> : null}
      {error ? <p className="mt-1 text-xs text-red-700 dark:text-red-400" role="alert" data-prueba={`error-${campo.clave}`}>{error}</p> : null}
    </li>
  );
}

function Control({ campo, valor, motoresInstalados, guardando, alGuardar }: { campo: Campo; valor: Valor; motoresInstalados: string[]; guardando: boolean; alGuardar: (v: Valor) => Promise<boolean> }) {
  const id = `ajuste-${campo.clave}`;
  if (campo.tipo === 'booleano') {
    return <Interruptor key={String(valor)} id={id} campo={campo} valor={valor === true} guardando={guardando} alGuardar={alGuardar} />;
  }
  if (campo.tipo === 'eleccion' || campo.tipo === 'motor' || campo.tipo === 'respaldo') {
    const opciones = opcionesDe(campo, motoresInstalados);
    const actual = String(valor);
    return (
      <select id={id} className={caja} value={actual} disabled={guardando} onChange={(e) => void alGuardar(e.target.value)} data-prueba={`control-${campo.clave}`}>
        {opciones.includes(actual) ? null : <option value={actual}>{actual} (no instalado)</option>}
        {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  // `key`: cuando el servidor devuelve otro valor, la caja se rearma con el; sin efectos que escriban estado.
  return <Caja key={String(valor)} id={id} campo={campo} valor={valor} guardando={guardando} alGuardar={alGuardar} />;
}

/** Interruptor: cambia al instante (la persona ve el click) y si el servidor lo rechaza vuelve atras. */
function Interruptor({ id, campo, valor, guardando, alGuardar }: { id: string; campo: Campo; valor: boolean; guardando: boolean; alGuardar: (v: Valor) => Promise<boolean> }) {
  const [marcado, setMarcado] = useState(valor);
  const cambia = async (nuevo: boolean) => {
    setMarcado(nuevo);
    if (!(await alGuardar(nuevo))) setMarcado(valor);
  };
  return <input id={id} type="checkbox" className="h-5 w-5 accent-neutral-900 dark:accent-white" checked={marcado} disabled={guardando || Boolean(campo.sinProveedor)} onChange={(e) => void cambia(e.target.checked)} data-prueba={`control-${campo.clave}`} />;
}

/** Caja de texto o numero: guarda al salir o con Enter, solo si cambio; Esc deja lo que habia. */
function Caja({ id, campo, valor, guardando, alGuardar }: { id: string; campo: Campo; valor: Valor; guardando: boolean; alGuardar: (v: Valor) => Promise<boolean> }) {
  const [texto, setTexto] = useState(valorParaEditar(valor));
  const guarda = () => {
    if (texto.trim() === valorParaEditar(valor)) return;
    void alGuardar(texto.trim());
  };
  const numerico = campo.tipo === 'entero' || campo.tipo === 'numero';
  return (
    <div className="flex items-center gap-1">
      <input
        id={id}
        type={numerico ? 'number' : 'text'}
        inputMode={numerico || campo.tipo === 'ganancia' ? 'decimal' : 'text'}
        min={campo.min}
        max={campo.max}
        step={campo.tipo === 'entero' ? 1 : campo.tipo === 'numero' ? 0.5 : undefined}
        className={`${caja} w-28`}
        value={texto}
        disabled={guardando}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={guarda}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setTexto(valorParaEditar(valor));
        }}
        data-prueba={`control-${campo.clave}`}
      />
      {texto.trim() !== valorParaEditar(valor) ? <button type="button" onClick={guarda} className={botonChico} data-prueba={`guardar-${campo.clave}`}>Guardar</button> : null}
    </div>
  );
}
