'use client';
/**
 * La barra de instrucciones: una frase, ejemplos de un clic y, ANTES de aplicar, «lo que entendí» (tipo, métrica,
 * dimensión, filtros, periodo, lo que toca). La persona aplica, descarta o corrige con otra frase. Una alerta pide
 * confirmación con nombre y no se envía a ningún canal; una pregunta sin métrica lo dice y ofrece proponerla.
 */
import { useState } from 'react';
import type { RespuestaInstruccion } from '../types';
import e from './estudio.module.css';

const EJEMPLOS = [
  'Muéstrame margen por región en 2026, sin mayoreo, y resalta las tiendas debajo del 23 %',
  'ahora por mes y compáralo con 2025',
  '¿por qué estas bajaron?',
  '¿Cómo se calcula el ticket promedio?',
  'Avísame si Mérida cae más de 5 % semanal',
  '¿Cuál es el NPS por tienda?',
];

interface Props {
  readonly ocupado: string | null;
  readonly agente: string | null;
  readonly respuesta: RespuestaInstruccion | null;
  readonly error: string | null;
  readonly onInstruccion: (texto: string) => void;
  readonly onAplicar: () => void;
  readonly onDescartar: () => void;
  readonly onConfirmaAlerta: (por: string) => void;
}

function Entendi({ r, onAplicar, onDescartar, onConfirmaAlerta, ocupado }: { r: RespuestaInstruccion } & Pick<Props, 'onAplicar' | 'onDescartar' | 'onConfirmaAlerta' | 'ocupado'>) {
  const [por, setPor] = useState('');
  const fichas = r.vuelta.entendi.split(' · ').filter(Boolean);
  return (
    <section className={e.entendi} aria-label="Lo que entendí">
      <h2>Lo que entendí</h2>
      <div className={e.fichas}>{fichas.map((f) => <span key={f} className={e.ficha}>{f}</span>)}</div>
      <p className={e.respuesta}>{r.vuelta.texto}</p>
      {r.vuelta.error && <p className={e.error}>{r.vuelta.error}</p>}
      {r.propuesta && <p className={e.aviso}>Vista previa sin aplicar: {r.propuesta.tocados.length ? `cambia ${r.propuesta.tocados.join(', ')}` : 'cambia lo global'}{r.propuesta.globales.length ? ` (${r.propuesta.globales.join(', ')})` : ''}. Lo demás queda igual.</p>}
      {r.alerta && (
        <form className={e.acciones} onSubmit={(ev) => { ev.preventDefault(); if (por.trim()) onConfirmaAlerta(por.trim()); }}>
          <label className={e.pie} htmlFor="confirma-alerta">Confirmo como</label>
          <input id="confirma-alerta" className={e.selector} value={por} onChange={(ev) => setPor(ev.target.value)} placeholder="tu nombre o rol" />
          <button type="submit" className={e.botonPrimario} disabled={!por.trim() || !!ocupado}>Registrar la alerta (no se envía)</button>
        </form>
      )}
      {r.propuestaMetrica && <p className={e.aviso}>Propuesta: {r.propuestaMetrica.motivo} {r.propuestaMetrica.siguientePaso}</p>}
      <div className={e.acciones}>
        {r.propuesta && <button type="button" className={e.botonPrimario} onClick={onAplicar} disabled={!!ocupado}>Aplicar como versión nueva</button>}
        <button type="button" className={e.boton} onClick={onDescartar}>{r.propuesta ? 'Descartar' : 'Cerrar'}</button>
        <span className={e.pie}>{r.vuelta.modelo} · {r.vuelta.versionPrompt} · {(r.vuelta.ms.total / 1000).toFixed(1)} s · {r.vuelta.costoUsd === null ? 'costo sin reportar' : `US$${r.vuelta.costoUsd.toFixed(5)}`}{r.vuelta.intentos > 1 ? ` · ${r.vuelta.intentos} intentos` : ''}</span>
      </div>
    </section>
  );
}

export function Barra(p: Props) {
  const [texto, setTexto] = useState('');
  const envia = (t: string) => { if (t.trim() && !p.ocupado) p.onInstruccion(t.trim()); };
  return (
    <div className={e.barra}>
      <form className={e.filaBarra} onSubmit={(ev) => { ev.preventDefault(); envia(texto); }}>
        <label htmlFor="instruccion" className={e.oculto}>Instrucción para el agente</label>
        <textarea id="instruccion" rows={1} value={texto} onChange={(ev) => setTexto(ev.target.value)} placeholder="Pídele un cambio al tablero: «retención por origen solo en el Sureste»"
          onKeyDown={(ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); envia(texto); } }} />
        <button type="submit" className={e.botonPrimario} disabled={!!p.ocupado || !p.agente}>Regenerar</button>
      </form>
      <div className={e.chips} aria-label="Ejemplos">{EJEMPLOS.map((x) => <button key={x} type="button" className={e.chip} onClick={() => { setTexto(x); envia(x); }} disabled={!!p.ocupado || !p.agente}>{x}</button>)}</div>
      <div className={e.estado} aria-live="polite">{p.ocupado ?? (p.agente ? `Agente: ${p.agente}` : 'Agente apagado: falta la llave del modelo en el servidor (el tablero, los clics y las versiones siguen)')}</div>
      {p.error && <p className={e.error} role="alert">{p.error}</p>}
      {p.respuesta && <Entendi r={p.respuesta} onAplicar={p.onAplicar} onDescartar={p.onDescartar} onConfirmaAlerta={p.onConfirmaAlerta} ocupado={p.ocupado} />}
    </div>
  );
}
