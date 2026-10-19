/**
 * El banco de las pruebas: el portal armado sobre las piezas REALES de la casa (las `Reservas`, la Pluma y el
 * simulador de Google de `tools/calendario`; el enrutador de `tools/bucle-voz`), con buzon y Telegram simulados,
 * libro en memoria y un reloj que controla la prueba. Modulo de apoyo: no tiene pruebas propias.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Lector, Pluma, Reservas } from '../../calendario/dist/index.js';
import { SimuladorGoogle } from '../../calendario/dist/simulador/index.js';
import { AlmacenEnMemoria } from '../../calendario/dist/almacenes/memoria.js';
import { creaEnrutadorLocal, VERBOS_ESCRITURA } from '../../bucle-voz/dist/index.js';
import {
  AlmacenPortalEnMemoria, BuzonSimulado, CLINICAS, ORDENES_CLINICA, VERBOS_ESCRITURA_CLINICA, TelegramSimulado, creaAgenda, creaCanalTelegram, creaLibro, creaPortal,
  creaSeudonimos, libroEnMemoria, reglasDe, type Agenda, type Clinica, type DepsWhatsApp, type PuertoReservas, type Servicio,
} from '../dist/servidor.js';

const aqui = dirname(fileURLToPath(import.meta.url));
export const PACIENTES = JSON.parse(readFileSync(join(aqui, '..', 'laboratorio', 'pacientes.json'), 'utf8')) as { pacientes: PacienteSintetico[] };
export const CORPUS = JSON.parse(readFileSync(join(aqui, '..', 'laboratorio', 'corpus-asistente.json'), 'utf8')) as { preguntas: PreguntaCorpus[] };

export interface PacienteSintetico {
  id: string; caso: string; clinica: string; contrasena: string; canal: 'busqueda' | 'redes' | 'referido' | 'convenio' | 'directo'; via: 'escrito' | 'voz';
  registro: Record<string, unknown> & { correo: string; nombre: string; apellidoPaterno: string; apellidoMaterno?: string; celular: string; padecimiento?: string; tutor?: Record<string, unknown> };
  cita: { servicio: string; diasAdelante: number; hora: string; canales: ('correo' | 'telegram')[]; newsletter: boolean; choqueCon?: string; alternativa?: string };
  telegram?: { vincula: boolean; chatId?: number; nombre?: string };
  bajaNewsletter?: boolean;
  asiste: boolean;
}
export interface PreguntaCorpus { id: string; clinica: string; categoria: string; texto: string; esperado: Record<string, unknown> }

export const INICIO = '2026-10-19T08:00:00-06:00';
export const LLAVE = 'llave-de-seudonimos-del-laboratorio-0123456789';
export const REEL = { nombre: 'reel.mp4', tipo: 'video/mp4', bytes: new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, ...new Array(1000).fill(7)]) };

export function relojDePrueba(inicio = INICIO) {
  let t = Date.parse(inicio);
  return { ahora: () => t, espera: async (ms: number) => { t += ms; }, avanza: (ms: number) => { t += ms; }, fija: (iso: string) => { t = Date.parse(iso); } };
}

const cuenta = (c: Clinica) => `agenda@${c.dominio}`;

/** Una agenda por clinica: cada sillon es un calendario; cada (sillon, duracion) una instancia de `Reservas`. */
function agendaDe(c: Clinica, almacen: AlmacenEnMemoria, pluma: Pluma, lector: Lector, reloj: ReturnType<typeof relojDePrueba>, sim: SimuladorGoogle): Agenda {
  for (const s of c.sillones) sim.agregaCalendario({ cuenta: cuenta(c), id: s, nombre: s, color: c.marca.primario, zona: c.zona, rol: 'propietario', principal: false, visible: true });
  const cache = new Map<string, PuertoReservas>();
  return creaAgenda({
    clinica: c,
    reservasPara: (sillon: string, s: Servicio) => {
      const k = `${sillon}|${s.duracionMin}`;
      if (!cache.has(k)) cache.set(k, new Reservas({ almacen, pluma, lector, recurso: { cuenta: cuenta(c), calendario: sillon }, reglas: reglasDe(c, s), reloj, ttlMin: 10 }));
      return cache.get(k)!;
    },
  });
}

