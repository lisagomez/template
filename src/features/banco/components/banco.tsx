'use client';

/**
 * El banco de motores: eliges una función y su esquema pinta la pantalla. Entrada a la izquierda, salida a la
 * derecha, los ejemplos sintéticos arriba y la misma llamada por API abajo. Es la idea de Gradio (Interface,
 * examples, «Use via API»), en la marca Turno 25 y sobre los motores del repo.
 */
import { useEffect, useRef, useState } from 'react';
import type { Bloque, Descriptor, Ejemplo, Resultado } from '../../../../tools/banco-motores/dist/index.js';
import { BloqueEtiquetado, Cifra } from '@/shared/components/bloque-etiquetado';
import { BloqueDeEntrada, BloqueDeSalida } from './bloques';

type Valores = Record<string, unknown>;

const iniciales = (f: Descriptor): Valores => Object.fromEntries(f.entrada.filter((b) => b.porDefecto !== undefined).map((b) => [b.campo, b.porDefecto]));

/** Lo que el formulario guarda como texto se convierte al tipo del esquema; si no se puede, va tal cual y el esquema lo rechaza. */
function preparaEntrada(bloques: readonly Bloque[], valores: Valores): Valores {
  const salida: Valores = {};
  for (const b of bloques) {
    const v = valores[b.campo];
    if (v === undefined || v === '') continue;
    if (b.tipo === 'numero' && typeof v === 'string') salida[b.campo] = Number.isNaN(Number(v)) ? v : Number(v);
    else if (b.tipo === 'lista' && typeof v === 'string') salida[b.campo] = v.split('\n').filter(Boolean);
    else if (['tabla', 'objeto', 'json'].includes(b.tipo) && typeof v === 'string') { try { salida[b.campo] = JSON.parse(v); } catch { salida[b.campo] = v; } }
    else salida[b.campo] = v;
  }
  return salida;
}

async function cargaEjemplo(e: Ejemplo<Record<string, unknown>>): Promise<Valores> {
  const valores: Valores = { ...e.entrada };
  for (const [campo, ruta] of Object.entries(e.archivos ?? {})) {
    const blob = await (await fetch(ruta)).blob();
    valores[campo] = await new Promise<string>((ok) => { const l = new FileReader(); l.onload = () => ok(String(l.result)); l.readAsDataURL(blob); });
  }
  return valores;
}

function useCronometro(corriendo: boolean) {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!corriendo) return;
    const t0 = performance.now();
    const id = setInterval(() => setMs(Math.round(performance.now() - t0)), 100);
    return () => clearInterval(id);
  }, [corriendo]);
  return corriendo ? ms : 0;
}

function Fallo({ r }: { r: Extract<Resultado, { ok: false }> }) {
  return (
    <div role="alert" className="rounded-lg border border-peligro bg-peligro-suave p-4 text-peligro-texto" data-prueba="fallo" data-etapa={r.etapa}>
      <p className="font-semibold">Falló en la etapa «{r.etapa}» · <Cifra valor={r.ms} unidad="ms" /></p>
      <p className="mt-1 text-sm">{r.mensaje}</p>
      {r.problemas.length ? <ul className="mt-2 list-inside list-disc text-sm">{r.problemas.map((p, i) => <li key={i}><span className="font-mono">{p.ruta}</span>: {p.mensaje}</li>)}</ul> : null}
    </div>
  );
}

function Api({ f, entrada }: { f: Descriptor; entrada: Valores }) {
  const cuerpo = JSON.stringify({ entrada: Object.fromEntries(Object.entries(entrada).map(([k, v]) => [k, typeof v === 'string' && v.startsWith('data:') ? `${v.slice(0, 32)}…` : v])) });
  return (
    <details className="rounded-lg border border-border bg-card p-4" data-prueba="api">
      <summary className="cursor-pointer text-sm font-semibold">Úsalo por API</summary>
      <pre className="mt-3 overflow-x-auto rounded bg-muted p-3 font-mono text-xs">{`curl -X POST http://localhost:3000/api/banco/${f.id} \\\n  -H 'content-type: application/json' \\\n  -d '${cuerpo}'`}</pre>
      <p className="mt-2 text-sm text-muted-foreground">El mismo esquema que pinta esta pantalla valida la llamada: una entrada fuera de esquema vuelve con 422 y la ruta de cada problema.</p>
      <pre className="mt-3 max-h-64 overflow-auto rounded bg-muted p-3 font-mono text-xs">{JSON.stringify(f.esquemas.entrada, null, 2)}</pre>
    </details>
  );
}

