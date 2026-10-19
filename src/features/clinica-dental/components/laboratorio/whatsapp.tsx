'use client';

/**
 * El WhatsApp SIMULADO del paciente (laboratorio): la conversación con el número de la clínica, los botones de las
 * plantillas y de los mensajes interactivos, y los Flows dibujados desde su Flow JSON publicado (lo que WhatsApp
 * pinta en el celular). Lo que la persona hace se manda al simulador de Meta; la clínica contesta por el canal real
 * del portal (receptor, asistente, Flows). Debajo de cada mensaje de la clínica, lo que Meta cobró por él.
 */
import { useCallback, useEffect, useState } from 'react';
import type { Burbuja, VistaFlow } from '../../services/servidor/telefono';

interface Props { clinica: string; nombreClinica: string; numero: string; textoInicial: string }
interface Estado { burbujas: Burbuja[]; flow: VistaFlow | null; alertas: { texto: string }[] }

const API = '/api/clinica-dental/laboratorio/whatsapp';
const hora = (ms: number) => new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));

export function WhatsappSimulado({ clinica, nombreClinica, numero, textoInicial }: Props) {
  const [estado, setEstado] = useState<Estado>({ burbujas: [], flow: null, alertas: [] });
  const [texto, setTexto] = useState(textoInicial);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const carga = useCallback(async () => {
    const r = await fetch(`${API}?clinica=${clinica}&numero=${numero}`);
    if (r.ok) setEstado((await r.json()) as Estado);
  }, [clinica, numero]);
  useEffect(() => {
    let vivo = true;
    void fetch(`${API}?clinica=${clinica}&numero=${numero}`).then(async (r) => { if (vivo && r.ok) setEstado((await r.json()) as Estado); });
    return () => { vivo = false; };
  }, [clinica, numero]);
  const haz = async (cambio: Record<string, unknown>) => {
    setOcupado(true);
    setError(null);
    const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clinica, numero, nombre: 'Paciente', cambio }) });
    const j = (await r.json().catch(() => ({}))) as Partial<Estado> & { error?: string };
    if (r.ok) setEstado((e) => ({ ...e, burbujas: j.burbujas ?? e.burbujas, flow: j.flow ?? null }));
    else setError(j.error ?? 'no se pudo');
    setOcupado(false);
    await carga();
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
      <section aria-label={`WhatsApp de ${numero} con ${nombreClinica}`} className="relative mx-auto w-full max-w-sm overflow-hidden rounded-[2rem] border-8 border-slate-900 bg-[#efeae2] shadow-xl">
        <header className="bg-[#075e54] px-4 py-3 text-white">
          <p className="font-semibold">{nombreClinica}</p>
          <p className="text-xs opacity-90">Cuenta de empresa · simulado · tu número termina en {numero.slice(-4)}</p>
        </header>
        <ol aria-live="polite" className="flex h-[62vh] min-h-80 flex-col gap-2 overflow-y-auto p-3" data-burbujas={estado.burbujas.length}>
          {estado.burbujas.map((b, i) => <Globo key={i} b={b} ocupado={ocupado} alTocar={(id) => void haz({ accion: 'toca', boton: id })} alAbrir={() => void haz({ accion: 'abre-flow' })} />)}
        </ol>
        <form className="flex gap-2 border-t border-slate-300 bg-[#f0f2f5] p-2" onSubmit={(e) => { e.preventDefault(); if (texto.trim()) { void haz({ accion: 'escribe', texto }); setTexto(''); } }}>
          <label className="sr-only" htmlFor="wa-texto">Mensaje</label>
          <input id="wa-texto" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe un mensaje" className="min-h-11 flex-1 rounded-full border border-slate-300 bg-white px-4 text-sm" />
          <button type="submit" disabled={ocupado} className="min-h-11 rounded-full bg-[#00a884] px-4 text-sm font-semibold text-white disabled:opacity-60">Enviar</button>
        </form>
        {estado.flow ? <HojaFlow flow={estado.flow} ocupado={ocupado} alEnviar={(datos) => void haz({ accion: 'envia-flow', datos })} /> : null}
      </section>
      <Palancas ocupado={ocupado} error={error} alertas={estado.alertas} alHacer={(c) => void haz(c)} />
    </div>
  );
}

