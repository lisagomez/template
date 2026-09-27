'use client';

/** Ventas y brief: tus XML y CSV se leen aquí mismo; confirmas precios; sale el brief de 30 días. */
import { useMemo, useState } from 'react';
import { Boton } from '@/features/laboratorio-voz/components/ui';
import { formatoDinero, formatoPesosRedondo, fechaCorta, normaliza } from '../../../../tools/pymes-marketing/dist/index.js';
import { resumeVentas } from '../../../../tools/pymes-marketing/dist/ventas/index.js';
import type { EstrategiaDe30Dias } from '../../../../tools/pymes-marketing/dist/contenido/index.js';
import { useEstudio } from '../store/estudio.ts';
import { Lista, Pastilla } from './ui-estudio.tsx';

function Carga() {
  const { cargaArchivos, ocupado } = useEstudio();
  const [rfc, setRfc] = useState('');
  return (
    <div className="flex flex-wrap items-end gap-3 text-sm">
      <label className="space-y-1"><span className="block font-semibold">Tus facturas (XML) o el CSV de tu caja</span>
        <input type="file" multiple accept=".xml,.csv,.txt" onChange={(e) => e.target.files && void cargaArchivos([...e.target.files], rfc)} className="block text-xs" /></label>
      <label className="space-y-1"><span className="block font-semibold">Tu RFC (para no contar tus compras)</span>
        <input value={rfc} onChange={(e) => setRfc(e.target.value.toUpperCase())} className="rounded-lg border border-neutral-300 p-2 text-sm dark:border-neutral-700 dark:bg-neutral-950" placeholder="EKU9003173C9" /></label>
      {ocupado ? <span className="text-neutral-500">Leyendo…</span> : null}
    </div>
  );
}

function Precios() {
  const { ventas, precios, confirmaPrecios } = useEstudio();
  const resumen = useMemo(() => (ventas ? resumeVentas(ventas) : null), [ventas]);
  const [borrador, setBorrador] = useState<Record<string, string>>({});
  if (!resumen || resumen.estado !== 'ok') return null;
  // La clave es el NOMBRE normalizado: es la que usa el calendario para poner el precio en la pieza.
  const top = resumen.valor.productos.slice(0, 6).map((p) => ({ ...p, clave: normaliza(p.producto) }));
  return (
    <div className="text-sm">
      <p className="mb-1 font-semibold">Precios al público (con impuestos): confírmalos antes de que aparezcan en una pieza</p>
      <table className="w-full"><tbody>{top.map((p) => (
        <tr key={p.clave} className="border-t border-neutral-100 dark:border-neutral-900">
          <td className="py-1">{p.producto}</td><td className="text-xs text-neutral-500">en tus datos: {p.precioUnitario !== null ? formatoDinero(p.precioUnitario) : '—'}{p.precioUnitario !== null ? ' (factura: sin IVA)' : ''}</td>
          <td className="text-right">$ <input className="w-20 rounded border border-neutral-300 p-1 text-right dark:border-neutral-700 dark:bg-neutral-950" value={borrador[p.clave] ?? (precios[p.clave]?.toString() ?? '')} onChange={(e) => setBorrador({ ...borrador, [p.clave]: e.target.value })} /></td>
        </tr>))}</tbody></table>
      <Boton onClick={() => confirmaPrecios({ ...precios, ...Object.fromEntries(Object.entries(borrador).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)])) })}>Confirmar precios</Boton>
      <span className="ml-2 text-xs text-neutral-500">{Object.keys(precios).length} confirmado(s)</span>
    </div>
  );
}

function Resumen() {
  const { ventas, origenVentas } = useEstudio();
  const r = useMemo(() => (ventas ? resumeVentas(ventas) : null), [ventas]);
  if (!ventas || !r) return null;
  if (r.estado !== 'ok') return <p className="text-sm"><Pastilla tono="sin">sin datos</Pastilla> {r.motivo}</p>;
  const v = r.valor;
  return (
    <div className="grid gap-3 text-sm md:grid-cols-2" data-prueba="resumen-ventas">
      <div><p className="text-xs text-neutral-500">{origenVentas}</p><p className="text-2xl font-bold tabular-nums">{formatoPesosRedondo(v.netoPesos)}</p><p className="text-xs text-neutral-500">{fechaCorta(v.desde)} al {fechaCorta(v.hasta)} · {v.lineas} líneas · sin IVA{v.notasDeCredito ? ` · −${formatoPesosRedondo(v.notasDeCredito)} en notas de crédito` : ''}</p>
        <Lista titulo="Lo que más vende" elementos={v.top.map((p) => `${p.producto}: ${formatoPesosRedondo(p.importe)}`)} /></div>
      <div className="space-y-2"><Lista titulo="Sube más de 25 %" elementos={v.subiendo.map((p) => `${p.producto} ${Math.round((p.tendencia ?? 0) * 100)}%`)} />
        <Lista titulo="Baja más de 25 %" elementos={v.bajando.map((p) => `${p.producto} ${Math.round((p.tendencia ?? 0) * 100)}%`)} />
        <Lista titulo="Lo que no entró (y por qué)" elementos={ventas.excluidas.slice(0, 5).map((e) => `${e.referencia}: ${e.motivo}`)} />
        <Lista titulo="Avisos" elementos={ventas.avisos} /></div>
    </div>
  );
}

export function Brief({ e }: { e: EstrategiaDe30Dias }) {
  return (
    <div data-prueba="brief-30" className="space-y-3 rounded-xl bg-neutral-50 p-4 text-sm dark:bg-neutral-900">
      <p className="text-xs uppercase tracking-widest text-neutral-500">Brief de contenido · {fechaCorta(e.desde)} al {fechaCorta(e.hasta)}</p>
      <p className="text-base font-semibold">{e.resumen}</p>
      <Lista titulo="Empujar fuerte" elementos={e.empujar.map((x) => `${x.producto} — ${x.cifras}. ${x.angulo}. Cuándo: ${x.cuando}.`)} />
      <Lista titulo="Mantener" elementos={e.mantener.map((x) => `${x.producto} — ${x.cifras}`)} />
      <Lista titulo="Reposicionar o pausar" elementos={e.reposicionar.map((x) => `${x.producto}: ${x.opcion} — ${x.porque}`)} />
      <Lista titulo="Temporada" elementos={e.temporada.map((t) => `${t.fecha.nombre} (${fechaCorta(t.fecha.desde)}${t.fecha.precision === 'aproximada' ? ', aprox.' : ''}): ${t.accion}`)} />
      <Lista titulo="Ofertas recomendadas (tú validas el margen)" elementos={e.ofertas.map((o) => `${o.descripcion}: ${o.porque}`)} />
      <Lista titulo="Lo que falta" elementos={e.faltantes} />
    </div>
  );
}

export function SeccionVentas() {
  const { brief, generaBrief } = useEstudio();
  return (
    <div className="space-y-4">
      <Carga />
      <Resumen />
      <Precios />
      <Boton variante="primario" onClick={generaBrief}>Hacer el brief de 30 días</Boton>
      {brief ? <Brief e={brief} /> : null}
    </div>
  );
}
