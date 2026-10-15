'use client';

/**
 * Un PRODUCTO QUE AGENDA, simulado: lo que hara el vendedor por WhatsApp o el asesor por voz. Pide
 * huecos en la zona del cliente, aparta uno (tentativa con caducidad), lo confirma, y un segundo
 * cliente que pide el mismo hueco recibe un rechazo tipado. No toca ningun producto real.
 */
import { useState } from 'react';
import { SelectorDeHuecos } from '../../../../tools/calendario/dist/react/index.js';
import { claveNueva, huecoEnZona, type Hueco, type Reserva, type ResultadoHuecos } from '../../../../tools/calendario/dist/index.js';
import type { Motor } from '../services/motor.ts';

const ZONAS = [['America/Mexico_City', 'Ciudad de México'], ['America/Bogota', 'Bogotá'], ['Europe/Madrid', 'Madrid']] as const;

interface Props { motor: Motor; alCambiar: (nota: string) => void }

export function PanelConsumidor({ motor, alCambiar }: Props) {
  const [zona, setZona] = useState<string>(ZONAS[0][0]);
  const [resultado, setResultado] = useState<ResultadoHuecos | null>(null);
  const [elegido, setElegido] = useState<Hueco | null>(null);
  const [reserva, setReserva] = useState<Reserva | null>(null);
  const [mensaje, setMensaje] = useState<{ tono: 'ok' | 'no'; texto: string } | null>(null);

  const pide = async () => {
    const r = await motor.reservas.huecos({ maximo: 12 });
    setResultado(r);
    setElegido(null);
    setReserva(null);
    setMensaje(null);
  };
  const aparta = async () => {
    if (!elegido) return;
    const r = await motor.reservas.tentativa({ inicio: elegido.inicio, referencia: 'wa-conv-0042', clave: claveNueva('wa') });
    if (r.ok) {
      setReserva(r.reserva);
      setMensaje({ tono: 'ok', texto: `Apartado para el cliente 0042 hasta las ${new Date(r.reserva.expira ?? 0).toLocaleTimeString('es-MX', { timeZone: motor.zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })} (hora del negocio).` });
    } else setMensaje({ tono: 'no', texto: `Rechazado (${r.motivo}): ${r.detalle}` });
    alCambiar(r.ok ? `tentativa · ${huecoEnZona(elegido, zona)} · apartada` : `tentativa · rechazada: ${r.motivo}`);
  };
  const otroCliente = async () => {
    if (!elegido) return;
    const r = await motor.reservas.tentativa({ inicio: elegido.inicio, referencia: 'wa-conv-0043', clave: claveNueva('wa') });
    setMensaje(r.ok ? { tono: 'ok', texto: 'El segundo cliente también lo apartó (no debería pasar).' } : { tono: 'no', texto: `Segundo cliente, mismo hueco → rechazado (${r.motivo}): ${r.detalle}` });
    alCambiar(r.ok ? 'tentativa duplicada (ERROR)' : `2º cliente · mismo hueco · rechazado: ${r.motivo}`);
  };
  const confirma = async () => {
    if (!reserva) return;
    const r = await motor.reservas.confirma(reserva.id, { titulo: 'Cita (WhatsApp) · ref wa-conv-0042', clave: `confirma:${reserva.id}` });
    if (r.ok) { setReserva(r.reserva); setMensaje({ tono: 'ok', texto: 'Cita confirmada: ya está en el calendario de Trabajo, con la referencia y sin datos del cliente.' }); }
    else setMensaje({ tono: 'no', texto: `No se confirmó (${r.motivo}): ${r.detalle}` });
    alCambiar(r.ok ? 'confirma · cita creada por la pluma' : `confirma · ${r.motivo}`);
  };
  const libera = async () => {
    if (!reserva) return;
    const r = await motor.reservas.libera(reserva.id, { clave: `libera:${reserva.id}` });
    setReserva(null);
    setMensaje({ tono: 'ok', texto: r.ok ? 'Liberado: el hueco vuelve a ofrecerse.' : `No se liberó: ${r.detalle}` });
    alCambiar('libera · hueco devuelto');
  };

  const boton = 'rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800';
  return (
    <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800" data-prueba="panel-consumidor">
      <h2 className="text-sm font-semibold">Producto que agenda <span className="font-normal text-neutral-500">(vendedor por WhatsApp, simulado)</span></h2>
      <p className="mt-1 text-xs text-neutral-500">Pide huecos, aparta uno 10 min y lo confirma. La doble reserva la impide el almacén, también con peticiones simultáneas.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="text-xs text-neutral-500">Cliente en
          <select value={zona} onChange={(e) => setZona(e.target.value)} className="ml-1 rounded border border-neutral-300 bg-transparent px-1 py-0.5 text-sm dark:border-neutral-700" data-prueba="zona-cliente">
            {ZONAS.map(([z, n]) => <option key={z} value={z}>{n}</option>)}
          </select>
        </label>
        <button type="button" className={boton} onClick={pide} data-prueba="pedir-huecos">Pedir huecos</button>
      </div>
      <div className="mt-3">
        <SelectorDeHuecos resultado={resultado} zonaPersona={zona} elegido={elegido?.inicio ?? null} alElegir={(h) => { setElegido(h); setReserva(null); setMensaje(null); }} maximoPorDia={6} />
      </div>
      {elegido && <p className="mt-2 text-xs text-neutral-500" data-prueba="hueco-elegido">Elegido: {huecoEnZona(elegido, zona)}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={boton} disabled={!elegido || Boolean(reserva)} onClick={aparta} data-prueba="apartar">Apartar</button>
        <button type="button" className={boton} disabled={!reserva || reserva.estado !== 'tentativa'} onClick={confirma} data-prueba="confirmar">Confirmar cita</button>
        <button type="button" className={boton} disabled={!elegido} onClick={otroCliente} data-prueba="otro-cliente">Otro cliente pide el mismo hueco</button>
        <button type="button" className={boton} disabled={!reserva} onClick={libera} data-prueba="liberar">Liberar</button>
      </div>
      {mensaje && (
        <p className={`mt-3 rounded-md px-3 py-2 text-sm ${mensaje.tono === 'ok' ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200'}`} data-prueba="mensaje-consumidor" data-tono={mensaje.tono}>
          {mensaje.texto}
        </p>
      )}
    </section>
  );
}
