/**
 * La CASCADA del puente: de cero, cada clase suma (azul) o resta (rojo) a partir de donde terminó
 * la anterior, y la última barra, el cambio total, termina exactamente donde terminó la cascada:
 * se VE que cierra al centavo. Solo dibuja hechos del CERTIFICADO, nunca un cálculo aparte.
 * Paleta divergente validada (claro y oscuro); valores también en la tabla de abajo.
 */
import type { Certificado } from '../services/nucleo';
import { etiqueta, formatoPesos } from '../services/nucleo';

const NOMBRES: Readonly<Record<string, string>> = { N: 'Nuevos', K_exp: 'Crecieron', K_con: 'Decrecieron', K_flat: 'Estables', L: 'Perdidos', Z: 'Solo ajustes', A: 'Público en general' };
const ORDEN = ['N', 'K_exp', 'K_con', 'K_flat', 'L', 'Z', 'A'] as const;

export interface Puente {
  readonly desde: string;
  readonly hasta: string;
  readonly metrica: string;
  readonly clases: readonly { readonly clase: string; readonly nombre: string; readonly n: number | null; readonly delta: number }[];
  readonly total: number;
  readonly inicio: number | null;
  readonly fin: number | null;
}

/** El puente de un certificado (o `null` si el certificado no es de un puente). */
export function puenteDe(c: Certificado): Puente | null {
  const de = (m: string, clase: string, en?: string) => c.hechos.find((h) => h.termino.m === m && 'clase' in h.termino && h.termino.clase === clase && !('cliente' in h.termino && h.termino.cliente) && (en === undefined || ('en' in h.termino && h.termino.en === en)));
  const v = (h: ReturnType<typeof de>) => (h?.valor.tipo === 'centavos' || h?.valor.tipo === 'conteo' ? h.valor.v : null);
  const total = de('dR', 'T');
  if (!total || total.termino.m !== 'dR' || !c.hechos.some((h) => h.termino.m === 'n')) return null;
  const clases = ORDEN.flatMap((clase) => {
    const delta = v(de('dR', clase));
    const n = v(de('n', clase));
    return delta === null || (delta === 0 && !n) ? [] : [{ clase, nombre: NOMBRES[clase]!, n: clase === 'A' ? null : n, delta }];
  });
  return { desde: total.termino.desde, hasta: total.termino.hasta, metrica: total.termino.metrica, clases, total: v(total)!, inicio: v(de('R', 'T', 'desde')), fin: v(de('R', 'T', 'hasta')) };
}

const compacto = (c: number) => {
  const p = Math.abs(c) / 100;
  const s = p >= 1e6 ? `$${(p / 1e6).toFixed(2)} M` : p >= 1e3 ? `$${(p / 1e3).toFixed(0)} mil` : `$${p.toFixed(0)}`;
  return `${c < 0 ? '−' : c > 0 ? '+' : ''}${s}`;
};

function escala(min: number, max: number, alto: number) {
  const pad = (max - min) * 0.08 || 1;
  const [a, b] = [min - pad, max + pad];
  const y = (v: number) => ((b - v) / (b - a)) * alto;
  const paso = 10 ** Math.floor(Math.log10((b - a) / 4));
  const bonito = [1, 2, 5, 10].map((m) => m * paso).find((s) => (b - a) / s <= 5) ?? paso * 10;
  const ticks: number[] = [];
  for (let t = Math.ceil(a / bonito) * bonito; t <= b; t += bonito) ticks.push(t);
  return { y, ticks };
}

