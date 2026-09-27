'use client';

/**
 * /etiquetas/conteo — inventario fisico. Se abre un conteo por sitio y zonas (con punto de corte
 * en la cadena), se cuenta CIEGO leyendo la etiqueta de ubicacion y luego las cajas, lo que sale de
 * la tolerancia lo recuenta otra persona, y al cerrar se ve la conciliacion contra la CADENA. El
 * ajuste lo autoriza alguien que no conto y entra como evento CONTEO por lote.
 */
import { useEffect, useState } from 'react';
import { nombreZona, ZONAS, type Zona } from '../services/nucleo.ts';
import { accion, credenciales } from '../services/cliente.ts';
import { COLOR_CLASE, fechaCorta, fechaHora, hashCorto, TEXTO_CLASE } from '../services/presenta.ts';
import { enlaceExpediente, type Conteos, type VistaConteo } from '../services/tipos-expediente.ts';
import type { Etiquetas } from '../hooks/use-etiquetas.ts';
import { EntradaPistola } from './entrada-pistola.tsx';
import { LectorCamara } from './lector-camara.tsx';
import { boton, botonPrimario, campo, tarjeta } from './marco.tsx';
import { FotoArticulo } from './foto.tsx';
import type { EstadoCliente } from '../services/cliente.ts';

type Resp = { ok: boolean; motivo?: string; ubicacion?: { sitio: string; zona: Zona; posicion?: string }; leido?: { lote: { lote: string }; sku: string; cajas: number | null; zona: Zona; posicion: string | null; sscc: string | null } };
const ESTADO: Record<string, string> = { contando: 'Contando', reconteo: 'Reconteo', 'por-aplicar': 'Por aplicar', aplicado: 'Aplicado', cancelado: 'Cancelado' };

function Nuevo({ e, alAbrir }: { e: Etiquetas; alAbrir: (folio: string) => void }) {
  const sitios = e.estado!.configuracion.sitios;
  const [sitio, setSitio] = useState(sitios[0]?.clave ?? '');
  const [zonas, setZonas] = useState<Zona[]>(['almacen', 'piso']);
  const [tolerancia, setTolerancia] = useState(1);
  const [aviso, setAviso] = useState<string | null>(null);
  const abre = () => void accion<{ ok: boolean; motivo?: string; conteo?: VistaConteo }>({ accion: 'conteo-abre', sitio, zonas, tolerancia }).then(
    (r) => (r.ok && r.conteo ? alAbrir(r.conteo.folio) : setAviso(r.motivo ?? 'no se pudo')), (err: unknown) => setAviso(String(err)));
  return (
    <section className={`${tarjeta} space-y-2`}>
      <h2 className="text-base font-semibold">Nuevo conteo</h2>
      <label className="block text-sm">Sitio<select className={campo} value={sitio} onChange={(v) => setSitio(v.target.value)} data-prueba="sitio-conteo">{sitios.map((s) => <option key={s.clave} value={s.clave}>{s.nombre}</option>)}</select></label>
      <fieldset className="text-sm"><legend>Zonas</legend>
        <div className="flex flex-wrap gap-2">{ZONAS.map((z) => <label key={z.id} className="flex items-center gap-1"><input type="checkbox" checked={zonas.includes(z.id)} onChange={() => setZonas((x) => (x.includes(z.id) ? x.filter((y) => y !== z.id) : [...x, z.id]))} data-prueba={`zona-conteo-${z.id}`} />{z.nombre}</label>)}</div>
      </fieldset>
      <label className="block text-sm">Tolerancia (cajas que se ajustan sin reconteo)<input className={campo} type="number" min={0} value={tolerancia} onChange={(v) => setTolerancia(Math.max(0, Number(v.target.value) || 0))} data-prueba="tolerancia" /></label>
      <button type="button" className={botonPrimario} onClick={abre} disabled={zonas.length === 0} data-prueba="abrir-conteo">Abrir conteo</button>
      <p className="text-xs text-neutral-500">Antes de abrir se verifica la cadena del sitio: si el inventario guardado no es el que dicen los eventos, se abre un incidente y no se cuenta.</p>
      {aviso ? <p className="text-sm text-red-700 dark:text-red-300" role="alert" data-prueba="aviso-conteo">{aviso}</p> : null}
    </section>
  );
}

