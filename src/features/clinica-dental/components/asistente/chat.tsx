'use client';

/**
 * El chatbot de la clínica, por escrito o por voz. Contesta con la base de SU clínica; no diagnostica; las
 * urgencias las decide una regla; y lo que haría algo (agendar, cancelar) llega como BOTÓN que la persona pulsa.
 */
import Link from 'next/link';
import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { EventoBucle } from '../../../../../tools/bucle-voz/dist/index.js';
import { CLINICAS, type AccionPropuesta } from '../../../../../tools/clinica-dental/dist/index.js';
import { useVoz, TEXTO_ESTADO } from '../../hooks/use-voz';
import { lineas, puertosChat } from '../../services/cliente/voz';
import { conversacionNueva, visitante } from '../../services/cliente/visitante';
import { clasesBoton, clasesBotonSecundario, clasesEntrada } from '../ui';

interface Mensaje { rol: 'usuario' | 'asistente'; texto: string; accion?: AccionPropuesta | null; urgencia?: { regla: string; destino: string } | null; turno?: number }

const DESTINO: Record<AccionPropuesta['tipo'], { texto: string; ruta: string }> = {
  abrir_agenda: { texto: 'Abrir la agenda', ruta: 'agenda' },
  abrir_mis_citas: { texto: 'Ver mis citas', ruta: 'mis-citas' },
  abrir_cancelacion: { texto: 'Ir a cancelar en Mis citas', ruta: 'mis-citas' },
  abrir_reprogramacion: { texto: 'Ir a cambiar en Mis citas', ruta: 'mis-citas' },
};

