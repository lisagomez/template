'use client';

/**
 * El panel del dueño de la pyme: la BANDEJA (las conversaciones que el agente le pasó: queja,
 * monto alto, no se entendieron, presupuesto; las toma, contesta y las devuelve) y el TABLERO
 * (cuánto vendió cada campaña y cada canal orgánico, y cuánto costó cada conversación en Meta y
 * en IA). El token del dispositivo decide qué pyme ve; se guarda en este navegador.
 */
import { useCallback, useEffect, useState } from 'react';
import type { Cronometro, Tablero } from '../services/nucleo.ts';

interface MensajeVista { wamid: string; autor: string; resumen: string; instante: number; direccion: string }
interface CasoVista { id: string; motivo: string; detalle: string; estado: string; conversacionId: string; waId: string; abiertoEn: number; mensajes: MensajeVista[]; ventana: Cronometro | null }
type Integridad = { activa: false } | { activa: true; cadena: { ok: boolean; n: number; rotoEn?: number; motivo?: string }; anclas: { ok: boolean; ancladas: number; sinAnclar: number; motivo?: string } | null };
interface Datos {
  inquilino: { id: string; nombre: string; giro: string; ciudad: string; dueno: string; estado: string; ficticio: boolean };
  bandeja: { casos: CasoVista[]; pausadasPorEco: Array<{ id: string; waId: string; pausadaHasta?: number }>; alertas: Array<{ id: string; nivel: string; texto: string; instante: number }> };
  tablero: Tablero;
  a2a: boolean;
  integridad: Integridad;
  /** Contactos en la lista de bloqueo del dueño. */
  bloqueados: string[];
  /** Reloj del servidor al responder: el cronómetro corre desde aquí. */
  ahora: number;
}

/** «3 h 12 min»: lo que queda de una ventana, contado desde el reloj del servidor. */
function restante(cierraEn: number | null, ahoraServidor: number, desdeCarga: number): string {
  if (cierraEn === null) return 'cerrada';
  const ms = cierraEn - (ahoraServidor + desdeCarga);
  if (ms <= 0) return 'cerrada';
  const min = Math.ceil(ms / 60_000);
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
}

function Ventana({ v, ahora, desdeCarga }: { v: Cronometro; ahora: number; desdeCarga: number }) {
  const gratis = v.entradaGratis.abierta || v.anuncioPorResponder;
  const texto = v.anuncioPorResponder ? `Contesta en ${restante(v.anuncioPorResponder.vence, ahora, desdeCarga)}: abre 72 h gratis`
    : v.entradaGratis.abierta ? `72 h gratis: quedan ${restante(v.entradaGratis.cierraEn, ahora, desdeCarga)}`
      : v.atencion.abierta ? `Ventana 24 h: quedan ${restante(v.atencion.cierraEn, ahora, desdeCarga)}`
        : 'Ventana cerrada: solo plantilla (cobrada)';
  const urgente = Boolean(v.aviso);
  return <span data-prueba="cronometro" className={`rounded px-2 py-0.5 text-xs font-semibold ${urgente ? 'bg-amber-100 text-amber-900' : gratis ? 'bg-emerald-50 text-emerald-800' : v.atencion.abierta ? 'bg-sky-50 text-sky-900' : 'bg-neutral-200 text-neutral-700'}`}>⏱ {texto}</span>;
}

