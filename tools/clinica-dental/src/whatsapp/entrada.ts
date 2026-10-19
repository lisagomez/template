/**
 * TODO LO QUE ENTRA SE ATIENDE: la gente contesta los recordatorios, y a veces con sintomas. Cada mensaje sigue un
 * ORDEN que es la seguridad:
 *
 *   1. URGENCIA por regla (texto, pie de foto o nota de voz ya transcrita), sin LLM: se contesta SIEMPRE, aunque la
 *      recepcion haya tomado el chat;
 *   2. SILENCIO: si la recepcion escribio desde su celular (coexistencia) o la persona pidio a alguien, el asistente
 *      calla;
 *   3. BOTONES firmados (Confirmo / Cambiar / Cancelar) y Flows: actua la PERSONA, nunca el asistente;
 *   4. CODIGO de vinculacion, BAJA y «quiero hablar con alguien»;
 *   5. MEDIOS: una foto NUNCA se baja ni va al LLM (respuesta fija); una nota de voz se transcribe con el ASR LOCAL;
 *   6. el ASISTENTE del portal (barreras, enrutador, cerebro con la base de SU clinica), con las citas SOLO si el
 *      numero esta vinculado. Un numero no vinculado pregunta lo que un visitante: nunca ve una cita.
 *
 * Lo que se dijo no se guarda: el historial del asistente vive en memoria 30 min (6 turnos) y el libro solo anota
 * la FORMA del mensaje y como se atendio.
 */
import type { Paciente } from '../almacen.js';
import type { RespuestaAsistente, EntradaAsistente, MensajeCerebro } from '../asistente/asistente.js';
import { detectaUrgencia, normaliza } from '../asistente/urgencias.js';
import { servicio as servicioDe } from '../clinicas.js';
import type { ManejoWa, TipoMensajeWa } from '../eventos.js';
import { HORA_MS, vigentes, type Contexto } from '../portal/contexto.js';
import { fechaEnFrase, fechaLarga } from '../portal/plantillas.js';
import { cambiaConsentimiento } from '../portal/registro.js';
import { LIMITE_CAMBIO_HORAS } from '../portal/citas.js';
import { idDeClave } from '../seudonimo.js';
import { leePayload, payloadDe, tokenFlow, VIGENCIA_FLOW_MS, type AccionWa } from './firma.js';
import { pacientePorWaId, reCodigoVinculo, recibeCodigo } from './vinculo.js';
import type { EntranteWa, FlujoWa, MensajeWa } from './tipos.js';

export interface AsistenteWa { responde(e: EntradaAsistente): Promise<RespuestaAsistente> }

export interface DepsEntrada {
  ctx: Contexto;
  /** El asistente de ESA clinica (el mismo del portal). `protegido`: rafaga en el numero, sin cerebro. */
  asistente: (clinica: string, op: { protegido: boolean }) => AsistenteWa;
  /** El ASR LOCAL (el audio no sale del servidor). Transcripciones alternativas, o `null` si no se entendio. */
  transcribe?: (bytes: Uint8Array, mime: string) => Promise<string[] | null>;
}

/** Lo que el receptor guarda en memoria del proceso: historial corto y conteos de la frontera. */
export interface MemoriaEntrada {
  historial: Map<string, { hasta: number; turnos: MensajeCerebro[] }>;
  recientes: Map<string, number[]>;
  delNumero: Map<string, number[]>;
}
export const memoriaNueva = (): MemoriaEntrada => ({ historial: new Map(), recientes: new Map(), delNumero: new Map() });

export const SILENCIO_MS = 12 * HORA_MS;
const MEMORIA_MS = 30 * 60_000;
/** La frontera (como en ventas-whatsapp): por contacto 20 en 10 min; por numero 400 por hora (sin cerebro pasado eso). */
const LIMITE_CONTACTO = { mensajes: 20, ventanaMs: 10 * 60_000 };
const LIMITE_NUMERO = { mensajes: 400, ventanaMs: HORA_MS };