function useBanco(funciones: readonly Descriptor[]) {
  const [id, setId] = useState(funciones[0]?.id ?? '');
  const f = funciones.find((x) => x.id === id) ?? funciones[0];
  const [valores, setValores] = useState<Valores>(() => (f ? iniciales(f) : {}));
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [corriendo, setCorriendo] = useState(false);
  const control = useRef<AbortController | null>(null);
  const transcurrido = useCronometro(corriendo);
  const elige = (nuevo: Descriptor) => { setId(nuevo.id); setValores(iniciales(nuevo)); setResultado(null); };
  const cargaDeEjemplo = async (d: Descriptor, e: Ejemplo<Record<string, unknown>>) => { setValores({ ...iniciales(d), ...(await cargaEjemplo(e)) }); setResultado(null); };
  const corre = async (d: Descriptor) => {
    control.current = new AbortController();
    setCorriendo(true);
    setResultado(null);
    try {
      const r = await fetch(`/api/banco/${d.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entrada: preparaEntrada(d.entrada, valores) }), signal: control.current.signal });
      setResultado(await r.json() as Resultado);
    } catch {
      setResultado({ ok: false, etapa: 'cancelada', mensaje: 'Cancelaste la ejecución antes de que el motor terminara.', problemas: [], ms: transcurrido });
    } finally {
      setCorriendo(false);
    }
  };
  return { f, valores, setValores, resultado, corriendo, transcurrido, elige, cargaDeEjemplo, corre, cancela: () => control.current?.abort() };
}

function Cabecera({ maquina }: { maquina: { tesseract: boolean } }) {
  return (
    <header className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-etiqueta text-muted-foreground">Banco de motores · laboratorio</p>
      <h1 className="text-3xl font-bold tracking-tight">Declaras la función; la pantalla sale sola</h1>
      <p className="max-w-3xl text-muted-foreground">Cada función trae su esquema: de ahí salen estos bloques y su ruta API. Corre en esta máquina, con datos sintéticos y por el mismo adaptador que usa producción.</p>
      {!maquina.tesseract ? <p className="text-sm text-aviso-texto">Esta máquina no declara TESSERACT_CMD: el OCR dirá «no medido» en lugar de fingir.</p> : null}
    </header>
  );
}

function Selector({ funciones, actual, elige }: { funciones: readonly Descriptor[]; actual: Descriptor; elige: (d: Descriptor) => void }) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Funciones del banco">
      {funciones.map((x) => (
        <button key={x.id} type="button" onClick={() => elige(x)} aria-pressed={x.id === actual.id} data-prueba={`funcion-${x.id}`}
          className={`rounded-full border px-3 py-1.5 text-sm transition-colors duration-rapida ${x.id === actual.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-accent'}`}>{x.titulo}</button>
      ))}
    </nav>
  );
}

function Ejemplos({ f, carga }: { f: Descriptor; carga: (e: Ejemplo<Record<string, unknown>>) => void }) {
  if (!f.ejemplos.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" data-prueba="ejemplos">
      <span className="text-xs font-semibold uppercase tracking-etiqueta text-muted-foreground">Ejemplos sintéticos</span>
      {f.ejemplos.map((e) => (
        <button key={e.id} type="button" data-prueba={`ejemplo-${e.id}`} onClick={() => carga(e)}
          className="rounded-md border border-border bg-card px-3 py-1 text-sm hover:bg-accent">{e.titulo}{e.trampa ? <span className="ml-1 text-xs text-muted-foreground">· trampa: {e.trampa}</span> : null}</button>
      ))}
    </div>
  );
}

function Salida({ f, resultado, corriendo }: { f: Descriptor; resultado: Resultado | null; corriendo: boolean }) {
  const salida = resultado?.ok ? (resultado.salida as Valores) : null;
  return (
    <div className="space-y-5" data-prueba="salida">
      {resultado && !resultado.ok ? <Fallo r={resultado} /> : null}
      {salida ? f.salida.map((b) => <BloqueDeSalida key={b.campo} bloque={b} valor={salida[b.campo]} />) : null}
      {resultado?.ok ? <p className="text-sm text-muted-foreground">Salida validada contra su esquema en <Cifra valor={resultado.ms} unidad="ms" /></p> : null}
      {!resultado && !corriendo ? <BloqueEtiquetado etiqueta="Salida"><p className="text-sm text-muted-foreground">Aquí aparece el resultado, ya validado contra su esquema.</p></BloqueEtiquetado> : null}
    </div>
  );
}

export function Banco({ funciones, maquina }: { funciones: readonly Descriptor[]; maquina: { tesseract: boolean } }) {
  const b = useBanco(funciones);
  const { f } = b;
  if (!f) return <p>No hay funciones registradas.</p>;
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <Cabecera maquina={maquina} />
      <Selector funciones={funciones} actual={f} elige={b.elige} />
      <section className="space-y-1">
        <h2 className="text-xl font-semibold">{f.titulo}</h2>
        <p className="text-muted-foreground">{f.descripcion}</p>
        <p className="font-mono text-xs text-muted-foreground">motor: {f.motor}</p>
      </section>
      <Ejemplos f={f} carga={(e) => b.cargaDeEjemplo(f, e)} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5" data-prueba="entrada">
          {f.entrada.map((x) => <BloqueDeEntrada key={x.campo} bloque={x} valor={b.valores[x.campo]} alCambiar={(c, v) => b.setValores((s) => ({ ...s, [c]: v }))} />)}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => b.corre(f)} disabled={b.corriendo} data-prueba="correr"
              className="rounded-lg bg-primary px-5 py-2.5 font-semibold text-primary-foreground transition-colors duration-rapida hover:bg-marca-hover active:bg-marca-press disabled:opacity-50">Correr</button>
            {b.corriendo ? <button type="button" onClick={b.cancela} data-prueba="cancelar" className="rounded-lg border border-border px-4 py-2.5 text-sm hover:bg-accent">Cancelar</button> : null}
            {b.corriendo ? <span className="text-sm text-muted-foreground" aria-live="polite">Corriendo · <Cifra valor={(b.transcurrido / 1000).toFixed(1)} unidad="s" /></span> : null}
          </div>
        </div>
        <Salida f={f} resultado={b.resultado} corriendo={b.corriendo} />
      </div>
      <Api f={f} entrada={preparaEntrada(f.entrada, b.valores)} />
    </div>
  );
}
