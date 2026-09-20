'use client';

/**
 * La pagina entera: cabecera con la promesa (todo corre aqui, nada sale), emparejamiento si
 * hace falta, el mapa de salas y la exportacion del informe.
 */
import { useState } from 'react';
import { useLaboratorio } from '../hooks/use-laboratorio.ts';
import { Emparejar } from './emparejar.tsx';
import { MapaSalas } from './mapa-salas.tsx';
import type { ContextoPanel } from './paneles/contexto.ts';
import { Aviso, Boton } from './ui.tsx';

export function Laboratorio({ casoAbierto }: { casoAbierto?: number }) {
  const { movil, token, servidor, errorServidor, veredictos } = useLaboratorio();
  const [descargando, setDescargando] = useState(false);

  const descargaInforme = async () => {
    if (!token) return;
    setDescargando(true);
    const blob = await veredictos.informe(token);
    setDescargando(false);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laboratorio-voz-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const contexto: ContextoPanel = {
    token,
    voces: servidor?.voces ?? [],
    piezas: servidor?.piezas,
    guardaVeredicto: (v) => (token ? veredictos.guarda(token, v) : Promise.resolve(false)),
  };

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6">
      <header className="mb-6">
        <div className="pr-32">
          <p className="text-xs uppercase tracking-widest text-neutral-500">Laboratorio de voz</p>
          <h1 className="text-3xl font-bold">Qué sabe hacer hoy la voz, y pruébalo tú</h1>
        </div>
        <p className="mt-3 max-w-3xl text-base text-neutral-700 dark:text-neutral-300">
          Veinte casos en cuatro salas. Cada tarjeta dice qué hace, en qué estado está de verdad y cómo probarlo en tres pasos. Todo corre en esta computadora: tu voz y lo que dices no salen a internet. Lo que no está listo no se disfraza: se explica qué falta y quién lo decide.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Boton onClick={() => void descargaInforme()} disabled={!token || descargando} title={token ? 'Informe en Markdown con el estado real y tus veredictos' : 'Empareja el navegador para exportar'}>
            {descargando ? 'Generando…' : 'Descargar informe de pruebas'}
          </Boton>
          <span className="text-xs text-neutral-500">{veredictos.veredictos.length} veredictos guardados en esta computadora</span>
          {token ? (
            <button type="button" onClick={() => movil.olvida()} className="text-xs text-neutral-400 underline">
              olvidar emparejamiento
            </button>
          ) : null}
        </div>
        {errorServidor ? (
          <div className="mt-3">
            <Aviso tipo="error">{errorServidor}</Aviso>
          </div>
        ) : null}
        {veredictos.error ? (
          <div className="mt-3">
            <Aviso tipo="error">{veredictos.error}</Aviso>
          </div>
        ) : null}
      </header>
      {!token ? (
        <div className="mb-6">
          <Emparejar empareja={movil.empareja} error={movil.error} />
        </div>
      ) : null}
      <MapaSalas piezas={servidor?.piezas} contexto={contexto} veredictos={veredictos.veredictos} ocupadoVeredicto={veredictos.ocupado} casoAbierto={casoAbierto} />
    </main>
  );
}
