'use client';

/**
 * /etiquetas/catalogo — la plantilla, la subida de Excel o CSV con su diff antes de aplicar,
 * el catalogo resultante con la regla de cada codigo, la exportacion y la impresion por lote.
 */
import { useState } from 'react';
import { readSheet } from 'read-excel-file/browser';
import writeExcelFile from 'write-excel-file/browser';
import { aCsv, aRegistros, COLUMNAS_PLANTILLA, filasDeExportacion, parseaCsv, PERFIL_EJEMPLO, registrosDeCeldas, sumaDias, type PlanImportacion } from '../services/nucleo.ts';
import { COLOR_FILA, gtinLegible, resumenLegible, TEXTO_FILA, TEXTO_REGLA } from '../services/presenta.ts';
import { zplDeLote } from '../services/lote.ts';
import type { Etiquetas } from '../hooks/use-etiquetas.ts';
import { comoEstado } from './pantalla-lector.tsx';
import { boton, botonPrimario, campo, tarjeta } from './marco.tsx';
import { PanelImpresion } from './panel-impresion.tsx';

const EJEMPLOS = [
  ['YOG-001', 'Yogurt natural 1 kg', 'lacteos', 'CEDIS-NTE;SUC-CENTRO', 'NO', '9521111000013', '19521111000010', '12', '50', '35'],
  ['PAN-004', 'Pan de caja blanco 680 g', 'panaderia', 'SUC-CENTRO', 'SI', '', '', '10', '', '6'],
];

function descarga(nombre: string, datos: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(datos);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function huellaDe(archivo: File): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', await archivo.arrayBuffer());
  return `sha256:${[...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)}`;
}

async function registrosDe(archivo: File): Promise<Record<string, string>[]> {
  if (/\.xlsx$/i.test(archivo.name)) return registrosDeCeldas(await readSheet(archivo));
  return aRegistros(parseaCsv(await archivo.text()));
}

