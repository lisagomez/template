'use client';

/**
 * El panel de migración de OpenWA a la API oficial: qué cambiar (URL y llave), el informe de las llamadas que hoy hace
 * quien migra y la matriz completa de las 203 operaciones del contrato pineado, cada una con su fuente. Compatible con
 * la API de OpenWA; no es OpenWA.
 */
import { useMemo, useState } from 'react';

export type EstadoFila = 'igual' | 'diferencia' | 'imposible' | 'pendiente' | 'fuera';
export interface FilaPanel { operacion: string; metodo: string; ruta: string; etiqueta: string; estado: EstadoFila; nota: string; alternativa?: string; fuente: string; certeza: 'documentado' | 'sin_documentar' }
export interface ResumenPanel { version: string; sha256: string; total: number; porEstado: Record<EstadoFila, number>; sirve: number }
interface LineaInforme { llamada: string; metodo: string; ruta: string; estado: EstadoFila | 'desconocida'; nota: string; alternativa?: string }
interface Informe { lineas: LineaInforme[]; resumen: Record<EstadoFila | 'desconocida', number>; migraSinCambios: boolean }

const ESTADOS: Array<{ e: EstadoFila; titulo: string; color: string }> = [
  { e: 'igual', titulo: 'Igual', color: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' },
  { e: 'diferencia', titulo: 'Cambia', color: 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200' },
  { e: 'pendiente', titulo: 'Pendiente', color: 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200' },
  { e: 'imposible', titulo: 'Imposible', color: 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200' },
  { e: 'fuera', titulo: 'Fuera', color: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300' },
];
const COLOR = Object.fromEntries(ESTADOS.map((x) => [x.e, x.color])) as Record<EstadoFila, string>;
const TITULO = Object.fromEntries(ESTADOS.map((x) => [x.e, x.titulo])) as Record<EstadoFila, string>;
const EJEMPLO = ['POST /api/sessions', 'POST /api/sessions/mi-sesion/start', 'GET /api/sessions/mi-sesion/qr', 'POST /api/sessions/mi-sesion/messages/send-text',
  'POST /api/sessions/mi-sesion/messages/send-image', 'POST /api/sessions/mi-sesion/messages/send-poll', 'POST /api/sessions/mi-sesion/groups', 'POST /api/sessions/mi-sesion/webhooks'].join('\n');

function Chip({ estado }: { estado: EstadoFila | 'desconocida' }) {
  const color = estado === 'desconocida' ? 'bg-neutral-100 text-neutral-600' : COLOR[estado];
  return <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-semibold ${color}`}>{estado === 'desconocida' ? '¿?' : TITULO[estado]}</span>;
}

function DosCambios() {
  return (
    <section className="mb-8 min-w-0" data-prueba="dos-cambios">
      <h2 className="mb-2 text-lg font-semibold">Cambia dos cosas</h2>
      <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-400">Tus rutas, tu SDK y tus webhooks siguen igual. Lo que la vía oficial no hace contesta con un error que dice qué usar en su lugar; nunca se finge.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <pre className="overflow-x-auto rounded border border-red-200 bg-red-50 p-3 text-xs dark:border-red-900 dark:bg-red-950"><code>{`// Antes: OpenWA (WhatsApp Web, no oficial)\nconst cliente = new OpenWAClient({\n  baseUrl: 'http://tu-servidor:2785',\n  apiKey: 'owa_k1_…',\n});`}</code></pre>
        <pre className="overflow-x-auto rounded border border-emerald-200 bg-emerald-50 p-3 text-xs dark:border-emerald-900 dark:bg-emerald-950"><code>{`// Después: Cloud API oficial, misma API\nconst cliente = new OpenWAClient({\n  baseUrl: 'https://<esta-app>/api/ventas-whatsapp/openwa',\n  apiKey: '<llave de la fachada>',\n});`}</code></pre>
      </div>
      <p className="mt-2 text-xs text-neutral-500">En lugar del QR, <code>POST /sessions/:id/start</code> devuelve <code>signupUrl</code>: la liga de alta de Meta (Embedded Signup).</p>
    </section>
  );
}

function Resumen({ r }: { r: ResumenPanel }) {
  return (
    <section className="mb-8 min-w-0" data-prueba="resumen">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded border p-3"><span className="block text-2xl font-bold">{r.total}</span><span className="text-xs text-neutral-500">operaciones del contrato</span></div>
        {ESTADOS.map(({ e, titulo, color }) => (
          <div key={e} className={`rounded p-3 ${color}`}><span className="block text-2xl font-bold">{r.porEstado[e]}</span><span className="text-xs">{titulo}</span></div>
        ))}
      </div>
      <p className="mt-2 break-all text-xs text-neutral-500">OpenWA {r.version} · openapi.json pineado {r.sha256.slice(0, 23)}… · se sirven {r.sirve}; las demás contestan 501 con su alternativa.</p>
    </section>
  );
}

function TuInforme() {
  const [texto, setTexto] = useState(EJEMPLO);
  const [informe, setInforme] = useState<Informe | null>(null);
  const [error, setError] = useState('');
  const revisa = async () => {
    const r = await fetch('/api/ventas-whatsapp/openwa-informe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ llamadas: texto }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setError(String((j as { error?: string }).error ?? `HTTP ${r.status}`)); return; }
    setError('');
    setInforme(j as Informe);
  };
  return (
    <section className="mb-8 min-w-0" data-prueba="informe">
      <h2 className="mb-2 text-lg font-semibold">¿Qué pasa con tus llamadas?</h2>
      <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-400">Pega una llamada por renglón (<code>MÉTODO /api/…</code> o la URL completa). No se guarda.</p>
      <textarea className="h-36 w-full rounded border p-2 font-mono text-xs dark:bg-neutral-900" value={texto} onChange={(e) => setTexto(e.target.value)} data-prueba="llamadas" aria-label="Llamadas de OpenWA" />
      <button type="button" className="mt-2 rounded bg-neutral-900 px-3 py-1.5 font-semibold text-white dark:bg-white dark:text-neutral-900" onClick={revisa} data-prueba="revisa">Revisar</button>
      {error && <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
      {informe && (
        <div className="mt-4" data-prueba="resultado">
          <p className="mb-2 flex flex-wrap gap-2 text-sm">{(['igual', 'diferencia', 'pendiente', 'imposible', 'fuera'] as const).map((e) => <span key={e}><Chip estado={e} /> {informe.resumen[e]}</span>)}{informe.resumen.desconocida > 0 && <span><Chip estado="desconocida" /> {informe.resumen.desconocida}</span>}</p>
          <ul className="divide-y divide-neutral-200 rounded border text-sm dark:divide-neutral-800">
            {informe.lineas.map((l, i) => (
              <li key={i} className="p-2">
                <p className="flex flex-wrap items-center gap-2"><Chip estado={l.estado} /><code className="break-all text-xs">{l.metodo} {l.ruta || l.llamada}</code></p>
                <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">{l.nota}</p>
                {l.alternativa && <p className="mt-1 text-xs"><b>Alternativa:</b> {l.alternativa}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Matriz({ filas }: { filas: FilaPanel[] }) {
  const [estado, setEstado] = useState<EstadoFila | 'todas'>('todas');
  const [busca, setBusca] = useState('');
  const vistas = useMemo(() => filas.filter((f) => (estado === 'todas' || f.estado === estado) && (!busca || `${f.metodo} ${f.ruta} ${f.etiqueta}`.toLowerCase().includes(busca.toLowerCase()))), [filas, estado, busca]);
  return (
    <section className="mb-8 min-w-0" data-prueba="matriz">
      <h2 className="mb-2 text-lg font-semibold">La matriz completa</h2>
      <div className="mb-3 flex flex-wrap gap-2">
        {(['todas', ...ESTADOS.map((x) => x.e)] as const).map((e) => (
          <button key={e} type="button" onClick={() => setEstado(e)} data-prueba={`filtro-${e}`} className={`rounded border px-2 py-1 text-sm ${estado === e ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900' : ''}`}>{e === 'todas' ? 'Todas' : TITULO[e]}</button>
        ))}
        <input className="min-w-0 flex-1 rounded border px-3 py-1 text-sm dark:bg-neutral-900" placeholder="Busca una ruta: send-text, groups…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar ruta" />
      </div>
      <p className="mb-2 text-xs text-neutral-500">{vistas.length} de {filas.length}</p>
      <ul className="divide-y divide-neutral-200 rounded border text-sm dark:divide-neutral-800">
        {vistas.map((f) => (
          <li key={f.operacion} className="grid gap-1 p-2 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <p className="flex min-w-0 flex-wrap items-center gap-2"><Chip estado={f.estado} /><code className="break-all text-xs">{f.metodo} {f.ruta}</code></p>
            <div className="min-w-0 text-xs text-neutral-600 dark:text-neutral-400">
              <p>{f.nota}</p>
              {f.alternativa && <p className="mt-1 text-neutral-800 dark:text-neutral-200"><b>Alternativa:</b> {f.alternativa}</p>}
              <a className="mt-1 inline-block underline" href={f.fuente} target="_blank" rel="noreferrer">fuente</a>
              {f.certeza === 'sin_documentar' && <span className="ml-2 text-[10px] text-neutral-500">(se sostiene en una ausencia en la documentación)</span>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MigracionOpenWA({ resumen, filas }: { resumen: ResumenPanel; filas: FilaPanel[] }) {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6">
      <header className="mb-6 pr-24">
        <p className="text-xs uppercase tracking-widest text-neutral-500">Laboratorio · puerta de salida</p>
        <h1 className="text-2xl font-bold sm:text-3xl">De OpenWA a la API oficial de WhatsApp</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Compatible con la API de OpenWA {resumen.version} y servida sobre el BSP oficial. No es OpenWA ni habla en su nombre.</p>
      </header>
      <Resumen r={resumen} />
      <DosCambios />
      <TuInforme />
      <Matriz filas={filas} />
    </div>
  );
}
