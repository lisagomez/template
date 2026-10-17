'use client';

/**
 * El dataLayer de Google Tag Manager en el navegador. El `consent default` (todo DENEGADO) lo pone un script en
 * linea del layout ANTES que cualquier otra cosa; aqui van la actualizacion por el banner, la carga del
 * contenedor (solo con ID valido Y consentimiento: modo basico, sin pings antes de consentir) y el empuje de
 * eventos, que ya llegan filtrados por la lista de permitidos del nucleo (sin PII, sin categoria del servicio).
 */
import { CONSENTIMIENTO_POR_DEFECTO, consentimientoDesdeEleccion, debeCargarContenedor, ESPERA_ACTUALIZACION_MS, type EventoDataLayer } from '../../../../../tools/clinica-dental/dist/index.js';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** El script en linea que va primero en la pagina: dataLayer, gtag y el consentimiento por defecto. */
export const SCRIPT_CONSENTIMIENTO = `window.dataLayer=window.dataLayer||[];window.gtag=function(){window.dataLayer.push(arguments)};window.gtag('consent','default',${JSON.stringify({ ...CONSENTIMIENTO_POR_DEFECTO, wait_for_update: ESPERA_ACTUALIZACION_MS })});`;

const CLAVE = 'clinica-consentimiento-analitica';

export function eleccionGuardada(): boolean | null {
  try {
    const v = localStorage.getItem(CLAVE);
    return v === null ? null : v === 'si';
  } catch {
    return null;
  }
}

export function aplicaEleccion(analitica: boolean, idGtm: string | undefined): void {
  try {
    localStorage.setItem(CLAVE, analitica ? 'si' : 'no');
  } catch {
    /* sin almacenamiento: la eleccion vale para esta pagina */
  }
  const c = consentimientoDesdeEleccion(analitica);
  window.gtag?.('consent', 'update', c);
  if (debeCargarContenedor(idGtm, c) && idGtm && !document.getElementById('gtm-contenedor')) {
    window.dataLayer?.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    const s = document.createElement('script');
    s.id = 'gtm-contenedor';
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(idGtm)}`;
    document.head.appendChild(s);
  }
}

export function empuja(eventos: readonly (EventoDataLayer | null | undefined)[]): void {
  window.dataLayer ??= [];
  for (const e of eventos) if (e) window.dataLayer.push(e);
}
