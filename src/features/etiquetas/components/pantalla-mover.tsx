'use client';

/**
 * /etiquetas/mover — la mercancia dentro del sitio: recibo → almacen → piso de venta, y merma.
 *
 * Se lee la etiqueta de UBICACION (o se toca la zona) para fijar el destino, y luego las cajas o
 * tarimas: cada lectura mueve. Lo vencido o en retiro no sube a piso; al resurtir, el FEFO avisa
 * si en almacen hay un lote que vence antes. Abajo, las etiquetas de ubicacion del sitio.
 */
import { useState } from 'react';
import {
  aZpl, disenaUbicacion, esErrorLectura, fechaLegible, leeUbicacion, nombreZona, parseaLectura, PERFIL_EJEMPLO, zonaDe, ZONAS,
  type ResultadoMovimiento, type Zona, parseaFechaGs1, aAammdd, esFecha,
} from '../services/nucleo.ts';
import type { Etiquetas } from '../hooks/use-etiquetas.ts';
import { EntradaPistola } from './entrada-pistola.tsx';
import { LectorCamara } from './lector-camara.tsx';
import { campo, tarjeta } from './marco.tsx';
import { PanelImpresion } from './panel-impresion.tsx';
import { svgDe } from './vista-etiqueta.tsx';

interface Registro { readonly n: number; readonly tipo: 'ok' | 'error' | 'zona'; readonly texto: string; readonly avisos: readonly string[] }

const fecha = (iso: string) => { const f = parseaFechaGs1(aAammdd(iso), Number(iso.slice(0, 4))); return esFecha(f) ? fechaLegible(f) : iso; };