function Plan({ plan }: { plan: PlanImportacion }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" data-prueba="resumen">{resumenLegible(plan.resumen).map((r) => <span key={r.clave} className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs dark:bg-neutral-800"><strong>{r.n}</strong> {r.texto}</span>)}</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs" data-prueba="diff">
          <thead className="text-neutral-500"><tr><th className="py-1">Fila</th><th>SKU</th><th>Estado</th><th>Pieza</th><th>Caja</th><th>Detalle</th></tr></thead>
          <tbody>
            {plan.filas.map((f) => (
              <tr key={`${f.fila}-${f.sku}`} className="border-t border-neutral-200 align-top dark:border-neutral-800" data-estado={f.estado}>
                <td className="py-1">{f.fila}</td>
                <td className="font-mono">{f.sku}</td>
                <td><span className={`rounded px-1.5 py-0.5 font-semibold ${COLOR_FILA[f.estado]}`}>{TEXTO_FILA[f.estado]}</span></td>
                <td className="font-mono">{f.articulo ? <>{gtinLegible(f.articulo.gtinUnidad)}<br /><span className="font-sans text-neutral-500">{f.articulo.reglaUnidad ? TEXTO_REGLA[f.articulo.reglaUnidad] : ''}</span></> : '—'}</td>
                <td className="font-mono">{f.articulo ? <>{gtinLegible(f.articulo.gtinCaja)}<br /><span className="font-sans text-neutral-500">{f.articulo.reglaCaja ? TEXTO_REGLA[f.articulo.reglaCaja] : ''}</span></> : '—'}</td>
                <td>{[...f.motivos, ...f.cambios, ...(f.articulo?.notas ?? []), ...f.nuevas.filter((n) => n.emitido).map((n) => `asigna ${n.nivel} ${n.gtin}`)].join(' · ')}</td>
              </tr>
            ))}
            {plan.errores.map((x) => <tr key={`e${x.fila}`} className="border-t border-neutral-200 dark:border-neutral-800" data-estado="error"><td className="py-1">{x.fila}</td><td /><td><span className="rounded bg-red-100 px-1.5 py-0.5 font-semibold text-red-900">Error</span></td><td /><td /><td>{x.mensaje}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PantallaCatalogo({ e }: { e: Etiquetas }) {
  const est = e.estado!;
  const [archivo, setArchivo] = useState<{ nombre: string; huella: string; registros: Record<string, string>[] } | null>(null);
  const [plan, setPlan] = useState<PlanImportacion | null>(null);
  const [aplicado, setAplicado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [lote, setLote] = useState({ sitio: est.configuracion.sitios[0]?.clave ?? '', lote: '', caducidad: sumaDias(est.hoy, 30), copias: 1 });

  const sube = async (f: File | undefined) => {
    if (!f) return;
    setError(null); setAplicado(false);
    try {
      const registros = await registrosDe(f);
      const a = { nombre: f.name, huella: await huellaDe(f), registros };
      setArchivo(a);
      setPlan(await e.ejecuta<PlanImportacion>({ accion: 'catalogo-plan', archivo: a.nombre, huella: a.huella, registros }));
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };
  const aplica = async () => {
    if (!archivo) return;
    try {
      setPlan(await e.ejecuta<PlanImportacion>({ accion: 'catalogo-aplica', archivo: archivo.nombre, huella: archivo.huella, registros: archivo.registros }));
      setAplicado(true);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };
  const plantillaCsv = () => descarga('plantilla-catalogo-gs1.csv', new Blob([aCsv([COLUMNAS_PLANTILLA.map((c) => c.clave), ...EJEMPLOS])], { type: 'text/csv' }));
  const plantillaXlsx = () => void writeExcelFile([COLUMNAS_PLANTILLA.map((c) => ({ value: c.clave, fontWeight: 'bold' as const })), ...EJEMPLOS.map((f) => f.map((v) => ({ value: v, type: String })))]).toBlob().then((b) => descarga('plantilla-catalogo-gs1.xlsx', b));
  const exportaCsv = () => descarga('catalogo-gs1.csv', new Blob([aCsv(filasDeExportacion(comoEstado(est)))], { type: 'text/csv' }));
  const exportaXlsx = () => void writeExcelFile(filasDeExportacion(comoEstado(est)).map((f, i) => f.map((v) => ({ value: v, type: String, ...(i === 0 ? { fontWeight: 'bold' as const } : {}) })))).toBlob().then((b) => descarga('catalogo-gs1.xlsx', b));

  const perfil = est.impresoras.find((p) => p.sitio === lote.sitio) ?? { ...PERFIL_EJEMPLO, sitio: lote.sitio };
  const seleccion = est.articulos.filter((a) => elegidos.includes(a.sku));
  const loteZpl = seleccion.length && lote.lote ? zplDeLote(seleccion, lote, perfil, est.configuracion.categorias, est.hoy) : null;
  const aplicables = plan ? plan.filas.filter((f) => f.estado === 'nuevo' || f.estado === 'cambiado').length : 0;

  return (
    <div className="space-y-4">
      <section className={`${tarjeta} space-y-2`}>
        <h2 className="text-base font-semibold">1 · La plantilla</h2>
        <ul className="grid gap-x-4 text-xs text-neutral-600 sm:grid-cols-2 dark:text-neutral-300">{COLUMNAS_PLANTILLA.map((c) => <li key={c.clave}><code className="font-semibold">{c.clave}</code>{c.obligatoria ? ' *' : ''} — {c.ayuda}</li>)}</ul>
        <div className="flex flex-wrap gap-2"><button type="button" className={boton} onClick={plantillaXlsx}>Plantilla Excel</button><button type="button" className={boton} onClick={plantillaCsv}>Plantilla CSV</button></div>
      </section>
      <section className={`${tarjeta} space-y-3`}>
        <h2 className="text-base font-semibold">2 · Subir el catálogo (Excel o CSV)</h2>
        <p className="text-xs text-neutral-600 dark:text-neutral-300">Regla mixta: si trae el GTIN del fabricante se conserva; si es marca propia se numera con el prefijo de la casa ({est.configuracion.prefijoEmpresa || 'sin configurar'}); si no hay ni lo uno ni lo otro, código interno {est.configuracion.prefijoInterno} de circulación restringida. Subir el mismo archivo otra vez no duplica nada.</p>
        <input type="file" accept=".csv,.xlsx,text/csv" onChange={(x) => void sube(x.target.files?.[0])} data-prueba="archivo" className="text-sm" />
        {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
        {plan ? <Plan plan={plan} /> : null}
        {plan && !aplicado ? <button type="button" className={botonPrimario} disabled={aplicables === 0} onClick={() => void aplica()} data-prueba="aplica">Aplicar {aplicables} cambio(s)</button> : null}
        {aplicado ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" role="status" data-prueba="aplicado">Aplicado. Queda en la traza: {archivo?.nombre} por {est.importaciones.at(-1)?.operador}.</p> : null}
      </section>
      <section className={`${tarjeta} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">3 · Catálogo ({est.articulos.length})</h2>
          <div className="flex gap-2"><button type="button" className={boton} onClick={exportaXlsx}>Exportar Excel</button><button type="button" className={boton} onClick={exportaCsv}>Exportar CSV</button></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs" data-prueba="catalogo">
            <thead className="text-neutral-500"><tr><th /><th className="py-1">SKU</th><th>Descripción</th><th>Sitios</th><th>GTIN pieza</th><th>GTIN caja</th></tr></thead>
            <tbody>{est.articulos.map((a) => (
              <tr key={a.sku} className="border-t border-neutral-200 align-top dark:border-neutral-800">
                <td><input type="checkbox" aria-label={`Elegir ${a.sku}`} checked={elegidos.includes(a.sku)} onChange={() => setElegidos((v) => (v.includes(a.sku) ? v.filter((x) => x !== a.sku) : [...v, a.sku]))} /></td>
                <td className="py-1 font-mono">{a.sku}</td><td>{a.descripcion}</td><td>{a.sitios.join(', ')}</td>
                <td className="font-mono">{gtinLegible(a.gtinUnidad)}<br /><span className="font-sans text-neutral-500">{a.reglaUnidad ? TEXTO_REGLA[a.reglaUnidad] : ''}</span></td>
                <td className="font-mono">{gtinLegible(a.gtinCaja)}<br /><span className="font-sans text-neutral-500">{a.reglaCaja ? TEXTO_REGLA[a.reglaCaja] : ''}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      <section className={`${tarjeta} space-y-3`}>
        <h2 className="text-base font-semibold">4 · Imprimir etiquetas de un lote ({seleccion.length} artículo(s) elegidos)</h2>
        <div className="grid gap-2 sm:grid-cols-4">
          <label className="text-sm">Sitio<select className={campo} value={lote.sitio} onChange={(x) => setLote({ ...lote, sitio: x.target.value })}>{est.configuracion.sitios.map((s) => <option key={s.clave} value={s.clave}>{s.nombre}</option>)}</select></label>
          <label className="text-sm">Lote<input className={`${campo} font-mono`} value={lote.lote} onChange={(x) => setLote({ ...lote, lote: x.target.value })} maxLength={20} /></label>
          <label className="text-sm">Caducidad<input className={campo} type="date" value={lote.caducidad} onChange={(x) => setLote({ ...lote, caducidad: x.target.value })} /></label>
          <label className="text-sm">Copias c/u<input className={campo} type="number" min={1} max={500} value={lote.copias} onChange={(x) => setLote({ ...lote, copias: Math.max(1, Number(x.target.value) || 1) })} /></label>
        </div>
        {loteZpl ? <ul className="text-xs">{loteZpl.etiquetas.map((x) => <li key={x.sku} className={x.bloquea ? 'text-red-700' : 'text-emerald-700'}>{x.sku}: {x.bloquea ? `no pasa — ${x.errores.join('; ')}` : 'lista'}</li>)}</ul> : <p className="text-xs text-neutral-500">Elige artículos en la tabla y escribe el lote.</p>}
        <PanelImpresion e={e} zpl={loteZpl?.zpl || null} bloquea={!loteZpl || loteZpl.etiquetas.some((x) => x.bloquea)} sitio={lote.sitio} impresora={est.impresoras.find((p) => p.sitio === lote.sitio)?.id ?? ''} copias={lote.copias} />
      </section>
    </div>
  );
}
