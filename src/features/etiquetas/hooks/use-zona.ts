'use client';

/**
 * Donde esta la persona: sitio, zona y rack. Se fija escaneando la etiqueta de ubicacion (o
 * tocandola) y se RECUERDA en este equipo hasta que cambie de zona o pasen 30 minutos sin escanear:
 * quien vuelve de comer no debe seguir «en piso» si ya esta en el anden.
 * Es una comodidad del equipo: lo que se puede hacer en cada zona lo decide el servidor.
 */
import { useCallback, useEffect, useState } from 'react';
import type { Zona } from '../services/nucleo.ts';

export interface ContextoZona { readonly sitio: string; readonly zona: Zona; readonly posicion?: string }

const CLAVE = 'etiquetas-zona';
export const MINUTOS_SIN_ACTIVIDAD = 30;

function leeGuardada(ahora: number): ContextoZona | null {
  try {
    const x = JSON.parse(localStorage.getItem(CLAVE) ?? 'null') as (ContextoZona & { t: number }) | null;
    if (!x || ahora - x.t > MINUTOS_SIN_ACTIVIDAD * 60_000) return null;
    return { sitio: x.sitio, zona: x.zona, ...(x.posicion ? { posicion: x.posicion } : {}) };
  } catch { return null; }
}

function guarda(z: ContextoZona | null): void {
  try {
    if (z) localStorage.setItem(CLAVE, JSON.stringify({ ...z, t: Date.now() }));
    else localStorage.removeItem(CLAVE);
  } catch { /* sin almacenamiento: vive solo en esta pestaña */ }
}

export function useZona() {
  const [zona, setZona] = useState<ContextoZona | null>(null);
  useEffect(() => { void Promise.resolve().then(() => setZona(leeGuardada(Date.now()))); }, []);
  // Vencida la inactividad con la pantalla abierta, la zona se olvida igual.
  useEffect(() => {
    const t = setInterval(() => { if (!leeGuardada(Date.now())) setZona(null); }, 60_000);
    return () => clearInterval(t);
  }, []);
  const fija = useCallback((z: ContextoZona | null) => { guarda(z); setZona(z); }, []);
  /** Cada escaneo renueva el plazo de inactividad. */
  const toca = useCallback(() => { const z = leeGuardada(Date.now()); if (z) guarda(z); }, []);
  return { zona, fija, toca };
}
