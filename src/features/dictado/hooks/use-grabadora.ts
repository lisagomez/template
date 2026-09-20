'use client';

/**
 * Grabadora del microfono del telefono con MediaRecorder. El formato lo decide el navegador
 * (webm/opus en Android, mp4/aac en iPhone): el servidor lo traga igual via ffmpeg, asi que
 * aqui NO se transcodifica nada. El microfono se suelta al parar: el punto rojo del sistema
 * se apaga y no queda ningun track vivo.
 */
import { useRef, useState } from 'react';

const MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

export function useGrabadora() {
  const [grabando, setGrabando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const grabadora = useRef<MediaRecorder | null>(null);
  const trozos = useRef<Blob[]>([]);

  const empieza = async (): Promise<boolean> => {
    setError(undefined);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MIMES.find((m) => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      trozos.current = [];
      r.ondataavailable = (e) => {
        if (e.data.size > 0) trozos.current.push(e.data);
      };
      r.start();
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

  return { grabando, error, empieza, termina };
}
