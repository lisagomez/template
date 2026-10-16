/**
 * El portal del laboratorio, armado UNA vez por proceso: el nucleo de `tools/clinica-dental` sobre almacenes en
 * archivo, el calendario de `tools/calendario` (simulador de Google + espejo en archivo + Pluma: nada sale), el
 * buzon y la Bot API de Telegram simulados y persistentes, el libro sha256 y el reloj del laboratorio.
 */
import { randomBytes } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Lector, Pluma, Reservas } from '../../../../../tools/calendario/dist/index.js';
import { SimuladorGoogle } from '../../../../../tools/calendario/dist/simulador/index.js';
import { AlmacenEnArchivo } from '../../../../../tools/calendario/dist/almacenes/archivo.js';
import {
  AlmacenPortalEnArchivo, BuzonSimulado, CLINICAS, TelegramSimulado, creaAgenda, creaCanalTelegram, creaLibro, creaPortal, creaSeudonimos, libroEnArchivo,
  llavesSello, reglasDe, type Clinica, type Enviado, type Portal, type PuertoReservas, type Servicio, type VideoSubido,
} from '../../../../../tools/clinica-dental/dist/servidor.js';
import { exigeLaboratorio, RUTAS, URL_PORTAL } from './datos';

export interface Runtime {
  portal: Portal;
  buzon: BuzonSimulado;
  telegram: TelegramSimulado;
  llaves: { seudonimos: string; selloPrivada: string; selloPublica: string };
  reloj: () => number;
  avanzaReloj: (ms: number) => Promise<void>;
  guardaTelegram: () => Promise<void>;
}

