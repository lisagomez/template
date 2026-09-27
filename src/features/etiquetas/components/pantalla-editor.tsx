'use client';

/**
 * /etiquetas — armar la etiqueta de una caja o una tarima, verla (SVG, ZPL, motor local),
 * revisarla contra GS1 con arreglos de un clic, e imprimirla por Browser Print o por el agente.
 */
import { useState } from 'react';
import { aZpl, PERFIL_EJEMPLO, perfilParaVistaLocal, sumaDias, type Arreglo, type PerfilImpresora } from '../services/nucleo.ts';
import { aManual, aplicaAlEditor, calcula, desdeArticulo, EDITOR_INICIAL, type EstadoEditor } from '../services/editor.ts';
import type { Etiquetas } from '../hooks/use-etiquetas.ts';
import { PanelImpresion } from './panel-impresion.tsx';
import { PanelRevision } from './panel-revision.tsx';
import { boton, campo, tarjeta } from './marco.tsx';
import { VistaEtiqueta } from './vista-etiqueta.tsx';

function inicial(e: Etiquetas): EstadoEditor {
  const est = e.estado!;
  const sitio = est.configuracion.sitios[0]?.clave ?? '';
  const art = est.articulos.find((a) => a.sitios.includes(sitio) && a.gtinCaja);
  const base: EstadoEditor = { ...EDITOR_INICIAL, sitio, lote: 'L4471', caducidad: sumaDias(est.hoy, 35) };
  return art ? desdeArticulo(base, art) : base;
}

