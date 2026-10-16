'use client';

/**
 * El estado de /historial: el mismo emparejamiento que /dictar (token en el store movil), los
 * filtros, la pagina cargada, y el «vivo»: cada 2 s se pide la primera pagina sin filtros con
 * un sondeo barato y, si la huella del historial cambio (llego un dictado nuevo, o se corrigio
 * o borro desde otra pestana), se recarga lo que se esta viendo. Medido: la orden completa cuesta
 * ~100 ms de proceso; a 2 s es el 5 % de un nucleo, y sin pestana visible no se sondea.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDictadoMovil } from '@/features/dictado/store/movil';
import { borraRango, borraUno, corrige, estadisticas as pideEstadisticas, leePagina, pegaEnPc } from '../services/cliente.ts';
import type { Estadisticas } from '../services/estadisticas.ts';
import type { Dictado, Filtros, Pagina } from '../services/tipos.ts';
import { tokenDelEnlace } from '@/shared/lib/token-enlace';

const CUANTOS = 100;
const MS_SONDEO = 2_000;

export const hoyLocal = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function useHistorial() {
  const movil = useDictadoMovil();
  const { carga: cargaMovil, empareja } = movil;
  const token = movil.token;
  const [filtros, setFiltros] = useState<Filtros>({});
  const [pagina, setPagina] = useState<Pagina | undefined>(undefined);
  const [entradas, setEntradas] = useState<Dictado[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [aviso, setAviso] = useState<string | undefined>(undefined);
  const [cifras, setCifras] = useState<Estadisticas | undefined>(undefined);
  const [nuevos, setNuevos] = useState(0);
  const huella = useRef<string | undefined>(undefined);
  const filtrosRef = useRef(filtros);
  useEffect(() => {
    filtrosRef.current = filtros;
  });

  useEffect(() => {
    cargaMovil();
    // Hash y búsqueda por separado: concatenados, `?caso=6#t=…` pegaba la búsqueda al token (shared/lib/token-enlace.ts).
    const enlace = tokenDelEnlace(window.location);
    if (enlace) {
      void empareja(enlace.token);
      history.replaceState(null, '', enlace.urlLimpia);
    }
  }, [cargaMovil, empareja]);

  const avisa = (texto: string) => {
    setAviso(texto);
    setTimeout(() => setAviso(undefined), 1_800);
  };

  /**
   * La carga no toca estado de forma sincrona (la regla de React sobre efectos): pide, y al
   * resolver pone pagina, entradas y «cargando» de golpe. Si llego una carga mas nueva mientras
   * tanto (la persona siguio tecleando), la vieja se descarta.
   */
  const ultimaCarga = useRef(0);
  const enVuelo = useRef(0);
  const carga = useCallback((f: Filtros, desde = 0, reinicia = true): Promise<void> => {
    if (!token) return Promise.resolve();
    const numero = ++ultimaCarga.current;
    enVuelo.current += 1;
    return leePagina(token, f, desde, CUANTOS)
      .then((p) => {
        if (numero !== ultimaCarga.current) return;
        setPagina(p);
        setEntradas((previas) => (desde === 0 ? p.entradas : [...previas, ...p.entradas]));
        setError(undefined);
        if (desde === 0) {
          huella.current = p.huella;
          if (reinicia) setNuevos(0);
        }
      })
      .catch((e: unknown) => {
        if (numero === ultimaCarga.current) setError(e instanceof Error ? e.message : 'no se pudo leer el historial');
      })
      .finally(() => {
        enVuelo.current -= 1;
        if (numero === ultimaCarga.current) setCargando(false);
      });
  }, [token]);

  // Primera carga y cada cambio de filtros. «cargando» lo enciende quien pide (el usuario o el efecto), en la promesa.
  useEffect(() => {
    void Promise.resolve().then(() => setCargando(true)).then(() => carga(filtros, 0));
  }, [carga, filtros]);

  // Vivo: sondeo de la huella (una peticion minima, sin filtros). Si cambio, se recarga lo que se
  // ve CON los filtros vigentes por la misma via que una carga normal (asi una respuesta vieja
  // nunca pisa una nueva) y se cuentan los dictados que llegaron.
  useEffect(() => {
    if (!token) return undefined;
    const tic = async () => {
      // Ni sin pestana visible ni con una carga en vuelo: el sondeo nunca compite con lo que la persona pidio.
      if (document.visibilityState !== 'visible' || enVuelo.current > 0) return;
      try {
        const p = await leePagina(token, {}, 0, 1);
        if (huella.current === undefined || p.huella === huella.current) return;
        const antes = Number(huella.current.split(':')[0] ?? 0);
        setNuevos((n) => n + Math.max(0, p.total - antes));
        huella.current = p.huella;
        await carga(filtrosRef.current, 0, false);
      } catch {
        /* el siguiente sondeo lo intenta de nuevo */
      }
    };
    const id = setInterval(() => void tic(), MS_SONDEO);
    return () => clearInterval(id);
  }, [token, carga]);

  const masPaginas = pagina !== undefined && entradas.length < pagina.coinciden;
  const cargaMas = () => void carga(filtros, entradas.length);

  const corrigeUno = async (id: string, texto: string): Promise<string[]> => {
    if (!token) return [];
    try {
      const r = await corrige(token, id, texto);
      await carga(filtros, 0);
      avisa('Corrección guardada');
      return r.candidatos;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'no se pudo corregir');
      return [];
    }
  };

  const borra = async (id: string) => {
    if (!token) return;
    try {
      await borraUno(token, id);
      setEntradas((xs) => xs.filter((e) => e.id !== id));
      setPagina((p) => (p ? { ...p, coinciden: p.coinciden - 1, total: p.total - 1 } : p));
      avisa('Dictado borrado');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'no se pudo borrar');
    }
  };

  const borraAnteriores = async (antesDe: string): Promise<number> => {
    if (!token) return 0;
    try {
      const r = await borraRango(token, antesDe);
      await carga(filtros, 0);
      avisa(`${r.borrados} dictado${r.borrados === 1 ? '' : 's'} borrado${r.borrados === 1 ? '' : 's'}`);
      return r.borrados;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'no se pudo borrar');
      return 0;
    }
  };

  const copia = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      avisa('Copiado');
    } catch {
      setError('el navegador no dejó copiar; selecciona el texto a mano');
    }
  };

  const pega = async (texto: string) => {
    if (!token) return;
    try {
      await pegaEnPc(token, texto);
      avisa('Pegado en la PC');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'no se pudo pegar en la PC');
    }
  };

  const cargaCifras = async () => {
    if (!token) return;
    try {
      setCifras(await pideEstadisticas(token, hoyLocal()));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'no se pudieron calcular las cifras');
    }
  };

  return { movil, token, filtros, setFiltros, pagina, entradas, cargando, error, aviso, nuevos, masPaginas, cargaMas, corrigeUno, borra, borraAnteriores, copia, pega, cifras, cargaCifras, recarga: () => void carga(filtros, 0) };
}
