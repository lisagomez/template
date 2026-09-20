'use client';

/**
 * Comandos de voz y recordatorios POR REGLAS. A la izquierda, el texto limpio (los comandos de
 * puntuacion del dictado, ya construidos); a la derecha, lo que HARIA: vista previa marcada como
 * no ejecutado. Ejecutar de verdad es puerta humana. Los recordatorios se guardan en este navegador.
 */
import { useMemo, useState, useSyncExternalStore } from 'react';
import { aplicaComandos } from '../../../../../tools/dictado/dist/index.js';
import { useTranscripcion } from '../../hooks/use-transcripcion.ts';
import { detectaIntenciones, type Intencion } from '../../services/intenciones.ts';
import { EntradaAudio } from '../entrada-audio.tsx';
import { Aviso, Boton, claseEntrada, Ocupado } from '../ui.tsx';

const NOMBRE: Record<Intencion['tipo'], string> = { evento: 'Evento de calendario', recordatorio: 'Recordatorio', busqueda: 'Búsqueda de documentos', correo: 'Correo (borrador)', crm: 'Nota en el CRM', ninguna: 'Sin acción' };
const CLAVE = 'laboratorio.recordatorios';

interface Recordatorio {
  tarea: string;
  fecha?: string;
  creado: string;
}

const EVENTO = 'laboratorio.recordatorios';
const leeCrudo = (): string => {
  try {
    return localStorage.getItem(CLAVE) ?? '[]';
  } catch {
    return '[]';
  }
};
const suscribe = (avisa: () => void) => {
  window.addEventListener('storage', avisa);
  window.addEventListener(EVENTO, avisa);
  return () => {
    window.removeEventListener('storage', avisa);
    window.removeEventListener(EVENTO, avisa);
  };
};
const escribeRecordatorios = (lista: Recordatorio[]) => {
  try {
    if (lista.length === 0) localStorage.removeItem(CLAVE);
    else localStorage.setItem(CLAVE, JSON.stringify(lista));
  } catch {
    /* modo privado: no persiste */
  }
  window.dispatchEvent(new Event(EVENTO));
};

export function PanelComandos({ token, muestra, modoRecordatorio = false }: { token: string | undefined; muestra: string; modoRecordatorio?: boolean }) {
  const [texto, setTexto] = useState(muestra);
  const stt = useTranscripcion(token);
  const crudo = useSyncExternalStore(suscribe, leeCrudo, () => '[]');
  const recordatorios = useMemo(() => {
    try {
      return JSON.parse(crudo) as Recordatorio[];
    } catch {
      return [];
    }
  }, [crudo]);

  const limpio = aplicaComandos(texto);
  const intenciones = detectaIntenciones(limpio.texto);
  const intencion = intenciones[0] ?? detectaIntenciones('')[0]!;

  const guardaRecordatorio = () => {
    const nuevo: Recordatorio = { tarea: intencion.detalles.tarea ?? limpio.texto, fecha: intencion.fecha, creado: new Date().toISOString() };
    escribeRecordatorios([...recordatorios, nuevo]);
  };

  return (
    <div className="space-y-3" data-prueba="panel-comandos">
      <p className="text-xs text-neutral-500">Dicta (graba y termina) o escribe. Prueba «punto y aparte», «nueva línea», «coma», y una acción con fecha.</p>
      <EntradaAudio token={token} ocupado={stt.ocupado} alAudio={(a) => void stt.corre(a, { modo: 'rapido' }).then((r) => { if (r?.texto) setTexto(r.texto); })} />
      {stt.ocupado ? <Ocupado texto="Transcribiendo…" /> : null}
      {stt.error ? <Aviso tipo="error">{stt.error}</Aviso> : null}
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} className={claseEntrada} />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Texto limpio (comandos aplicados)</p>
          <pre className="mt-1 whitespace-pre-wrap font-sans text-sm" data-prueba="texto-limpio">{limpio.texto}</pre>
          {limpio.acciones.length > 0 ? <p className="mt-1 text-xs text-neutral-500">Acciones de teclado detectadas: {limpio.acciones.join(', ')}</p> : null}
        </div>
        <div className="rounded-lg border border-dashed border-neutral-400 bg-white p-3 dark:border-neutral-600 dark:bg-neutral-950" data-prueba="vista-previa">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Lo que haría · vista previa</p>
            <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-semibold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-100">NO EJECUTADO</span>
          </div>
          <ol className="mt-1 space-y-2" data-prueba="intenciones">
            {intenciones.map((i, n) => (
              <li key={`${n}-${i.tipo}`} className={intenciones.length > 1 ? 'border-l-2 border-neutral-300 pl-2 dark:border-neutral-600' : ''}>
                <p className="text-sm font-medium">{NOMBRE[i.tipo]}</p>
                <p className="text-sm">{i.resumen}</p>
                {i.fechaTexto ? <p className="mt-0.5 text-xs text-neutral-500">Entendí la fecha de: «{i.fechaTexto}»</p> : null}
                <p className="text-xs text-neutral-500">Confianza de la regla: {i.confianza}</p>
              </li>
            ))}
          </ol>
          {intencion.tipo === 'recordatorio' || modoRecordatorio ? (
            <div className="mt-2">
              <Boton variante="primario" onClick={guardaRecordatorio} disabled={intencion.tipo === 'ninguna' && !modoRecordatorio}>
                Guardar recordatorio en este navegador
              </Boton>
            </div>
          ) : null}
        </div>
      </div>
      <Aviso tipo="honesto">Ejecutar contra el calendario, el correo o el CRM es una acción irreversible y hoy no hay integración: es una puerta humana. Aquí solo se muestra lo que haría.</Aviso>
      {recordatorios.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Recordatorios guardados aquí</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {recordatorios.map((r) => (
              <li key={r.creado}>• {r.tarea}{r.fecha ? ` — ${new Date(r.fecha).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}</li>
            ))}
          </ul>
          <button type="button" className="mt-1 text-xs text-neutral-400 underline" onClick={() => escribeRecordatorios([])}>borrar todos</button>
        </div>
      ) : null}
    </div>
  );
}
