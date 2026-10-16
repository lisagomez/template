/**
 * Telemetría por turno, contada desde el FIN REAL DEL HABLA hasta el primer audio que SUENA.
 *
 * La fuente medía desde que el VAD decidía (≈1,5 s después de callar) hasta que el audio se
 * encolaba (antes de sonar): subestimaba la espera en ~1,5 s (defecto 5 del análisis). Aquí:
 *  - `finReal` es el instante del último marco con voz, en el reloj del audio y pasado al reloj
 *    de la página (`creaRelojAudio`); el cierre del VAD es una etapa más, DENTRO de la cuenta;
 *  - `suena` lo pone el reproductor cuando la primera muestra audible sale, no al encolar;
 *  - abrir un turno con `finReal` posterior al cierre es un error de quien mide y se rechaza.
 */

export const ETAPAS = ['finReal', 'cierre', 'transcrito', 'enrutado', 'primerToken', 'primeraFrase', 'vozLista', 'suena', 'fin'] as const;
export type Etapa = (typeof ETAPAS)[number] | 'interrumpido';

export type EstadoRegistro = 'en-curso' | 'completo' | 'interrumpido' | 'descartado';

export interface RegistroTurno {
  id: number;
  marcas: Partial<Record<Etapa, number>>;
  estado: EstadoRegistro;
  ruta?: 'orden' | 'llm' | 'nada';
  orden?: string;
  /** La transcripción salió de la especulación (pausa), no del cierre. */
  especulativo?: boolean;
  /** Cierre anticipado por sentido (orden segura). */
  cierreAnticipado?: boolean;
  costoUsd?: number | null;
  texto?: string;
}

export interface Tramo {
  etapa: Etapa;
  /** ms desde `finReal`. */
  desde: number;
  ms: number;
}

export interface Telemetria {
  abre(id: number, finReal: number): void;
  marca(id: number, etapa: Etapa, t: number): void;
  anota(id: number, datos: Partial<Omit<RegistroTurno, 'id' | 'marcas' | 'estado'>>): void;
  cierra(id: number, estado: Exclude<EstadoRegistro, 'en-curso'>): void;
  turno(id: number): RegistroTurno | undefined;
  turnos(): readonly RegistroTurno[];
  suscribe(f: (r: RegistroTurno) => void): () => void;
}

export function creaTelemetria(maxTurnos = 200): Telemetria {
  const registros = new Map<number, RegistroTurno>();
  const oyentes = new Set<(r: RegistroTurno) => void>();
  const avisa = (r: RegistroTurno) => {
    for (const f of oyentes) f(r);
  };

  return {
    abre(id, finReal) {
      if (!Number.isFinite(finReal)) throw new Error('telemetría: el fin real del habla tiene que ser un instante');
      registros.set(id, { id, marcas: { finReal }, estado: 'en-curso' });
      if (registros.size > maxTurnos) registros.delete(registros.keys().next().value ?? id);
      avisa(registros.get(id) as RegistroTurno);
    },
    marca(id, etapa, t) {
      const r = registros.get(id);
      if (!r || r.marcas[etapa] !== undefined) return; // la primera marca gana
      const fin = r.marcas.finReal ?? t;
      if (etapa === 'cierre' && t < fin) throw new Error('telemetría: el cierre del VAD no puede ser anterior al fin real del habla');
      r.marcas[etapa] = t;
      avisa(r);
    },
    anota(id, datos) {
      const r = registros.get(id);
      if (!r) return;
      Object.assign(r, datos);
      avisa(r);
    },
    cierra(id, estado) {
      const r = registros.get(id);
      if (!r || r.estado !== 'en-curso') return;
      r.estado = estado;
      avisa(r);
    },
    turno: (id) => registros.get(id),
    turnos: () => [...registros.values()],
    suscribe(f) {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
  };
}

/** Fin real del habla → primer audio audible, en ms; `undefined` si el turno no sonó. */
export function latencia(r: RegistroTurno): number | undefined {
  const { finReal, suena } = r.marcas;
  return finReal !== undefined && suena !== undefined ? suena - finReal : undefined;
}

/** La cascada del turno: cada etapa con su inicio relativo al fin real y su duración. */
export function tramos(r: RegistroTurno): Tramo[] {
  const fin = r.marcas.finReal;
  if (fin === undefined) return [];
  const salida: Tramo[] = [];
  let previo = fin;
  for (const etapa of ETAPAS.slice(1)) {
    const t = r.marcas[etapa];
    if (t === undefined) continue;
    salida.push({ etapa, desde: previo - fin, ms: Math.max(0, t - previo) });
    previo = Math.max(previo, t);
  }
  return salida;
}

export function percentil(valores: readonly number[], p: number): number | undefined {
  if (valores.length === 0) return undefined;
  const orden = [...valores].sort((a, b) => a - b);
  const i = Math.min(orden.length - 1, Math.max(0, Math.ceil((p / 100) * orden.length) - 1));
  return orden[i];
}

export interface Resumen {
  n: number;
  p50: number | undefined;
  p95: number | undefined;
}

export function resume(turnos: readonly RegistroTurno[], ruta?: 'orden' | 'llm'): Resumen {
  const valores = turnos
    .filter((t) => t.estado === 'completo' && (ruta === undefined || t.ruta === ruta))
    .map(latencia)
    .filter((v): v is number => v !== undefined);
  return { n: valores.length, p50: percentil(valores, 50), p95: percentil(valores, 95) };
}