function Globo({ b, ocupado, alTocar, alAbrir }: { b: Burbuja; ocupado: boolean; alTocar: (id: string) => void; alAbrir: () => void }) {
  const mio = b.lado === 'paciente';
  return (
    <li className={`max-w-[85%] ${mio ? 'ml-auto' : ''}`} data-lado={b.lado} data-tipo={b.tipo}>
      <div className={`rounded-xl px-3 py-2 text-sm shadow-sm ${mio ? 'bg-[#d9fdd3]' : 'bg-white'}`}>
        {b.lado === 'recepcion' ? <p className="mb-1 text-xs font-semibold text-[#075e54]">Recepción (desde el celular de la clínica)</p> : null}
        {b.plantilla ? <p className="mb-1 text-[11px] font-medium text-slate-600">Plantilla · {b.plantilla}</p> : null}
        <p className="whitespace-pre-wrap">{b.texto}</p>
        <p className="mt-1 text-right text-[10px] text-slate-600">{hora(b.instante)}</p>
      </div>
      {b.botones?.length ? (
        <div className="mt-1 grid gap-1">
          {b.botones.map((x) => <button key={x.id} type="button" disabled={ocupado} onClick={() => alTocar(x.id)} className="min-h-10 rounded-lg bg-white text-sm font-medium text-[#027eb5] shadow-sm disabled:opacity-60">{x.titulo}</button>)}
        </div>
      ) : null}
      {b.cta ? <p className="mt-1 rounded-lg bg-white px-3 py-2 text-center text-sm font-medium text-[#027eb5] shadow-sm">↗ {b.cta.texto} <span className="block text-[10px] text-slate-600">{b.cta.url}</span></p> : null}
      {b.flow ? <button type="button" disabled={ocupado} onClick={alAbrir} className="mt-1 min-h-10 w-full rounded-lg bg-white text-sm font-medium text-[#027eb5] shadow-sm disabled:opacity-60">{b.flow.cta}</button> : null}
      {b.precio ? <p className="mt-0.5 text-[10px] text-slate-600" data-precio={b.precio}>Meta: {b.precio}</p> : null}
    </li>
  );
}

const sustituye = (t: unknown, datos: Record<string, unknown>, forma: Record<string, unknown>): unknown => {
  if (typeof t !== 'string') return t;
  const m = /^\$\{(data|form)\.([a-z_]+)\}$/.exec(t);
  if (m) return m[1] === 'data' ? datos[m[2]!] : forma[m[2]!];
  return t.replace(/\$\{data\.([a-z_]+)\}/g, (_, k: string) => String(datos[k] ?? ''));
};

type Opcion = { id: string; title: string; description?: string };

