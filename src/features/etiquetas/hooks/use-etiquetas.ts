'use client';

/**
 * El estado del sistema (catalogo, sitios, impresoras, existencias) y un ejecutor de acciones
 * que recarga al terminar. Cada carga lleva numero y solo se aplica la ultima (una respuesta
 * vieja no pisa a la nueva).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { accion as accionRemota, credenciales, leeEstadoRemoto, type EstadoCliente } from '../services/cliente.ts';
import type { AccionEtiquetas } from '../services/esquemas.ts';

export function useEtiquetas() {
  const [estado, setEstado] = useState<EstadoCliente | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emparejado, setEmparejado] = useState<boolean | null>(null);
  const numero = useRef(0);

  const recarga = useCallback(() => {
    const n = ++numero.current;
    return leeEstadoRemoto().then(
      (e) => { if (n === numero.current) { setEstado(e); setError(null); } },
      (e: unknown) => { if (n === numero.current) setError(e instanceof Error ? e.message : String(e)); },
    );
  }, []);

  useEffect(() => {
    const { token, operador } = credenciales();
    const listo = Boolean(token && operador);
    void Promise.resolve().then(() => setEmparejado(listo));
    if (listo) void recarga();
  }, [recarga]);

  const ejecuta = useCallback(async <T,>(a: AccionEtiquetas): Promise<T> => {
    const r = await accionRemota<T>(a);
    await recarga();
    return r;
  }, [recarga]);

  const alEmparejar = useCallback(() => { setEmparejado(true); void recarga(); }, [recarga]);

  return { estado, error, emparejado, recarga, ejecuta, alEmparejar };
}

export type Etiquetas = ReturnType<typeof useEtiquetas>;
