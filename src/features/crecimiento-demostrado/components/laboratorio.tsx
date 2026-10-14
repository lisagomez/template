/**
 * El laboratorio: todo lo de esta página CORRIÓ en el servidor al abrirla. Las trampas por el
 * orquestador real, los snapshots sucios contra los invariantes, el puente contra la verdad
 * plantada, el replay de Γ y la inyección. Las siembras (mutaciones del kernel) viven en las
 * pruebas de la herramienta: tardan, y su resultado es de la suite.
 */
import Link from 'next/link';
import type { FilaDeCotejo, FilaDeSucio, ResultadoDeTrampa } from '../../../../tools/crecimiento-demostrado/dist/laboratorio/index.js';
import { formatoPesos } from '../services/nucleo';

interface Props {
  readonly trampas: readonly ResultadoDeTrampa[];
  readonly sucios: readonly FilaDeSucio[];
  readonly cotejo: readonly FilaDeCotejo[];
  readonly replay: { primera: string; segunda: string; bytes: number; iguales: boolean };
  readonly inyeccion: { sellado: boolean; mismosHechos: boolean; gammaLimpio: string; gammaInyectado: string };
  readonly cuando: string;
}

const PASA = 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200';
const FALLA = 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200';
const marca = (ok: boolean) => <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${ok ? PASA : FALLA}`}>{ok ? '✓ pasa' : '✕ falla'}</span>;
const th = 'py-1 pr-3 font-medium';

export function Laboratorio({ trampas, sucios, cotejo, replay, inyeccion, cuando }: Props) {
  const n = (xs: readonly { pasa?: boolean; cierra?: boolean }[]) => xs.filter((x) => x.pasa ?? x.cierra).length;
  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6">
      <header className="mb-4 pr-24">
        <p className="text-xs uppercase tracking-widest text-neutral-500">Crecimiento demostrado · laboratorio</p>
        <h1 className="text-2xl font-bold sm:text-3xl">Las trampas, y la defensa que las detiene</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">Corrido {cuando}. Dos pymes sintéticas con la verdad plantada; agentes simulados y adversariales. <Link className="underline" href="/crecimiento">← preguntar</Link></p>
        <p className="mt-2 flex flex-wrap gap-2 text-sm" data-prueba="resumen">
          <span className={`rounded px-2 py-0.5 font-semibold ${n(trampas) === trampas.length ? PASA : FALLA}`}>trampas {n(trampas)}/{trampas.length}</span>
          <span className={`rounded px-2 py-0.5 font-semibold ${n(sucios) === sucios.length ? PASA : FALLA}`}>snapshots sucios {n(sucios)}/{sucios.length}</span>
          <span className={`rounded px-2 py-0.5 font-semibold ${n(cotejo) === cotejo.length ? PASA : FALLA}`}>puente = verdad {n(cotejo)}/{cotejo.length}</span>
          <span className={`rounded px-2 py-0.5 font-semibold ${replay.iguales ? PASA : FALLA}`}>replay de Γ {replay.iguales ? 'idéntico' : 'distinto'}</span>
          <span className={`rounded px-2 py-0.5 font-semibold ${inyeccion.mismosHechos ? PASA : FALLA}`}>inyección: {inyeccion.mismosHechos ? 'mismos hechos' : 'hechos movidos'}</span>
        </p>
      </header>
      <h2 className="mt-6 text-lg font-semibold">Trampas, de punta a punta por el orquestador</h2>
      <div className="overflow-x-auto">
        <table className="mt-2 w-full text-left text-sm" data-prueba="trampas">
          <thead><tr className="text-neutral-500"><th className={th}>#</th><th className={th}>Trampa</th><th className={th}>Pyme</th><th className={th}>Esperado</th><th className={th}>Obtenido</th><th className={th}></th><th className={th}>Por qué</th></tr></thead>
          <tbody>
            {trampas.map((t) => (
              <tr key={t.trampa.id} className="border-t border-neutral-200 align-top dark:border-neutral-800">
                <td className="py-1 pr-3">{t.trampa.numero}</td>
                <td className="py-1 pr-3">{t.trampa.descripcion}</td>
                <td className="py-1 pr-3">{t.trampa.pyme}</td>
                <td className="py-1 pr-3 font-mono text-xs">{t.trampa.esperado.estado}{t.trampa.esperado.motivo ? ` / ${t.trampa.esperado.motivo}` : ''}</td>
                <td className="py-1 pr-3 font-mono text-xs">{t.obtenido.estado}{t.obtenido.motivo ? ` / ${t.obtenido.motivo}` : ''}</td>
                <td className="py-1 pr-3">{marca(t.pasa)}</td>
                <td className="max-w-md py-1 text-xs text-neutral-600 dark:text-neutral-400">{t.detalle.slice(0, 220)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Sucios sucios={sucios} />
      <Cotejo cotejo={cotejo} />
      <p className="mt-6 text-sm" data-prueba="replay-gamma">Replay de Γ (tienda, {(replay.bytes / 1e6).toFixed(1)} MB canónicos): {replay.primera} = {replay.segunda} {replay.iguales ? '✓' : '✕'}. Inyección en un concepto de CFDI: Γ {inyeccion.sellado ? 'sella' : 'no sella'}, el puente {inyeccion.mismosHechos ? 'no cambia un centavo' : 'cambió'} ({inyeccion.gammaLimpio} → {inyeccion.gammaInyectado}: otros bytes, mismos hechos).</p>
    </main>
  );
}

function Sucios({ sucios }: { sucios: readonly FilaDeSucio[] }) {
  return (
    <>
      <h2 className="mt-8 text-lg font-semibold">Snapshots sucios: un defecto por invariante, y Γ no se sella</h2>
      <table className="mt-2 w-full text-left text-sm" data-prueba="sucios">
        <thead><tr className="text-neutral-500"><th className={th}>Invariante</th><th className={th}>Defecto plantado</th><th className={th}>Detectado</th><th className={th}>Γ</th><th className={th}></th></tr></thead>
        <tbody>
          {sucios.map((s) => (
            <tr key={s.id} className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-1 pr-3 font-mono text-xs">{s.esperado}</td><td className="py-1 pr-3">{s.descripcion} <span className="text-neutral-500">({s.pyme})</span></td>
              <td className="py-1 pr-3 font-mono text-xs">{s.obtenidos.join(', ')}</td><td className="py-1 pr-3">{s.sellado ? 'sellado' : 'no sellado'}</td><td className="py-1">{marca(s.pasa)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Cotejo({ cotejo }: { cotejo: readonly FilaDeCotejo[] }) {
  const ultimas = cotejo.filter((f) => f.hasta === '2026-3T' && f.metrica === 'neto');
  return (
    <>
      <h2 className="mt-8 text-lg font-semibold">El puente del sistema contra la verdad plantada</h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{cotejo.filter((f) => f.cierra).length} de {cotejo.length} filas (pyme × transición × métrica) cierran al centavo en las ocho clases y en los factores de clientes × frecuencia × ticket. Detalle de la última transición:</p>
      <table className="mt-2 w-full text-left text-sm tabular-nums" data-prueba="cotejo">
        <thead><tr className="text-neutral-500"><th className={th}>Pyme</th><th className={th}>Clase</th><th className={`${th} text-right`}>Sistema</th><th className={`${th} text-right`}>Verdad plantada</th><th className={th}></th></tr></thead>
        <tbody>
          {ultimas.flatMap((f) => Object.keys(f.verdad).map((k) => (
            <tr key={`${f.pyme}-${k}`} className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-1 pr-3">{f.pyme}</td><td className="py-1 pr-3 font-mono text-xs">{k}</td>
              <td className="py-1 pr-3 text-right">{formatoPesos(f.sistema[k] ?? NaN)}</td><td className="py-1 pr-3 text-right">{formatoPesos(f.verdad[k] ?? NaN)}</td>
              <td className="py-1">{marca(f.sistema[k] === f.verdad[k])}</td>
            </tr>
          )))}
        </tbody>
      </table>
    </>
  );
}
