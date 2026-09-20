'use client';

/** El mapa: resumen del semaforo, leyenda y las cuatro salas con sus tarjetas. */
import { CASOS, SALAS } from '../services/casos.ts';
import { resumenEstados } from '../services/estado-casos.ts';
import type { Piezas, Veredicto } from '../types/index.ts';
import type { ContextoPanel } from './paneles/contexto.ts';
import { Leyenda } from './semaforo.tsx';
import { TarjetaCaso } from './tarjeta-caso.tsx';

export function MapaSalas({ piezas, contexto, veredictos, ocupadoVeredicto, casoAbierto }: { piezas: Piezas | undefined; contexto: ContextoPanel; veredictos: Veredicto[]; ocupadoVeredicto: boolean; casoAbierto?: number }) {
  const resumen = resumenEstados(CASOS, piezas);
  const probados = new Set(veredictos.map((v) => v.caso)).size;
  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800" data-prueba="resumen">
        <div className="grid gap-3 sm:grid-cols-4">
          <Cifra nombre="Listos" valor={resumen.listo} color="text-emerald-600" />
          <Cifra nombre="Por reglas" valor={resumen.reglas} color="text-amber-600" />
          <Cifra nombre="Puerta humana" valor={resumen.puerta} color="text-neutral-500" />
          <Cifra nombre="Casos probados" valor={`${probados} / ${CASOS.length}`} color="text-neutral-800 dark:text-neutral-100" />
        </div>
        <div className="mt-4">
          <Leyenda />
        </div>
      </section>
      {SALAS.map((sala) => (
        <section key={sala.id} id={`sala-${sala.id}`} data-prueba={`sala-${sala.id}`}>
          <h2 className="text-xl font-bold">{sala.titulo}</h2>
          <p className="mb-3 text-sm text-neutral-500">{sala.bajada}</p>
          <div className="grid gap-3 lg:grid-cols-2">
            {CASOS.filter((c) => c.sala === sala.id).map((c) => (
              <TarjetaCaso key={c.id} caso={c} piezas={piezas} contexto={contexto} veredictos={veredictos.filter((v) => v.caso === c.id)} ocupadoVeredicto={ocupadoVeredicto} guardaVeredicto={contexto.guardaVeredicto} abiertaAlInicio={casoAbierto === c.id} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Cifra({ nombre, valor, color }: { nombre: string; valor: number | string; color: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-neutral-500">{nombre}</p>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{valor}</p>
    </div>
  );
}