const MOTIVO: Record<string, string> = {
  queja: 'Queja', monto: 'Monto alto', comprension: 'No se entendieron', presupuesto: 'Conversación larga',
  solicitud: 'Pidió una persona', inquilino_sin_presupuesto: 'Sin presupuesto de IA', modelo_no_disponible: 'IA no disponible',
};
const pesos = (c: number) => `$${(c / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usd = (m: number) => `USD ${(m / 1e6).toFixed(4)}`;
const hora = (ms: number) => new Date(ms).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
const LLAVE = 'ventas-wa-token';

function leeToken(): string {
  try { return localStorage.getItem(LLAVE) ?? ''; } catch { return ''; }
}

export function PanelDueno() {
  const [token, setToken] = useState('');
  const [borrador, setBorrador] = useState('');
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState('');
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [vista, setVista] = useState<'bandeja' | 'tablero'>('bandeja');
  const [cargadoEn, setCargadoEn] = useState(0);
  const [tic, setTic] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTic(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const carga = useCallback((t: string) => {
    if (!t) return;
    fetch('/api/ventas-whatsapp/panel', { headers: { authorization: `Bearer ${t}` } })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); return j as Datos; })
      .then((d) => { setDatos(d); setError(''); setCargadoEn(Date.now()); setTic(Date.now()); })
      .catch((e: Error) => { setDatos(null); setError(e.message); });
  }, []);

  useEffect(() => {
    const t = leeToken();
    queueMicrotask(() => { setToken(t); carga(t); });
  }, [carga]);

  const accion = async (cuerpo: Record<string, unknown>) => {
    const r = await fetch('/api/ventas-whatsapp/panel', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
    if (!r.ok) setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);
    carga(token);
  };

  if (!token || (!datos && error)) {
    return (
      <main className="mx-auto max-w-md px-4 pt-16">
        <h1 className="text-2xl font-bold">Panel del vendedor en WhatsApp</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Escribe el código de este dispositivo. Decide qué negocio ves.</p>
        {error && <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200" data-prueba="error">{error}</p>}
        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); try { localStorage.setItem(LLAVE, borrador); } catch { /* sin almacenamiento: vale para esta visita */ } setToken(borrador); carga(borrador); }}>
          <input className="flex-1 rounded border px-3 py-2 dark:bg-neutral-900" type="password" value={borrador} onChange={(e) => setBorrador(e.target.value)} aria-label="Código del dispositivo" />
          <button className="rounded bg-emerald-700 px-4 py-2 font-semibold text-white" type="submit">Entrar</button>
        </form>
      </main>
    );
  }
  if (!datos) return <main className="p-8 text-sm text-neutral-500">Cargando…</main>;
  const { inquilino, bandeja, tablero, integridad } = datos;
  const desdeCarga = Math.max(0, tic - cargadoEn);
  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6">
      <header className="mb-4 pr-24">
        <p className="text-xs uppercase tracking-widest text-neutral-500">Vendedor con IA en WhatsApp · laboratorio</p>
        <h1 className="text-2xl font-bold sm:text-3xl" data-prueba="negocio">{inquilino.nombre}</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {inquilino.giro} en {inquilino.ciudad} · atiende {inquilino.dueno}
          {inquilino.ficticio && <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">datos ficticios</span>}
          {inquilino.estado === 'pausado' && <span className="ml-2 rounded bg-red-100 px-1.5 text-xs font-semibold text-red-800">canal desconectado</span>}
          {datos.a2a && <span className="ml-2 rounded bg-sky-100 px-1.5 text-xs font-semibold text-sky-900 dark:bg-sky-950 dark:text-sky-200">pedidos y atribución por A2A</span>}
        </p>
        <p className="mt-1 text-xs" data-prueba="integridad">
          {!integridad.activa ? <span className="text-neutral-500">Trazabilidad apagada (sin llave de huellas)</span>
            : integridad.cadena.ok
              ? <span className="text-emerald-800 dark:text-emerald-300">🔗 Cadena de {integridad.cadena.n} eslabones verificada{integridad.anclas ? (integridad.anclas.ok ? ` · anclada hasta el ${integridad.anclas.ancladas} (sin anclar: ${integridad.anclas.sinAnclar})` : ` · ANCLA NO CUADRA: ${integridad.anclas.motivo}`) : ' · sin anclaje configurado'}</span>
              : <span className="font-semibold text-red-700">🔗 CADENA ROTA en el eslabón {integridad.cadena.rotoEn}: {integridad.cadena.motivo}</span>}
        </p>
      </header>
      <nav className="mb-4 flex gap-2 sm:hidden">
        {(['bandeja', 'tablero'] as const).map((v) => (
          <button key={v} type="button" onClick={() => setVista(v)} className={`flex-1 rounded px-3 py-2 text-sm font-semibold ${vista === v ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900' : 'bg-neutral-100 dark:bg-neutral-800'}`}>{v === 'bandeja' ? `Bandeja (${bandeja.casos.length})` : 'Tablero'}</button>
        ))}
      </nav>
      <div className="grid gap-6 lg:grid-cols-5">
        <section className={`min-w-0 lg:col-span-3 ${vista === 'bandeja' ? '' : 'hidden sm:block'}`} data-prueba="bandeja">
          <h2 className="mb-2 text-lg font-semibold">Bandeja: te lo pasó el agente</h2>
          {bandeja.casos.length === 0 && <p className="rounded border border-dashed p-6 text-center text-sm text-neutral-500">Nada pendiente. El agente está atendiendo.</p>}
          {bandeja.casos.map((c) => (
            <article key={c.id} className="mb-4 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800" data-prueba={`caso-${c.estado}`}>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950 dark:text-red-200">{MOTIVO[c.motivo] ?? c.motivo}</span>
                <span className="font-mono text-xs text-neutral-500">+{c.waId}</span>
                {datos.bloqueados.includes(c.waId) && <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs font-semibold text-white" data-prueba="bloqueado">bloqueado</span>}
                <span className="text-xs text-neutral-500">{hora(c.abiertoEn)}</span>
                {c.ventana && <Ventana v={c.ventana} ahora={datos.ahora} desdeCarga={desdeCarga} />}
                <span className={`ml-auto rounded px-2 py-0.5 text-xs font-semibold ${c.estado === 'tomado' ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-700'}`}>{c.estado === 'tomado' ? 'lo atiendes tú' : 'sin tomar'}</span>
              </div>
              <ol className="mb-3 max-h-72 space-y-1 overflow-y-auto rounded bg-neutral-50 p-2 text-sm dark:bg-neutral-900">
                {c.mensajes.map((m) => (
                  <li key={m.wamid} className={`max-w-[85%] rounded px-2 py-1 ${m.autor === 'cliente' ? 'bg-white dark:bg-neutral-800' : m.autor === 'dueno' ? 'ml-auto bg-emerald-100 dark:bg-emerald-950' : 'ml-auto bg-sky-50 dark:bg-sky-950'}`}>
                    <span className="block text-[10px] uppercase tracking-wide text-neutral-500">{m.autor === 'dueno' ? inquilino.dueno : m.autor}</span>{m.resumen}
                  </li>
                ))}
              </ol>
              {c.estado === 'abierto' && <button type="button" className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white dark:bg-white dark:text-neutral-900" onClick={() => accion({ accion: 'tomar', casoId: c.id })} data-prueba="tomar">Tomar la conversación</button>}
              {c.estado === 'tomado' && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input className="flex-1 rounded border px-2 py-1.5 text-sm dark:bg-neutral-900" placeholder="Escríbele al cliente…" value={respuestas[c.id] ?? ''} onChange={(e) => setRespuestas({ ...respuestas, [c.id]: e.target.value })} data-prueba="respuesta" />
                  <button type="button" className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white" onClick={() => { void accion({ accion: 'responder', conversacionId: c.conversacionId, texto: respuestas[c.id] ?? '' }); setRespuestas({ ...respuestas, [c.id]: '' }); }} data-prueba="enviar">Enviar</button>
                  <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => accion({ accion: 'liberar', casoId: c.id })} data-prueba="liberar">Devolver al agente</button>
                </div>
              )}
              <button type="button" className="ml-3 mt-2 text-xs text-neutral-500 underline" data-prueba="bloquear"
                onClick={() => { const b = datos.bloqueados.includes(c.waId); if (b || confirm('Sus mensajes se guardan, pero el agente ya no le responde. ¿Bloquear este contacto?')) void accion({ accion: 'bloquear', conversacionId: c.conversacionId, motivo: b ? null : 'bloqueado por el dueño desde la bandeja' }); }}>
                {datos.bloqueados.includes(c.waId) ? 'Desbloquear contacto' : 'Bloquear contacto'}
              </button>
            </article>
          ))}
          {bandeja.pausadasPorEco.length > 0 && (
            <p className="mt-2 text-sm text-neutral-600">El agente está callado en {bandeja.pausadasPorEco.length} chat(s) porque contestaste desde tu celular.</p>
          )}
          {bandeja.alertas.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm">
              {bandeja.alertas.slice(0, 5).map((a) => <li key={a.id} className={`rounded px-2 py-1 ${a.nivel === 'grave' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>{a.texto}</li>)}
            </ul>
          )}
        </section>
        <section className={`min-w-0 lg:col-span-2 ${vista === 'tablero' ? '' : 'hidden sm:block'}`} data-prueba="tablero">
          <h2 className="mb-2 text-lg font-semibold">Tablero: lo que vendió cada canal</h2>
          <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
            <Kpi titulo="Ingresos por chat" valor={pesos(tablero.totales.ingresosCentavos)} />
            <Kpi titulo="Pedidos pagados" valor={String(tablero.totales.pedidosPagados)} />
            <Kpi titulo="ROAS de anuncios" valor={tablero.totales.roas === null ? '—' : `${tablero.totales.roas}×`} dato="roas-total" />
            <Kpi titulo="Costo por venta (anuncios)" valor={tablero.totales.costoPorVentaCentavos === null ? '—' : pesos(tablero.totales.costoPorVentaCentavos)} />
            <Kpi titulo="Meta por conversación" valor={usd(tablero.porConversacion.metaMicros)} />
            <Kpi titulo="IA por conversación" valor={usd(tablero.porConversacion.iaMicros)} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-prueba="tabla-canales">
              <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr><th className="py-1">Canal</th><th className="text-right">Conv.</th><th className="text-right">Pagados</th><th className="text-right">Ingresos</th><th className="text-right">Gasto</th><th className="text-right">ROAS</th></tr>
              </thead>
              <tbody>
                {tablero.filas.map((f) => (
                  <tr key={f.canal} className="border-t border-neutral-200 dark:border-neutral-800">
                    <td className="py-1">{f.canal}<span className="block text-[10px] uppercase text-neutral-500">{f.tipo}</span></td>
                    <td className="text-right tabular-nums">{f.conversaciones}</td>
                    <td className="text-right tabular-nums">{f.pedidosPagados}</td>
                    <td className="text-right tabular-nums">{pesos(f.ingresosCentavos)}</td>
                    <td className="text-right tabular-nums">{f.gastoCentavos === null ? '—' : pesos(f.gastoCentavos)}</td>
                    <td className="text-right tabular-nums font-semibold">{f.roas === null ? '—' : `${f.roas}×`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-3 space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
            <li>{tablero.porConversacion.mensajesPorConversacion} mensajes del negocio por conversación ({tablero.porConversacion.mensajesSalientes} en total).</li>
            {!tablero.tarjeta.verificada && <li className="text-amber-800 dark:text-amber-300">Costos de Meta ESTIMADOS: la tarjeta de tarifas no está verificada contra la oficial.</li>}
            {tablero.iaSimulada && <li className="text-amber-800 dark:text-amber-300">IA SIMULADA: tokens estimados con precio de referencia. El modelo real no está medido.</li>}
            {tablero.llamadasIaSinCosto > 0 && <li>{tablero.llamadasIaSinCosto} llamadas de IA sin datos de uso: el costo de IA no está completo.</li>}
          </ul>
        </section>
      </div>
    </main>
  );
}

function Kpi({ titulo, valor, dato }: { titulo: string; valor: string; dato?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-2 dark:border-neutral-800">
      <p className="text-[11px] uppercase tracking-wide text-neutral-500">{titulo}</p>
      <p className="text-lg font-bold tabular-nums" {...(dato ? { 'data-prueba': dato } : {})}>{valor}</p>
    </div>
  );
}