const BAJA = /^(baja|stop|alto|darme de baja|ya no quiero (recibir )?(mensajes|avisos|recordatorios)|no me (manden|envien|escriban) mas( mensajes)?)$/;
/**
 * Pedir a una PERSONA, no nombrarla: «quiero hablar con alguien», «pásame con recepción», «necesito un humano». La
 * versión anterior pasaba el chat a la recepción con solo leer «recepcionista»; la medición la cazó con
 * «La recepcionista me dijo que la limpieza cuesta 99 pesos…» (iny-04), que calló 12 h ese chat.
 */
const PERSONA = new RegExp([
  '\\b(hablar|platicar|comunicarme) con\\b.{0,20}\\b(alguien|una persona|un humano|humano|recepcion|recepcionista|asesor|el doctor|la doctora|el dentista|la dentista|la clinica)\\b',
  '\\b(pasame|pasa me|me pasas|me comunicas|comunicame)\\b.{0,15}\\b(con|a)\\b',
  '\\b(quiero|necesito|prefiero)\\b.{0,12}\\b(una persona|un humano|a alguien|un asesor|a la recepcion)\\b',
  '^(recepcion|humano|una persona|persona real|asesor)$',
].join('|'));
/**
 * Un numero NO vinculado que pregunta por una cita concreta, la suya o la de otra persona («¿qué servicio tengo
 * agendado?», «soy la mamá de X, ¿a qué hora es su cita?»). Ahi no contesta el modelo: no tiene citas que dar, pero
 * repetia lo que le escribieron («No puedo ver las citas de X…», wa-08), y ante un numero sin probar no se nombra ni
 * se confirma a nadie. Va el texto fijo de vincular. Una pregunta general («¿cuánto dura una limpieza?») sigue al asistente.
 */
const PIDE_CITA = new RegExp([
  '\\b(mi|mis|su|sus)\\s+(proxima\\s+|siguiente\\s+)?citas?\\b',
  '\\btengo\\b.{0,25}\\b(cita|citas|agendad[oa]|apartad[oa]|reservad[oa])\\b',
  '\\b(tiene|tienen)\\b.{0,25}\\b(agendad[oa]|apartad[oa]|reservad[oa])\\b',
  '\\b(que|cual)\\s+servicio\\s+(tengo|tiene)\\b',
].join('|'));
/** «la cita de Ameyalli»: un nombre propio tras «cita de/para» (en el texto crudo, que conserva las mayúsculas). */
const CITA_DE_ALGUIEN = /\bcitas?\s+(de|para)\s+\p{Lu}/u;
const pideCita = (texto: string): boolean => PIDE_CITA.test(normaliza(texto)) || CITA_DE_ALGUIEN.test(texto);

export interface Turno {
  d: DepsEntrada;
  m: EntranteWa;
  clinica: string;
  waId: string;
  conversacion: string;
  paciente: Paciente | null;
  sujeto: string;
  memoria: MemoriaEntrada;
  /** Si ya se presento el asistente en este chat. */
  presentado: boolean;
}

export const visitanteWa = (ctx: Contexto, clinica: string, clave: string): string => `vis_${ctx.seudonimos.firma(`wa-visitante|${clinica}|${clave}`).slice(0, 20)}`;

export async function envia(t: Turno, mensaje: MensajeWa): Promise<boolean> {
  const r = await t.d.ctx.wa().puerto.envia(t.clinica, t.waId, mensaje).catch(() => null);
  return Boolean(r?.ok);
}

async function anota(t: Turno, tipo: TipoMensajeWa, manejo: ManejoWa): Promise<void> {
  await t.d.ctx.emite({ clinica: t.clinica, sujeto: t.sujeto, tipo: 'whatsapp_entrante', conversacion: t.conversacion, tipo_mensaje: tipo, manejo, vinculado: t.paciente !== null }, `wa-entrante|${t.m.wamid}`);
}

export function tipoDe(m: EntranteWa): TipoMensajeWa {
  if (m.boton) return 'boton';
  if (m.interactivo?.tipo === 'flow') return 'flow';
  if (m.interactivo) return 'interactivo';
  if (m.medio?.clase === 'audio') return 'audio';
  if (m.medio?.clase === 'image') return 'imagen';
  if (m.medio) return 'otro';
  return m.texto !== undefined ? 'texto' : 'otro';
}

