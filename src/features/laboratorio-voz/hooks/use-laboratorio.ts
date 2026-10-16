'use client';

/**
 * El estado de la pagina: emparejamiento (el mismo token y el mismo store que /dictar, asi
 * un navegador emparejado sirve para las dos), lo que hay en la maquina y los veredictos.
 */
import { useEffect, useState } from 'react';
import { useDictadoMovil } from '@/features/dictado/store/movil';
import { pideEstado, type EstadoServidor } from '../services/cliente.ts';
import { useVeredictos } from '../store/veredictos.ts';
import { tokenDelEnlace } from '@/shared/lib/token-enlace';

export function useLaboratorio() {
  const movil = useDictadoMovil();
  const veredictos = useVeredictos();
  const [servidor, setServidor] = useState<EstadoServidor | undefined>(undefined);
  const [errorServidor, setErrorServidor] = useState<string | undefined>(undefined);
  const { carga: cargaMovil, empareja } = movil;
  const { carga: cargaVeredictos } = veredictos;

  useEffect(() => {
    cargaMovil();
    // Emparejamiento por QR/enlace, igual que /dictar: el token viaja en #t= y se borra de la barra.
    // Hash y búsqueda por separado: concatenados, `?caso=6#t=…` pegaba la búsqueda al token (shared/lib/token-enlace.ts).
    const enlace = tokenDelEnlace(window.location);
    if (enlace) {
      void empareja(enlace.token);
      history.replaceState(null, '', enlace.urlLimpia);
    }
    pideEstado()
      .then(setServidor)
      .catch((e: unknown) => setErrorServidor(e instanceof Error ? e.message : 'error'));
  }, [cargaMovil, empareja]);

  const token = movil.token;
  useEffect(() => {
    if (token) void cargaVeredictos(token);
  }, [token, cargaVeredictos]);

  return { movil, token, servidor, errorServidor, veredictos };
}