function Contar({ c, alCambiar, est }: { c: VistaConteo; alCambiar: () => void; est?: EstadoCliente | null }) {
  const [zona, setZona] = useState<Zona>(c.zonas[0]!);
  const [posicion, setPosicion] = useState('');
  const [veces, setVeces] = useState(1);
  const [aviso, setAviso] = useState<string | null>(null);
  const [skuLeido, setSkuLeido] = useState<string | null>(null);
  const alLeer = (texto: string) => void accion<Resp>({ accion: 'conteo-lee', folio: c.folio, texto, zona, veces, ...(zona === 'almacen' && posicion ? { posicion } : {}) }).then((r) => {
    if (r.ubicacion) {
      setSkuLeido(null);
      if (r.ubicacion.sitio !== c.sitio) return setAviso(`esa ubicación es de ${r.ubicacion.sitio}; el conteo es de ${c.sitio}`);
      if (!c.zonas.includes(r.ubicacion.zona)) return setAviso(`${nombreZona(r.ubicacion.zona)} no está en este conteo`);
      setZona(r.ubicacion.zona); setPosicion(r.ubicacion.posicion ?? '');
      return setAviso(`Ubicación: ${nombreZona(r.ubicacion.zona)}${r.ubicacion.posicion ? ` · rack ${r.ubicacion.posicion}` : ''}`);
    }
    setSkuLeido(r.ok && r.leido ? r.leido.sku : null);
    setAviso(r.ok && r.leido ? (r.leido.cajas === null ? `Leído: tarima ${r.leido.sscc ?? ''} completa, lote ${r.leido.lote.lote}` : `Leído: ${r.leido.cajas} caja(s) del lote ${r.leido.lote.lote}`) : r.motivo ?? 'no se pudo');
    if (r.ok) alCambiar();
  }, (err: unknown) => setAviso(String(err)));
  const cierra = () => void accion<{ ok: boolean; motivo?: string }>({ accion: 'conteo-cierra', folio: c.folio }).then((r) => (r.ok ? alCambiar() : setAviso(r.motivo ?? 'no se pudo')));
  return (
    <div className="space-y-3">
      {c.ronda === 2 ? (
        <div className="rounded-lg border border-amber-400 bg-amber-50 p-2 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100" data-prueba="recontar">
          <p className="font-semibold">Reconteo: lo cuenta otra persona, sin ver lo que se contó antes.</p>
          <ul className="list-inside list-disc">{c.recontar.map((r) => <li key={`${r.lote}${r.zona}${r.sscc ?? ''}`}>lote {r.lote} en {nombreZona(r.zona as Zona).toLowerCase()}{r.sscc ? ` (tarima ${r.sscc})` : ''}</li>)}</ul>
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Ubicación que se cuenta">
            {c.zonas.map((z) => <button key={z} type="button" role="radio" aria-checked={zona === z} onClick={() => { setZona(z); setPosicion(''); }} className={`rounded-md px-2 py-1.5 text-sm font-semibold ${zona === z ? 'bg-blue-700 text-white' : 'bg-neutral-100 dark:bg-neutral-800'}`}>{nombreZona(z)}</button>)}
          </div>
          {zona === 'almacen' ? <label className="flex items-center gap-2 text-sm">Rack-nivel-posición<input className="w-28 rounded-lg border border-neutral-300 bg-white px-2 py-1 font-mono uppercase dark:border-neutral-700 dark:bg-neutral-900" value={posicion} placeholder="B-01-1" maxLength={8} onChange={(v) => setPosicion(v.target.value.toUpperCase())} /></label> : null}
          <label className="flex items-center gap-2 text-sm">Cajas por lectura<input className="w-20 rounded-lg border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900" type="number" min={1} max={500} value={veces} onChange={(v) => setVeces(Math.min(500, Math.max(1, Number(v.target.value) || 1)))} data-prueba="veces-conteo" /></label>
          <LectorCamara alLeer={alLeer} />
          <EntradaPistola alLeer={alLeer} />
          {aviso ? <div className="flex items-center gap-2">{skuLeido && est ? <FotoArticulo est={est} sku={skuLeido} className="h-10 w-10 rounded" /> : null}<p className="text-sm" role="status" data-prueba="aviso-lectura-conteo">{aviso}</p></div> : null}
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Lo que llevas contado en la ronda {c.ronda} ({c.lecturas.filter((x) => !x.porRegistro).reduce((s, x) => s + x.cajas, 0)} cajas{c.lecturas.some((x) => x.porRegistro) ? ' y tarimas completas' : ''})</h3>
          <ol className="max-h-72 divide-y divide-neutral-200 overflow-y-auto text-sm dark:divide-neutral-800" data-prueba="lecturas-conteo">
            {[...c.lecturas].reverse().map((x, i) => <li key={`${x.fecha}${i}`} className="py-1">{x.porRegistro ? `tarima ${x.sscc ?? ''} completa` : `${x.cajas} caja(s)`} · lote <b>{x.lote.lote}</b> · {nombreZona(x.zona).toLowerCase()}{x.posicion ? ` ${x.posicion}` : ''} <span className="text-xs text-neutral-500">· {x.operador}</span></li>)}
          </ol>
          <p className="text-xs text-neutral-500">Conteo ciego: aquí no aparece cuánto dice el sistema.</p>
          <button type="button" className={botonPrimario} onClick={cierra} data-prueba="terminar-ronda">Terminar ronda {c.ronda}</button>
        </div>
      </div>
    </div>
  );
}

function Conciliacion({ e, c, alCambiar }: { e: Etiquetas; c: VistaConteo; alCambiar: () => void }) {
  const [autoriza, setAutoriza] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const filas = c.conciliacion ?? [];
  const fuera = filas.filter((r) => !r.dentroTolerancia).length;
  const aplica = () => void e.ejecuta<{ ok: boolean; motivo?: string }>({ accion: 'conteo-aplica', folio: c.folio, ...(autoriza.trim() ? { autoriza: autoriza.trim() } : {}) }).then(
    (r) => (r.ok ? alCambiar() : setAviso(r.motivo ?? 'no se pudo')), (err: unknown) => setAviso(err instanceof Error ? err.message : String(err)));
  return (
    <div className="space-y-2" data-prueba="conciliacion">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="text-xs text-neutral-500"><tr><th>Lote</th><th>Ubicación</th><th>Cadena</th><th>Contado</th><th>Diferencia</th><th>Resultado</th><th>Ronda</th></tr></thead>
          <tbody>{filas.map((r) => (
            <tr key={r.clave} className="border-t border-neutral-200 dark:border-neutral-800">
              <td><a className="hover:underline" href={enlaceExpediente(r.lote)}>{r.sku} <span className="font-mono text-xs">{r.lote.lote}</span></a> <span className="text-xs text-neutral-500">cad. {fechaCorta(r.lote.caducidad)}</span></td>
              <td>{nombreZona(r.zona).toLowerCase()}{r.posicion ? ` ${r.posicion}` : ''}</td><td>{r.esperado}</td><td>{r.contado}</td>
              <td className="font-bold">{r.diferencia > 0 ? `+${r.diferencia}` : r.diferencia}</td>
              <td><span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${COLOR_CLASE[r.clase]}`}>{TEXTO_CLASE[r.clase]}</span>{r.diferencia !== 0 && r.dentroTolerancia ? <span className="ml-1 text-xs text-neutral-500">(en tolerancia)</span> : null}</td><td>{r.ronda}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {c.estado === 'por-aplicar' ? (
        <div className="flex flex-wrap items-end gap-2">
          {fuera ? <label className="min-w-0 flex-1 text-sm">{fuera} diferencia(s) fuera de tolerancia tras el reconteo: autoriza (una persona que no contó)<input className={campo} value={autoriza} onChange={(v) => setAutoriza(v.target.value)} maxLength={60} data-prueba="autoriza-conteo" /></label> : null}
          <button type="button" className={botonPrimario} onClick={aplica} data-prueba="aplicar-conteo">Aplicar ajustes a la cadena</button>
        </div>
      ) : null}
      {aviso ? <p className="text-sm text-red-700 dark:text-red-300" role="alert">{aviso}</p> : null}
    </div>
  );
}

function Cancelar({ c, alCambiar }: { c: VistaConteo; alCambiar: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const cancela = () => void accion<{ ok: boolean; motivo?: string }>({ accion: 'conteo-cancela', folio: c.folio, motivo: motivo.trim() }).then((r) => (r.ok ? alCambiar() : setAviso(r.motivo ?? 'no se pudo')));
  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-neutral-200 pt-2 dark:border-neutral-800">
      <label className="min-w-0 flex-1 text-xs">Motivo para cancelar (no toca la cadena)<input className={campo} value={motivo} onChange={(v) => setMotivo(v.target.value)} maxLength={200} /></label>
      <button type="button" className={boton} onClick={cancela} disabled={motivo.trim().length < 3}>Cancelar conteo</button>
      {aviso ? <p className="text-xs text-red-700">{aviso}</p> : null}
    </div>
  );
}

function Activo({ e, c, alCambiar }: { e: Etiquetas; c: VistaConteo; alCambiar: () => void }) {
  const contador = e.estado?.rol === 'conteo';
  const cerrado = c.estado === 'por-aplicar' || c.estado === 'aplicado';
  return (
    <article className={`${tarjeta} space-y-3`} data-prueba="conteo-activo" data-estado={c.estado} data-ronda={c.ronda}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">{c.folio}</h2>
        <span className="rounded bg-neutral-900 px-2 py-0.5 text-xs font-bold text-white dark:bg-white dark:text-neutral-900">{ESTADO[c.estado]}{c.estado === 'contando' || c.estado === 'reconteo' ? ` · ronda ${c.ronda}` : ''}</span>
      </header>
      <p className="text-xs text-neutral-500">{c.sitio} · {c.zonas.map(nombreZona).join(', ')} · tolerancia {c.tolerancia} caja(s) · abierto {fechaHora(c.abierto)} por {c.abre} · corte en la cadena: evento #{c.corte.seq} {hashCorto(c.corte.cabeza)} · cuentas como {credenciales().operador}</p>
      {c.estado === 'contando' || c.estado === 'reconteo' ? <Contar key={`${c.folio}${c.ronda}`} c={c} alCambiar={alCambiar} est={e.estado} /> : null}
      {cerrado && contador ? <p className="rounded bg-neutral-100 px-2 py-1 text-sm dark:bg-neutral-800" data-prueba="conteo-terminado">Conteo terminado{c.estado === 'aplicado' ? ' y aplicado' : ''}. La conciliación contra el sistema la ve quien supervisa, no este dispositivo.</p> : null}
      {cerrado && !contador ? <Conciliacion e={e} c={c} alCambiar={alCambiar} /> : null}
      {c.aplicado?.acta ? <p className="rounded bg-emerald-50 px-2 py-1 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" data-prueba="aplicado">✓ Aplicado {fechaHora(c.aplicado.fecha)}: {c.aplicado.eventos ?? 0} evento(s) en la cadena{c.aplicado.autoriza ? `, autorizó ${c.aplicado.autoriza}` : ''} · acta {hashCorto(c.aplicado.acta)}</p> : null}
      {c.cancelado ? <p className="text-sm text-neutral-500">Cancelado: {c.cancelado.motivo}</p> : null}
      {c.estado !== 'aplicado' && c.estado !== 'cancelado' && !contador ? <Cancelar c={c} alCambiar={alCambiar} /> : null}
    </article>
  );
}

export function PantallaConteo({ e }: { e: Etiquetas }) {
  const [datos, setDatos] = useState<Conteos | null>(null);
  const [folio, setFolio] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => { void accion<Conteos>({ accion: 'conteos' }).then(setDatos); }, [vuelta]);
  const recarga = () => setVuelta((n) => n + 1);
  const conteos = datos?.conteos ?? [];
  const activo = conteos.find((c) => c.folio === folio) ?? conteos.find((c) => c.estado !== 'aplicado' && c.estado !== 'cancelado') ?? conteos[0];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <div className="space-y-4">
        {e.estado?.rol === 'conteo'
          ? <p className={`${tarjeta} text-sm`} data-prueba="nota-contador">Los conteos los abre quien supervisa. Aquí solo cuentas: lees la ubicación y las cajas, sin ver lo que dice el sistema.</p>
          : <Nuevo e={e} alAbrir={(f) => { setFolio(f); recarga(); }} />}
        <section className={`${tarjeta} space-y-1 text-sm`}>
          <h2 className="text-base font-semibold">Conteos</h2>
          {conteos.length === 0 ? <p className="text-neutral-500">Ninguno todavía.</p> : null}
          {conteos.map((c) => <button key={c.folio} type="button" onClick={() => setFolio(c.folio)} className={`block w-full rounded px-1 py-1 text-left ${activo?.folio === c.folio ? 'bg-blue-50 dark:bg-blue-950' : 'hover:bg-neutral-50 dark:hover:bg-neutral-900'}`}><span className="font-mono text-xs">{c.folio}</span> · {ESTADO[c.estado]}</button>)}
          {datos?.patrones.map((p) => p.faltantes.map((f) => <p key={`${p.sitio}${f.ubicacion}`} className="rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-800 dark:bg-red-950 dark:text-red-200">Patrón en {p.sitio}: faltantes repetidos en {f.ubicacion} ({f.cajas} cajas, {f.folios.length} conteos) — incidente abierto</p>))}
        </section>
      </div>
      <div className="min-w-0">{activo ? <Activo e={e} c={activo} alCambiar={recarga} /> : <p className={`${tarjeta} text-sm text-neutral-500`}>Abre un conteo para empezar.</p>}</div>
    </div>
  );
}