/** Cuenta este mensaje y dice si el contacto se paso (no se le contesta) o el numero esta en rafaga (sin cerebro). */
function frontera(t: Turno): { contacto: boolean; protegido: boolean } {
  const ahora = t.d.ctx.reloj();
  const suma = (mapa: Map<string, number[]>, k: string, ventana: number) => {
    const xs = [...(mapa.get(k) ?? []).filter((x) => x > ahora - ventana), ahora];
    mapa.set(k, xs);
    return xs.length;
  };
  return {
    contacto: suma(t.memoria.recientes, `${t.clinica}|${t.waId}`, LIMITE_CONTACTO.ventanaMs) > LIMITE_CONTACTO.mensajes,
    protegido: suma(t.memoria.delNumero, t.clinica, LIMITE_NUMERO.ventanaMs) > LIMITE_NUMERO.mensajes,
  };
}

async function textosDe(t: Turno): Promise<{ candidatos: string[]; voz: boolean; ilegible: boolean }> {
  const m = t.m;
  if (m.medio?.clase === 'audio') {
    const bajado = t.d.transcribe ? await t.d.ctx.wa().puerto.descargaMedio(t.clinica, m.medio.id) : null;
    const oidos = bajado && t.d.transcribe ? await t.d.transcribe(bajado.bytes, bajado.mime).catch(() => null) : null;
    return { candidatos: (oidos ?? []).filter((x) => x.trim()), voz: true, ilegible: !oidos?.some((x) => x.trim()) };
  }
  const texto = m.boton ? '' : m.medio?.caption ?? m.texto ?? '';
  return { candidatos: texto.trim() ? [texto] : [], voz: false, ilegible: false };
}

async function turnoAsistente(t: Turno, r: Pick<RespuestaAsistente, 'ruta' | 'intencion' | 'latenciaMs' | 'costoUsd' | 'tokens'>, voz: boolean): Promise<void> {
  await t.d.ctx.emite({
    clinica: t.clinica, sujeto: t.sujeto, tipo: 'asistente_turno', conversacion: t.conversacion, modo: voz ? 'voz' : 'texto', ruta: r.ruta, intencion: r.intencion,
    latencia_ms: Math.max(0, Math.round(r.latenciaMs)), costo_usd: r.costoUsd, tokens_entrada: r.tokens?.entrada ?? null, tokens_salida: r.tokens?.salida ?? null, uso_padecimiento: false, canal: 'whatsapp',
  }, `wa-turno|${t.m.wamid}`);
}

/** 1. La urgencia por regla: respuesta fija, sin LLM, aunque el chat este en silencio. */
async function urgencia(t: Turno, candidatos: string[], voz: boolean): Promise<boolean> {
  const c = t.d.ctx.clinica(t.clinica);
  const u = candidatos.map((x) => detectaUrgencia(x, c)).find((x) => x !== null);
  if (!u) return false;
  await envia(t, { tipo: 'texto', texto: u.respuesta });
  await turnoAsistente(t, { ruta: 'urgencia', intencion: 'urgencia', latenciaMs: 0, costoUsd: null, tokens: null }, voz);
  await t.d.ctx.emite({ clinica: t.clinica, sujeto: t.sujeto, tipo: 'urgencia_derivada', conversacion: t.conversacion, regla: u.regla.id, destino: u.regla.destino, canal: 'whatsapp' }, `wa-urgencia|${t.m.wamid}`);
  return true;
}

const FLOW_TEXTOS: Record<FlujoWa, { cuerpo: string; cta: string; pantalla: string }> = {
  agendar: { cuerpo: 'Elige el servicio, el día y la hora. La cita queda apartada cuando tocas «Confirmar cita».', cta: 'Agendar cita', pantalla: 'SERVICIO' },
  reprogramar: { cuerpo: 'Elige el nuevo día y la hora. Tu cita actual sigue apartada hasta que confirmes el cambio.', cta: 'Cambiar mi cita', pantalla: 'CITA' },
  cancelar: { cuerpo: 'Revisa la cita y confirma si quieres cancelarla. Nada se cancela hasta que lo confirmes ahí.', cta: 'Cancelar mi cita', pantalla: 'CITA' },
};

