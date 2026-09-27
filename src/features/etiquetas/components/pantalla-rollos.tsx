'use client';

/**
 * /etiquetas/rollos — presupuesto contra gasto de rollos Zebra, por sitio y mes.
 *
 * El gasto sale de lo que se imprime (cada impresion anota sus etiquetas contra el rollo que
 * tiene la impresora). Aviso al 80 % o si la proyeccion a fin de mes pasa del presupuesto; el
 * exceso se marca pero NUNCA bloquea imprimir: una caja sin etiqueta de caducidad cuesta mas que
 * un rollo. Lo impreso sin rollo asignado se muestra aparte, no como cero.
 */
import { useState } from 'react';
import { costoPorEtiqueta, costoPorRollo, resumenPresupuesto, type EstadoPresupuesto, type ResumenSitio } from '../services/nucleo.ts';
import type { Etiquetas } from '../hooks/use-etiquetas.ts';
import { EstimadorRollos, pesos } from './estimador-rollos.tsx';
import { boton, botonPrimario, campo, tarjeta } from './marco.tsx';

const campoCorto = campo.replace('w-full ', '');

const ESTADO: Record<EstadoPresupuesto, { texto: string; clase: string; barra: string }> = {
  'sin-presupuesto': { texto: 'Sin presupuesto', clase: 'bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200', barra: 'bg-neutral-400' },
  'en-rango': { texto: 'En rango', clase: 'bg-emerald-600 text-white', barra: 'bg-emerald-600' },
  incompleto: { texto: 'Incompleto: falta precio', clase: 'bg-amber-100 text-amber-900 ring-1 ring-amber-400', barra: 'bg-neutral-400' },
  aviso: { texto: 'Aviso', clase: 'bg-amber-400 text-neutral-950', barra: 'bg-amber-500' },
  excedido: { texto: 'Excedido', clase: 'bg-red-600 text-white', barra: 'bg-red-600' },
};

