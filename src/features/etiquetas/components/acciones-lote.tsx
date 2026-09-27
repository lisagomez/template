'use client';

/**
 * Lo que se le puede hacer a un lote desde su expediente: una salida (venta, devolucion, donacion,
 * merma), una transferencia a otro sitio o una CORRECCION. No hay «editar»: un error se corrige
 * con un evento nuevo que apunta al corregido. Donar o liquidar lo autoriza una persona.
 */
import { useState } from 'react';
import type { Sitio } from '../services/nucleo.ts';
import { describeEvento, TEXTO_EVENTO } from '../services/presenta.ts';
import type { Expediente } from '../services/tipos-expediente.ts';
import type { Etiquetas } from '../hooks/use-etiquetas.ts';
import { boton, botonPrimario, campo } from './marco.tsx';

type Tipo = 'VENDIDO' | 'DEVUELTO' | 'DONADO' | 'MERMA';
type Respuesta = { ok: boolean; motivo?: string };

export function AccionesLote({ e, x, sitios, alTerminar }: { e: Etiquetas; x: Expediente; sitios: readonly Sitio[]; alTerminar: () => void }) {
  const conStock = [...new Set(x.existencias.map((z) => z.sitio))];
  const [modo, setModo] = useState<'salida' | 'transferencia' | 'correccion' | null>(null);
  const [sitio, setSitio] = useState(conStock[0] ?? '');
  const [tipo, setTipo] = useState<Tipo>('VENDIDO');
  const [cajas, setCajas] = useState(1);
  const [canal, setCanal] = useState<'normal' | 'liquidacion'>('normal');
  const [autoriza, setAutoriza] = useState('');
  const [motivo, setMotivo] = useState('');
  const [destino, setDestino] = useState('');
  const [corregido, setCorregido] = useState('');
  const [zona, setZona] = useState<'recibo' | 'almacen' | 'piso' | 'merma'>('almacen');
  const [caducidad, setCaducidad] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const eventosSitio = x.eventos.filter((v) => v.evento.sitio === sitio).map((v) => v.evento);

  const corre = (p: Promise<Respuesta>) => void p.then(
    (r) => { setAviso(r.ok ? 'Registrado en la cadena.' : r.motivo ?? 'no se pudo'); if (r.ok) { setModo(null); alTerminar(); } },
    (err: unknown) => setAviso(err instanceof Error ? err.message : String(err)),
  );
  const envia = () => {
    const l = x.lote;
    if (modo === 'salida') corre(e.ejecuta<Respuesta>({ accion: 'salida', sitio, tipo, ...l, cajas, ...(tipo === 'VENDIDO' ? { canal } : {}), ...(autoriza.trim() ? { autoriza: autoriza.trim() } : {}), ...(motivo.trim() ? { motivo: motivo.trim() } : {}) }));
    if (modo === 'transferencia') corre(e.ejecuta<Respuesta>({ accion: 'transferencia', origen: sitio, destino, ...l, cajas }));
    if (modo === 'correccion') corre(e.ejecuta<Respuesta>({ accion: 'correccion', sitio, corrige: corregido, motivo: motivo.trim(), ...(caducidad ? { caducidad } : { ajuste: { zona, cajas } }) }));
  };

  return (
    <div className="space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-800" data-prueba="acciones-lote">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={boton} onClick={() => setModo('salida')} disabled={conStock.length === 0}>Salida</button>
        <button type="button" className={boton} onClick={() => setModo('transferencia')} disabled={conStock.length === 0}>Transferir</button>
        <button type="button" className={boton} onClick={() => setModo('correccion')} data-prueba="abrir-correccion">Corregir un evento</button>
      </div>
      {modo ? (
        <form className="grid gap-2 sm:grid-cols-2" onSubmit={(v) => { v.preventDefault(); envia(); }}>
          <label className="text-sm">Sitio<select className={campo} value={sitio} onChange={(v) => setSitio(v.target.value)}>{(modo === 'correccion' ? Object.keys(x.cadenas) : conStock).map((s) => <option key={s}>{s}</option>)}</select></label>
          {modo === 'salida' ? (
            <>
              <label className="text-sm">Tipo<select className={campo} value={tipo} onChange={(v) => setTipo(v.target.value as Tipo)}><option value="VENDIDO">Venta</option><option value="DEVUELTO">Devolución</option><option value="DONADO">Donación</option><option value="MERMA">Merma</option></select></label>
              {tipo === 'VENDIDO' ? <label className="text-sm">Canal<select className={campo} value={canal} onChange={(v) => setCanal(v.target.value as 'normal' | 'liquidacion')}><option value="normal">Normal</option><option value="liquidacion">Liquidación (solo rojo)</option></select></label> : null}
              {tipo === 'DONADO' || canal === 'liquidacion' ? <label className="text-sm">Quién lo autoriza (persona)<input className={campo} value={autoriza} onChange={(v) => setAutoriza(v.target.value)} maxLength={60} /></label> : null}
              {tipo === 'DEVUELTO' || tipo === 'MERMA' ? <label className="text-sm">Motivo<input className={campo} value={motivo} onChange={(v) => setMotivo(v.target.value)} maxLength={200} /></label> : null}
            </>
          ) : null}
          {modo === 'transferencia' ? <label className="text-sm">Destino<select className={campo} value={destino} onChange={(v) => setDestino(v.target.value)}><option value="">—</option>{sitios.filter((s) => s.clave !== sitio).map((s) => <option key={s.clave} value={s.clave}>{s.nombre}</option>)}</select></label> : null}
          {modo === 'correccion' ? (
            <>
              <label className="text-sm sm:col-span-2">Evento que se corrige<select className={campo} value={corregido} onChange={(v) => setCorregido(v.target.value)} data-prueba="evento-corregido"><option value="">—</option>{eventosSitio.map((ev) => <option key={ev.hash} value={ev.hash}>#{ev.seq} {TEXTO_EVENTO[ev.tipo]} · {describeEvento(ev).slice(0, 60)}</option>)}</select></label>
              <label className="text-sm">Zona del ajuste<select className={campo} value={zona} onChange={(v) => setZona(v.target.value as typeof zona)}><option value="recibo">Recibo</option><option value="almacen">Almacén</option><option value="piso">Piso</option><option value="merma">Merma</option></select></label>
              <label className="text-sm">…o caducidad correcta<input className={campo} type="date" value={caducidad} onChange={(v) => setCaducidad(v.target.value)} /></label>
              <label className="text-sm sm:col-span-2">Motivo<input className={campo} value={motivo} onChange={(v) => setMotivo(v.target.value)} maxLength={200} required minLength={3} data-prueba="motivo-correccion" /></label>
            </>
          ) : null}
          {modo !== 'correccion' || !caducidad ? <label className="text-sm">{modo === 'correccion' ? 'Cajas (+/−)' : 'Cajas'}<input className={campo} type="number" value={cajas} min={modo === 'correccion' ? -100000 : 1} onChange={(v) => setCajas(Number(v.target.value) || 0)} data-prueba="cajas-accion" /></label> : null}
          <div className="flex items-end gap-2 sm:col-span-2">
            <button type="submit" className={botonPrimario} data-prueba="registrar-accion">Registrar en la cadena</button>
            <button type="button" className={boton} onClick={() => setModo(null)}>Cancelar</button>
          </div>
        </form>
      ) : null}
      {aviso ? <p className="text-sm" role="status">{aviso}</p> : null}
    </div>
  );
}
