'use client';

/**
 * /etiquetas/dia — el dia del SUPERVISOR en una pantalla: los avisos, el avance de la ronda por
 * zona y lo atrasado, lo pendiente por confirmar con su antiguedad, lo que entro HOY a rojo, los
 * conteos por conciliar, los hallazgos de piso y las recomendaciones del agente sin decidir. Cada
 * renglon lleva a donde se resuelve. Desde aqui se abre el conteo ciclico de hoy (lo cuenta el
 * almacenista a ciegas; lo concilia y autoriza quien no conto).
 */
import { useEffect, useState } from 'react';
import { nombreZona, type DiaDelSitio, type Zona } from '../services/nucleo.ts';
import { accion } from '../services/cliente.ts';
import type { Etiquetas } from '../hooks/use-etiquetas.ts';
import { Foto } from './foto.tsx';
import { botonPrimario, campo, tarjeta } from './marco.tsx';
import { FilaTarea } from './ronda-panel.tsx';

function Seccion({ titulo, n, enlace, prueba, children }: { titulo: string; n: number; enlace?: string; prueba: string; children: React.ReactNode }) {
  return (
    <section className={`${tarjeta} space-y-2`} data-prueba={prueba} data-n={n}>
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">{titulo} <span className="text-neutral-500">({n})</span></h2>
        {enlace ? <a className="text-xs font-semibold underline" href={enlace}>Resolver</a> : null}
      </header>
      {n === 0 ? <p className="text-sm text-neutral-500">Nada hoy.</p> : children}
    </section>
  );
}

function AbrirCiclico({ d, alAbrir }: { d: DiaDelSitio; alAbrir: () => void }) {
  const [aviso, setAviso] = useState<string | null>(null);
  const [tolerancia, setTolerancia] = useState(0);
  const ubic = (d.ronda?.tareas ?? []).filter((t) => t.tipo === 'contar' && (t.estado === 'pendiente' || t.estado === 'atrasada'));
  if (ubic.length === 0) return null;
  const abierto = d.conteos.some((c) => c.estado === 'contando' || c.estado === 'reconteo');
  const abre = () => void accion<{ ok: boolean; motivo?: string; conteo?: { folio: string } }>({ accion: 'conteo-abre', sitio: d.sitio, zonas: [...new Set(ubic.map((t) => t.zona))] as Zona[], tolerancia, ubicaciones: ubic.map((t) => t.ubicacion) })
    .then((r) => { setAviso(r.ok ? `Abierto ${r.conteo?.folio}: el almacenista lo ve en su ronda y cuenta a ciegas.` : r.motivo ?? 'no se pudo'); if (r.ok) alAbrir(); }, (x: unknown) => setAviso(x instanceof Error ? x.message : String(x)));
  return (
    <div className="space-y-2 rounded-lg border border-teal-600 p-2" data-prueba="abrir-ciclico">
      <p className="text-sm font-semibold">Conteo cíclico de hoy, elegido por riesgo:</p>
      <ul className="text-sm">{ubic.map((t) => <li key={t.id}><b>{t.ubicacion}</b>: {(t.razones ?? []).join('; ')}</li>)}</ul>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">Tolerancia (cajas)<input type="number" min={0} className={`${campo} w-20`} value={tolerancia} onChange={(x) => setTolerancia(Math.max(0, Number(x.target.value) || 0))} /></label>
        <button type="button" className={botonPrimario} onClick={abre} disabled={abierto} data-prueba="abrir-ciclico-boton">{abierto ? 'Ya hay un conteo abierto' : 'Abrir el conteo cíclico'}</button>
      </div>
      {aviso ? <p className="text-sm" role="status" data-prueba="aviso-ciclico">{aviso}</p> : null}
    </div>
  );
}