function Burbuja({ m, clinica }: { m: Mensaje; clinica: string }) {
  const urgente = m.urgencia?.destino === 'emergencias_911';
  return (
    <li className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.rol === 'usuario' ? 'ml-auto bg-[color:var(--c1)] text-white' : urgente ? 'border border-red-300 bg-red-50 text-red-900' : 'bg-slate-100 text-slate-900'}`}>
      <span className="sr-only">{m.rol === 'usuario' ? 'Tú:' : 'Asistente:'} </span>
      {m.texto || '…'}
      {m.urgencia ? <a className="mt-2 block font-semibold underline" href={urgente ? 'tel:911' : `tel:${CLINICAS.find((c) => c.id === clinica)?.telefono.replace(/\s/g, '')}`}>{urgente ? 'Llamar al 911' : 'Llamar a la clínica'}</a> : null}
      {m.accion ? <Link className={`${clasesBotonSecundario} mt-2 min-h-9 text-xs`} href={`/clinica/${clinica}/${DESTINO[m.accion.tipo].ruta}${m.accion.tipo === 'abrir_agenda' && m.accion.servicio ? `?servicio=${m.accion.servicio}` : ''}`}>{DESTINO[m.accion.tipo].texto}</Link> : null}
    </li>
  );
}

interface TurnoVoz { texto: string; confirmado: boolean; decidido: boolean; respuesta: string; pintado: 'nada' | 'usuario' | 'ambos' }

/**
 * Los turnos de voz en el chat, POR TURNO. El bucle arranca el cerebro antes de cerrar el turno (especulación): el
 * texto oído llega marcado especulativo y la confirmación llega después, SIN repetirlo. Antes solo se pintaba el oído
 * no especulativo y la pregunta que iba al LLM no aparecía (visto en las capturas del 16/10). Ahora nada se pinta hasta
 * que el turno está confirmado, y cada respuesta va a la burbuja de SU turno, no a «la última».
 */
function useTurnosDeVoz(setMensajes: Dispatch<SetStateAction<Mensaje[]>>) {
  const turnosRef = useRef(new Map<number, TurnoVoz>());
  // La acción que propuso el servidor para el turno en curso: llega antes del `fin` del bucle y se cuelga de SU burbuja.
  const accionRef = useRef<AccionPropuesta | null>(null);
  const enTurno = (id: number, f: (m: Mensaje) => Mensaje) => setMensajes((ms) => ms.map((m) => (m.turno === id && m.rol === 'asistente' ? f(m) : m)));
  const pinta = (id: number, t: TurnoVoz) => {
    if (!t.confirmado || !t.texto) return;
    const nuevos: Mensaje[] = [];
    if (t.pintado === 'nada') { nuevos.push({ rol: 'usuario', texto: t.texto, turno: id }); t.pintado = 'usuario'; }
    if (t.pintado === 'usuario' && t.decidido) { nuevos.push({ rol: 'asistente', texto: t.respuesta, turno: id }); t.pintado = 'ambos'; }
    if (nuevos.length) setMensajes((ms) => [...ms, ...nuevos]);
  };
  const alEvento = (e: EventoBucle) => {
    if (!('turno' in e) || e.turno === undefined) return;
    const id = e.turno;
    if (e.tipo === 'descartado') return void turnosRef.current.delete(id);
    const t = turnosRef.current.get(id) ?? { texto: '', confirmado: false, decidido: false, respuesta: '', pintado: 'nada' };
    turnosRef.current.set(id, t);
    if (e.tipo === 'oido') { t.texto = e.texto; t.confirmado ||= !e.especulativo; }
    if (e.tipo === 'confirmado') t.confirmado = true;
    if (e.tipo === 'decision') t.decidido = true;
    if (e.tipo === 'respuesta') { t.respuesta = e.texto.trim(); if (t.pintado === 'ambos') enTurno(id, (m) => ({ ...m, texto: t.respuesta })); }
    if (e.tipo === 'fin' && accionRef.current) {
      const accion = accionRef.current;
      accionRef.current = null;
      enTurno(id, (m) => ({ ...m, accion }));
    }
    pinta(id, t);
  };
  return { alEvento, alAccion: (a: AccionPropuesta) => { accionRef.current = a; } };
}

export function Chat({ clinica, conSesion, conVoz }: { clinica: string; conSesion: boolean; conVoz: boolean }) {
  const c = CLINICAS.find((x) => x.id === clinica)!;
  const conversacion = useMemo(() => conversacionNueva(), []);
  const [mensajes, setMensajes] = useState<Mensaje[]>([{ rol: 'asistente', texto: `Hola, soy el asistente de ${c.nombre}. Pregúntame por servicios, precios, horarios o tus citas. No doy diagnósticos; en una urgencia, llama al 911.` }]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [usaPadecimiento, setUsaPadecimiento] = useState(false);
  const agrega = (m: Mensaje) => setMensajes((ms) => [...ms, m]);
  const actualizaUltimo = (f: (m: Mensaje) => Mensaje) => setMensajes((ms) => [...ms.slice(0, -1), f(ms[ms.length - 1]!)]);

  const turnosVoz = useTurnosDeVoz(setMensajes);
  const voz = useVoz(turnosVoz.alEvento);

  async function envia(t: string) {
    const limpio = t.trim();
    if (!limpio || enviando) return;
    setTexto('');
    setEnviando(true);
    const historial = mensajes.slice(1).filter((m) => m.texto).map((m) => ({ rol: m.rol, texto: m.texto })).slice(-6);
    agrega({ rol: 'usuario', texto: limpio });
    agrega({ rol: 'asistente', texto: '' });
    try {
      const r = await fetch('/api/clinica-dental/asistente', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clinica, candidatos: [limpio], historial, modo: 'texto', conversacion, visitante: visitante(), usaPadecimiento }) });
      if (!r.ok || !r.body) throw new Error();
      let dicho = '';
      for await (const l of lineas(r.body)) {
        if (l['t'] === 'frase') dicho = `${dicho} ${String(l['x'])}`.trim();
        if (l['t'] === 'fin') actualizaUltimo((m) => ({ ...m, texto: String(l['texto'] ?? dicho), accion: (l['accion'] as AccionPropuesta | null) ?? null, urgencia: (l['urgencia'] as Mensaje['urgencia']) ?? null }));
        else if (l['t'] === 'error') actualizaUltimo((m) => ({ ...m, texto: String(l['mensaje']) }));
        else actualizaUltimo((m) => ({ ...m, texto: dicho }));
      }
    } catch {
      actualizaUltimo((m) => ({ ...m, texto: `No pude contestar ahora. Llama a ${c.nombre} al ${c.telefono}.` }));
    } finally {
      setEnviando(false);
    }
  }

  const encendida = voz.estado !== 'apagada';
  const alternaVoz = () => (encendida ? void voz.apaga() : void voz.enciende(puertosChat(c, { conversacion, visitante: visitante(), alAccion: turnosVoz.alAccion })));
  return (
    <section aria-label={`Asistente de ${c.nombre}`} data-enviando={enviando ? 'si' : 'no'} className="flex max-h-[70vh] w-[min(24rem,calc(100vw-1.5rem))] flex-col rounded-2xl bg-white shadow-xl ring-1 ring-slate-200">
      <header className="rounded-t-2xl bg-[color:var(--c1)] px-4 py-3 text-white">
        <h2 className="font-semibold">Asistente de {c.nombre}</h2>
        <p className="text-xs opacity-90">Información de la clínica. No da diagnósticos.</p>
      </header>
      <ol aria-live="polite" className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">{mensajes.map((m, i) => <Burbuja key={i} m={m} clinica={clinica} />)}</ol>
      {voz.error ? <p role="alert" className="px-3 pb-2 text-xs text-red-800">{voz.error}</p> : null}
      {conVoz ? <p className="px-3 text-xs text-slate-600" aria-live="polite">{TEXTO_ESTADO[voz.estado]}</p> : null}
      {conSesion ? (
        <label className="flex items-center gap-2 px-3 pt-2 text-xs text-slate-700">
          <input type="checkbox" checked={usaPadecimiento} onChange={(e) => setUsaPadecimiento(e.target.checked)} />
          Usar lo que escribí en mi registro (dato de salud, solo para orientar qué valoración agendar)
        </label>
      ) : null}
      <form className="flex gap-2 p-3" onSubmit={(e) => { e.preventDefault(); void envia(texto); }}>
        <label htmlFor="chat-texto" className="sr-only">Escribe tu pregunta</label>
        <input id="chat-texto" className={`${clasesEntrada} mt-0`} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe tu pregunta" maxLength={500} autoComplete="off" />
        {conVoz ? <button type="button" onClick={alternaVoz} aria-pressed={encendida} className={clasesBotonSecundario} aria-label={encendida ? 'Apagar el micrófono' : 'Hablar con el asistente'}>{encendida ? '⏹' : '🎙'}</button> : null}
        <button type="submit" className={clasesBoton} disabled={enviando || !texto.trim()}>Enviar</button>
      </form>
    </section>
  );
}
