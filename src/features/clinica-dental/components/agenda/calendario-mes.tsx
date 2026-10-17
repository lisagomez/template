'use client';

/**
 * El calendario mensual: solo los días con hueco se pueden elegir; los demás se ven, pero apagados. Las fechas
 * son texto AAAA-MM-DD de la zona de la clínica, así que se calcula en UTC sin que la zona del navegador las corra.
 */
import type { DiaDisponible } from '../../../../../tools/clinica-dental/dist/index.js';

const NOMBRES_DIA = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const mesTexto = (anio: number, mes: number) => mayuscula(new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(anio, mes - 1, 1))));
export const fechaLarga = (fecha: string) => mayuscula(new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.parse(fecha) + 12 * 3_600_000)));

export function CalendarioMes({ anio, mes, dias, elegido, alElegir, alCambiarMes, puedeAtras, puedeAdelante }: {
  anio: number; mes: number; dias: DiaDisponible[]; elegido: string | null; alElegir: (fecha: string) => void; alCambiarMes: (delta: number) => void; puedeAtras: boolean; puedeAdelante: boolean;
}) {
  const porFecha = new Map(dias.map((d) => [d.fecha, d]));
  const primero = new Date(Date.UTC(anio, mes - 1, 1));
  const enBlanco = (primero.getUTCDay() + 6) % 7;
  const total = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const celdas: (string | null)[] = [...Array(enBlanco).fill(null), ...Array.from({ length: total }, (_, i) => `${anio}-${String(mes).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`)];
  const semanas: (string | null)[][] = [];
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => alCambiarMes(-1)} disabled={!puedeAtras} className="min-h-11 min-w-11 rounded-md hover:bg-slate-100 disabled:opacity-30" aria-label="Mes anterior">‹</button>
        <h3 className="font-semibold" aria-live="polite">{mesTexto(anio, mes)}</h3>
        <button type="button" onClick={() => alCambiarMes(1)} disabled={!puedeAdelante} className="min-h-11 min-w-11 rounded-md hover:bg-slate-100 disabled:opacity-30" aria-label="Mes siguiente">›</button>
      </div>
      <table className="w-full table-fixed text-center text-sm">
        <caption className="sr-only">Días con horarios disponibles en {mesTexto(anio, mes)}</caption>
        <thead><tr>{NOMBRES_DIA.map((d) => <th key={d} scope="col" className="py-1 text-xs font-medium text-slate-500">{d}</th>)}</tr></thead>
        <tbody>
          {semanas.map((s, i) => (
            <tr key={i}>
              {s.map((fecha, j) => {
                if (!fecha) return <td key={j} />;
                const d = porFecha.get(fecha);
                const activo = elegido === fecha;
                return (
                  <td key={j} className="p-0.5">
                    <button
                      type="button" data-dia={fecha} disabled={!d} onClick={() => d && alElegir(fecha)} aria-pressed={activo}
                      aria-label={`${fechaLarga(fecha)}${d ? `, ${d.horas.length} horarios` : ', sin horarios'}`}
                      className={`h-11 w-full rounded-lg text-sm ${activo ? 'bg-[color:var(--c1)] font-semibold text-white' : d ? 'bg-[color:var(--c0)] font-medium text-slate-900 ring-1 ring-[color:var(--c1)]/30 hover:ring-[color:var(--c1)]' : 'text-slate-400'}`}
                    >
                      {Number(fecha.slice(8))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