export function PantallaDia({ e }: { e: Etiquetas }) {
  const est = e.estado!;
  const [sitio, setSitio] = useState(est.configuracion.sitios.find((s) => s.clave.startsWith('SUC'))?.clave ?? est.configuracion.sitios[0]?.clave ?? '');
  const [d, setD] = useState<DiaDelSitio | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => { void accion<DiaDelSitio>({ accion: 'dia', sitio }).then(setD, (x: unknown) => setAviso(x instanceof Error ? x.message : String(x))); }, [sitio, vuelta]);
  const tareas = d?.ronda?.tareas ?? [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">Sitio<select className={`${campo} w-auto`} value={sitio} onChange={(x) => setSitio(x.target.value)} data-prueba="sitio-dia">{est.configuracion.sitios.map((s) => <option key={s.clave} value={s.clave}>{s.nombre}</option>)}</select></label>
        <button type="button" className="text-sm font-semibold underline" onClick={() => setVuelta((v) => v + 1)}>Actualizar</button>
        {aviso ? <p className="text-sm text-red-700" role="alert">{aviso}</p> : null}
      </div>
      {d ? (
        <div className="grid gap-3 lg:grid-cols-2" data-prueba="dia" data-sitio={d.sitio}>
          <section className={`${tarjeta} space-y-1 lg:col-span-2`} data-prueba="avisos" data-n={d.avisos.length}>
            <h2 className="text-base font-bold">Avisos ({d.avisos.length})</h2>
            {d.avisos.length === 0 ? <p className="text-sm text-neutral-500">Sin avisos.</p> : null}
            {d.avisos.map((a, i) => <a key={`${i}${a.texto}`} href={a.enlace} className={`block rounded px-2 py-1 text-sm ${a.nivel === 'alto' ? 'bg-red-600 font-semibold text-white' : 'bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100'}`}>{a.texto}</a>)}
          </section>
          <Seccion titulo="Ronda de hoy" n={tareas.length} prueba="avance">
            <div className="space-y-1">{(d.ronda?.avance ?? []).map((z) => (
              <div key={z.zona} className="text-sm" data-prueba="avance-zona" data-zona={z.zona} data-porcentaje={z.porcentaje}>
                <div className="flex justify-between"><span>{nombreZona(z.zona)}</span><span>{z.hechas + z.yaNoAplica}/{z.total} · {z.porcentaje}%{z.atrasadas ? <b className="text-red-700"> · {z.atrasadas} atrasada(s)</b> : null}</span></div>
                <div className="h-2 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800"><div className="h-full bg-emerald-600" style={{ width: `${z.porcentaje}%` }} /></div>
              </div>
            ))}</div>
            <details><summary className="cursor-pointer text-sm font-semibold">Las {tareas.length} tareas en orden de recorrido</summary><ol className="divide-y divide-neutral-200 dark:divide-neutral-800">{tareas.map((t) => <FilaTarea key={t.id} t={t} />)}</ol></details>
            <AbrirCiclico d={d} alAbrir={() => setVuelta((v) => v + 1)} />
          </Seccion>
          <Seccion titulo="Por confirmar (caducidad por foto)" n={d.pendientes.length} enlace="/etiquetas/recibir" prueba="pendientes">
            <ul className="text-sm">{d.pendientes.map((p) => <li key={p.folio}><b>{p.descripcion}</b> · {p.cajas} caja(s) · folio {p.folio} · <span className={p.horas >= 4 ? 'font-bold text-red-700' : ''}>{p.antiguedad}</span></li>)}</ul>
          </Seccion>
          <Seccion titulo="Entró hoy a rojo o venció hoy" n={d.rojosHoy.length} enlace="/etiquetas/caducidades" prueba="rojos-hoy">
            <ul className="text-sm">{d.rojosHoy.map((r) => <li key={`${r.lote}${r.ubicacion}`}><b>{r.que}</b>: {r.descripcion} · lote {r.lote} · {r.cajas} caja(s) en {r.ubicacion}</li>)}</ul>
          </Seccion>
          <Seccion titulo="Conteos por conciliar" n={d.conteos.length} enlace="/etiquetas/conteo" prueba="conteos-dia">
            <ul className="text-sm">{d.conteos.map((c) => <li key={c.folio}><b>{c.folio}</b> · {c.estado} · {c.ubicaciones.join(', ')}{c.fuera ? <b className="text-red-700"> · {c.fuera} fuera de tolerancia</b> : null}</li>)}</ul>
          </Seccion>
          <Seccion titulo="Hallazgos de piso (7 días)" n={d.hallazgos.length} prueba="hallazgos">
            <ul className="space-y-1 text-sm">{d.hallazgos.map((h) => <li key={h.seq} className="flex items-center gap-2">{h.foto ? <Foto huella={h.foto} alt="foto del hallazgo" className="h-12 w-16 rounded" /> : null}<span><b>{est.articulos.find((a) => a.sku === h.sku)?.descripcion ?? h.sku}</b> en {h.ubicacion} · {h.leido} · evento #{h.seq}</span></li>)}</ul>
          </Seccion>
          <Seccion titulo="Recomendaciones del agente sin decidir" n={d.recomendaciones.length} enlace="/etiquetas/riesgo" prueba="recomendaciones">
            <ul className="text-sm">{d.recomendaciones.map((r) => <li key={`${r.lote}${r.fecha}`}>lote <b>{r.lote}</b>: {r.texto}</li>)}</ul>
          </Seccion>
        </div>
      ) : <p className="text-sm text-neutral-500">Cargando el día…</p>}
    </div>
  );
}