/** Manda el Flow, firmado para ESTE paciente y ESTE numero. Solo a numeros vinculados. */
export async function mandaFlow(t: Turno, flujo: FlujoWa, cita: string | null): Promise<void> {
  if (!t.paciente) return pideVincular(t);
  const flowToken = tokenFlow(t.d.ctx.seudonimos.firma, { clinica: t.clinica, paciente: t.paciente.seudonimo, waId: t.waId, flujo, cita, expira: t.d.ctx.reloj() + VIGENCIA_FLOW_MS });
  const x = FLOW_TEXTOS[flujo];
  await envia(t, { tipo: 'flow', cuerpo: x.cuerpo, cta: x.cta, flujo, flowToken, pantalla: x.pantalla });
}

/** Lo que un numero sin vincular recibe cuando pide algo de SU cuenta: como vincularse, y el portal. */
async function pideVincular(t: Turno): Promise<void> {
  const c = t.d.ctx.clinica(t.clinica);
  const url = t.d.ctx.wa().urlPublica?.(t.clinica) ?? `https://${c.dominio}/clinica/${c.id}`;
  await envia(t, { tipo: 'cta_url', cuerpo: `Para ver o mover tus citas por aquí, primero vincula este WhatsApp desde tu cuenta en el portal de ${c.nombre} («Mis citas» → «Vincular WhatsApp»). También puedes hacerlo todo en el portal.`, textoBoton: 'Abrir el portal', url });
}

/** 4b. «Quiero hablar con alguien»: la recepcion toma el chat (lo ve en su celular) y el asistente calla 12 h. */
export async function pasaARecepcion(t: Turno, texto?: string): Promise<void> {
  const c = t.d.ctx.clinica(t.clinica);
  const chat = await t.d.ctx.almacen.chat(t.clinica, t.waId);
  if (chat) await t.d.ctx.almacen.guardaChat({ ...chat, silenciadoHasta: t.d.ctx.reloj() + SILENCIO_MS, actualizado: t.d.ctx.reloj() });
  await envia(t, { tipo: 'texto', texto: texto ?? `Le aviso a la recepción de ${c.nombre}: te contestan por aquí en horario de atención. Si es urgente, llama al ${c.telefono}.` });
  await t.d.ctx.emite({ clinica: t.clinica, sujeto: t.sujeto, tipo: 'recepcion_atiende', conversacion: t.conversacion, motivo: 'pedido_del_paciente' }, `wa-recepcion|${t.m.wamid}`);
}

async function proximasDe(t: Turno) {
  if (!t.paciente) return [];
  const ahora = t.d.ctx.reloj();
  return (await t.d.ctx.almacen.citas(t.clinica, t.paciente.seudonimo)).filter((x) => x.estado === 'confirmada' && x.fin > ahora).sort((a, b) => a.inicio - b.inicio);
}

/** 3. Un boton firmado: la firma dice que es nuestro; la vinculacion, que la cita es de quien lo toca. */
async function boton(t: Turno, payload: string): Promise<void> {
  const ctx = t.d.ctx;
  const b = leePayload(ctx.seudonimos.firma, t.clinica, payload);
  if (!b) return void (await envia(t, { tipo: 'texto', texto: 'Ese botón ya no es válido. Escribe «mis citas» y te muestro las tuyas.' }));
  if (b.accion === 'recepcion') return pasaARecepcion(t);
  if (b.accion === 'agendar') return mandaFlow(t, 'agendar', null);
  if (!t.paciente) return pideVincular(t);
  if (b.accion === 'mis_citas') return misCitas(t);
  const cita = b.cita ? await ctx.almacen.cita(t.clinica, b.cita) : null;
  if (!cita || cita.paciente !== t.paciente.seudonimo || cita.estado !== 'confirmada' || cita.fin <= ctx.reloj()) {
    return void (await envia(t, { tipo: 'texto', texto: 'Esa cita ya no está activa. Escribe «mis citas» para ver las tuyas.' }));
  }
  const c = ctx.clinica(t.clinica);
  if (b.accion === 'confirma') {
    await ctx.emite({ clinica: t.clinica, sujeto: t.paciente.seudonimo, tipo: 'asistencia_confirmada', cita: cita.id, canal: 'whatsapp' }, `asistencia|${cita.id}`);
    const cuando = fechaEnFrase(cita.inicio, c.zona);
    return void (await envia(t, { tipo: 'texto', texto: `¡Gracias, ${t.paciente.datos.nombre}! Te esperamos el ${cuando} en ${c.direccion}.` }));
  }
  if ((cita.inicio - ctx.reloj()) / HORA_MS < LIMITE_CAMBIO_HORAS) {
    // A menos de 24 h el cambio lo decide una persona: «No podré ir» pasa el chat a la recepcion (lo ve en su celular).
    if (b.accion === 'no_ire') return pasaARecepcion(t, `Gracias por avisarnos, ${t.paciente.datos.nombre}. Como faltan menos de ${LIMITE_CAMBIO_HORAS} horas, la recepción de ${c.nombre} te escribe por aquí para cancelarla o moverla; si prefieres, llama al ${c.telefono}.`);
    return void (await envia(t, { tipo: 'texto', texto: `Faltan menos de ${LIMITE_CAMBIO_HORAS} horas para tu cita: para cambiarla o cancelarla, llama a ${c.nombre} al ${c.telefono}.` }));
  }
  return mandaFlow(t, b.accion === 'reprograma' ? 'reprogramar' : 'cancelar', cita.id);
}

