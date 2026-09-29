'use client';

/**
 * La revision de la caducidad leida (decision del laboratorio: la maquina PROPONE y la persona que
 * registra CONFIRMA o CORRIGE). Se ve la foto con la zona leida marcada, la fecha dicha sin
 * ambiguedad con sus dias y su semaforo, las opciones si hay ambiguedad, el lote y el texto leido
 * tal cual. Nada de esto cuenta hasta que se confirma; si se deja pendiente, las cajas se quedan
 * en recibo y el servidor no deja moverlas.
 */
import { useState } from 'react';
import { aAammdd, avisosDeFecha, categoriaPorId, fechaLarga, TEXTO_SEMAFORO, TEXTO_TIPO_FECHA, textoDias, vidaRestante, type OpcionFecha, type Propuesta } from '../services/nucleo.ts';
import type { EstadoCliente } from '../services/cliente.ts';
import { COLOR_SEMAFORO } from '../services/presenta.ts';
import { Foto, fotoDe } from './foto.tsx';
import { boton, botonPrimario, campo } from './marco.tsx';

export interface RevisionAbierta {
  readonly sitio: string;
  readonly sku: string;
  readonly cajas: number;
  readonly revision: string;
  readonly folio: string;
  readonly propuesta: Propuesta & { readonly enFotoEntera?: boolean };
  readonly completa: string;
  readonly recortes: readonly string[];
}

export interface Decision {
  readonly caducidad: string;
  readonly lote: string;
  readonly formato?: OpcionFecha['formato'];
  readonly tipo?: 'caducidad' | 'consumo-preferente';
  readonly dondeCaducidad?: string;
}

const ESTADO: Record<Propuesta['estado'], string> = {
  propuesta: 'Propuesta', ambigua: 'Ambigua: elige', discrepancia: 'Las tomas no coinciden', invalida: 'Fecha imposible', 'solo-fabricacion': 'Solo fabricación', remite: 'No está en esta cara', 'sin-fecha': 'No encontré fecha',
};

function Vida({ est, sku, iso }: { est: EstadoCliente; sku: string; iso: string }) {
  const art = est.articulos.find((a) => a.sku === sku);
  const v = vidaRestante(aAammdd(iso), est.hoy, categoriaPorId(est.configuracion.categorias, art?.categoria), art?.vidaUtilDias);
  if (!v) return null;
  return <span className={`inline-block rounded-md px-2 py-0.5 text-sm font-bold ${COLOR_SEMAFORO[v.estado]}`} data-prueba="semaforo-revision">{TEXTO_SEMAFORO[v.estado].etiqueta} · {textoDias(v.dias)}</span>;
}