function HojaFlow({ flow, ocupado, alEnviar }: { flow: VistaFlow; ocupado: boolean; alEnviar: (d: Record<string, unknown>) => void }) {
  const [forma, setForma] = useState<Record<string, unknown>>({});
  if (flow.cerrado) return <div role="status" className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 text-center text-sm shadow-2xl">✓ Formulario enviado</div>;
  return (
    <div role="dialog" aria-label={flow.titulo} className="absolute inset-x-0 bottom-0 top-16 overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl" data-pantalla={flow.pantalla}>
      <h3 className="mb-3 text-center font-semibold">{flow.titulo}</h3>
      <div className="space-y-3 text-sm">
        {flow.componentes.map((c, i) => {
          const visible = c['visible'] === undefined ? true : sustituye(c['visible'], flow.datos, forma) === true;
          if (!visible) return null;
          const tipo = String(c['type']);
          if (tipo === 'TextBody' || tipo === 'TextHeading') return <p key={i} className={tipo === 'TextHeading' ? 'font-semibold' : 'text-slate-800'}>{String(sustituye(c['text'], flow.datos, forma) ?? '')}</p>;
          if (tipo === 'Dropdown' || tipo === 'RadioButtonsGroup') {
            const nombre = String(c['name']);
            const opciones = (sustituye(c['data-source'], flow.datos, forma) as Opcion[] | undefined) ?? [];
            return (
              <fieldset key={i}>
                <legend className="mb-1 font-medium">{String(c['label'])}</legend>
                <div className="grid gap-1">
                  {opciones.map((o) => (
                    <label key={o.id} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 ${forma[nombre] === o.id ? 'border-[#00a884] bg-[#e7fce3]' : 'border-slate-200'}`}>
                      <input type="radio" name={nombre} value={o.id} checked={forma[nombre] === o.id} onChange={() => setForma((f) => ({ ...f, [nombre]: o.id }))} className="mt-0.5 h-4 w-4 accent-[#00a884]" />
                      <span>{o.title}{o.description ? <span className="block text-xs text-slate-600">{o.description}</span> : null}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          }
          if (tipo === 'OptIn') {
            const nombre = String(c['name']);
            return <label key={i} className="flex items-start gap-2"><input type="checkbox" checked={forma[nombre] === true} onChange={(e) => setForma((f) => ({ ...f, [nombre]: e.target.checked }))} className="mt-0.5 h-5 w-5 accent-[#00a884]" /><span>{String(c['label'])}</span></label>;
          }
          if (tipo === 'Footer') {
            const accion = (c['on-click-action'] ?? {}) as { payload?: Record<string, unknown> };
            const datos = Object.fromEntries(Object.entries(accion.payload ?? {}).map(([k, v]) => [k, sustituye(v, flow.datos, forma) ?? '']));
            return <button key={i} type="button" disabled={ocupado} onClick={() => { alEnviar(datos); setForma({}); }} className="min-h-11 w-full rounded-full bg-[#00a884] font-semibold text-white disabled:opacity-60">{String(c['label'])}</button>;
          }
          return null;
        })}
      </div>
    </div>
  );
}

function Palancas({ ocupado, error, alertas, alHacer }: { ocupado: boolean; error: string | null; alertas: { texto: string }[]; alHacer: (c: Record<string, unknown>) => void }) {
  const [voz, setVoz] = useState('¿A qué hora abren el sábado?');
  const [pie, setPie] = useState('mira mi muela');
  const [recepcion, setRecepcion] = useState('Hola, aquí recepción. ¿En qué te ayudo?');
  const clase = 'min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium disabled:opacity-60';
  return (
    <aside aria-label="Palancas del laboratorio" className="space-y-3 rounded-xl bg-white p-4 text-sm ring-1 ring-slate-200">
      <h2 className="font-semibold">Desde el celular de la persona</h2>
      {error ? <p role="alert" className="text-red-800">{error}</p> : null}
      <label className="block">Nota de voz (voz local)<input value={voz} onChange={(e) => setVoz(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1" /></label>
      <button type="button" disabled={ocupado} className={clase} onClick={() => alHacer({ accion: 'voz', texto: voz })}>Mandar nota de voz</button>
      <label className="block">Pie de la foto<input value={pie} onChange={(e) => setPie(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1" /></label>
      <button type="button" disabled={ocupado} className={clase} onClick={() => alHacer({ accion: 'foto', pie })}>Mandar foto (sintética)</button>
      <h2 className="pt-2 font-semibold">Desde la clínica y Meta</h2>
      <label className="block">La recepción contesta<input value={recepcion} onChange={(e) => setRecepcion(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1" /></label>
      <button type="button" disabled={ocupado} className={clase} onClick={() => alHacer({ accion: 'recepcion', texto: recepcion })}>Contestar desde el celular</button>
      <button type="button" disabled={ocupado} className={clase} onClick={() => alHacer({ accion: 'plantilla', nombre: 'recordatorio_cita_24h_v1', estado: 'PAUSED' })}>Meta pausa el recordatorio de 24 h</button>
      <button type="button" disabled={ocupado} className={clase} onClick={() => alHacer({ accion: 'desconecta' })}>La clínica desconecta el número</button>
      {alertas.length ? <ul className="space-y-1 text-xs text-amber-900">{alertas.map((a, i) => <li key={i}>⚠ {a.texto}</li>)}</ul> : null}
    </aside>
  );
}
