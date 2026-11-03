/**
 * UNA tarjeta para todo caso de laboratorio ya corrido: qué entra, qué trampa pone, qué salió de verdad y
 * el veredicto. Sustituye a las dos `tarjeta-caso.tsx` que `/laboratorio-etiquetas` y `/laboratorio-pymes`
 * repetían casi letra por letra. Son los «ejemplos» del banco: la misma forma (`CasoCorridoVisible`) vive
 * en `tools/banco-motores`. Lo que cada laboratorio pinta aparte (su pieza, su video) entra por `pieza`.
 *
 * Colores por token (estados de la marca Turno 25), no por paleta: así sigue al tema claro y al oscuro.
 */
import type { ReactNode } from 'react';
import { ETIQUETA_DE_ESTADO, type CasoCorridoVisible, type EstadoDeCaso } from '../../../../tools/banco-motores/dist/index.js';
import { BloqueEtiquetado } from '@/shared/components/bloque-etiquetado';

const ESTILO: Record<EstadoDeCaso, string> = {
  pasa: 'bg-exito-suave text-exito-texto',
  falla: 'bg-peligro-suave text-peligro-texto',
  'no-medido': 'bg-aviso-suave text-aviso-texto',
};

export function EtiquetaEstado({ estado }: { estado: EstadoDeCaso }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTILO[estado]}`}>{ETIQUETA_DE_ESTADO[estado]}</span>;
}

function Cabecera({ corrido, requisitos }: { corrido: CasoCorridoVisible; requisitos?: Readonly<Record<string, string>> }) {
  const { caso } = corrido;
  return (
    <header className="flex flex-wrap items-center gap-2">
      <EtiquetaEstado estado={corrido.resultado.estado} />
      <h3 className="text-sm font-semibold">{caso.titulo}</h3>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">{caso.id} · {corrido.ms} ms</span>
      {caso.trampa ? <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">trampa: {caso.trampa}</span> : null}
      {caso.requiere && requisitos?.[caso.requiere] ? <span className="rounded-full border border-info px-2 py-0.5 text-xs text-info-texto">{requisitos[caso.requiere]}</span> : null}
      {!corrido.coincide ? <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground">esperaba «{caso.esperado}»</span> : null}
    </header>
  );
}

export function TarjetaCaso({ corrido, pieza, requisitos }: {
  corrido: CasoCorridoVisible;
  pieza?: ReactNode;
  requisitos?: Readonly<Record<string, string>>;
}) {
  const { caso, resultado } = corrido;
  return (
    <article className="rounded-xl border border-border bg-card p-4 text-card-foreground" data-prueba={`caso-${caso.id}`} data-estado={resultado.estado}>
      <Cabecera corrido={corrido} {...(requisitos ? { requisitos } : {})} />
      <p className="mt-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">Entrada:</span> {caso.entrada}</p>
      <div className={pieza ? 'mt-4 grid gap-3 md:grid-cols-[1fr_auto]' : 'mt-4'}>
        <BloqueEtiquetado etiqueta="Lo que salió">
          <ul className="space-y-1 text-sm">
            {resultado.evidencia.filter(Boolean).map((e, i) => (
              <li key={i} className={`whitespace-pre-wrap break-words rounded bg-muted px-2 py-1 font-mono text-xs ${e.startsWith('✗') ? 'text-peligro-texto' : 'text-foreground'}`}>{e}</li>
            ))}
          </ul>
        </BloqueEtiquetado>
        {pieza}
      </div>
      <p className="mt-3 text-sm"><span className="font-semibold">Veredicto:</span> {resultado.veredicto}</p>
    </article>
  );
}