function Opciones({ est, r, elegida, elige }: { est: EstadoCliente; r: RevisionAbierta; elegida: OpcionFecha | undefined; elige: (o: OpcionFecha) => void }) {
  const ctx = { hoy: est.hoy, ...(est.articulos.find((a) => a.sku === r.sku)?.vidaUtilDias ? { vidaUtilDias: est.articulos.find((a) => a.sku === r.sku)!.vidaUtilDias! } : {}) };
  return (
    <fieldset className="space-y-1.5" data-prueba="opciones">
      <legend className="text-sm font-semibold">¿Cuál dice la caja?</legend>
      {r.propuesta.opciones.map((o) => (
        <label key={`${o.iso}${o.tipo}${o.formato}`} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm ${elegida === o ? 'border-blue-600 bg-blue-50 dark:bg-blue-950' : 'border-neutral-300 dark:border-neutral-700'}`} data-prueba="opcion">
          <input type="radio" name="opcion" className="mt-1" checked={elegida === o} onChange={() => elige(o)} />
          <span className="space-y-0.5">
            <span className="block font-semibold">{fechaLarga(o.iso)}</span>
            <span className="block text-xs text-neutral-600 dark:text-neutral-300">leída como {o.formato} · {TEXTO_TIPO_FECHA[o.tipo]}{o.sugerida ? ' · SUGERIDA (cambiando una cifra)' : ''}{o.derivada ? ' · calculada' : ''}</span>
            <Vida est={est} sku={r.sku} iso={o.iso} />
            {avisosDeFecha(o, ctx).map((a) => <span key={a} className="block text-xs text-amber-800 dark:text-amber-300">{a}</span>)}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function RevisionCaducidad({ est, r, alDecidir, alOtraFoto, alPendiente, ocupado }: { est: EstadoCliente; r: RevisionAbierta; alDecidir: (d: Decision) => void; alOtraFoto: () => void; alPendiente: () => void; ocupado: boolean }) {
  const p = r.propuesta;
  const inicial = p.estado === 'propuesta' ? p.opciones[0] : undefined;
  const [elegida, setElegida] = useState<OpcionFecha | undefined>(inicial);
  const [fecha, setFecha] = useState(p.fecha ?? '');
  const [lote, setLote] = useState(p.lote ?? p.lotesPosibles[0]?.valor ?? '');
  const [donde, setDonde] = useState('');
  const [guardarDonde, setGuardarDonde] = useState(!fotoDe(est, r.sku, 'caducidad'));
  const elige = (o: OpcionFecha) => { setElegida(o); setFecha(o.iso); };
  const tal = fecha === (p.fecha ?? '') && lote === (p.lote ?? '');
  const zonaMarca = p.zona && !p.enFotoEntera ? p.zona.caja : undefined;
  const huellaVista = p.enFotoEntera ? r.completa : r.recortes[p.zona?.toma ?? 0] ?? r.completa;
  const decide = () => alDecidir({
    caducidad: fecha, lote: lote.trim(),
    ...(elegida && elegida.iso === fecha && elegida.tipo !== 'sin-rotulo' && elegida.tipo !== 'fabricacion' ? { formato: elegida.formato, tipo: elegida.tipo } : {}),
    ...(elegida && elegida.iso === fecha && elegida.tipo === 'sin-rotulo' ? { formato: elegida.formato, tipo: 'caducidad' as const } : {}),
    ...(guardarDonde && donde.trim() ? { dondeCaducidad: donde.trim() } : {}),
  });
  return (
    <div className="space-y-3" data-prueba="revision" data-estado={p.estado}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-200" data-prueba="estado-propuesta">{ESTADO[p.estado]}</span>
        <span className="text-xs text-neutral-500">folio {r.folio} · motor {p.motor}{p.ms.length ? ` · ${p.ms.map((m) => `${(m / 1000).toFixed(1)} s`).join(' + ')}` : ''}{p.coinciden !== undefined ? ` · dos tomas ${p.coinciden ? 'coinciden' : 'NO coinciden'}` : ''}</span>
      </div>
      <Foto huella={huellaVista} alt="Lo que se leyó" className="max-h-56 w-full rounded-lg bg-neutral-900" {...(zonaMarca ? { marca: zonaMarca } : {})} />
      {p.enFotoEntera ? <p className="text-xs text-amber-800 dark:text-amber-300">En el recuadro no se vio fecha: se leyó la foto entera.</p> : null}
      <p className="text-base font-semibold" data-prueba="mensaje-propuesta">{p.mensaje}</p>
      {p.estado === 'propuesta' && p.fecha ? (
        <div className="space-y-1 rounded-xl border-2 border-blue-600 p-3" data-prueba="fecha-propuesta">
          <p className="text-xl font-black">{fechaLarga(p.fecha)}</p>
          <p className="text-sm">{TEXTO_TIPO_FECHA[p.opciones[0]!.tipo]} · leída como {p.opciones[0]!.formato}</p>
          <Vida est={est} sku={r.sku} iso={p.fecha} />
          {p.avisos.map((a) => <p key={a} className="text-xs text-amber-800 dark:text-amber-300">{a}</p>)}
        </div>
      ) : null}
      {p.estado !== 'propuesta' && p.opciones.length > 0 ? <Opciones est={est} r={r} elegida={elegida} elige={elige} /> : null}
      <p className="text-xs text-neutral-500" data-prueba="texto-leido">Texto leído tal cual: «{p.textoLeido.join(' ¦ ') || '—'}»</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm">Caducidad<input type="date" className={campo} value={fecha} onChange={(x) => { setFecha(x.target.value); setElegida(undefined); }} data-prueba="fecha-confirmar" /></label>
        <label className="text-sm">Lote<input className={`${campo} font-mono`} value={lote} maxLength={20} onChange={(x) => setLote(x.target.value.toUpperCase())} data-prueba="lote-confirmar" /></label>
      </div>
      {p.loteDifiere ? <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200" data-prueba="lote-difiere">Las tomas leyeron el lote distinto — {p.loteDifiere.join('; ')}. Míralo en la caja.</p> : null}
      <p className="text-xs text-neutral-500">Revisa también el lote letra por letra: el motor confunde A/H, 0/O, 2/3.{p.lotesPosibles.length ? ` Otros posibles: ${p.lotesPosibles.map((l) => l.valor).join(', ')}.` : ''}</p>
      {!fotoDe(est, r.sku, 'caducidad') ? (
        <div className="space-y-1 rounded-lg bg-neutral-50 p-2 text-sm dark:bg-neutral-900">
          <label className="flex items-center gap-2"><input type="checkbox" checked={guardarDonde} onChange={(x) => setGuardarDonde(x.target.checked)} data-prueba="guardar-donde" />Guardar esta foto como «dónde viene la caducidad» de este artículo</label>
          {guardarDonde ? <input className={campo} placeholder="dónde está impresa y cómo se ve mejor (p. ej. cuello, por encima del líquido)" value={donde} maxLength={200} onChange={(x) => setDonde(x.target.value)} data-prueba="nota-donde" /> : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={botonPrimario} onClick={decide} disabled={ocupado || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !lote.trim()} data-prueba="confirmar">{tal ? 'Confirmar tal cual' : 'Confirmar corregida'}</button>
        <button type="button" className={boton} onClick={alOtraFoto} disabled={ocupado} data-prueba="otra-foto">Tomar otra foto</button>
        <button type="button" className={boton} onClick={alPendiente} disabled={ocupado} data-prueba="dejar-pendiente">Dejar pendiente</button>
      </div>
      <p className="text-xs text-neutral-500">Pendiente = las {r.cajas} caja(s) se quedan en recibo y no se mueven, venden ni transfieren hasta que confirmes.</p>
    </div>
  );
}
