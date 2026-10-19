/**
 * Lo que el portal guarda y el PUERTO por el que lo guarda. Aqui SI viven los datos personales del paciente
 * (es su expediente administrativo en la clinica, no el clinico): nombre, correo, celular y, solo con
 * consentimiento expreso, el padecimiento. Nada de esto sale al libro de eventos, que solo ve seudonimos.
 *
 * Dos adaptadores: en memoria (pruebas) y en archivo (el laboratorio). El de Supabase es la migracion
 * propuesta (`migraciones/propuesta-clinica-dental.sql`), validada en Postgres efimero con RLS y NO aplicada.
 * Todo acceso va por (clinica, …): no hay lectura «de todas las clinicas» en el puerto.
 */
import type { Categoria } from './clinicas.js';
import type { CanalAdquisicion, CanalAviso, ClaseAviso, TipoConsentimiento } from './eventos.js';
import type { Registro } from './cuestionario.js';

export interface Paciente {
  seudonimo: string;
  clinica: string;
  usuario: string;
  datos: Omit<Registro, 'consentimientos' | 'categorias'>;
  categorias: Categoria[];
  canalAdquisicion: CanalAdquisicion;
  telegram: { chatId: number | null; vinculadoEn: number | null };
  /**
   * El WhatsApp VINCULADO: el `wa_id` normalizado de un numero que escribio a la clinica con su codigo Y que la
   * persona confirmo desde su cuenta. El celular del registro NO sirve para mandar nada: puede estar mal escrito.
   * Opcional porque los pacientes de antes del canal no lo traen.
   */
  whatsapp?: { waId: string | null; vinculadoEn: number | null };
  creado: number;
}

export interface ConsentimientoGuardado { clinica: string; paciente: string; tipo: TipoConsentimiento; otorgado: boolean; version: string; en: number }

export type EstadoCita = 'confirmada' | 'cancelada' | 'reprogramada' | 'atendida' | 'inasistencia';
export interface Cita {
  id: string;
  clinica: string;
  paciente: string;
  servicio: string;
  categoria: Categoria;
  sillon: string;
  reservaId: string;
  inicio: number;
  fin: number;
  estado: EstadoCita;
  canales: CanalAviso[];
  clave: string;
  creada: number;
  anterior: string | null;
  /** La primera cita de la cadena de reprogramaciones: el UID del `.ics` no cambia al reprogramar. */
  origen: string;
  secuencia: number;
}

/** `enviado` y `leido` son de WhatsApp: Meta acepta el mensaje (enviado) y DESPUES avisa si se entrego o se leyo. */
export type EstadoAviso = 'programado' | 'esperando_vinculo' | 'enviando' | 'enviado' | 'entregado' | 'leido' | 'fallido' | 'cancelado' | 'incierto';
export interface Aviso {
  id: string;
  clinica: string;
  paciente: string;
  cita: string | null;
  canal: CanalAviso;
  clase: ClaseAviso;
  para: number;
  estado: EstadoAviso;
  intentos: number;
  proximoIntento: number;
  motivo: string | null;
  edicion: string | null;
  actualizado: number;
  /** El id del mensaje en WhatsApp: los estados que llegan despues se atan al aviso por el. */
  wamid?: string | null;
}

/**
 * Un token de un solo uso. El de WhatsApp es el CODIGO de vinculacion: cuando un numero lo manda, queda
 * `pendiente` de que la persona confirme ese numero desde su cuenta; nada se le manda a ese numero antes.
 */
export interface Token {
  id: string; clinica: string; paciente: string; tipo: 'baja' | 'telegram' | 'whatsapp'; creado: number; expira: number | null; usado: number | null;
  pendiente?: { waId: string; recibido: number } | null;
}

/**
 * El estado de UNA conversacion de WhatsApp (clinica, numero). Sin el texto de nada: el historial que el asistente
 * necesita vive en memoria del proceso y caduca (ver el receptor). `silenciadoHasta`: la recepcion escribio desde
 * su celular (coexistencia) o la persona pidio a alguien, y el asistente calla salvo ante una urgencia.
 */
export interface ChatWhatsApp {
  clinica: string;
  waId: string;
  conversacion: string;
  ultimoEntrante: number | null;
  silenciadoHasta: number | null;
  /** Ya se le dijo a esta persona que contesta un asistente automatico (una vez por chat). */
  presentado?: boolean;
  actualizado: number;
}

export interface AlmacenPortal {
  paciente(clinica: string, usuario: string): Promise<Paciente | null>;
  pacientePorSeudonimo(clinica: string, seudonimo: string): Promise<Paciente | null>;
  pacientes(clinica: string): Promise<Paciente[]>;
  guardaPaciente(p: Paciente): Promise<void>;
  consentimientos(clinica: string, paciente: string): Promise<ConsentimientoGuardado[]>;
  agregaConsentimiento(c: ConsentimientoGuardado): Promise<void>;
  citas(clinica: string, paciente?: string): Promise<Cita[]>;
  cita(clinica: string, id: string): Promise<Cita | null>;
  guardaCita(c: Cita): Promise<void>;
  avisos(clinica: string, paciente?: string): Promise<Aviso[]>;
  aviso(clinica: string, id: string): Promise<Aviso | null>;
  guardaAviso(a: Aviso): Promise<void>;
  token(id: string): Promise<Token | null>;
  /** Los tokens de UN paciente en SU clinica (los codigos de vinculacion vivos o pendientes). */
  tokensDe(clinica: string, paciente: string): Promise<Token[]>;
  guardaToken(t: Token): Promise<void>;
  chat(clinica: string, waId: string): Promise<ChatWhatsApp | null>;
  guardaChat(c: ChatWhatsApp): Promise<void>;
  /** Marca un id (un `wamid`, un estado) como procesado. `false` si YA lo estaba: la idempotencia del receptor. */
  marcaProcesado(id: string): Promise<boolean>;
}

