'use client';

/** El calendario vivo: una pieza por día con su reuso por canal. Aprobar NO publica: la subes tú. */
import { useMemo } from 'react';
import { Boton } from '@/features/laboratorio-voz/components/ui';
import { fechaLarga } from '../../../../tools/pymes-marketing/dist/index.js';
import { estadoDelCalendario, piezaComoDataUrl, type FilaDeCalendario } from '../../../../tools/pymes-marketing/dist/contenido/index.js';
import { useEstudio } from '../store/estudio.ts';
import { Copiar, Pastilla } from './ui-estudio.tsx';

const ANGULO: Record<FilaDeCalendario['angulo'], string> = { util: 'útil', prueba: 'prueba real', oferta: 'oferta', personas: 'personas' };
const TONO = { borrador: 'neutro', 'falta-algo': 'revisar', aprobada: 'bien', descartada: 'sin' } as const;

function Fila({ f }: { f: FilaDeCalendario }) {
  const decideFila = useEstudio((s) => s.decideFila);
  return (
    <div className="rounded-lg border border-neutral-200 p-2 text-sm dark:border-neutral-800" data-prueba={`fila-${f.id}`}>
      <div className="mb-1 flex flex-wrap items-center gap-2"><b className="capitalize">{f.canal}</b><span className="text-xs text-neutral-500">{f.formato}{f.origen ? ' · reuso de la pieza del día' : ''}</span><Pastilla tono={TONO[f.estado]}>{f.estado === 'aprobada' ? 'lista: la publicas tú' : f.estado}</Pastilla></div>
      <pre className="whitespace-pre-wrap break-words font-sans text-[13px]">{f.texto}</pre>
      {f.falta ? <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">Falta de ti: {f.falta}</p> : null}
      {f.avisos.length ? <ul className="mt-1 list-disc pl-4 text-xs text-neutral-500">{f.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Boton onClick={() => decideFila(f.id, 'aprobada')} disabled={f.estado === 'aprobada' || f.estado === 'falta-algo'}>Aprobar</Boton>
        <Boton variante="suave" onClick={() => decideFila(f.id, 'descartada')}>Descartar</Boton>
        <Copiar texto={f.texto} etiqueta="Copiar texto" />
        {f.pieza ? <a className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700" href={piezaComoDataUrl(f.pieza)} download={`${f.id}.svg`}>Descargar imagen</a> : null}
      </div>
    </div>
  );
}

function Dia({ filas }: { filas: readonly FilaDeCalendario[] }) {
  const origen = filas[0]!;
  return (
    <article className="grid gap-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800 md:grid-cols-[220px_1fr]" data-prueba="dia-calendario">
      <div>
        <p className="text-sm font-semibold">{fechaLarga(origen.dia)}</p>
        <p className="mb-2 text-xs text-neutral-500">{ANGULO[origen.angulo]} · {origen.tema}</p>
        {origen.pieza ? (
          // eslint-disable-next-line @next/next/no-img-element -- SVG generado aquí mismo, en data URL
          <img src={piezaComoDataUrl(origen.pieza)} alt={`Pieza del ${origen.dia}`} className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800" data-prueba="pieza" />
        ) : null}
      </div>
      <div className="grid gap-2">{filas.map((f) => <Fila key={f.id} f={f} />)}</div>
    </article>
  );
}

export function SeccionCalendario() {
  const { brief, marca, calendario, generaCalendario, ocupado } = useEstudio();
  const dias = useMemo(() => [...new Set(calendario.map((f) => f.dia))].map((d) => calendario.filter((f) => f.dia === d)), [calendario]);
  const estado = calendario.length ? estadoDelCalendario(calendario, calendario[0]!.dia) : null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Boton variante="primario" onClick={() => void generaCalendario()} disabled={!brief || !marca || ocupado}>Armar el calendario de 30 días</Boton>
        {!brief ? <span className="text-neutral-500">Primero el brief.</span> : null}
        {!marca ? <span className="text-neutral-500">Primero tu marca.</span> : null}
        {estado ? <span data-prueba="estado-calendario">{estado.aprobadas} listas · {estado.borradores} en borrador · {estado.faltaAlgo} esperan algo tuyo · hueco desde {estado.huecoDesde}</span> : null}
      </div>
      <p className="text-xs text-neutral-500">Aprobar deja la pieza lista para que tú la subas a Instagram, Facebook o tu estado de WhatsApp. Aquí nada se publica ni se programa.</p>
      <div className="grid gap-3">{dias.map((f) => <Dia key={f[0]!.dia} filas={f} />)}</div>
    </div>
  );
}
