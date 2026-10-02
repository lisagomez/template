/**
 * La pantalla del dueño: elige la pyme, pregunta en español y recibe una respuesta con su prueba,
 * o un «no» que dice por qué. Todo corrió en el servidor; la página no trae JavaScript propio.
 */
import Link from 'next/link';
import type { Especificacion, Respuesta } from '../services/nucleo';
import { PYMES, type IdDePyme } from '../services/servidor';
import { TarjetaDeRespuesta } from './respuesta';

interface Props {
  readonly pyme: IdDePyme;
  readonly gamma: string;
  readonly transacciones: number;
  readonly especificacion: Especificacion;
  readonly pregunta: string | null;
  readonly respuesta: Respuesta | null;
  readonly replay: { gamma: string; certificado: string | null } | null;
}

const enlace = (pyme: IdDePyme, q?: string) => `/crecimiento?pyme=${pyme}${q ? `&q=${encodeURIComponent(q)}` : ''}`;

export function PaginaPregunta({ pyme, gamma, transacciones, especificacion, pregunta, respuesta, replay }: Props) {
  const p = PYMES[pyme];
  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-6">
      <header className="mb-4 pr-24">
        <p className="text-xs uppercase tracking-widest text-neutral-500">Crecimiento demostrado · laboratorio con datos sintéticos</p>
        <h1 className="text-2xl font-bold sm:text-3xl">Ninguna cifra sin prueba</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Cada respuesta sale de un snapshot sellado (Γ), la verifica un kernel sin IA y su texto solo puede usar cifras verificadas. Lo que no se puede demostrar, se dice.
        </p>
      </header>
      <nav className="flex flex-wrap gap-2" aria-label="Pyme">
        {(Object.keys(PYMES) as IdDePyme[]).map((id) => (
          <Link key={id} href={enlace(id)} className={`rounded-full border px-3 py-1 text-sm ${id === pyme ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900' : 'border-neutral-300 dark:border-neutral-700'}`}>
            {PYMES[id].etiqueta} <span className="opacity-70">· {PYMES[id].modelo}</span>
          </Link>
        ))}
        <Link href="/laboratorio-crecimiento" className="rounded-full border border-dashed border-neutral-400 px-3 py-1 text-sm">Laboratorio de trampas →</Link>
      </nav>
      <p className="mt-2 text-xs text-neutral-500" data-prueba="gamma">Γ {gamma} · {transacciones.toLocaleString('es-MX')} transacciones · spec {especificacion.version} · {especificacion.supuestos.length} supuestos declarados · horizonte {especificacion.horizonte.desde} a {especificacion.horizonte.hasta}</p>
      <form method="get" action="/crecimiento" className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="pyme" value={pyme} />
        <label className="sr-only" htmlFor="q">Tu pregunta</label>
        <input id="q" name="q" defaultValue={pregunta ?? ''} placeholder="¿De dónde salió el crecimiento del trimestre?" className="min-w-0 flex-1 rounded border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700" />
        <button type="submit" className="rounded bg-neutral-900 px-4 py-2 font-semibold text-white dark:bg-white dark:text-neutral-900">Preguntar</button>
      </form>
      <div className="mt-2 flex flex-wrap gap-2 text-sm" data-prueba="ejemplos">
        {p.ejemplos.map((q) => <Link key={q} href={enlace(pyme, q)} className="rounded bg-neutral-100 px-2 py-1 hover:bg-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-800">{q}</Link>)}
      </div>
      {respuesta && <TarjetaDeRespuesta r={respuesta} especificacion={especificacion} replay={replay} />}
      {respuesta?.veredicto?.estado === 'aceptada' && !replay && (
        <p className="mt-2 text-sm"><Link className="underline" href={`${enlace(pyme, pregunta ?? '')}&replay=1`}>Repetir con Γ reconstruido desde las fuentes (replay)</Link></p>
      )}
      <footer className="mt-10 text-xs text-neutral-500">
        Datos sintéticos con la verdad plantada; ningún dato de una pyme real. Agentes simulados: el adaptador del LLM real existe y dice «no medido». La pasarela A2A es local: exponerla es una decisión humana.
      </footer>
    </main>
  );
}