async function leeJson<T>(ruta: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(/*turbopackIgnore: true*/ ruta, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function llaves(): Promise<Runtime['llaves']> {
  const previas = await leeJson<Runtime['llaves']>(RUTAS.llaves);
  if (previas) return previas;
  const s = llavesSello();
  const nuevas = { seudonimos: randomBytes(32).toString('hex'), selloPrivada: s.privada, selloPublica: s.publica };
  await writeFile(/*turbopackIgnore: true*/ RUTAS.llaves, JSON.stringify(nuevas), { mode: 0o600 });
  return nuevas;
}

/** El reloj del laboratorio: el real mas un desfase que se guarda (las corridas arrancan el lunes 2026-10-19). */
async function relojDelLaboratorio() {
  let desfase = (await leeJson<{ desfaseMs: number }>(RUTAS.reloj))?.desfaseMs;
  if (desfase === undefined) {
    const inicio = process.env['CLINICA_RELOJ_INICIO'];
    desfase = inicio ? Date.parse(inicio) - Date.now() : 0;
    await writeFile(/*turbopackIgnore: true*/ RUTAS.reloj, JSON.stringify({ desfaseMs: desfase }));
  }
  const estado = { desfase };
  return {
    reloj: () => Date.now() + estado.desfase,
    avanza: async (ms: number) => {
      estado.desfase += ms;
      await writeFile(/*turbopackIgnore: true*/ RUTAS.reloj, JSON.stringify({ desfaseMs: estado.desfase }));
    },
  };
}

async function buzon(reloj: () => number): Promise<BuzonSimulado> {
  await mkdir(/*turbopackIgnore: true*/ RUTAS.buzon, { recursive: true });
  const indice = join(RUTAS.buzon, 'indice.jsonl');
  const texto = await readFile(/*turbopackIgnore: true*/ indice, 'utf8').catch(() => '');
  const previos = texto.split('\n').filter(Boolean).map((l) => JSON.parse(l) as Enviado);
  return new BuzonSimulado({
    reloj, previos,
    alGuardar: async (e) => {
      await writeFile(/*turbopackIgnore: true*/ join(RUTAS.buzon, `${e.idMensaje.replace(/[^a-z0-9_.-]/gi, '_')}.eml`), e.eml, { mode: 0o600 });
      await appendFile(/*turbopackIgnore: true*/ indice, `${JSON.stringify(e)}\n`, { mode: 0o600 });
    },
  });
}

function agendaDe(c: Clinica, deps: { almacen: AlmacenEnArchivo; pluma: Pluma; lector: Lector; sim: SimuladorGoogle; reloj: { ahora: () => number; espera: (ms: number) => Promise<void> } }) {
  const cuenta = `agenda@${c.dominio}`;
  for (const s of c.sillones) deps.sim.agregaCalendario({ cuenta, id: s, nombre: s, color: c.marca.primario, zona: c.zona, rol: 'propietario', principal: false, visible: true });
  const cache = new Map<string, PuertoReservas>();
  return creaAgenda({
    clinica: c,
    reservasPara: (sillon: string, s: Servicio) => {
      const k = `${sillon}|${s.duracionMin}`;
      if (!cache.has(k)) cache.set(k, new Reservas({ almacen: deps.almacen, pluma: deps.pluma, lector: deps.lector, recurso: { cuenta, calendario: sillon }, reglas: reglasDe(c, s), reloj: deps.reloj, ttlMin: 10 }));
      return cache.get(k)!;
    },
  });
}

async function arma(): Promise<Runtime> {
  exigeLaboratorio();
  await mkdir(/*turbopackIgnore: true*/ RUTAS.libro, { recursive: true });
  const k = await llaves();
  const r = await relojDelLaboratorio();
  const relojCal = { ahora: r.reloj, espera: async () => undefined };
  const sim = new SimuladorGoogle({ reloj: relojCal });
  const almacen = await AlmacenEnArchivo.abre(RUTAS.calendario);
  const pluma = new Pluma({ proveedor: sim, almacen, reloj: relojCal });
  const lector = new Lector({ almacen, reloj: relojCal });
  const agendas = new Map(CLINICAS.map((c) => [c.id, agendaDe(c, { almacen, pluma, lector, sim, reloj: relojCal })]));
  const correo = await buzon(r.reloj);
  const telegram = new TelegramSimulado({ bots: CLINICAS.map((c) => ({ token: `lab-${c.id}`, usuario: c.botTelegram })), reloj: r.reloj });
  const reels = new Map<string, VideoSubido>();
  const portal = creaPortal({
    clinicas: CLINICAS, almacen: await AlmacenPortalEnArchivo.abre(RUTAS.portal), libro: creaLibro({ almacen: libroEnArchivo(RUTAS.libro), reloj: r.reloj }),
    agendas, correo, seudonimos: creaSeudonimos(k.seudonimos), reloj: r.reloj,
    telegram: (id) => creaCanalTelegram(telegram.transporte(`lab-${id}`)),
    urlPortal: (id) => `${URL_PORTAL}/clinica/${id}`,
    urlBaja: (id, token) => `https://${CLINICAS.find((c) => c.id === id)?.dominio ?? 'clinica.example'}/api/clinica-dental/baja/${token}`,
    reel: async (id) => {
      if (!reels.has(id)) {
        const bytes = await readFile(/*turbopackIgnore: true*/ join(RUTAS.reel, `${id}.mp4`)).catch(() => null);
        if (!bytes) return null;
        reels.set(id, { nombre: `reel-${id}.mp4`, tipo: 'video/mp4', bytes: new Uint8Array(bytes) });
      }
      return reels.get(id) ?? null;
    },
  });
  const guardaTelegram = () => writeFile(/*turbopackIgnore: true*/ RUTAS.telegram, JSON.stringify(telegram.historial), { mode: 0o600 });
  telegram.alActualizar = async (bot, u) => {
    const c = CLINICAS.find((x) => x.botTelegram === bot);
    if (c) await portal.procesaActualizacion(c.id, u);
    await guardaTelegram();
  };
  return { portal, buzon: correo, telegram, llaves: k, reloj: r.reloj, avanzaReloj: r.avanza, guardaTelegram };
}

const g = globalThis as unknown as { __clinicaRuntime?: Promise<Runtime> };

/** El runtime del proceso (sobrevive al recargado en caliente de `next dev`). */
export function runtime(): Promise<Runtime> {
  g.__clinicaRuntime ??= mkdir(/*turbopackIgnore: true*/ RUTAS.reel, { recursive: true }).then(arma);
  g.__clinicaRuntime.catch(() => { g.__clinicaRuntime = undefined; });
  return g.__clinicaRuntime;
}

/** Despacha lo vencido y deja el historial de Telegram en disco (lo llaman las acciones y el laboratorio). */
export async function despacha() {
  const rt = await runtime();
  const r = await rt.portal.despacha();
  await rt.guardaTelegram();
  return r;
}
