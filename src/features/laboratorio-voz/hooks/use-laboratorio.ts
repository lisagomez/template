'use client';

/**
 * El estado de la pagina: emparejamiento (el mismo token y el mismo store que /dictar, asi
 * un navegador emparejado sirve para las dos), lo que hay en la maquina y los veredictos.
 */
import { useEffect, useState } from 'react';
import { useDictadoMovil } from '@/features/dictado/store/movil';
import { pideEstado, type EstadoServidor } from '../services/cliente.ts';
import { useVeredictos } from '../store/veredictos.ts';

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
    const m = /[#?&]t=([^&]+)/.exec(window.location.hash + window.location.search);
    if (m?.[1]) {
      void empareja(decodeURIComponent(m[1]));
      history.replaceState(null, '', window.location.pathname);
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
