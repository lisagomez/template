/**
 * El GRAFO DE ATENCIÓN del laboratorio: el recorrido del paciente, con el conteo y el tiempo p50 de cada arista
 * (de MetricFlow). Un solo tono; el grosor sigue al conteo y cada arista lleva su rótulo y su tooltip; debajo, la
 * misma información en tabla.
 */
import type { GrafoAtencion } from '../../../../../tools/clinica-dental/dist/index.js';

const POS: Record<string, [number, number]> = {
  visita: [75, 210], registro: [245, 210], consentimientos: [415, 210], agenda: [585, 210], cita: [755, 210], avisos: [925, 210], asistencia: [1095, 140], inasistencia: [1095, 290],
  asistente: [245, 70], urgencia: [470, 70], baja: [415, 350], cancelada: [665, 360], reprogramada: [835, 360],
};
const MEDIO_ANCHO = 58;
const MEDIO_ALTO = 24;

const tiempo = (s: number | null) => (s === null ? '—' : s < 90 ? `${Math.round(s)} s` : s < 5_400 ? `${Math.round(s / 60)} min` : s < 172_800 ? `${Math.round(s / 3_600)} h` : `${Math.round(s / 86_400)} d`);

/** Dónde sale (o entra) una arista: el borde del rectángulo del nodo en dirección al otro, no su centro. */
function borde([cx, cy]: [number, number], [tx, ty]: [number, number], holgura = 0): [number, number] {
  const dx = tx - cx;
  const dy = ty - cy;
  const t = Math.min(dx ? (MEDIO_ANCHO + holgura) / Math.abs(dx) : Infinity, dy ? (MEDIO_ALTO + holgura) / Math.abs(dy) : Infinity);
  return [cx + dx * t, cy + dy * t];
}

/** El rótulo de un nodo en hasta tres renglones de 14 caracteres (sin el paréntesis aclaratorio). */
const renglones = (label: string) => label.split(' (')[0]!.split(' ').reduce<string[]>((ls, w) => { const u = ls[ls.length - 1]; if (u && `${u} ${w}`.length <= 14) ls[ls.length - 1] = `${u} ${w}`; else ls.push(w); return ls; }, []).slice(0, 3);

const HALO = { paintOrder: 'stroke', stroke: '#ffffff', strokeWidth: 4, strokeLinejoin: 'round' } as const;

export function Grafo({ grafo }: { grafo: GrafoAtencion }) {
  const maximo = Math.max(1, ...grafo.aristas.map((a) => a.n));
  const etiqueta = new Map(grafo.nodos.map((n) => [n.id, n.label]));
  return (
    <div className="space-y-4">
      <figure className="overflow-hidden rounded-xl bg-white p-2 ring-1 ring-slate-200">
        <svg viewBox="0 0 1170 410" className="h-auto w-full" role="img" aria-labelledby="grafo-titulo grafo-desc">
          <title id="grafo-titulo">Recorrido del paciente</title>
          <desc id="grafo-desc">Nodos del recorrido y aristas con el número de pacientes que pasaron y el tiempo mediano entre un paso y el siguiente. La tabla de abajo trae los mismos datos.</desc>
          {/* La punta mide lo mismo en toda arista: en unidades del dibujo, no del grosor (si no, la arista gruesa la vuelve enorme). */}
          <defs><marker id="punta" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#0f766e" /></marker></defs>
          {grafo.aristas.map((a) => {
            const de = POS[a.from] ?? [0, 0];
            const a2 = POS[a.to] ?? [0, 0];
            const [x1, y1] = borde(de, a2);
            const [x2, y2] = borde(a2, de, 3);
            const horizontal = Math.abs(y2 - y1) < 1;
            const [mx, my] = [(x1 + x2) / 2, (y1 + y2) / 2];
            return (
              <g key={a.id}>
                <title>{`${etiqueta.get(a.from)} → ${etiqueta.get(a.to)}: ${a.n} · p50 ${tiempo(a.p50_s)}`}</title>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#0f766e" strokeOpacity={0.75} strokeWidth={2 + (6 * a.n) / maximo} strokeLinecap="round" markerEnd="url(#punta)" />
                <text x={mx} y={horizontal ? my - 9 : my - 4} textAnchor="middle" className="fill-slate-800 text-[13px] font-semibold" style={HALO}>{a.n}</text>
                <text x={mx} y={horizontal ? my + 18 : my + 10} textAnchor="middle" className="fill-slate-600 text-[11px]" style={HALO}>{tiempo(a.p50_s)}</text>
              </g>
            );
          })}
          {grafo.nodos.map((n) => {
            const [x, y] = POS[n.id] ?? [0, 0];
            const ls = renglones(n.label);
            return (
              <g key={n.id}>
                <rect x={x - MEDIO_ANCHO} y={y - MEDIO_ALTO} width={MEDIO_ANCHO * 2} height={MEDIO_ALTO * 2} rx={10} fill="#f0fdfa" stroke="#0f766e" strokeWidth={1.5} />
                {ls.map((l, i) => <text key={i} x={x} y={y + (i - (ls.length - 1) / 2) * 13 + 4} textAnchor="middle" className="fill-slate-900 text-[12px] font-medium">{l}</text>)}
              </g>
            );
          })}
        </svg>
        <figcaption className="px-2 pb-1 text-xs text-slate-600">Grosor = pacientes que pasaron por la arista; debajo de cada número, el tiempo mediano (p50). Fuente: {grafo.fuente}.</figcaption>
      </figure>
      <div role="region" aria-label="Aristas del recorrido" tabIndex={0} className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200 focus-visible:outline focus-visible:outline-2">
        <table className="w-full text-left text-sm">
          <caption className="px-3 pt-3 text-left text-sm font-semibold">Aristas del recorrido</caption>
          <thead className="text-xs text-slate-600"><tr><th className="px-3 py-2">Desde</th><th className="px-3 py-2">Hacia</th><th className="px-3 py-2 text-right">Pacientes</th><th className="px-3 py-2 text-right">Tiempo p50</th><th className="px-3 py-2">Origen</th></tr></thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {grafo.aristas.map((a) => <tr key={a.id}><td className="px-3 py-2">{etiqueta.get(a.from)}</td><td className="px-3 py-2">{etiqueta.get(a.to)}</td><td className="px-3 py-2 text-right">{a.n}</td><td className="px-3 py-2 text-right">{tiempo(a.p50_s)}</td><td className="px-3 py-2">{a.origen}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