/** «Mis citas» por WhatsApp: SOLO a un numero vinculado. Lleva el servicio porque la persona lo pidio en su chat. */
async function misCitas(t: Turno): Promise<void> {
  const c = t.d.ctx.clinica(t.clinica);
  const citas = await proximasDe(t);
  if (!citas.length) return void (await envia(t, { tipo: 'botones', cuerpo: 'No tienes citas próximas. ¿Quieres agendar una?', botones: [{ id: payloadDe(t.d.ctx.seudonimos.firma, t.clinica, 'agendar', null), titulo: 'Agendar cita' }] }));
  const lista = citas.slice(0, 3).map((x) => `• ${servicioDe(c, x.servicio).nombre}: ${fechaLarga(x.inicio, c.zona)}`).join('\n');
  const prox = citas[0]!;
  const f = (a: AccionWa) => payloadDe(t.d.ctx.seudonimos.firma, t.clinica, a, prox.id);
  await envia(t, { tipo: 'botones', cuerpo: `Tus próximas citas en ${c.nombre}:\n${lista}`, botones: [{ id: f('reprograma'), titulo: 'Cambiar la próxima' }, { id: f('cancela'), titulo: 'Cancelar la próxima' }] });
}

/** 4a. BAJA por WhatsApp (Meta exige respetarla venga por donde venga): retira el consentimiento y desvincula. */
async function baja(t: Turno): Promise<void> {
  const c = t.d.ctx.clinica(t.clinica);
  if (!t.paciente) return void (await envia(t, { tipo: 'texto', texto: `Este número no recibe avisos de ${c.nombre}.` }));
  if ((await vigentes(t.d.ctx, t.clinica, t.paciente.seudonimo)).whatsapp === true) await cambiaConsentimiento(t.d.ctx, t.clinica, t.paciente.usuario, 'whatsapp', false);
  await envia(t, { tipo: 'texto', texto: `Listo: ya no te mandaremos avisos por WhatsApp de ${c.nombre} y este número quedó desvinculado de tu cuenta. Tus citas siguen igual; los avisos por correo, si los tienes, también.` });
}

const TEXTO_ACCION_WA = {
  abrir_agenda: 'Te mando el formulario para elegir día y hora.',
  abrir_mis_citas: '',
  abrir_cancelacion: 'Te mando el formulario para cancelar; nada se cancela hasta que lo confirmes ahí.',
  abrir_reprogramacion: 'Te mando el formulario para cambiar tu cita.',
} as const;

async function conAccion(t: Turno, r: RespuestaAsistente): Promise<void> {
  const a = r.accion!;
  const extra = TEXTO_ACCION_WA[a.tipo];
  const texto = r.ruta === 'enrutador' ? extra : `${r.texto}${extra ? ` ${extra}` : ''}`;
  if (!t.paciente) {
    if (r.ruta !== 'enrutador') await envia(t, { tipo: 'texto', texto: r.texto });
    return pideVincular(t);
  }
  if (a.tipo === 'abrir_mis_citas') return misCitas(t);
  if (texto) await envia(t, { tipo: 'texto', texto });
  await mandaFlow(t, a.tipo === 'abrir_agenda' ? 'agendar' : a.tipo === 'abrir_cancelacion' ? 'cancelar' : 'reprogramar', null);
}

