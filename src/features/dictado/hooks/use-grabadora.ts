'use client';

/**
 * Grabadora del microfono del telefono con MediaRecorder. El formato lo decide el navegador
 * (webm/opus en Android, mp4/aac en iPhone): el servidor lo traga igual via ffmpeg, asi que
 * aqui NO se transcodifica nada. El microfono se suelta al parar: el punto rojo del sistema
 * se apaga y no queda ningun track vivo.
 */
import { useRef, useState } from 'react';

const MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

/**
 * Restricciones de audio para DICTADO, no para llamada: la supresion de ruido de Chromium
 * (por defecto ON) trata un microfono flojo como ruido y lo silencia — justo lo que pasaba
 * (voz a -53 dBFS). Se apagan supresion y cancelacion de eco, y se deja la ganancia automatica
 * ENCENDIDA para que el navegador amplifique la señal debil. `channelCount:1` = mono, como el motor.
 */
const AUDIO: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: true,
  channelCount: 1,
};

/**
 * Fuentes que NO son un microfono de voz: la MEZCLA ESTEREO / stereo mix / loopback graba lo
 * que suena en los altavoces, no tu voz (sintoma: RMS plano sin estructura de habla). La camara
 * NO se excluye: en algunas maquinas su microfono es el bueno (medido el 2026-09-19, donde el
 * jack Realtek daba puro ruido plano y la webcam captaba la voz con estructura).
 */
const NO_ES_MIC_DE_VOZ = /mezcla|stereo\s*mix|what\s*u\s*hear|loopback|wave\s*out|salida/i;

export interface Microfono {
  deviceId: string;
  label: string;
}

export function useGrabadora() {
  const [grabando, setGrabando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [micUsado, setMicUsado] = useState<string>('');
  const [microfonos, setMicrofonos] = useState<Microfono[]>([]);
  const grabadora = useRef<MediaRecorder | null>(null);
  const trozos = useRef<Blob[]>([]);

  /**
   * Lista los microfonos con etiqueta legible. Las etiquetas solo existen tras conceder permiso
   * una vez, asi que primero se pide audio generico (y se suelta) para desbloquearlas.
   */
  const listaMicrofonos = async (): Promise<void> => {
    try {
      const permiso = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const t of permiso.getTracks()) t.stop();
      const dispositivos = await navigator.mediaDevices.enumerateDevices();
      setMicrofonos(
        dispositivos
          .filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default')
          .map((d) => ({ deviceId: d.deviceId, label: d.label || 'micrófono' })),
      );
    } catch {
      setError('sin acceso al micrófono: revisa el permiso del navegador (y que la página sea https)');
    }
  };

  /**
   * Elige un microfono REAL, no la camara. Brave/Chromium a veces tiene clavada la webcam como
   * dispositivo del sitio y graba silencio; aqui se enumeran las entradas y se prefiere una que
   * NO sea camara (y mejor si dice «microphone/microfono»). Las etiquetas solo existen tras
   * conceder permiso una vez, asi que primero se pide audio generico y luego se re-elige.
   */
  const eligeMicrofono = async (): Promise<string | undefined> => {
    try {
      const dispositivos = await navigator.mediaDevices.enumerateDevices();
      const entradas = dispositivos.filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default');
      // Fuera lo que NO es un microfono de voz: camara (lejana/muda) y, sobre todo, la MEZCLA
      // ESTEREO / stereo mix / loopback, que graba lo que suena en los altavoces, no tu voz
      // (sintoma: RMS plano sin estructura de habla — vivido el 2026-09-19).
      const candidatas = entradas.filter((d) => !NO_ES_MIC_DE_VOZ.test(d.label));
      const preferida = candidatas.find((d) => /micr[oó]fono|microphone/i.test(d.label));
      return (preferida ?? candidatas[0])?.deviceId;
    } catch {
      return undefined;
    }
  };

  const empieza = async (idElegido?: string): Promise<boolean> => {
    setError(undefined);
    try {
      // Si el usuario eligio un microfono, se respeta EXACTAMENTE (gana sobre cualquier
      // heuristica). Si no, se pide el default y se re-elige si cayo en mezcla estereo.
      let stream = idElegido
        ? await navigator.mediaDevices.getUserMedia({ audio: { ...AUDIO, deviceId: { exact: idElegido } } })
        : await navigator.mediaDevices.getUserMedia({ audio: AUDIO });
      const activo = stream.getAudioTracks()[0]?.label ?? '';
      if (!idElegido && NO_ES_MIC_DE_VOZ.test(activo)) {
        const idBueno = await eligeMicrofono();
        if (idBueno) {
          for (const t of stream.getTracks()) t.stop();
          stream = await navigator.mediaDevices.getUserMedia({ audio: { ...AUDIO, deviceId: { exact: idBueno } } });
        }
      }
      const pista = stream.getAudioTracks()[0];
      setMicUsado(pista?.label ?? '(sin etiqueta)');
      const mime = MIMES.find((m) => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      trozos.current = [];
      r.ondataavailable = (e) => {
        if (e.data.size > 0) trozos.current.push(e.data);
      };
      r.start(1_000); // trozos de 1 s: algunos navegadores Android no emiten el audio final sin timeslice
      grabadora.current = r;
      setGrabando(true);
      return true;
    } catch {
      setError('sin acceso al microfono: el navegador lo bloqueo (revisa permisos, y que la pagina sea https)');
      return false;
    }
  };

  const termina = (): Promise<Blob | undefined> =>
    new Promise((resuelve) => {
      const r = grabadora.current;
      if (!r || r.state === 'inactive') {
        setGrabando(false);
        resuelve(undefined);
        return;
      }
      r.onstop = () => {
        for (const pista of r.stream.getTracks()) pista.stop();
        grabadora.current = null;
        setGrabando(false);
        resuelve(trozos.current.length > 0 ? new Blob(trozos.current, { type: r.mimeType || 'audio/webm' }) : undefined);
      };
      r.stop();
    });

  return { grabando, error, micUsado, microfonos, listaMicrofonos, empieza, termina };
}