function TarjetaSitio({ r, nombre, e, mes }: { r: ResumenSitio; nombre: string; e: Etiquetas; mes: string }) {
  const est = e.estado!;
  const c = est.consumibles;
  const [monto, setMonto] = useState(String(r.presupuesto ?? ''));
  const pct = r.proporcion !== undefined ? Math.min(100, r.proporcion * 100) : 0;
  const s = ESTADO[r.estado];
  const impresoras = est.impresoras.filter((p) => p.sitio === r.sitio);
  return (
    <article className={`${tarjeta} space-y-3`} data-prueba="rollos-sitio" data-sitio={r.sitio} data-estado={r.estado}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-bold">{nombre}</h3>
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${s.clase}`}>{s.texto}</span>
      </header>
      <div>
        <p className="text-2xl font-bold tabular-nums">{pesos(r.gasto)} <span className="text-sm font-normal text-neutral-500">de {r.presupuesto !== undefined ? pesos(r.presupuesto, 0) : '—'}</span></p>
        <div className="relative mt-1 h-3 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Gasto contra presupuesto">
          <div className={`h-full ${s.barra}`} style={{ width: `${pct}%` }} />
          <div className="absolute inset-y-0 left-[80%] w-0.5 bg-neutral-900/60 dark:bg-white/60" title="80 %: aviso" />
        </div>
        <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">Al ritmo de este mes cerraría en <strong>{pesos(r.proyeccion)}</strong>{r.proporcion !== undefined ? ` · va al ${Math.round(r.proporcion * 100)} %` : ''} · {r.etiquetas.toLocaleString('es-MX')} etiquetas impresas · compras del mes: {pesos(r.compras, 0)} ({r.rollosComprados} rollos)</p>
        {r.etiquetasSinCosto ? <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200" data-prueba="sin-costo">{r.etiquetasSinCosto.toLocaleString('es-MX')} etiquetas impresas en una impresora sin rollo asignado: no se suman como cero, falta su precio. Asígnale su rollo abajo.</p> : null}
      </div>
      <form className="flex items-end gap-2" onSubmit={(x) => { x.preventDefault(); void e.ejecuta({ accion: 'presupuesto', sitio: r.sitio, mes, monto: Math.max(0, Number(monto) || 0) }); }}>
        <label className="text-xs">Presupuesto de {mes} (MXN)<input className={`${campoCorto} w-32`} type="number" min={0} value={monto} onChange={(x) => setMonto(x.target.value)} /></label>
        <button type="submit" className={boton}>Guardar</button>
      </form>
      <table className="w-full text-left text-xs">
        <thead className="text-neutral-500"><tr><th className="py-1">Impresora</th><th>Rollo puesto</th><th className="text-right">Etiquetas</th><th className="text-right">Gasto</th></tr></thead>
        <tbody>{impresoras.map((p) => {
          const g = r.porImpresora.find((x) => x.impresora === p.id);
          return (
            <tr key={p.id} className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-1 pr-2">{p.nombre}</td>
              <td className="pr-2"><select className={campo} value={c.rolloPorImpresora[p.id] ?? ''} onChange={(x) => void e.ejecuta({ accion: 'rollo-impresora', impresora: p.id, rollo: x.target.value })} aria-label={`Rollo de ${p.nombre}`}><option value="">— sin asignar —</option>{c.rollos.map((ro) => <option key={ro.id} value={ro.id}>{ro.nombre}</option>)}</select></td>
              <td className="text-right tabular-nums">{(g?.etiquetas ?? 0).toLocaleString('es-MX')}</td>
              <td className="text-right tabular-nums">{g?.etiquetasSinCosto ? 'sin costo' : pesos(g?.gasto ?? 0)}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </article>
  );
}

export function PantallaRollos({ e }: { e: Etiquetas }) {
  const est = e.estado!;
  const c = est.consumibles;
  const [mes, setMes] = useState(est.hoy.slice(0, 7));
  const sitios = est.configuracion.sitios;
  const resumen = resumenPresupuesto(c, sitios.map((s) => s.clave), mes, est.hoy);
  const [compra, setCompra] = useState({ sitio: sitios[0]?.clave ?? '', rollo: c.rollos[0]?.id ?? '', rollos: 1, costoTotal: 0 });
  const [aviso, setAviso] = useState<string | null>(null);
  const total = resumen.reduce((s, r) => s + r.gasto, 0);
  const totalPresupuesto = resumen.reduce((s, r) => s + (r.presupuesto ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">Mes<input className={campo} type="month" value={mes} onChange={(x) => setMes(x.target.value)} data-prueba="mes" /></label>
        <p className="text-sm" data-prueba="total-cadena">Toda la cadena: <strong>{pesos(total)}</strong> de {pesos(totalPresupuesto, 0)} presupuestados</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {resumen.map((r) => <TarjetaSitio key={`${r.sitio}-${mes}`} r={r} nombre={sitios.find((s) => s.clave === r.sitio)?.nombre ?? r.sitio} e={e} mes={mes} />)}
      </div>
      <EstimadorRollos escenarios={c.escenarios} rollos={c.rollos} />
      <section className={`${tarjeta} space-y-2`}>
        <h2 className="text-base font-semibold">Rollos y precios</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs" data-prueba="rollos">
            <thead className="text-neutral-500"><tr><th className="py-1">Rollo</th><th>Medida</th><th className="text-right">Etiq./rollo</th><th className="text-right">Paquete</th><th className="text-right">$ por rollo</th><th className="text-right">$ por etiqueta</th><th>Precio consultado</th></tr></thead>
            <tbody>{c.rollos.map((r) => (
              <tr key={r.id} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="py-1 pr-2">{r.nombre}<br /><span className="text-neutral-500">{r.tecnologia === 'termica-directa' ? 'térmica directa' : 'transferencia térmica'}</span></td>
                <td>{r.anchoMm} × {r.altoMm} mm</td>
                <td className="text-right tabular-nums">{r.etiquetasPorRollo.toLocaleString('es-MX')}</td>
                <td className="text-right tabular-nums">{pesos(r.costoPaquete)} / {r.rollosPorPaquete}</td>
                <td className="text-right tabular-nums">{pesos(costoPorRollo(r))}</td>
                <td className="text-right tabular-nums">{pesos(costoPorEtiqueta(r), 4)}</td>
                <td>{r.fuente ? <a className="underline" href={r.fuente} target="_blank" rel="noreferrer">{new URL(r.fuente).hostname}</a> : 'sin fuente'}{r.fechaPrecio ? ` · ${r.fechaPrecio}` : ''}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <p className="text-xs text-neutral-500">Precios de referencia de tiendas en línea; pon los de tu proveedor. La página de la tienda no aclara si incluyen IVA.</p>
      </section>
      <form className={`${tarjeta} grid gap-2 sm:grid-cols-5 sm:items-end`} onSubmit={(x) => { x.preventDefault(); void e.ejecuta({ accion: 'compra', ...compra }).then(() => setAviso('Compra registrada.'), (err: unknown) => setAviso(err instanceof Error ? err.message : String(err))); }}>
        <h2 className="text-base font-semibold sm:col-span-5">Registrar una compra de rollos</h2>
        <label className="text-xs">Sitio<select className={campo} value={compra.sitio} onChange={(x) => setCompra({ ...compra, sitio: x.target.value })}>{sitios.map((s) => <option key={s.clave} value={s.clave}>{s.nombre}</option>)}</select></label>
        <label className="text-xs">Rollo<select className={campo} value={compra.rollo} onChange={(x) => setCompra({ ...compra, rollo: x.target.value })}>{c.rollos.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select></label>
        <label className="text-xs">Rollos<input className={campo} type="number" min={1} value={compra.rollos} onChange={(x) => setCompra({ ...compra, rollos: Math.max(1, Number(x.target.value) || 1) })} /></label>
        <label className="text-xs">Costo total (MXN)<input className={campo} type="number" min={0} step="0.01" value={compra.costoTotal} onChange={(x) => setCompra({ ...compra, costoTotal: Math.max(0, Number(x.target.value) || 0) })} /></label>
        <button type="submit" className={botonPrimario}>Registrar</button>
        {aviso ? <p className="text-sm sm:col-span-5" role="status">{aviso}</p> : null}
      </form>
    </div>
  );
}