function historial(t: Turno): MensajeCerebro[] {
  const k = `${t.clinica}|${t.waId}`;
  const h = t.memoria.historial.get(k);
  return h && h.hasta > t.d.ctx.reloj() ? h.turnos : [];
}

function recuerda(t: Turno, pregunta: string, respuesta: string): void {
  const turnos = [...historial(t), { rol: 'usuario' as const, texto: pregunta }, { rol: 'asistente' as const, texto: respuesta }].slice(-6);
  t.memoria.historial.set(`${t.clinica}|${t.waId}`, { hasta: t.d.ctx.reloj() + MEMORIA_MS, turnos });
}

/** 6. El asistente del portal, con las citas solo si el numero esta vinculado. */
async function asistente(t: Turno, candidatos: string[], voz: boolean, protegido: boolean): Promise<void> {
  const c = t.d.ctx.clinica(t.clinica);
  const citas = (await proximasDe(t)).map((x) => ({ cuando: fechaLarga(x.inicio, c.zona), servicio: servicioDe(c, x.servicio).nombre }));
  const senal = AbortSignal.timeout(20_000);
  const r = await t.d.asistente(t.clinica, { protegido }).responde({ candidatos, historial: historial(t), citas: t.paciente ? citas : null, padecimiento: null, senal });
  const f = (a: AccionWa) => payloadDe(t.d.ctx.seudonimos.firma, t.clinica, a, null);
  if (r.accion) await conAccion(t, r);
  // El horario dice «usa el botón Agendar cita»: en WhatsApp el boton viaja en el mismo mensaje.
  else if (r.ruta === 'enrutador' && r.intencion === 'horario') await envia(t, { tipo: 'botones', cuerpo: r.texto, botones: [{ id: f('agendar'), titulo: 'Agendar cita' }] });
  // Lo que no se entendio o no se pudo contestar lleva SIEMPRE la salida a una persona (politica de Meta: escalado claro).
  else if (r.ruta === 'barrera' && (r.intencion === 'conversacion' || r.intencion === 'error')) await envia(t, { tipo: 'botones', cuerpo: r.texto, botones: [{ id: f('agendar'), titulo: 'Agendar cita' }, { id: f('recepcion'), titulo: 'Hablar con alguien' }] });
  else await envia(t, { tipo: 'texto', texto: r.texto });
  recuerda(t, candidatos[0] ?? '', r.texto);
  await turnoAsistente(t, r, voz);
}

const FOTO = (c: { nombre: string }) => `Gracias por la foto. Por mensaje no podemos valorar tu caso ni guardar imágenes: eso lo hace el dentista en consulta. Si quieres, escribe «agendar» para una valoración en ${c.nombre}. Si tienes fiebre, hinchazón que crece o sangrado que no para, dímelo.`;

/**
 * La primera vez que el asistente contesta en un chat se presenta: en WhatsApp los mensajes llegan del numero de la
 * clinica y la persona puede creer que le escribe alguien de la recepcion (opacidad, AISIA). Y dice como pasar con una
 * persona: Meta pide una salida clara y directa a un humano.
 */
async function presenta(t: Turno): Promise<void> {
  if (t.presentado) return;
  const c = t.d.ctx.clinica(t.clinica);
  await envia(t, { tipo: 'texto', texto: `Hola, soy el asistente automático de ${c.nombre} en WhatsApp: no soy una persona y no doy diagnósticos. Para hablar con alguien de la clínica, escribe «quiero hablar con alguien».` });
  const chat = await t.d.ctx.almacen.chat(t.clinica, t.waId);
  if (chat) await t.d.ctx.almacen.guardaChat({ ...chat, presentado: true, actualizado: t.d.ctx.reloj() });
  t.presentado = true;
}

