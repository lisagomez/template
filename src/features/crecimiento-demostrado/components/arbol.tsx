/**
 * El ÁRBOL de la prueba: cada paso de la derivación con su regla, lo que cita y lo que establece.
 * Se lee de la derivación tal como la propuso el agente; el veredicto de arriba dice si el kernel
 * la aceptó. Lo que no encaja en el esquema se muestra crudo, no se maquilla.
 */
import { esquemaDerivacion, formatoPesos, nombreDe, type Paso, type Valor } from '../services/nucleo';

const REGLA: Readonly<Record<Paso['regla'], string>> = {
  cita: 'cita un hecho de Γ', particion: 'partición', suma_particion: 'suma sobre la partición', teorema: 'teorema', aritmetica: 'aritmética exacta',
  compara: 'comparación', razon: 'proporción', cambio_relativo: 'cambio relativo', prueba: 'prueba estadística', supuesto: 'supuesto', hipotesis: 'hipótesis',
};

export function textoDeValor(v: Valor): string {
  switch (v.tipo) {
    case 'centavos': return formatoPesos(v.v);
    case 'conteo': return String(v.v);
    case 'fraccion': return v.den ? `${formatoPesos(Math.round(v.num / v.den))} (exacto: ${v.num}/${v.den} centavos)` : '—';
    case 'prueba': return `n = ${v.r.n}, p = ${v.r.exitos + 1}/${v.r.iteraciones + 1}`;
    case 'lista': return v.items.map((i) => `${i.cliente} ${formatoPesos(i.centavos)}`).join(' · ');
    case 'no_aplica': return `no aplica: ${v.motivo}`;
  }
}

function describe(p: Paso): string {
  switch (p.regla) {
    case 'cita': return `${nombreDe(p.termino)} = ${textoDeValor(p.valor as Valor)}`;
    case 'particion': return `{${p.clases.join(', ')}} parte ${p.universo} (${p.metrica}${p.segmento ? `, segmento ${p.segmento}` : ''})`;
    case 'suma_particion': return `ΔR del universo = Σ ΔR de las clases de «${p.particion}»`;
    case 'teorema': return `${p.nombre} con las hipótesis de ${p.usa.join(', ')}`;
    case 'aritmetica': return `${p.op} de ${p.de.join(', ')}`;
    case 'compara': return `${p.a} ${p.op} ${typeof p.b === 'string' ? p.b : p.b.constante}`;
    case 'razon': return `${p.num} / ${p.den} ${p.op} ${p.umbralPorMil / 1000}`;
    case 'cambio_relativo': return `(${p.despues} − ${p.antes}) / ${p.antes} ${p.op} ${p.umbralPorMil / 1000}`;
    case 'prueba': return `prueba de permutación citada en ${p.cita}`;
    case 'supuesto': return p.sa;
    case 'hipotesis': return `«${p.intervencion}» → ${p.metrica} ${p.sentido}${p.experimento ? ` · experimento ${p.experimento.diseno}, ${p.experimento.duracionSemanas} semanas` : ' · sin experimento'}`;
  }
}

export function ArbolDeLaPrueba({ derivacion }: { derivacion: unknown }) {
  const d = esquemaDerivacion.safeParse(derivacion);
  if (!d.success) return <pre className="overflow-x-auto rounded bg-neutral-100 p-2 text-xs dark:bg-neutral-900">{JSON.stringify(derivacion, null, 2)}</pre>;
  const afirmado = d.data.afirmacion.paso;
  return (
    <details className="mt-3 rounded border border-neutral-200 p-3 dark:border-neutral-800" data-prueba="arbol" open>
      <summary className="cursor-pointer text-sm font-semibold">Árbol de la prueba: {d.data.pasos.length} pasos, nivel {d.data.nivel}</summary>
      <p className="mt-1 text-xs text-neutral-500">Γ {d.data.gamma} · spec {d.data.especificacion} · supuestos {d.data.supuestos.join(', ') || 'ninguno'}</p>
      <ol className="mt-2 space-y-1 text-sm">
        {d.data.pasos.map((p) => (
          <li key={p.id} className={`flex flex-col gap-0.5 sm:flex-row sm:gap-2 ${p.id === afirmado ? 'rounded bg-sky-50 px-1 font-semibold dark:bg-sky-950' : ''}`}>
            <code className="shrink-0 text-xs text-neutral-500 sm:w-10">{p.id}</code>
            <span className="shrink-0 text-xs uppercase tracking-wide text-neutral-500 sm:w-40">{REGLA[p.regla]}{p.id === afirmado ? ' ⊢ φ' : ''}</span>
            <span className="min-w-0 break-words tabular-nums">{describe(p)}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
