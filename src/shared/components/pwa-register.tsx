'use client';

/**
 * Registra el service worker de la PWA. Va montado en el layout raiz: si se quita, la app
 * deja de ser instalable en silencio (leccion del skill add-mobile). CRITICO: la URL sale de
 * window.location.origin — iOS rechaza el registro si hay un redirect 307 de por medio.
 */
import { useEffect } from 'react';

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register(`${window.location.origin}/sw.js`, { scope: '/' })
      .catch(() => undefined); // sin https no hay SW: la pagina sigue sirviendo igual
  }, []);
  return null;
}
