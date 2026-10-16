'use client';

/**
 * El HUD del centro de mando por voz. La disposición (orbe al centro, telemetría y registro a los
 * lados, controles abajo, fondo #05060a con rejilla) viene de business-os `CommandCenterLive`
 * (MIT © 2026 Daniel Carreón, ver LICENSE-FUENTE). Todo lo de debajo es local: la voz se oye y se
 * dice en esta máquina; solo el texto de una conversación sale hacia el cerebro.
 */
import { useCallback, useState } from 'react';
import type { ModoBucle } from '../../../../tools/bucle-voz/dist/index.js';
import { useCentroDeMando } from '../hooks/use-centro-de-mando.ts';
import { COLOR_ESTADO, NOMBRE_ESTADO, nivelVisual, rgb } from './colores.ts';
import { Onda } from './onda.tsx';
import { Orbe } from './orbe.tsx';
import { Registro } from './registro.tsx';
import { Subtitulos } from './subtitulos.tsx';
import { Telemetria } from './telemetria.tsx';
import { Emparejar, Estado, Panel } from './ui.tsx';

const MODOS: { id: ModoBucle; nombre: string; ayuda: string }[] = [
  { id: 'manos-libres', nombre: 'Manos libres', ayuda: 'Siempre escucha; háblale encima para callarlo.' },
  { id: 'palabra', nombre: '«Oye, mando»', ayuda: 'En reposo solo despierta con su nombre (transcrito en local).' },
  { id: 'toque', nombre: 'Toque o ESPACIO', ayuda: 'Un turno por toque; mantén ESPACIO para hablar.' },
];

export function CentroDeMando() {
  const { movil, token, sesion, vista, servidor, enciende, apaga, cambiaModo } = useCentroDeMando();
  const [escrito, setEscrito] = useState('');
  const nivel = useCallback(() => {
    if (!sesion) return 0;
    return nivelVisual(vista.estado === 'hablando' ? sesion.niveles.salida : sesion.niveles.mic);
  }, [sesion, vista.estado]);
  const color = COLOR_ESTADO[vista.error ? 'error' : vista.estado];
  const interrumpida = vista.entradas.some((e) => e.turno === vista.turnoFrases && e.interrumpida);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05060a] text-white" data-prueba="centro-de-mando" data-estado={vista.estado} style={{ ['--cc' as string]: rgb(color) }}>
      <div className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(60%_50%_at_50%_35%,var(--cc)_0%,transparent_70%)] [mix-blend-mode:screen] [opacity:0.12]" />
      <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:44px_44px]" />
      <div className="relative mx-auto flex max-w-7xl flex-col gap-4 px-4 pb-8 pt-5">
        <header className="flex flex-wrap items-center gap-3 pr-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm" data-prueba="chip-estado">
            <span className="h-2 w-2 rounded-full" style={{ background: rgb(color) }} />
            {NOMBRE_ESTADO[vista.estado]}
          </span>
          <h1 className="text-lg font-semibold tracking-wide">Centro de mando</h1>
          <Estado servidor={servidor} />
        </header>
        {!token ? <Emparejar empareja={movil.empareja} error={movil.error} /> : null}
        <div className="grid gap-4 lg:grid-cols-12">
          <Panel titulo="Telemetría por etapa" className="order-2 lg:order-1 lg:col-span-3 lg:max-h-[620px] lg:overflow-y-auto">
            <Telemetria turnos={vista.turnos} />
          </Panel>
          <section className="order-1 flex flex-col items-center gap-3 lg:order-2 lg:col-span-6">
            <Orbe estado={vista.estado} nivel={nivel} />
            <Onda estado={vista.estado} nivel={nivel} />
            <Subtitulos frases={vista.frases} oyendo={vista.estado === 'escuchando' || vista.estado === 'transcribiendo' ? vista.oyendo : ''} interrumpida={interrumpida} />
          </section>
          <Panel titulo="Conversación" className="order-3 lg:col-span-3 lg:max-h-[620px] lg:overflow-y-auto">
            <Registro entradas={vista.entradas} />
          </Panel>
        </div>
        <footer className="flex flex-col items-center gap-3">
          {vista.error ? <p className="rounded-lg bg-red-500/15 px-3 py-1 text-sm text-red-200" data-prueba="error">{vista.error}</p> : null}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              disabled={!sesion}
              onClick={() => (vista.encendido ? sesion?.bucle.activa() : void enciende())}
              className="h-16 min-w-16 rounded-full border-2 px-5 text-sm font-semibold transition disabled:opacity-40"
              style={{ borderColor: rgb(color), background: rgb(color, 0.18) }}
              data-prueba="microfono"
              title={vista.encendido ? 'Escuchar ahora' : 'Encender el micrófono'}
            >
              {vista.encendido ? 'Hablar' : 'Encender'}
            </button>
            <button type="button" disabled={!sesion} onClick={() => sesion?.bucle.desactiva()} className="rounded-full border border-red-400/50 bg-red-500/10 px-4 py-2 text-sm text-red-200 disabled:opacity-40" data-prueba="parar">
              Parar <kbd className="ml-1 rounded bg-white/10 px-1 text-[10px]">Esc</kbd>
            </button>
            {vista.encendido ? (
              <button type="button" onClick={() => void apaga()} className="text-xs text-white/40 underline">
                apagar micrófono
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2" role="radiogroup" aria-label="Cómo se activa">
            {MODOS.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={vista.modo === m.id} title={m.ayuda} onClick={() => cambiaModo(m.id)} className={`rounded-full border px-3 py-1 text-xs ${vista.modo === m.id ? 'border-white/60 bg-white/10' : 'border-white/10 text-white/50'}`} data-prueba={`modo-${m.id}`}>
                {m.nombre}
              </button>
            ))}
            <span className="text-xs text-white/40" data-prueba="velocidad">velocidad ×{vista.velocidad.toFixed(2)}</span>
          </div>
          <form
            className="flex w-full max-w-md gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (escrito.trim() && sesion) sesion.bucle.dice(escrito.trim());
              setEscrito('');
            }}
          >
            <input value={escrito} onChange={(e) => setEscrito(e.target.value)} placeholder="o escribe una orden o una pregunta" className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm outline-none placeholder:text-white/30 focus:border-white/30" data-prueba="escrito" disabled={!sesion} />
            <button type="submit" disabled={!sesion} className="rounded-full bg-white/10 px-4 text-sm disabled:opacity-40">
              Enviar
            </button>
          </form>
          <p className="max-w-2xl text-center text-[11px] text-white/35">
            Tu voz no sale de esta computadora: el micrófono, la transcripción y la voz son locales. Solo el texto de una pregunta abierta viaja al cerebro (OpenRouter); las órdenes se resuelven aquí, sin LLM. Nada se escribe: lo que escribiría queda en borrador.
          </p>
        </footer>
      </div>
    </div>
  );
}