export function PantallaMover({ e }: { e: Etiquetas }) {
  const est = e.estado!;
  const sitios = est.configuracion.sitios;
  const [sitio, setSitio] = useState(sitios.find((s) => s.tipo === 'sucursal')?.clave ?? sitios[0]?.clave ?? '');
  const [destino, setDestino] = useState<Zona>('piso');
  const [veces, setVeces] = useState(1);
  const [bitacora, setBitacora] = useState<Registro[]>([]);
  const anota = (tipo: Registro['tipo'], texto: string, avisos: readonly string[] = []) => setBitacora((b) => [{ n: (b[0]?.n ?? 0) + 1, tipo, texto, avisos }, ...b].slice(0, 12));
  const sitioObj = sitios.find((s) => s.clave === sitio);

  const alLeer = (texto: string) => {
    const r = parseaLectura(texto);
    if (!esErrorLectura(r)) {
      const u = leeUbicacion(r.elementos, sitios);
      if (u) {
        if ('error' in u) anota('error', u.error);
        else if (u.sitio.clave !== sitio) anota('error', `Esa ubicación es de ${u.sitio.nombre}; aquí estás en ${sitioObj?.nombre ?? sitio}.`);
        else { setDestino(u.zona); anota('zona', `Destino: ${nombreZona(u.zona)}`); }
        return;
      }
    }
    void e.ejecuta<ResultadoMovimiento>({ accion: 'movimiento', sitio, texto, destino, veces }).then(
      (x) => {
        if (!x.ok) return anota('error', x.motivo);
        const m = x.movimiento;
        const art = est.articulos.find((a) => a.sku === m.sku)?.descripcion ?? m.sku;
        anota('ok', `${m.cajas} ${m.cajas === 1 ? 'caja' : 'cajas'} · ${art} · lote ${m.lote} · ${m.de.map(nombreZona).join(' + ')} → ${nombreZona(m.a)}`, x.avisos);
      },
      (err: unknown) => anota('error', err instanceof Error ? err.message : String(err)),
    );
  };

  const filas = new Map<string, { sku: string; lote: string; caducidad: string; zonas: Record<Zona, number> }>();
  for (const x of est.existencias.filter((y) => y.sitio === sitio && y.cantidad > 0)) {
    const k = `${x.sku}|${x.lote}|${x.caducidad}`;
    const f = filas.get(k) ?? { sku: x.sku, lote: x.lote, caducidad: x.caducidad, zonas: { recibo: 0, almacen: 0, piso: 0, merma: 0 } };
    f.zonas[zonaDe(x)] += x.cantidad;
    filas.set(k, f);
  }
  const perfil = est.impresoras.find((p) => p.sitio === sitio) ?? { ...PERFIL_EJEMPLO, sitio };
  const etiquetas = sitioObj?.gln ? ZONAS.map((z) => ({ z, diseno: disenaUbicacion(sitioObj, z.id, perfil) })) : [];
  const zplUbicaciones = etiquetas.map((x) => aZpl(x.diseno, perfil)).join('');

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className={`${tarjeta} space-y-3`}>
          <label className="block text-sm">Estoy en<select className={campo} value={sitio} onChange={(x) => setSitio(x.target.value)} data-prueba="sitio-mover">{sitios.map((s) => <option key={s.clave} value={s.clave}>{s.nombre}</option>)}</select></label>
          <div>
            <p className="mb-1 text-sm">Mover a <span className="text-xs text-neutral-500">(o lee la etiqueta de la zona)</span></p>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-4" role="radiogroup" aria-label="Zona de destino">
              {ZONAS.map((z) => <button key={z.id} type="button" role="radio" aria-checked={destino === z.id} onClick={() => setDestino(z.id)} className={`rounded-md px-2 py-2 text-sm font-semibold ${destino === z.id ? 'bg-blue-700 text-white' : 'bg-neutral-100 dark:bg-neutral-800'}`} data-prueba={`zona-${z.id}`}>{z.nombre}</button>)}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">Cajas por lectura <input className="w-20 rounded-lg border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900" type="number" min={1} max={500} value={veces} onChange={(x) => setVeces(Math.min(500, Math.max(1, Number(x.target.value) || 1)))} data-prueba="veces" /></label>
          <LectorCamara alLeer={alLeer} />
        </div>
        <div className="space-y-4">
          <EntradaPistola alLeer={alLeer} />
          <section className={`${tarjeta} space-y-2`} aria-live="polite" data-prueba="bitacora-mover">
            <h2 className="text-base font-semibold">Lecturas de esta sesión</h2>
            {bitacora.length === 0 ? <p className="text-sm text-neutral-500">Elige la zona de destino (o lee su etiqueta) y lee las cajas.</p> : null}
            <ul className="space-y-1.5">{bitacora.map((r) => (
              <li key={r.n} className={`rounded-lg px-3 py-1.5 text-sm ${r.tipo === 'ok' ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' : r.tipo === 'zona' ? 'bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-200' : 'bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200'}`} data-tipo={r.tipo}>
                {r.texto}{r.avisos.map((a) => <span key={a} className="mt-0.5 block text-xs font-semibold text-amber-800 dark:text-amber-300">{a}</span>)}
              </li>
            ))}</ul>
          </section>
        </div>
      </div>
      <section className={`${tarjeta} space-y-2`}>
        <h2 className="text-base font-semibold">Qué hay en {sitioObj?.nombre ?? sitio}, por zona (cajas)</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm" data-prueba="zonas">
            <thead className="text-xs text-neutral-500"><tr><th className="py-1">Artículo</th><th>Lote</th><th>Caduca</th>{ZONAS.map((z) => <th key={z.id} className="text-right">{z.nombre}</th>)}</tr></thead>
            <tbody>{[...filas.values()].sort((a, b) => a.caducidad.localeCompare(b.caducidad)).map((f) => (
              <tr key={`${f.sku}${f.lote}${f.caducidad}`} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="py-1 pr-2">{est.articulos.find((a) => a.sku === f.sku)?.descripcion ?? f.sku}</td>
                <td className="font-mono text-xs">{f.lote}</td><td className="text-xs">{fecha(f.caducidad)}</td>
                {ZONAS.map((z) => <td key={z.id} className="text-right tabular-nums">{f.zonas[z.id] || '·'}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      <section className={`${tarjeta} space-y-3`} data-prueba="etiquetas-ubicacion">
        <h2 className="text-base font-semibold">Etiquetas de ubicación de {sitioObj?.nombre ?? sitio}</h2>
        <p className="text-xs text-neutral-600 dark:text-neutral-300">GS1-128 con (414) el GLN del sitio y (254) la zona: la extensión que GS1 reserva para ubicaciones internas. Se pegan en la entrada de cada zona.</p>
        {etiquetas.length === 0 ? <p className="text-sm text-amber-700">Este sitio no tiene GLN: ponlo en Ajustes → Sitios para imprimir sus etiquetas de ubicación.</p> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {etiquetas.map(({ z, diseno }) => {
              const s = svgDe(diseno);
              return 'svg' in s ? <div key={z.id} className="overflow-hidden rounded border border-neutral-300 bg-white [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: s.svg }} /> : <p key={z.id} className="text-sm text-red-700">{s.error}</p>;
            })}
          </div>
        )}
        {etiquetas.length ? <PanelImpresion e={e} zpl={zplUbicaciones} bloquea={false} sitio={sitio} impresora={est.impresoras.find((p) => p.sitio === sitio)?.id ?? ''} copias={1} /> : null}
      </section>
    </div>
  );
}