export function Cascada({ puente }: { puente: Puente }) {
  const [ancho, alto, izq, arriba, abajo] = [760, 230, 84, 22, 54];
  const barras = [...puente.clases.map((c) => ({ ...c, total: false })), { clase: 'T', nombre: 'Cambio total', n: null, delta: puente.total, total: true }];
  let acumulado = 0;
  const tramos = barras.map((b) => {
    const [a, z] = b.total ? [0, b.delta] : [acumulado, acumulado + b.delta];
    if (!b.total) acumulado += b.delta;
    return { ...b, a, z };
  });
  const valores = tramos.flatMap((t) => [t.a, t.z, 0]);
  const { y, ticks } = escala(Math.min(...valores), Math.max(...valores), alto);
  const ranura = (ancho - izq - 8) / tramos.length;
  const grosor = Math.min(56, ranura * 0.62);
  const maximo = Math.max(...tramos.map((t) => Math.abs(t.delta)));
  return (
    <figure className="mt-4" data-prueba="cascada">
      <figcaption className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400">
        <span className="font-semibold text-neutral-800 dark:text-neutral-200">Cambio del ingreso {puente.metrica}, {etiqueta(puente.desde)} → {etiqueta(puente.hasta)}, por clase de cliente</span>
        <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-[#2a78d6] dark:bg-[#3987e5]" />suma</span>
        <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-[#e34948] dark:bg-[#e66767]" />resta</span>
        <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-neutral-500 dark:bg-neutral-400" />cambio total (cierra al centavo)</span>
      </figcaption>
      <svg viewBox={`0 0 ${ancho} ${alto + arriba + abajo}`} className="h-auto w-full" role="img" aria-label={`Cascada del puente: cambio total ${formatoPesos(puente.total)}`}>
        <g transform={`translate(0 ${arriba})`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={izq} x2={ancho - 8} y1={y(t)} y2={y(t)} className={t === 0 ? 'stroke-neutral-400 dark:stroke-neutral-600' : 'stroke-neutral-200 dark:stroke-neutral-800'} strokeWidth={1} />
              <text x={izq - 8} y={y(t) + 4} textAnchor="end" className="fill-neutral-500 text-[11px] tabular-nums">{compacto(t)}</text>
            </g>
          ))}
          {tramos.map((t, i) => {
            const x = izq + ranura * i + (ranura - grosor) / 2;
            const [y1, y2] = [y(Math.max(t.a, t.z)), y(Math.min(t.a, t.z))];
            const color = t.total ? 'fill-neutral-500 dark:fill-neutral-400' : t.delta >= 0 ? 'fill-[#2a78d6] dark:fill-[#3987e5]' : 'fill-[#e34948] dark:fill-[#e66767]';
            const etiquetaVisible = t.total || Math.abs(t.delta) >= maximo * 0.08;
            return (
              <g key={t.clase} tabIndex={0}>
                <title>{`${t.nombre}${t.n !== null ? ` (${t.n})` : ''}: ${formatoPesos(t.delta)}`}</title>
                {i > 0 && <line x1={x - (ranura - grosor)} x2={x} y1={y(t.total ? t.z : t.a)} y2={y(t.total ? t.z : t.a)} className="stroke-neutral-300 dark:stroke-neutral-700" strokeWidth={1} />}
                <rect x={x} y={y1} width={grosor} height={Math.max(1.5, y2 - y1)} rx={3} className={color} />
                {etiquetaVisible && <text x={x + grosor / 2} y={t.delta >= 0 ? y1 - 6 : y2 + 14} textAnchor="middle" className="fill-neutral-800 text-[11px] font-semibold dark:fill-neutral-200">{compacto(t.delta)}</text>}
                <text x={x + grosor / 2} y={alto + 18} textAnchor="middle" className="fill-neutral-700 text-[11px] dark:fill-neutral-300">{t.nombre}</text>
                {t.n !== null && <text x={x + grosor / 2} y={alto + 32} textAnchor="middle" className="fill-neutral-500 text-[10px]">{t.n} clientes</text>}
              </g>
            );
          })}
        </g>
      </svg>
      <TablaDelPuente puente={puente} />
    </figure>
  );
}

/** La tabla gemela de la cascada: los mismos valores, exactos, sin depender del color. */
function TablaDelPuente({ puente }: { puente: Puente }) {
  return (
    <details className="mt-1 text-sm">
        <summary className="cursor-pointer text-neutral-600 dark:text-neutral-400">Ver como tabla (valores exactos)</summary>
        <table className="mt-2 w-full text-left text-sm tabular-nums">
          <thead><tr className="text-neutral-500"><th className="py-1 pr-2">Clase</th><th className="py-1 pr-2">Clientes</th><th className="py-1 text-right">ΔR</th></tr></thead>
          <tbody>
            {puente.clases.map((c) => <tr key={c.clase} className="border-t border-neutral-200 dark:border-neutral-800"><td className="py-1 pr-2">{c.nombre}</td><td className="py-1 pr-2">{c.n ?? '—'}</td><td className="py-1 text-right">{formatoPesos(c.delta)}</td></tr>)}
            <tr className="border-t-2 border-neutral-400 font-semibold"><td className="py-1 pr-2">Cambio total</td><td /><td className="py-1 text-right">{formatoPesos(puente.total)}</td></tr>
            {puente.inicio !== null && puente.fin !== null && <tr className="text-neutral-500"><td className="py-1 pr-2" colSpan={2}>Ingreso {etiqueta(puente.desde)} → {etiqueta(puente.hasta)}</td><td className="py-1 text-right">{formatoPesos(puente.inicio)} → {formatoPesos(puente.fin)}</td></tr>}
          </tbody>
        </table>
    </details>
  );
}
