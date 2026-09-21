'use client';

/**
 * El estado de /ajustes: el mismo emparejamiento que /dictar y /historial (token en el store
 * movil), el estado completo que da el servidor (valores con origen, esquema, catalogo), y las
 * tres ordenes. Cada escritura devuelve el estado nuevo entero: no hay copia local que
 * desincronizar. Un valor rechazado por la validacion queda junto a su campo, no arriba.
 */
import { useCallback, useEffect, useState } from 'react';
import { useDictadoMovil } from '@/features/dictado/store/movil';
import { leeEstado, pon as ponRemoto, quita as quitaRemoto, restablece as restableceRemoto } from '../services/cliente.ts';
import type { EstadoAjustes, Valor } from '../services/tipos.ts';

export function useAjustes() {
  const movil = useDictadoMovil();
  const { carga: cargaMovil, empareja } = movil;
  const token = movil.token;
  const [estado, setEstado] = useState<EstadoAjustes | undefined>(undefined);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [erroresCampo, setErroresCampo] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState<string | undefined>(undefined);
  const [aviso, setAviso] = useState<string | undefined>(undefined);

  useEffect(() => {
    cargaMovil();
    const m = /[#?&]t=([^&]+)/.exec(window.location.hash + window.location.search);
    if (m?.[1]) {
      void empareja(decodeURIComponent(m[1]));
      history.replaceState(null, '', window.location.pathname);
    }
  }, [cargaMovil, empareja]);

  const avisa = (texto: string) => {
    setAviso(texto);
    setTimeout(() => setAviso(undefined), 1_800);
  };

  // La carga no toca estado de forma sincrona (regla de React sobre efectos): pide, y al resolver escribe.
  const carga = useCallback((): Promise<void> => {
    if (!token) return Promise.resolve();
    return leeEstado(token)
      .then((e) => {
        setEstado(e);
        setError(undefined);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'no se pudieron leer los ajustes'))
      .finally(() => setCargando(false));
  }, [token]);

  useEffect(() => {
    void Promise.resolve().then(() => setCargando(true)).then(carga);
  }, [carga]);

  const pon = async (clave: string, valor: Valor): Promise<boolean> => {
    if (!token) return false;
    setGuardando(clave);
    try {
      const r = await ponRemoto(token, clave, valor);
      setEstado(r.estado);
      setErroresCampo((e) => {
        const copia = { ...e };
        delete copia[clave];
        return copia;
      });
      avisa('Guardado');
      return true;
    } catch (e) {
      setErroresCampo((prev) => ({ ...prev, [clave]: e instanceof Error ? e.message : 'no se pudo guardar' }));
      return false;
    } finally {
      setGuardando(undefined);
    }
  };

  const quita = async (clave: string): Promise<void> => {
    if (!token) return;
    setGuardando(clave);
    try {
      const r = await quitaRemoto(token, clave);
      setEstado(r.estado);
      setErroresCampo((e) => {
        const copia = { ...e };
        delete copia[clave];
        return copia;
      });
      avisa('De vuelta al defecto');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'no se pudo volver al defecto');
    } finally {
      setGuardando(undefined);
    }
  };

  const restablece = async (): Promise<void> => {
    if (!token) return;
    try {
      const r = await restableceRemoto(token);
      setEstado(r.estado);
      setErroresCampo({});
      avisa('Todo por defecto');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'no se pudo restablecer');
    }
  };

  return { movil, token, estado, cargando, error, erroresCampo, guardando, aviso, recarga: carga, pon, quita, restablece };
}
