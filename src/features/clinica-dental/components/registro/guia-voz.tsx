'use client';

/**
 * El panel de la GUÍA DE VOZ del registro. La guía dice cada campo, escucha, propone lo que entendió (lo llena
 * para que se vea) y espera un «sí»; al final lee el resumen y SOLO envía con «sí, envíalo». Sin LLM: corre con
 * reglas en el navegador; el audio va al motor local de la clínica.
 */
import { useEffect, useRef, useState } from 'react';
import type { EventoBucle } from '../../../../../tools/bucle-voz/dist/index.js';
import { inicioGuia, procesaGuia, type AccionGuia, type EstadoGuia } from '../../../../../tools/clinica-dental/dist/index.js';
import { useVoz, TEXTO_ESTADO } from '../../hooks/use-voz';
import { puertosGuia } from '../../services/cliente/voz';
import { clasesBoton, clasesBotonSecundario } from '../ui';

export function GuiaVoz({ alAccion, alIniciar }: { alAccion: (a: AccionGuia) => void; alIniciar: () => void }) {
  const estado = useRef<EstadoGuia | null>(null);
  // La sesión de voz se crea UNA vez y vive más que este render: la acción va por referencia, nunca congelada.
  const accion = useRef(alAccion);
  useEffect(() => { accion.current = alAccion; }, [alAccion]);
  const [dicho, setDicho] = useState('');
  const [oido, setOido] = useState('');
  const alEvento = (e: EventoBucle) => {
    if (e.tipo === 'respuesta') setDicho(e.texto);
    if (e.tipo === 'oido' && !e.especulativo) setOido(e.texto);
  };
  const voz = useVoz(alEvento);
  const procesa = (texto: string): string => {
    const r = estado.current === null ? inicioGuia() : procesaGuia(estado.current, texto);
    estado.current = r.estado;
    r.acciones.forEach((a) => accion.current(a));
    return r.decir;
  };
  const empieza = async () => {
    estado.current = null;
    alIniciar();
    const s = await voz.enciende(puertosGuia(procesa));
    s?.bucle.dice('empieza la guía');
  };
  const encendida = voz.estado !== 'apagada';
  return (
    <section aria-labelledby="guia-titulo" className="rounded-xl border-2 border-dashed border-[color:var(--c1)] bg-white p-4 sm:p-5">
      <h2 id="guia-titulo" className="font-semibold">Guía de voz</h2>
      <p className="text-sm text-slate-600">Te pregunto cada dato, tú contestas en voz alta y confirmas. Puedes decir «para», «repite» o «atrás». La contraseña y los consentimientos se marcan en pantalla.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {encendida
          ? <button type="button" className={clasesBotonSecundario} onClick={() => void voz.apaga()}>Detener la guía</button>
          : <button type="button" className={clasesBoton} onClick={() => void empieza()}>Empezar la guía de voz</button>}
      </div>
      <p className="mt-2 text-sm font-medium" aria-live="polite">{encendida ? TEXTO_ESTADO[voz.estado] : ''}</p>
      {voz.error ? <p role="alert" className="mt-2 text-sm text-red-800">{voz.error}</p> : null}
      {dicho ? <p className="mt-2 rounded-lg bg-slate-50 p-2 text-sm"><span className="font-semibold">Guía:</span> {dicho}</p> : null}
      {oido ? <p className="mt-1 text-sm text-slate-700"><span className="font-semibold">Te oí:</span> {oido}</p> : null}
    </section>
  );
}