export function banco(op: { inicio?: string; whatsapp?: DepsWhatsApp } = {}) {
  const reloj = relojDePrueba(op.inicio);
  const sim = new SimuladorGoogle({ reloj });
  const almacenCal = new AlmacenEnMemoria();
  const pluma = new Pluma({ proveedor: sim, almacen: almacenCal, reloj });
  const lector = new Lector({ almacen: almacenCal, reloj });
  const agendas = new Map(CLINICAS.map((c) => [c.id, agendaDe(c, almacenCal, pluma, lector, reloj, sim)]));
  const buzon = new BuzonSimulado({ reloj: reloj.ahora });
  const telegram = new TelegramSimulado({ bots: CLINICAS.map((c) => ({ token: `token-${c.id}`, usuario: c.botTelegram })), reloj: reloj.ahora });
  const almacenLibro = libroEnMemoria();
  const libro = creaLibro({ almacen: almacenLibro, reloj: reloj.ahora });
  const almacen = new AlmacenPortalEnMemoria();
  const portal = creaPortal({
    clinicas: CLINICAS, almacen, libro, agendas, correo: buzon, seudonimos: creaSeudonimos(LLAVE), reloj: reloj.ahora,
    telegram: (id) => creaCanalTelegram(telegram.transporte(`token-${id}`)),
    urlPortal: (id) => `http://127.0.0.1:3000/clinica/${id}`,
    urlBaja: (id, token) => `https://${CLINICAS.find((c) => c.id === id)!.dominio}/api/clinica-dental/baja/${token}`,
    reel: async () => REEL,
    ...(op.whatsapp ? { whatsapp: op.whatsapp } : {}),
  });
  telegram.alActualizar = async (bot, u) => {
    const c = CLINICAS.find((x) => x.botTelegram === bot);
    if (c) await portal.procesaActualizacion(c.id, u);
  };
  return { reloj, sim, pluma, almacenCal, agendas, buzon, telegram, libro, almacenLibro, almacen, portal };
}

export const enrutador = () => creaEnrutadorLocal({ ordenes: ORDENES_CLINICA, vocativos: ['asistente'], verbosEscritura: [...VERBOS_ESCRITURA, ...VERBOS_ESCRITURA_CLINICA] });

/** Instante ISO de `dias` despues del inicio a la hora local HH:MM (CDMX, UTC-6 sin horario de verano). */
export function instante(dias: number, hora: string, inicio = INICIO): string {
  const base = new Date(Date.parse(inicio) + dias * 86_400_000);
  const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(base);
  return new Date(`${fecha}T${hora}:00-06:00`).toISOString();
}

/** Registra a un paciente sintetico como lo haria la app (usuario = id estable de su cuenta). */
export async function alta(b: ReturnType<typeof banco>, p: PacienteSintetico) {
  return b.portal.registra({ clinica: p.clinica, usuario: `usr-${p.id}`, entrada: p.registro, visitante: null, via: p.via, canal: p.canal, segundos: 95 });
}

/** Los valores sembrados que NUNCA deben aparecer fuera del almacen del portal. */
export function sembrados(): string[] {
  return PACIENTES.pacientes.flatMap((p) => {
    const r = p.registro;
    const t = r.tutor as Record<string, string> | undefined;
    return [r.nombre, r.apellidoPaterno, r.apellidoMaterno, r.correo, r.celular, String(r.celular).replace(/\s/g, ''), r.padecimiento, r.empresa as string | undefined, t?.nombre, t?.correo, t?.celular]
      .filter((x): x is string => typeof x === 'string' && x.length >= 4);
  });
}