export interface InstantaneaPortal {
  pacientes: Paciente[];
  consentimientos: ConsentimientoGuardado[];
  citas: Cita[];
  avisos: Aviso[];
  tokens: Token[];
  chats?: ChatWhatsApp[];
  procesados?: string[];
}

const copia = <T>(x: T): T => structuredClone(x);

export class AlmacenPortalEnMemoria implements AlmacenPortal {
  protected s: InstantaneaPortal = { pacientes: [], consentimientos: [], citas: [], avisos: [], tokens: [] };

  protected async cambio(): Promise<void> {
    /* en memoria no hay nada que persistir */
  }

  exporta(): InstantaneaPortal {
    return copia(this.s);
  }

  async paciente(clinica: string, usuario: string) {
    return copia(this.s.pacientes.find((p) => p.clinica === clinica && p.usuario === usuario) ?? null);
  }
  async pacientePorSeudonimo(clinica: string, seudonimo: string) {
    return copia(this.s.pacientes.find((p) => p.clinica === clinica && p.seudonimo === seudonimo) ?? null);
  }
  async pacientes(clinica: string) {
    return copia(this.s.pacientes.filter((p) => p.clinica === clinica));
  }
  async guardaPaciente(p: Paciente) {
    this.s.pacientes = [...this.s.pacientes.filter((x) => !(x.clinica === p.clinica && x.seudonimo === p.seudonimo)), copia(p)];
    await this.cambio();
  }
  async consentimientos(clinica: string, paciente: string) {
    return copia(this.s.consentimientos.filter((c) => c.clinica === clinica && c.paciente === paciente));
  }
  async agregaConsentimiento(c: ConsentimientoGuardado) {
    this.s.consentimientos.push(copia(c));
    await this.cambio();
  }
  async citas(clinica: string, paciente?: string) {
    return copia(this.s.citas.filter((c) => c.clinica === clinica && (paciente === undefined || c.paciente === paciente)));
  }
  async cita(clinica: string, id: string) {
    return copia(this.s.citas.find((c) => c.clinica === clinica && c.id === id) ?? null);
  }
  async guardaCita(c: Cita) {
    this.s.citas = [...this.s.citas.filter((x) => !(x.clinica === c.clinica && x.id === c.id)), copia(c)];
    await this.cambio();
  }
  async avisos(clinica: string, paciente?: string) {
    return copia(this.s.avisos.filter((a) => a.clinica === clinica && (paciente === undefined || a.paciente === paciente)));
  }
  async aviso(clinica: string, id: string) {
    return copia(this.s.avisos.find((a) => a.clinica === clinica && a.id === id) ?? null);
  }
  async guardaAviso(a: Aviso) {
    this.s.avisos = [...this.s.avisos.filter((x) => !(x.clinica === a.clinica && x.id === a.id)), copia(a)];
    await this.cambio();
  }
  async token(id: string) {
    return copia(this.s.tokens.find((t) => t.id === id) ?? null);
  }
  async tokensDe(clinica: string, paciente: string) {
    return copia(this.s.tokens.filter((t) => t.clinica === clinica && t.paciente === paciente));
  }
  async guardaToken(t: Token) {
    this.s.tokens = [...this.s.tokens.filter((x) => x.id !== t.id), copia(t)];
    await this.cambio();
  }
  async chat(clinica: string, waId: string) {
    return copia((this.s.chats ?? []).find((c) => c.clinica === clinica && c.waId === waId) ?? null);
  }
  async guardaChat(c: ChatWhatsApp) {
    this.s.chats = [...(this.s.chats ?? []).filter((x) => !(x.clinica === c.clinica && x.waId === c.waId)), copia(c)];
    await this.cambio();
  }
  async marcaProcesado(id: string) {
    const ya = new Set(this.s.procesados ?? []);
    if (ya.has(id)) return false;
    this.s.procesados = [...(this.s.procesados ?? []), id];
    await this.cambio();
    return true;
  }
}

/** Vigente = el ultimo registro de cada tipo (el historial completo se conserva: retirar no borra la prueba). */
export function consentimientosVigentes(lista: readonly ConsentimientoGuardado[]): Partial<Record<TipoConsentimiento, boolean>> {
  const salida: Partial<Record<TipoConsentimiento, boolean>> = {};
  for (const c of [...lista].sort((a, b) => a.en - b.en)) salida[c.tipo] = c.otorgado;
  return salida;
}
