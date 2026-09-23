/**
 * La trayectoria de una sesion de `dictar`: FORMA, nunca contenido. Cuantos turnos, cuantos
 * sin voz, cuantos descartados por energia o por muletilla, cuantas veces entro el respaldo,
 * latencias p50/p95, tiempo de motor y de pegado, pico del microfono, muertes de la captura.
 * Ni una palabra de lo dictado, ni una ruta de la maquina: es lo que permite versionarla en
 * git y compararla semana a semana (spec 011 del template, linea `herramientas`).
 *
 * El nucleo (`construyeTrayectoria`) es puro y se prueba sin sesion; `escribeTrayectoria` la
 * deja en `corpus/salida-dictar-<fecha>/trayectoria.json`, de donde la ingesta del template
 * la recoge. Se desactiva con `--sin-trayectoria`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ContadoresSesion {
  turnos: number;
  sinVoz: number;
  descartadosEnergia: number;
  muletillas: number;
  respaldo: number;
  pegados: number;
  errores: number;
  muertesCaptura: number;
  /** Modo conversacion (PRP-003): turnos enviados solos al callar y respuestas del agente dichas. */
  enviosPorSilencio: number;
  respuestasHabladas: number;
  latenciasMs: number[];
  msMotor: number[];
  msPegado: number[];
  duracionesMs: number[];
  picosDb: number[];
  /** Desde que llega el texto del agente hasta que suena; desde que calla hasta que el microfono vuelve. */
  msPrimerAudio: number[];
}

export const creaContadores = (): ContadoresSesion => ({ turnos: 0, sinVoz: 0, descartadosEnergia: 0, muletillas: 0, respaldo: 0, pegados: 0, errores: 0, muertesCaptura: 0, enviosPorSilencio: 0, respuestasHabladas: 0, latenciasMs: [], msMotor: [], msPegado: [], duracionesMs: [], picosDb: [], msPrimerAudio: [] });

export interface ContextoSesion {
  motorId: string;
  modo: string;
  silencioMs: number;
  gananciaDb: number;
  umbralVozDb: number;
  /** Solo con el modo conversacion encendido. */
  envioMs?: number;
  inicio: Date;
  fin: Date;
  /** Sin contenido: por defecto `salida-dictar-<fecha>`. */
  referencia?: string;
}

const percentil = (xs: readonly number[], p: number): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0);
};
const redondea = (x: number | null, d = 1): number | null => (x === null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

/** Mismo id que `scripts/trayectorias/formato.mjs` del template (FNV-1a de `linea:referencia`). */
export function idDeTrayectoria(linea: string, referencia: string): string {
  let h = 2166136261;
  for (const c of `${linea}:${referencia}`) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `${linea}-${h.toString(16).padStart(8, '0')}`;
}

/** Un identificador de motor cabe en 80 caracteres o se recorta: la trayectoria no admite cadenas largas. */
const corto = (s: string): string => (s.length > 80 ? s.slice(0, 77) + '…' : s);

export function construyeTrayectoria(c: ContadoresSesion, ctx: ContextoSesion): Record<string, unknown> {
  const referencia = ctx.referencia ?? `salida-dictar-${ctx.inicio.toISOString().slice(0, 19).replace(/[:.]/g, '-')}`;
  const totalMs = Math.max(0, ctx.fin.getTime() - ctx.inicio.getTime());
  const minutos = totalMs / 60_000;
  const suma = (xs: readonly number[]) => Math.round(xs.reduce((a, b) => a + b, 0));
  const avisos: string[] = [];
  if (c.turnos === 0) avisos.push('sesion sin turnos con texto');
  if (c.muertesCaptura > 0) avisos.push('la captura de audio murio durante la sesion');
  const picoMax = c.picosDb.length ? Math.max(...c.picosDb) : null;
  const picoMin = c.picosDb.length ? Math.min(...c.picosDb) : null;
  if (picoMax !== null && picoMax > -3) avisos.push('microfono saturando en alguna escucha');
  if (picoMin !== null && picoMin < -45) avisos.push('microfono flojo en alguna escucha');
  return {
    version: 1,
    id: idDeTrayectoria('herramientas', referencia),
    linea: 'herramientas',
    origen: { tipo: 'medicion', referencia },
    cuando: { inicio: ctx.inicio.toISOString(), fin: ctx.fin.toISOString() },
    actor: { herramienta: 'dictado', tarea: `dictar ${ctx.modo}` },
    modelos: { [corto(ctx.motorId)]: c.turnos },
    acciones: {
      herramientas: { turnos: c.turnos, sinVoz: c.sinVoz, descartadosEnergia: c.descartadosEnergia, muletillas: c.muletillas, respaldo: c.respaldo, pegados: c.pegados, enviosPorSilencio: c.enviosPorSilencio, respuestasHabladas: c.respuestasHabladas },
      turnos: c.turnos + c.sinVoz,
    },
    uso: null,
    costoUsd: null,
    tiempos: { totalMs: Math.round(totalMs), porEtapaMs: { motor: suma(c.msMotor), pegado: suma(c.msPegado), audio: suma(c.duracionesMs) } },
    gates: [],
    resultado: {
      errores: c.errores + c.muertesCaptura,
      metricas: {
        latenciaP50Ms: percentil(c.latenciasMs, 0.5),
        latenciaP95Ms: percentil(c.latenciasMs, 0.95),
        msMotorP50: percentil(c.msMotor, 0.5),
        msPegadoP50: percentil(c.msPegado, 0.5),
        segundosAudioPorTurno: redondea(c.duracionesMs.length ? suma(c.duracionesMs) / c.duracionesMs.length / 1000 : null),
        turnosPorMinuto: redondea(minutos > 0 ? c.turnos / minutos : null),
        picoDbMax: redondea(picoMax),
        picoDbMin: redondea(picoMin),
        silencioMs: ctx.silencioMs,
        gananciaDb: ctx.gananciaDb,
        umbralVozDb: ctx.umbralVozDb,
        muertesCaptura: c.muertesCaptura,
        envioMs: ctx.envioMs ?? null,
        msPrimerAudioP50: percentil(c.msPrimerAudio, 0.5),
      },
    },
    cobertura: { completa: false, faltan: ['uso', 'costo'] },
    ...(avisos.length > 0 ? { avisos } : {}),
  };
}

/** Escribe `corpus/salida-<referencia>/trayectoria.json` bajo `carpetaCorpus` y devuelve la ruta. */
export function escribeTrayectoria(carpetaCorpus: string, trayectoria: Record<string, unknown>): string {
  const referencia = String((trayectoria['origen'] as { referencia: string }).referencia);
  const carpeta = join(carpetaCorpus, referencia);
  mkdirSync(carpeta, { recursive: true });
  const ruta = join(carpeta, 'trayectoria.json');
  writeFileSync(ruta, JSON.stringify(trayectoria, null, 1) + '\n', 'utf8');
  return ruta;
}
