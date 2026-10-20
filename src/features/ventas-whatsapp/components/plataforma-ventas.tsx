'use client';

/**
 * La página de quien opera la plataforma: las ALTAS de pymes por nuestro BSP (Embedded Signup, con
 * su embudo y sus pasos), el POOL de números que vendemos o rentamos, y la FACTURA del mes en las dos
 * modalidades del BSP. En el laboratorio, la ventana de Embedded Signup y Meta son simuladores.
 */
import { useCallback, useEffect, useState } from 'react';
import type { AltaBsp, EstadoCredito, LineaFactura, NumeroGestionado } from '../services/nucleo.ts';

interface Datos {
  altas: AltaBsp[];
  embudo: Array<{ instante: number; resultado: string }>;
  numeros: NumeroGestionado[];
  numerosMes: { numeros: number; ingresoCentavos: number; costoCentavos: number; margenCentavos: number };
  factura: { mes: string; techProvider: LineaFactura[]; solutionPartner: LineaFactura[]; credito: Array<EstadoCredito & { inquilinoId: string }> };
  ahora: number;
}

const LLAVE = 'ventas-wa-plataforma';
const pesos = (c: number) => `$${(c / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usd = (m: number) => `USD ${(m / 1e6).toFixed(2)}`;
const fecha = (ms: number) => new Date(ms).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: 'short' });
const th = 'py-1 pr-3';
const ESTADO_ALTA: Record<AltaBsp['estado'], string> = { activa: 'activa', falta_metodo_pago: 'falta método de pago', fallida: 'fallida', baja: 'baja' };

function leeToken(): string {
  try { return localStorage.getItem(LLAVE) ?? ''; } catch { return ''; }
}

export function PlataformaVentas() {
  const [token, setToken] = useState('');
  const [borrador, setBorrador] = useState('');
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState('');
  const [nueva, setNueva] = useState({ inquilinoId: 'pyme_lab_1', perfil: 'restaurante' as 'restaurante' | 'tienda' });
  const [liga, setLiga] = useState('');
  const [aviso, setAviso] = useState('');

  const carga = useCallback((t: string) => {
    if (!t) return;
    fetch('/api/ventas-whatsapp/plataforma', { headers: { authorization: `Bearer ${t}` } })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); return j as Datos; })
      .then((d) => { setDatos(d); setError(''); })
      .catch((e: Error) => { setDatos(null); setError(e.message); });
  }, []);

  useEffect(() => {
    const t = leeToken();
    // La liga de alta llega en la URL cuando la abre quien migra de OpenWA (`signupUrl` de la sesión).
    const enUrl = new URLSearchParams(window.location.search).get('liga') ?? '';
    queueMicrotask(() => { setToken(t); carga(t); if (enUrl) setLiga(enUrl); });
  }, [carga]);

  const accion = async (cuerpo: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const r = await fetch('/api/ventas-whatsapp/plataforma', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    setAviso(typeof j.rechazo === 'string' ? `Rechazada: ${j.rechazo}` : typeof j.error === 'string' ? j.error : '');
    carga(token);
    return j;
  };

  if (!token || (!datos && error)) {
    return (
      <main className="mx-auto max-w-md px-4 pt-16">
        <h1 className="text-2xl font-bold">Plataforma del vendedor en WhatsApp</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Altas por BSP, números y factura. Solo para quien opera la plataforma.</p>
        {error && <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200" data-prueba="error">{error}</p>}
        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); try { localStorage.setItem(LLAVE, borrador); } catch { /* vale para esta visita */ } setToken(borrador); carga(borrador); }}>
          <input className="min-w-0 flex-1 rounded border px-3 py-2 dark:bg-neutral-900" type="password" value={borrador} onChange={(e) => setBorrador(e.target.value)} aria-label="Token de plataforma" />
          <button className="rounded bg-emerald-700 px-4 py-2 font-semibold text-white" type="submit">Entrar</button>
        </form>
      </main>
    );
  }
  if (!datos) return <main className="p-8 text-sm text-neutral-500">Cargando…</main>;
  const cuenta = (prefijo: string) => datos.embudo.filter((e) => e.resultado.startsWith(prefijo)).length;
  const sp = new Map(datos.factura.solutionPartner.map((l) => [l.inquilinoId, l]));
  const credito = new Map(datos.factura.credito.map((c) => [c.inquilinoId, c]));
  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6">
      <header className="mb-4 pr-24">
        <p className="text-xs uppercase tracking-widest text-neutral-500">Vendedor con IA en WhatsApp · plataforma · laboratorio</p>
        <h1 className="text-2xl font-bold sm:text-3xl">Altas, números y factura</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">Embedded Signup y Meta son simuladores: nada de esto toca una cuenta real. Ser Tech Provider y firmar C3/C4 va antes.</p>
        {aviso && <p className="mt-2 rounded bg-amber-50 p-2 text-sm text-amber-900" data-prueba="aviso">{aviso}</p>}
      </header>

      <section className="mb-8 min-w-0" data-prueba="altas">
        <h2 className="mb-2 text-lg font-semibold">Altas por nuestro BSP (Tech Provider)</h2>
        <p className="mb-2 text-sm" data-prueba="embudo">Embudo: {datos.altas.filter((a) => a.estado === 'activa').length} activas · {datos.altas.filter((a) => a.estado === 'falta_metodo_pago').length} esperando método de pago · {cuenta('abandono')} abandonos · {cuenta('fallida')} fallidas · {cuenta('mensaje que no viene de Meta')} mensajes rechazados por origen</p>
        <form className="mb-3 flex flex-wrap items-end gap-2 text-sm" onSubmit={async (e) => { e.preventDefault(); const j = await accion({ accion: 'liga', inquilinoId: nueva.inquilinoId }); if (typeof j.liga === 'string') setLiga(j.liga); }}>
          <label className="flex flex-col">Pyme<input className="rounded border px-2 py-1 dark:bg-neutral-900" value={nueva.inquilinoId} onChange={(e) => setNueva({ ...nueva, inquilinoId: e.target.value })} data-prueba="nueva-pyme" /></label>
          <label className="flex flex-col">Giro<select className="rounded border px-2 py-1 dark:bg-neutral-900" value={nueva.perfil} onChange={(e) => setNueva({ ...nueva, perfil: e.target.value as 'restaurante' | 'tienda' })}><option value="restaurante">restaurante</option><option value="tienda">tienda</option></select></label>
          <button className="rounded bg-neutral-900 px-3 py-1.5 font-semibold text-white dark:bg-white dark:text-neutral-900" type="submit" data-prueba="crear-liga">Crear liga de alta</button>
        </form>
        {liga && (
          <div className="mb-3 rounded border border-dashed p-2 text-sm">
            <p>Liga privada (firmada, vence en 7 días, sirve una vez): <code className="break-all text-xs">{liga.slice(0, 24)}…</code></p>
            <p className="mt-1 flex flex-wrap gap-2">
              {([['propio', 'Simular: trae su número'], ['venta', 'Sin número → venta'], ['renta', 'Sin número → renta'], ['abandona', 'Simular abandono']] as const).map(([numero, texto]) => (
                <button key={numero} type="button" className="rounded border px-2 py-1" data-prueba={`simula-${numero}`} onClick={() => accion({ accion: 'simulaAlta', liga, perfil: nueva.perfil, numero })}>{texto}</button>
              ))}
            </p>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-prueba="tabla-altas">
            <thead className="text-left text-xs uppercase tracking-wide text-neutral-500"><tr><th className={th}>Pyme</th><th className={th}>WABA</th><th className={th}>Estado</th><th className={th}>Pasos</th><th className={th}>Número</th><th className={th}></th></tr></thead>
            <tbody>
              {datos.altas.map((a) => (
                <tr key={a.wabaId} className="border-t border-neutral-200 align-top dark:border-neutral-800">
                  <td className={th}>{a.inquilinoId ?? '—'}<span className="block text-[10px] text-neutral-500">{fecha(a.creadaEn)}</span></td>
                  <td className={`${th} font-mono text-xs`}>{a.wabaId}</td>
                  <td className={th}>{ESTADO_ALTA[a.estado]}</td>
                  <td className={th}><span className="flex flex-wrap gap-1">{a.pasos.map((p, i) => <span key={i} title={p.detalle} className={`rounded px-1.5 text-xs ${p.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>{p.ok ? '✓' : '✗'} {p.paso}</span>)}</span></td>
                  <td className={`${th} font-mono text-xs`}>{a.numeroDelPool ?? '—'}</td>
                  <td className={th}>
                    {a.estado === 'falta_metodo_pago' && <button type="button" className="mr-2 underline" onClick={() => accion({ accion: 'confirmaPago', wabaId: a.wabaId })}>Confirmar pago</button>}
                    {(a.estado === 'activa' || a.estado === 'falta_metodo_pago') && <button type="button" className="underline" onClick={() => accion({ accion: 'baja', wabaId: a.wabaId, motivo: 'baja desde la plataforma' })}>Baja</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8 min-w-0" data-prueba="numeros">
        <h2 className="mb-2 text-lg font-semibold">Números (venta y renta)</h2>
        <p className="mb-2 text-sm">Este mes: {datos.numerosMes.numeros} cobrables · ingreso {pesos(datos.numerosMes.ingresoCentavos)} · costo del pool {pesos(datos.numerosMes.costoCentavos)} · margen <b>{pesos(datos.numerosMes.margenCentavos)}</b></p>
        <p className="mb-2 flex gap-2 text-sm">
          <button type="button" className="rounded border px-2 py-1" data-prueba="numero-venta" onClick={() => accion({ accion: 'numeroAlPool', modalidad: 'venta' })}>+ número en venta</button>
          <button type="button" className="rounded border px-2 py-1" data-prueba="numero-renta" onClick={() => accion({ accion: 'numeroAlPool', modalidad: 'renta' })}>+ número en renta</button>
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-prueba="tabla-numeros">
            <thead className="text-left text-xs uppercase tracking-wide text-neutral-500"><tr><th className={th}>Número</th><th className={th}>Modalidad</th><th className={th}>Estado</th><th className={th}>Pyme</th><th className={th}>Calidad</th><th className={th}>Precio al mes</th><th className={th}></th></tr></thead>
            <tbody>
              {datos.numeros.map((n) => (
                <tr key={n.e164} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className={`${th} font-mono text-xs`}>{n.e164}</td>
                  <td className={th}>{n.modalidad}{n.portable ? ' · portable' : ''}</td>
                  <td className={th}>{n.estado}{n.estado === 'cuarentena' && n.cuarentenaHasta ? <span className="block text-[10px] text-neutral-500">hasta el {fecha(n.cuarentenaHasta)}</span> : null}</td>
                  <td className={th}>{n.inquilinoId ?? '—'}</td>
                  <td className={th}>{n.calidad}</td>
                  <td className={`${th} tabular-nums`}>{pesos(n.precioMensualCentavos)}</td>
                  <td className={th}>{(n.estado === 'activo' || n.estado === 'registrado') && <button type="button" className="underline" onClick={() => accion({ accion: 'liberaNumero', e164: n.e164, motivo: 'liberado desde la plataforma' })}>Liberar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-neutral-500">Un número liberado en renta pasa 90 días en cuarentena antes de volver al pool: los clientes del dueño anterior siguen escribiéndole.</p>
      </section>

      <section className="min-w-0" data-prueba="factura">
        <h2 className="mb-2 text-lg font-semibold">Factura de {datos.factura.mes}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-neutral-500"><tr><th className={th}>Pyme</th><th className={th}>Mensajes cobrados</th><th className={th}>Meta</th><th className={th}>Como Tech Provider</th><th className={th}>Como Solution Partner</th><th className={th}>Crédito</th></tr></thead>
            <tbody>
              {datos.factura.techProvider.map((l) => {
                const c = credito.get(l.inquilinoId);
                return (
                  <tr key={l.inquilinoId} className="border-t border-neutral-200 tabular-nums dark:border-neutral-800">
                    <td className={th}>{l.inquilinoId}</td>
                    <td className={th}>{l.mensajesCobrados}</td>
                    <td className={th}>{usd(l.metaMicros)}</td>
                    <td className={th}>{pesos(l.totalCentavos)}<span className="block text-[10px] text-neutral-500">cuota; Meta le cobra a la pyme</span></td>
                    <td className={th}>{pesos(sp.get(l.inquilinoId)?.totalCentavos ?? 0)}<span className="block text-[10px] text-neutral-500">cuota + Meta + margen</span></td>
                    <td className={th}>{c ? `${c.nivel} (${c.usadoPct} %)` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-neutral-500">Supuestos ficticios del roadmap: cuota, margen y tipo de cambio. La línea de crédito de Meta no admite MXN. Al tope solo se frena el marketing.</p>
      </section>
    </main>
  );
}