/** 5 y 6. Lo que no fue boton, urgencia ni silencio: medios, codigo, baja, recepcion o el asistente. */
async function contenido(t: Turno, txt: { candidatos: string[]; voz: boolean; ilegible: boolean }, protegido: boolean): Promise<ManejoWa> {
  const c = t.d.ctx.clinica(t.clinica);
  const fija = async (texto: string, manejo: ManejoWa): Promise<ManejoWa> => {
    await envia(t, { tipo: 'texto', texto });
    return manejo;
  };
  if (t.m.medio) await presenta(t);
  if (t.m.medio?.clase === 'image') return fija(FOTO(c), 'foto');
  if (t.m.medio && t.m.medio.clase !== 'audio') return fija('Por aquí solo puedo leer mensajes de texto y notas de voz. ¿Me lo escribes?', 'otro_medio');
  if (txt.voz && txt.ilegible) return fija(`No alcancé a entender tu nota de voz. ¿Me lo escribes? Si es una urgencia, llama al 911 o a ${c.nombre} al ${c.telefono}.`, 'nota_voz_ilegible');
  const texto = txt.candidatos[0] ?? '';
  if (!txt.voz && reCodigoVinculo.test(texto)) return fija((await recibeCodigo(t.d.ctx, t.clinica, t.waId, texto)).respuesta, 'vinculacion');
  if (!BAJA.test(normaliza(texto)) && !PERSONA.test(normaliza(texto))) await presenta(t);
  if (BAJA.test(normaliza(texto))) {
    await baja(t);
    return 'baja';
  }
  if (PERSONA.test(normaliza(texto))) {
    await pasaARecepcion(t);
    return 'recepcion';
  }
  if (!t.paciente && pideCita(texto)) {
    await pideVincular(t);
    return 'vinculacion';
  }
  if (!texto.trim()) return fija('No recibí texto. ¿Me escribes tu pregunta?', 'otro_medio');
  await asistente(t, txt.candidatos, txt.voz, protegido);
  return 'asistente';
}

/** Un mensaje entrante, de punta a punta. El receptor ya verifico la firma y que no se haya procesado antes. */
export async function atiendeMensaje(d: DepsEntrada, m: EntranteWa, clinica: string, memoria: MemoriaEntrada): Promise<ManejoWa> {
  const ctx = d.ctx;
  const waId = m.waId;
  const paciente = await pacientePorWaId(ctx, clinica, waId);
  const conversacion = idDeClave('cnv', `wa|${clinica}|${waId || m.usuarioId}`);
  const t: Turno = { d, m, clinica, waId, conversacion, paciente, sujeto: paciente?.seudonimo ?? visitanteWa(ctx, clinica, waId || `bsuid|${m.usuarioId}`), memoria, presentado: false };
  // Solo BSUID (nombre de usuario, 2026): no hay a que numero contestar todavia; lo ve la recepcion en su app.
  if (!waId) {
    await anota(t, tipoDe(m), 'recepcion');
    return 'recepcion';
  }
  const previo = await ctx.almacen.chat(clinica, waId);
  const chat = previo ?? { clinica, waId, conversacion, ultimoEntrante: null, silenciadoHasta: null, actualizado: 0 };
  await ctx.almacen.guardaChat({ ...chat, ultimoEntrante: Math.max(chat.ultimoEntrante ?? 0, m.instante), actualizado: ctx.reloj() });
  t.presentado = chat.presentado === true;
  const f = frontera(t);
  const txt = await textosDe(t);
  const manejo = await decide(t, txt, f, chat.silenciadoHasta);
  await anota(t, tipoDe(m), manejo);
  return manejo;
}

async function decide(t: Turno, txt: { candidatos: string[]; voz: boolean; ilegible: boolean }, f: { contacto: boolean; protegido: boolean }, silenciadoHasta: number | null): Promise<ManejoWa> {
  if (await urgencia(t, txt.candidatos, txt.voz)) return 'asistente';
  if (f.contacto) return 'frontera';
  if (silenciadoHasta !== null && silenciadoHasta > t.d.ctx.reloj()) return 'silenciado';
  const payload = t.m.boton?.payload ?? (t.m.interactivo && t.m.interactivo.tipo !== 'flow' ? t.m.interactivo.id : null);
  if (payload) {
    await boton(t, payload);
    return 'boton';
  }
  if (t.m.interactivo?.tipo === 'flow') return 'flow';
  return contenido(t, txt, f.protegido);
}