export function PantallaEditor({ e }: { e: Etiquetas }) {
  const est = e.estado!;
  const [ed, setEd] = useState<EstadoEditor>(() => inicial(e));
  const impresorasSitio = est.impresoras.filter((p) => p.sitio === ed.sitio);
  const [impresoraId, setImpresoraId] = useState(impresorasSitio[0]?.id ?? '');
  const [lectura, setLectura] = useState<'impresora' | 'pistola' | 'automatico'>('impresora');
  const [copias, setCopias] = useState(1);
  const [registrar, setRegistrar] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const base: PerfilImpresora = impresorasSitio.find((p) => p.id === impresoraId) ?? impresorasSitio[0] ?? { ...PERFIL_EJEMPLO, sitio: ed.sitio };
  const perfil: PerfilImpresora = lectura === 'impresora' ? base : { ...base, perfilLectura: lectura };
  const r = calcula(ed, perfil, est.configuracion.categorias, est.hoy);
  let zpl: string | null = null;
  let zplVistaLocal: string | null = null;
  if (!('error' in r)) {
    try { zpl = aZpl(r.diseno, perfil, { copias }); zplVistaLocal = aZpl(r.diseno, perfilParaVistaLocal(perfil)); } catch { zpl = null; }
  }
  const pon = (x: Partial<EstadoEditor>) => setEd((v) => ({ ...v, ...x }));
  const articulos = est.articulos.filter((a) => a.sitios.includes(ed.sitio));
  const arregla = (a: Arreglo) => { if (!('error' in r)) setEd((v) => aplicaAlEditor(v, r.simbolos, a)); };

  const asignaSscc = () => void e.ejecuta<{ sscc?: string; error?: string }>({ accion: 'sscc', sitio: ed.sitio }).then(
    (x) => { if (x.sscc) pon({ sscc: x.sscc }); setAviso(x.sscc ? `SSCC asignado: ${x.sscc} (no se reusará)` : x.error ?? null); },
    (err: unknown) => setAviso(err instanceof Error ? err.message : String(err)),
  );

  const registraLote = async () => {
    if (!registrar || ed.manual !== null || !ed.sku) return;
    await e.ejecuta({ accion: 'etiquetado', sitio: ed.sitio, sku: ed.sku, lote: ed.lote, caducidad: ed.caducidad, cantidad: ed.tipo === 'tarima' ? ed.cantidad : copias, ...(ed.tipo === 'tarima' && ed.sscc ? { sscc: ed.sscc } : {}) });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <form className={`${tarjeta} space-y-3`} onSubmit={(x) => x.preventDefault()} data-prueba="formulario">
        <div className="flex gap-1" role="radiogroup" aria-label="Tipo de etiqueta">
          {(['caja', 'tarima'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={ed.tipo === t} className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold ${ed.tipo === t ? 'bg-blue-700 text-white' : 'bg-neutral-100 dark:bg-neutral-800'}`} onClick={() => pon({ tipo: t, manual: null, ...(t === 'tarima' ? { cantidad: articulos.find((a) => a.sku === ed.sku)?.cajasPorTarima ?? 1 } : { cantidad: 1 }) })} data-prueba={`tipo-${t}`}>{t === 'caja' ? 'Caja' : 'Tarima (CEDIS)'}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">Sitio<select className={campo} value={ed.sitio} onChange={(x) => { pon({ sitio: x.target.value }); setImpresoraId(est.impresoras.find((p) => p.sitio === x.target.value)?.id ?? ''); }} data-prueba="sitio">{est.configuracion.sitios.map((s) => <option key={s.clave} value={s.clave}>{s.nombre}</option>)}</select></label>
          <label className="text-sm">Impresora<select className={campo} value={impresoraId} onChange={(x) => setImpresoraId(x.target.value)} data-prueba="impresora">{impresorasSitio.length ? impresorasSitio.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>) : <option value="">Sin impresora (ejemplo 4×2)</option>}</select></label>
        </div>
        <label className="block text-sm">Artículo<select className={campo} value={ed.sku} onChange={(x) => { const a = articulos.find((y) => y.sku === x.target.value); if (a) setEd((v) => desdeArticulo(v, a)); }} data-prueba="articulo"><option value="">— libre —</option>{articulos.map((a) => <option key={a.sku} value={a.sku}>{a.sku} · {a.descripcion}</option>)}</select></label>
        {ed.manual === null ? (
          <>
            <label className="block text-sm">Producto<input className={campo} value={ed.producto} onChange={(x) => pon({ producto: x.target.value })} maxLength={60} data-prueba="producto" /></label>
            <label className="block text-sm">{ed.tipo === 'caja' ? 'GTIN de la caja (01)' : 'GTIN del contenido (02)'}<input className={`${campo} font-mono`} value={ed.gtin} onChange={(x) => pon({ gtin: x.target.value })} inputMode="numeric" maxLength={14} data-prueba="gtin" /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">Lote (10)<input className={`${campo} font-mono`} value={ed.lote} onChange={(x) => pon({ lote: x.target.value })} maxLength={24} data-prueba="lote" /></label>
              <label className="text-sm">Caducidad (17)<input className={campo} type="date" value={ed.caducidad} onChange={(x) => pon({ caducidad: x.target.value })} data-prueba="caducidad" /></label>
            </div>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={ed.diaCero} onChange={(x) => pon({ diaCero: x.target.checked })} /> Solo mes y año (día 00 = último día del mes)</label>
            {ed.tipo === 'tarima' ? (
              <>
                <label className="block text-sm">Cajas en la tarima (37)<input className={campo} type="number" min={1} max={99999999} value={ed.cantidad} onChange={(x) => pon({ cantidad: Math.max(1, Number(x.target.value) || 1) })} data-prueba="cantidad" /></label>
                <div className="flex items-end gap-2">
                  <label className="min-w-0 flex-1 text-sm">SSCC (00)<input className={`${campo} font-mono`} value={ed.sscc} onChange={(x) => pon({ sscc: x.target.value })} maxLength={18} data-prueba="sscc" /></label>
                  <button type="button" className={boton} onClick={asignaSscc} data-prueba="asigna-sscc">Asignar</button>
                </div>
              </>
            ) : null}
          </>
        ) : (
          <label className="block text-sm">Cadena GS1 (una línea por código)<textarea className={`${campo} h-28 font-mono text-xs`} value={ed.manual} onChange={(x) => pon({ manual: x.target.value })} data-prueba="manual" /></label>
        )}
        <button type="button" className={`${boton} w-full`} onClick={() => setEd((v) => (v.manual === null ? aManual(v) : { ...v, manual: null }))} data-prueba="modo-manual">{ed.manual === null ? 'Editar la cadena a mano' : 'Volver al formulario'}</button>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs">Grosor<select className={campo} value={String(ed.grosor)} onChange={(x) => pon({ grosor: x.target.value === 'auto' ? 'auto' : Number(x.target.value) })} data-prueba="grosor"><option value="auto">Auto</option>{[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n} pt</option>)}</select></label>
          <label className="text-xs">Lector<select className={campo} value={lectura} onChange={(x) => setLectura(x.target.value as typeof lectura)} data-prueba="lector"><option value="impresora">Del perfil</option><option value="pistola">Pistola</option><option value="automatico">Automático</option></select></label>
          <label className="text-xs">Copias<input className={campo} type="number" min={1} max={500} value={copias} onChange={(x) => setCopias(Math.min(500, Math.max(1, Number(x.target.value) || 1)))} /></label>
        </div>
        {ed.sku && ed.manual === null ? <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={registrar} onChange={(x) => setRegistrar(x.target.checked)} /> Al imprimir, dar de alta el lote en {ed.sitio}</label> : null}
        {aviso ? <p className="text-xs text-neutral-600" role="status">{aviso}</p> : null}
      </form>
      <div className="min-w-0 space-y-4">
        {'error' in r
          ? <p className={`${tarjeta} text-sm text-red-700`} data-prueba="error-editor">{r.error}</p>
          : (
            <>
              <div className={tarjeta}><VistaEtiqueta diseno={r.diseno} zpl={zpl} zplVistaLocal={zplVistaLocal} perfil={perfil} labelaryPermitido={est.configuracion.labelaryPermitido} /></div>
              <div className={tarjeta}><PanelRevision revision={r.revision} arregla={arregla} /></div>
              <div className={tarjeta}><PanelImpresion e={e} zpl={zpl} bloquea={r.revision.bloquea} sitio={ed.sitio} impresora={impresorasSitio.find((p) => p.id === impresoraId)?.id ?? ''} copias={copias} despues={registraLote} /></div>
            </>
          )}
      </div>
    </div>
  );
}
