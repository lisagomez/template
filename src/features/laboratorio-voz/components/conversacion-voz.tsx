'use client';

/**
 * Los mandos de una conversacion por voz: manos libres (escuchar), callar, la prueba de
 * interrupcion, y las cifras que la persona que prueba necesita ver: primera frase audible, vuelta
 * pregunta → respuesta y lo que paso con la escucha. Los `data-json` los lee la medicion.
 */
import type { useConversacion } from '../hooks/use-conversacion.ts';
import type { EstadoEscucha } from '../hooks/use-interrupcion.ts';
import { Aviso, Boton, Ocupado } from './ui.tsx';

type Conversacion = ReturnType<typeof useConversacion>;

export const TEXTO_PRUEBA_INTERRUPCION =
  'Voy a leer un texto largo para que pruebes a interrumpirme. Cuando quieras, di algo en voz alta y me callo. Sigo hablando de cualquier cosa: el horario, los envíos, las devoluciones. Y sigo un poco más para que te dé tiempo. Todavía sigo aquí, hasta que me hables. Y si no me hablas, termino sola.';

const ESTADO: Record<EstadoEscucha, string> = {
  apagado: 'micrófono cerrado',
  calibrando: 'midiendo el silencio…',
  escuchando: 'escuchando',
  'persona-habla': 'te oigo',
};

export function ConversacionVoz({ conversacion, textoDePrueba = TEXTO_PRUEBA_INTERRUPCION }: { conversacion: Conversacion; textoDePrueba?: string }) {
  const { voz, escucha, manosLibres, setManosLibres, vuelta, di } = conversacion;
  const interrupciones = escucha.eventos.filter((e) => e.tipo === 'interrumpir');
  const pruebaInterrupcion = async () => {
    setManosLibres(true);
    await di(textoDePrueba);
  };
  return (
    <div className="space-y-2" data-prueba="conversacion">
      <div className="flex flex-wrap items-center gap-2">
        <Boton variante={manosLibres ? 'primario' : 'secundario'} onClick={() => setManosLibres(!manosLibres)} data-prueba="manos-libres" title="Escucha por el micrófono todo el rato: hablas, transcribe, responde; si le hablas mientras suena, se calla.">
          {manosLibres ? '■ Dejar de escuchar' : '● Manos libres: escuchar'}
        </Boton>
        <Boton onClick={voz.detiene} disabled={!voz.hablando} data-prueba="callar">Callar</Boton>
        <Boton variante="suave" onClick={() => void pruebaInterrupcion()} disabled={voz.hablando} data-prueba="prueba-interrupcion" title="Lee un texto largo con la escucha encendida; habla encima y debe callarse.">
          Probar que se calla si le hablas
        </Boton>
        <span className="text-xs text-neutral-500" data-prueba="estado-escucha" data-escucha={escucha.estado}>
          {ESTADO[escucha.estado]}{manosLibres && escucha.estado !== 'apagado' ? ` · nivel ${escucha.nivel.toFixed(2)}` : ''}
        </span>
        {voz.hablando ? <Ocupado texto="La máquina habla…" /> : null}
      </div>
      {voz.metricas ? (
        <p className="text-xs text-neutral-600 dark:text-neutral-300" data-prueba="metricas-voz" data-json={JSON.stringify(voz.metricas)}>
          Primera frase audible a los {voz.metricas.msPrimerAudio} ms · {voz.metricas.segundosAudio} s de voz en {voz.metricas.trozos} trozos · vía {voz.metricas.via === 'demonio' ? 'motor residente' : voz.metricas.via === 'cli' ? 'motor por proceso' : 'desconocida'}
          {voz.metricas.cortada ? ' · cortada' : ''}
        </p>
      ) : null}
      {vuelta ? (
        <p className="text-xs text-neutral-600 dark:text-neutral-300" data-prueba="vuelta" data-json={JSON.stringify(vuelta)}>
          Vuelta: {vuelta.msVuelta} ms desde que terminaste de hablar hasta oír la respuesta (transcribir {vuelta.msTranscripcion} ms{vuelta.pases === 2 ? ' con segundo pase' : ''} + primer audio {vuelta.msPrimerAudio} ms) · dijiste «{vuelta.dicho}»
        </p>
      ) : null}
      {escucha.eventos.length > 0 ? (
        <p className="text-xs text-neutral-500" data-prueba="interrupcion" data-json={JSON.stringify(escucha.eventos)}>
          Escucha: {interrupciones.length} {interrupciones.length === 1 ? 'interrupción' : 'interrupciones'}
          {interrupciones[0] ? ` (reacción ${interrupciones[0].msDesdeInicioHabla} ms desde que empezaste a hablar)` : ''} · {escucha.eventos.filter((e) => e.tipo === 'turno').length} turnos oídos
        </p>
      ) : null}
      {escucha.error ? <Aviso tipo="error">{escucha.error}</Aviso> : null}
      {voz.error ? <Aviso tipo="error">{voz.error}</Aviso> : null}
      {conversacion.stt.error ? <Aviso tipo="error">{conversacion.stt.error}</Aviso> : null}
      <Aviso tipo="honesto">
        La escucha va por energía (sube el volumen del micrófono sobre el silencio): pensada para auriculares o micrófono cerca de la boca. Con ruido de sala puede callarse sola o no oírte; con altavoces, la cancelación de eco del navegador es lo único que evita que se interrumpa a sí misma.
      </Aviso>
    </div>
  );
}
