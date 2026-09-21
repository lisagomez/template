'use client';

/**
 * Voz picking: la maquina lee la linea (voz en flujo), la persona confirma de viva voz (manos
 * libres con interrupcion) o por escrito; la sesion pura lleva intentos, incidencias y el paso a
 * «a mano». Sin WMS: el pedido es de muestra y nada se descuenta de ningun inventario.
 */
import { useMemo, useState } from 'react';
import { useConversacion } from '../../hooks/use-conversacion.ts';
import { creaSesionPicking, evaluaConfirmacion, nombraCantidad, PEDIDO_MUESTRA, type EstadoPicking } from '../../services/picking.ts';
import { ConversacionVoz } from '../conversacion-voz.tsx';
import { EntradaAudio } from '../entrada-audio.tsx';
import { Aviso, Boton, claseEntrada, Ocupado } from '../ui.tsx';

export function PanelPicking({ token }: { token: string | undefined }) {
  const sesion = useMemo(() => creaSesionPicking(PEDIDO_MUESTRA), []);
  const [estado, setEstado] = useState<EstadoPicking>(sesion.estado);
  const [mensaje, setMensaje] = useState<string | undefined>(undefined);
  const [tecleado, setTecleado] = useState('');

  const confirma = (dicho: string): string => {
    const paso = sesion.confirma(dicho);
    setEstado(paso.estado);
    setMensaje(`«${dicho}» → ${paso.dice}`);
    return paso.dice;
  };
  // Si el principal no oyo una cantidad (audio corto oido en ingles: «sí» → «Sir»), segundo pase con el respaldo.
  const sinCantidad = (dicho: string): boolean => { const l = sesion.lineaActual; if (!l) return false; const t = evaluaConfirmacion(dicho, l).tipo; return t === 'no-entendi' || t === 'sin-cantidad'; };
  const conversacion = useConversacion({ token, responde: confirma, reintentaSi: sinCantidad });
  const { stt, di } = conversacion;
  const confirmaGrabacion = async (a: Blob) => {
    let r = await stt.corre(a, { modo: 'rapido' });
    if (!r?.texto || sinCantidad(r.texto)) {
      const r2 = await stt.corre(a, { modo: 'rapido', motor: 'respaldo' });
      if (r2?.texto) r = r2;
    }
    if (r?.texto) void di(confirma(r.texto));
  };
  const linea = sesion.lineaActual;
  const total = PEDIDO_MUESTRA.length;

  const reinicia = () => {
    sesion.reinicia();
    setEstado(sesion.estado);
    setMensaje(undefined);
  };

  return (
    <div className="space-y-3" data-prueba="panel-picking">
      <div className="flex flex-wrap items-center gap-3 text-sm" data-prueba="linea-actual" data-linea={String(estado.indice + 1)} data-json={JSON.stringify({ linea: estado.indice + 1, confirmadas: estado.confirmadas, aMano: estado.aMano, intentos: estado.intentos, terminado: estado.terminado })}>
        <span className="font-semibold">{estado.terminado ? `Pedido completo` : `Línea ${estado.indice + 1} de ${total}`}</span>
        <span className="text-neutral-500">{estado.confirmadas} confirmadas · {estado.aMano.length} a mano · intento {estado.intentos} de 3</span>
      </div>
      <ol className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {PEDIDO_MUESTRA.map((l, i) => {
          const aMano = estado.aMano.includes(i + 1);
          const hecha = i < estado.indice && !aMano;
          return (
            <li key={l.producto} className={`rounded-lg border px-3 py-2 ${i === estado.indice && !estado.terminado ? 'border-neutral-900 dark:border-white' : hecha ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950' : aMano ? 'border-amber-300 bg-amber-50 dark:bg-amber-950' : 'border-neutral-200 dark:border-neutral-800'}`}>
              <p className="text-xs text-neutral-500">{i + 1} · {l.ubicacion}</p>
              <p>{l.producto}</p>
              <p className="font-semibold">{nombraCantidad(l.cantidad, l.unidad)} {hecha ? '✓' : aMano ? '✎ a mano' : ''}</p>
            </li>
          );
        })}
      </ol>
      {estado.terminado ? (
        <Aviso tipo={estado.aMano.length ? 'honesto' : 'ok'}>Pedido completo: {estado.confirmadas} de {total} confirmadas por voz{estado.aMano.length ? `, ${estado.aMano.length} a mano (${estado.aMano.join(', ')})` : ''}.</Aviso>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Boton variante="primario" onClick={() => void di(sesion.lee())} disabled={!token || conversacion.voz.hablando} data-prueba="leer-linea">
            {`Escuchar la línea ${estado.indice + 1}`}
          </Boton>
          <Boton onClick={reinicia}>Reiniciar</Boton>
          {linea ? <span className="text-xs text-neutral-500">Confirma con la cantidad («son {nombraCantidad(linea.cantidad, linea.unidad)}», «sí, {linea.cantidad}»), o «no» si no cuadra, o «repite». Un «sí» a secas no vale: se confunde con «seis».</span> : null}
        </div>
      )}
      <ConversacionVoz conversacion={conversacion} textoDePrueba="Voy a leer varias líneas seguidas para que pruebes a interrumpirme. Pasillo A, estante doce, tornillos. Pasillo B, estante cuatro, cinta aislante. Pasillo C, estante veintiuno, guantes. Sigo leyendo hasta que me hables." />
      {!estado.terminado ? (
        <>
          <EntradaAudio token={token} ocupado={stt.ocupado} alAudio={(a) => void confirmaGrabacion(a)} />
          {stt.ocupado ? <Ocupado texto="Escuchando tu confirmación…" /> : null}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (tecleado.trim()) void di(confirma(tecleado.trim())); setTecleado(''); }}>
            <input value={tecleado} onChange={(e) => setTecleado(e.target.value)} placeholder="o escribe la confirmación: «tres», «no, faltan dos»" className={claseEntrada} data-prueba="confirmacion" />
            <Boton type="submit">Confirmar</Boton>
          </form>
        </>
      ) : null}
      {mensaje ? <Aviso tipo="info">{mensaje}</Aviso> : null}
      {estado.incidencias.length > 0 ? (
        <div className="text-xs" data-prueba="incidencias">
          <p className="font-medium">Incidencias (quedan a mano):</p>
          <ul className="list-inside list-disc text-neutral-600 dark:text-neutral-300">
            {estado.incidencias.map((inc) => (
              <li key={`${inc.linea}-${inc.dicho}`}>Línea {inc.linea} · {inc.producto} · {inc.motivo === 'no' ? 'dijiste que no cuadra' : 'tres intentos sin coincidir'}{inc.oido !== undefined ? ` (oí ${inc.oido})` : ''} · «{inc.dicho}»</li>
            ))}
          </ul>
        </div>
      ) : null}
      {estado.historial.length > 0 ? (
        <ul className="text-xs text-neutral-500">
          {estado.historial.slice(-6).map((h, i) => (
            <li key={`${i}-${h.dicho}`}>Línea {h.linea}: dijiste «{h.dicho}» → {h.veredicto}</li>
          ))}
        </ul>
      ) : null}
      <Aviso tipo="honesto">Entiende cifras, palabras, decimales y colectivos («media docena»), y la unidad si la dices. Medido con voces sintéticas: una palabra suelta («tres», «sí») se oye mal una de cada tres veces; con dos o más («son tres», «tres unidades») falla el 2 %. Lo que queda a mano: SKU reales, más de 999 999, «el doble», y descontar de un inventario (eso es irreversible y lo decide una persona).</Aviso>
    </div>
  );
}
