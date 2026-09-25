'use client';

/**
 * /etiquetas/leer — que tengo en la mano: producto, lote, cuanta vida le queda (semaforo) y en
 * que sitio esta. Por camara o por pistola; y, si se confirma, alta del lote en el sitio.
 */
import { useState } from 'react';
import {
  esErrorLectura, interpreta, nombreAi, nombreZona, parseaLectura, TEXTO_SEMAFORO, textoDias, fechaLegible,
  type EstadoAlmacen, type Interpretacion, type Lectura,
} from '../services/nucleo.ts';
import type { EstadoCliente } from '../services/cliente.ts';
import { COLOR_SEMAFORO, gtinLegible } from '../services/presenta.ts';
import type { Etiquetas } from '../hooks/use-etiquetas.ts';
import { EntradaPistola } from './entrada-pistola.tsx';
import { LectorCamara } from './lector-camara.tsx';
import { botonPrimario, campo, tarjeta } from './marco.tsx';

/** El estado del cliente con la forma que espera el nucleo (catalogo indexado por sku). */
export function comoEstado(e: EstadoCliente): EstadoAlmacen {
  return { ...e, articulos: Object.fromEntries(e.articulos.map((a) => [a.sku, a])), emitidos: [] };
}

export function PantallaLector({ e }: { e: Etiquetas }) {
  const est = e.estado!;
  const [sitio, setSitio] = useState(est.configuracion.sitios[0]?.clave ?? '');
  const [texto, setTexto] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const r = texto === null ? null : parseaLectura(texto);
  const lectura: Lectura | null = r && !esErrorLectura(r) ? r : null;
  const inter: Interpretacion | null = lectura ? interpreta(lectura.elementos, comoEstado(est), est.hoy) : null;

  const procesa = (t: string) => { setTexto(t); setAviso(null); };
  const recibe = () => {
    if (!texto) return;
    void e.ejecuta<{ ok: boolean; motivo?: string }>({ accion: 'recepcion', sitio, texto }).then(
      (x) => setAviso(x.ok ? `Recibido en ${sitio}.` : x.motivo ?? 'no se pudo'),
      (err: unknown) => setAviso(err instanceof Error ? err.message : String(err)),
    );
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 md:grid-rows-[auto_1fr]">
        <div className={`${tarjeta} order-1 space-y-3 md:order-none md:col-start-1 md:row-start-1`}>
          <label className="block text-sm">Estoy en<select className={campo} value={sitio} onChange={(x) => setSitio(x.target.value)} data-prueba="sitio-lector">{est.configuracion.sitios.map((s) => <option key={s.clave} value={s.clave}>{s.nombre}</option>)}</select></label>
          <LectorCamara alLeer={procesa} />
        </div>
        <EntradaPistola alLeer={procesa} className="order-3 md:order-none md:col-start-1 md:self-start" />
      <div className={`${tarjeta} order-2 space-y-3 md:order-none md:col-start-2 md:row-span-2 md:row-start-1 md:self-start`} data-prueba="resultado" aria-live="polite">
        {texto === null ? <p className="text-sm text-neutral-500">Lee una etiqueta para ver qué es, qué lote y cuánto le queda.</p> : null}
        {r && esErrorLectura(r) ? <p className="text-sm text-red-700" data-prueba="error-lectura">No se pudo interpretar: {r.mensaje}</p> : null}
        {lectura && inter ? (
          <>
            {inter.vida ? (
              <div className={`rounded-xl p-4 ${COLOR_SEMAFORO[inter.vida.estado]}`} data-prueba="semaforo-lectura" data-estado={inter.vida.estado}>
                <p className="text-3xl font-black">{TEXTO_SEMAFORO[inter.vida.estado].etiqueta}</p>
                <p className="text-lg font-semibold">{textoDias(inter.vida.dias)} · caduca el {fechaLegible(inter.vida.fecha)}</p>
                <p className="text-sm opacity-90">{TEXTO_SEMAFORO[inter.vida.estado].accion}</p>
              </div>
            ) : <p className="rounded-lg bg-neutral-100 p-3 text-sm dark:bg-neutral-800">Sin fecha de caducidad (17) en este código.</p>}
            <div>
              <p className="text-xl font-bold" data-prueba="producto-leido">{inter.articulo?.descripcion ?? 'Artículo fuera del catálogo'}</p>
              <p className="font-mono text-sm">{inter.gtin ? `GTIN ${gtinLegible(inter.gtin)}` : inter.sscc ? `SSCC ${inter.sscc}` : ''}{inter.lote ? ` · Lote ${inter.lote}` : ''}{inter.cajas > 1 ? ` · ${inter.cajas} cajas` : ''}</p>
              <p className="text-sm" data-prueba="ubicaciones">Está en: {inter.ubicaciones.length ? inter.ubicaciones.map((u) => `${u.sitio} · ${nombreZona(u.zona).toLowerCase()} ${u.cajas} cj`).join(', ') : 'ningún sitio registrado'}</p>
            </div>
            {inter.avisos.map((a) => <p key={a} className="rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{a}</p>)}
            <table className="w-full text-left text-xs">
              <thead><tr className="text-neutral-500"><th className="py-1">AI</th><th>Dato</th><th>Valor</th></tr></thead>
              <tbody>{lectura.elementos.map((x) => <tr key={x.ai + x.valor} className="border-t border-neutral-200 dark:border-neutral-800"><td className="py-1 font-mono">({x.ai})</td><td>{nombreAi(x.ai)}</td><td className="font-mono">{x.valor}</td></tr>)}</tbody>
            </table>
            <p className="text-xs text-neutral-500" data-prueba="forma">Llegó {lectura.simbologia ? `con ${lectura.simbologia}` : 'sin identificador de simbología'}, {lectura.forma === 'hri' ? 'como texto con paréntesis' : 'en crudo'}{lectura.sustitutoGs ? `, con el GS sustituido por «${lectura.sustitutoGs}»` : ''}.</p>
            <button type="button" className={botonPrimario} onClick={recibe} disabled={!inter.articulo} data-prueba="recibir">Registrar recepción en {sitio}</button>
            {aviso ? <p className="text-sm" role="status">{aviso}</p> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
