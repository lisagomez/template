'use client';

/**
 * Un bloque etiquetado por tipo de campo, de entrada y de salida: el contrato preprocess/postprocess de los
 * componentes de Gradio, en pequeño. El tipo lo decide el esquema (`describeEsquema`), no la pantalla.
 */
import type { Bloque } from '../../../../tools/banco-motores/dist/index.js';
import { BloqueEtiquetado, Cifra } from '@/shared/components/bloque-etiquetado';

const CAMPO = 'mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-base text-foreground transition-colors duration-rapida focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring';

type AlCambiar = (campo: string, valor: unknown) => void;

function leeArchivo(archivo: File): Promise<string> {
  return new Promise((ok, mal) => {
    const lector = new FileReader();
    lector.onload = () => ok(String(lector.result));
    lector.onerror = () => mal(lector.error);
    lector.readAsDataURL(archivo);
  });
}

function ControlDeEntrada({ bloque, valor, alCambiar }: { bloque: Bloque; valor: unknown; alCambiar: AlCambiar }) {
  const id = `banco-${bloque.campo}`;
  const texto = valor === undefined || valor === null ? '' : typeof valor === 'string' ? valor : JSON.stringify(valor);
  switch (bloque.tipo) {
    case 'texto-largo': case 'lista': case 'tabla': case 'objeto': case 'json':
      return <textarea id={id} rows={4} className={`${CAMPO} font-mono`} value={Array.isArray(valor) && bloque.tipo === 'lista' ? valor.join('\n') : texto} onChange={(e) => alCambiar(bloque.campo, e.target.value)} />;
    case 'numero':
      return <input id={id} type="number" inputMode="decimal" className={`${CAMPO} font-mono tabular-nums`} value={texto} min={bloque.minimo} max={bloque.maximo} onChange={(e) => alCambiar(bloque.campo, e.target.value)} />;
    case 'opcion':
      return <select id={id} className={CAMPO} value={texto} onChange={(e) => alCambiar(bloque.campo, e.target.value)}><option value="">Elige…</option>{bloque.opciones?.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
    case 'booleano':
      return <input id={id} type="checkbox" className="mt-2 size-5 accent-primary" checked={valor === true} onChange={(e) => alCambiar(bloque.campo, e.target.checked)} />;
    case 'imagen': case 'audio': case 'archivo':
      return <ArchivoDeEntrada id={id} bloque={bloque} valor={texto} alCambiar={alCambiar} />;
    default:
      // Un textarea de una fila que crece con su contenido: una URL larga se parte a la vista en vez de esconderse tras un scroll (peor caso de break-ui).
      return <textarea id={id} rows={1} className={`${CAMPO} resize-none [field-sizing:content] [overflow-wrap:anywhere]`} value={texto} onChange={(e) => alCambiar(bloque.campo, e.target.value)} />;
  }
}

function ArchivoDeEntrada({ id, bloque, valor, alCambiar }: { id: string; bloque: Bloque; valor: string; alCambiar: AlCambiar }) {
  const acepta = bloque.tipo === 'imagen' ? 'image/png,image/jpeg,image/webp' : bloque.tipo === 'audio' ? 'audio/*' : undefined;
  return (
    <div className="mt-1 space-y-2">
      <input id={id} type="file" accept={acepta} className="block w-full text-base text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-base file:font-semibold file:text-secondary-foreground"
        onChange={async (e) => { const f = e.target.files?.[0]; if (f) alCambiar(bloque.campo, await leeArchivo(f)); }} />
      {/* eslint-disable-next-line @next/next/no-img-element -- vista previa de un data URL local: nada que optimizar */}
      {bloque.tipo === 'imagen' && valor.startsWith('data:image/') ? <img src={valor} alt="Vista previa de la imagen de entrada" className="max-h-48 rounded border border-border" /> : null}
    </div>
  );
}

export function BloqueDeEntrada({ bloque, valor, alCambiar }: { bloque: Bloque; valor: unknown; alCambiar: AlCambiar }) {
  return (
    <BloqueEtiquetado etiqueta={bloque.etiqueta} prueba={`entrada-${bloque.campo}`}>
      <label htmlFor={`banco-${bloque.campo}`} className="sr-only">{bloque.etiqueta}</label>
      <ControlDeEntrada bloque={bloque} valor={valor} alCambiar={alCambiar} />
      {bloque.descripcion ? <p className="mt-1 text-sm text-muted-foreground">{bloque.descripcion}</p> : null}
    </BloqueEtiquetado>
  );
}

function Tabla({ columnas, filas }: { columnas: readonly string[]; filas: readonly Record<string, unknown>[] }) {
  if (!filas.length) return <p className="text-sm text-muted-foreground">Sin filas.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead><tr>{columnas.map((c) => <th key={c} className="border-b border-border px-2 py-1 text-xs font-semibold uppercase tracking-etiqueta text-muted-foreground">{c}</th>)}</tr></thead>
        <tbody>{filas.map((f, i) => <tr key={i}>{columnas.map((c) => <td key={c} className="max-w-[28rem] border-b border-border px-2 py-1 align-top font-mono text-xs [overflow-wrap:anywhere]">{String(f[c] ?? '')}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function ValorDeSalida({ bloque, valor }: { bloque: Bloque; valor: unknown }) {
  if (valor === null || valor === undefined) return <p className="text-sm text-muted-foreground">sin valor</p>;
  switch (bloque.tipo) {
    case 'numero': return <Cifra valor={String(valor)} {...(bloque.unidad ? { unidad: bloque.unidad } : {})} grande />;
    case 'booleano': return <p className="text-lg font-semibold">{valor === true ? 'sí' : 'no'}</p>;
    case 'texto-largo': return <p className="max-h-72 overflow-auto whitespace-pre-wrap text-base leading-normal">{String(valor)}</p>;
    case 'lista': return <ul className="list-inside list-disc text-sm">{(valor as unknown[]).map((v, i) => <li key={i}>{String(v)}</li>)}</ul>;
    case 'tabla': return <Tabla columnas={bloque.columnas ?? []} filas={valor as Record<string, unknown>[]} />;
    case 'objeto': case 'json': return <pre className="overflow-auto font-mono text-xs">{JSON.stringify(valor, null, 2)}</pre>;
    default: return <p className="text-base">{String(valor)}</p>;
  }
}

export function BloqueDeSalida({ bloque, valor }: { bloque: Bloque; valor: unknown }) {
  return (
    <BloqueEtiquetado etiqueta={bloque.etiqueta} variante="resultado" prueba={`salida-${bloque.campo}`}>
      <ValorDeSalida bloque={bloque} valor={valor} />
    </BloqueEtiquetado>
  );
}
