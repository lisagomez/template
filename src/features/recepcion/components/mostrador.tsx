'use client';

/**
 * El mostrador (`/recepcion`): el negocio ficticio, su horario, sus servicios y su agenda pintada con la UI de
 * tools/calendario (`./react`) sobre la misma agenda de la pestaña. No importa la capa: la capa lo rodea con su
 * ventana, y lo que se pide en la conversación cambia esta misma agenda.
 */
import { useState } from 'react';
import { Agenda as VistaDeAgenda } from '../../../../tools/calendario/dist/react/index.js';
import { fechaEnZona, textoFecha, type Vista } from '../../../../tools/calendario/dist/index.js';
import { NEGOCIO, SERVICIOS, ZONA } from '../datos.ts';
import { CALENDARIO_DEL_MOSTRADOR } from '../services/agenda.ts';
import { horarioDeLaSemana } from '../services/textos.ts';
import { useFotoDeAgenda } from '../hooks/use-agenda';

const CALENDARIOS = [CALENDARIO_DEL_MOSTRADOR];
const PIDELE = ['¿Qué tengo hoy?', 'Aparta una cita mañana a las 10', '¿Qué horas quedan libres mañana?', 'Cancela la cita de mañana', '¿Cuánto cuesta un corte?', 'Recuerda que los martes llega el proveedor'];
const tarjeta = 'rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900';
const ceja = 'text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-400';

function Agenda() {
  const foto = useFotoDeAgenda();
  const [vista, setVista] = useState<Vista>('dia');
  const [fecha, setFecha] = useState<string | null>(null);
  if (foto.ahora === 0) return <div className={`${tarjeta} h-[520px] animate-pulse`} data-recepcion-agenda="leyendo">Leyendo la agenda…</div>;
  const hoy = textoFecha(fechaEnZona(foto.ahora, ZONA));
  return (
    <div data-recepcion-agenda="lista">
      <VistaDeAgenda vista={vista} fecha={fecha ?? hoy} zona={ZONA} instancias={foto.instancias} calendarios={CALENDARIOS} hoy={hoy}
        ahoraMs={foto.ahora} horaInicial={9} alto={520} alCambiarVista={setVista} alCambiarFecha={setFecha} />
    </div>
  );
}

export function Mostrador() {
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6" data-recepcion-mostrador={NEGOCIO.inquilino}>
      <header className="space-y-2">
        <p className={ceja}>Recepción · mostrador</p>
        <h1 className="font-serif text-3xl font-semibold text-neutral-900 dark:text-neutral-50">{NEGOCIO.nombre}</h1>
        <p className="max-w-3xl text-sm text-neutral-600 dark:text-neutral-400">
          Un negocio ficticio con datos sintéticos. La agenda es el simulador de Google de <code>tools/calendario</code>: aquí no se avisa a nadie de
          verdad, y al recargar la página vuelve a su semilla.
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-950 dark:text-amber-200">{NEGOCIO.nota}</span>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">sin modelo de IA</span>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">cancelar pide la cita textual y tu clic</span>
        </div>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        <section className={tarjeta}>
          <h2 className={ceja}>Horario</h2>
          <p className="mt-2 text-sm text-neutral-800 dark:text-neutral-200">Abrimos {horarioDeLaSemana()}.</p>
        </section>
        <section className={tarjeta}>
          <h2 className={ceja}>Servicios (precios de ejemplo)</h2>
          <ul className="mt-2 space-y-1 text-sm text-neutral-800 dark:text-neutral-200">
            {SERVICIOS.map((s) => (
              <li key={s.id} className="flex justify-between gap-3"><span>{s.nombre} · {s.minutos} min</span><b className="tabular-nums">${s.precio}</b></li>
            ))}
          </ul>
        </section>
      </div>
      <section className="space-y-2">
        <h2 className={ceja}>Agenda</h2>
        <Agenda />
      </section>
      <section className={tarjeta}>
        <h2 className={ceja}>Pídeselo en la conversación, con tus palabras</h2>
        <ul className="mt-2 flex flex-wrap gap-2 text-sm">
          {PIDELE.map((p) => <li key={p} className="rounded-full border border-neutral-200 px-3 py-1 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300">«{p}»</li>)}
        </ul>
      </section>
    </div>
  );
}
