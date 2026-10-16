/**
 * El despachador de avisos, la baja de un clic y la vinculacion de Telegram.
 *
 * `despacha(ahora)` se puede correr las veces que sea, incluso dos a la vez: va en una cola y un aviso
 * `entregado` no se vuelve a mandar. El correo, ademas, lleva `Message-ID` estable (el buzon no guarda dos).
 */
import type { Aviso, Paciente } from '../almacen.js';
import { enlaceProfundo, type ActualizacionBot } from '../canales/telegram.js';
import { idDeClave } from '../seudonimo.js';
import { vigentes, type Contexto } from './contexto.js';
import { cancelaAvisos } from './avisos.js';
import { enviaAviso } from './envio.js';
import { cambiaConsentimiento } from './registro.js';

export interface ResumenDespacho { revisados: number; entregados: number; fallidos: number; reintentos: number; cancelados: number }

const vacio = (): ResumenDespacho => ({ revisados: 0, entregados: 0, fallidos: 0, reintentos: 0, cancelados: 0 });
const pendiente = (a: Aviso, ahora: number) => a.estado === 'programado' && a.para <= ahora && a.proximoIntento <= ahora;

/**
 * Un aviso de Telegram que espera a que el paciente inicie el chat NO se da por perdido al despachar: la app despacha
 * justo después de reservar, antes de que la persona abra el enlace. Se pierde solo cuando ya no serviría: la
 * confirmación, al empezar la cita; un recordatorio, a su hora.
 */
async function venceSinVinculo(ctx: Contexto, a: Aviso, ahora: number): Promise<boolean> {
  if (a.estado !== 'esperando_vinculo') return false;
  if (a.clase !== 'confirmacion') return a.para <= ahora;
  const cita = a.cita ? await ctx.almacen.cita(a.clinica, a.cita) : null;
  return (cita?.inicio ?? a.para) <= ahora;
}

async function sigueValido(ctx: Contexto, p: Paciente, a: Aviso): Promise<boolean> {
  const c = await vigentes(ctx, p.clinica, p.seudonimo);
  if (a.clase === 'newsletter') return c.newsletter === true;
  if (a.canal === 'telegram' && c.telegram !== true) return false;
  return c.recordatorios === true || a.clase === 'cancelacion';
}

async function despachaUno(ctx: Contexto, a: Aviso, ahora: number, r: ResumenDespacho): Promise<void> {
  r.revisados++;
  const p = await ctx.almacen.pacientePorSeudonimo(a.clinica, a.paciente);
  if (!p) return;
  if (!(await sigueValido(ctx, p, a))) {
    await cancelaAvisos(ctx, a.clinica, a.paciente, (x) => x.id === a.id, a.clase === 'newsletter' ? 'baja' : 'consentimiento_retirado');
    r.cancelados++;
    return;
  }
  const intento = a.intentos + 1;
  await ctx.almacen.guardaAviso({ ...a, estado: 'enviando', intentos: intento, actualizado: ahora });
  const base = { clinica: a.clinica, sujeto: a.paciente, aviso: a.id, canal: a.canal, clase: a.clase } as const;
  let envio;
  try {
    envio = await enviaAviso(ctx, p, a);
  } catch {
    // Resultado desconocido (el transporte se cayo a media llamada): NO se reintenta solo, para no mandar dos.
    await ctx.almacen.guardaAviso({ ...a, estado: 'incierto', intentos: intento, motivo: 'resultado desconocido', actualizado: ahora });
    await ctx.emite({ ...base, tipo: 'aviso_fallido', motivo: 'otro', definitivo: true }, `fallido|${a.id}|${intento}`);
    r.fallidos++;
    return;
  }
  if (envio.ok) {
    await ctx.almacen.guardaAviso({ ...a, estado: 'entregado', intentos: intento, motivo: null, actualizado: ahora });
    await ctx.emite({ ...base, tipo: 'aviso_enviado', intento }, `enviado|${a.id}`);
    const costo = ctx.clinica(a.clinica).supuestos[a.canal === 'correo' ? 'costoCorreoUsd' : 'costoTelegramUsd'].valor;
    await ctx.emite({ ...base, tipo: 'aviso_entregado', costo_usd: costo }, `entregado|${a.id}`);
    r.entregados++;
    return;
  }
  const definitivo = envio.definitivo;
  await ctx.almacen.guardaAviso({ ...a, estado: definitivo ? 'fallido' : 'programado', intentos: intento, motivo: envio.motivo, proximoIntento: ahora + (envio.esperaMs ?? 60_000), actualizado: ahora });
  await ctx.emite({ ...base, tipo: 'aviso_fallido', motivo: envio.motivo, definitivo }, `fallido|${a.id}|${intento}`);
  if (definitivo) r.fallidos++;
  else r.reintentos++;
}

export function creaDespachador(ctx: Contexto) {
  let cola: Promise<unknown> = Promise.resolve();
  return function despacha(ahora = ctx.reloj()): Promise<ResumenDespacho> {
    const corrida = cola.catch(() => undefined).then(async () => {
      const r = vacio();
      for (const c of ctx.clinicas) {
        const todos = await ctx.almacen.avisos(c.id);
        for (const a of todos) if (await venceSinVinculo(ctx, a, ahora)) await despachaUno(ctx, { ...a, estado: 'programado' }, ahora, r);
        const due = todos.filter((a) => pendiente(a, ahora)).sort((x, y) => x.para - y.para);
        for (const a of due) await despachaUno(ctx, a, ahora, r);
      }
      return r;
    });
    cola = corrida;
    return corrida;
  };
}

/** Baja de un clic (RFC 8058): el token basta, sin sesion ni pasos extra. Idempotente. */
export async function bajaPorToken(ctx: Contexto, token: string, via: 'un_clic' | 'enlace'): Promise<{ ok: boolean; clinica?: string }> {
  const t = await ctx.almacen.token(token);
  if (!t || t.tipo !== 'baja') return { ok: false };
  const p = await ctx.almacen.pacientePorSeudonimo(t.clinica, t.paciente);
  if (!p) return { ok: false };
  await cambiaConsentimiento(ctx, p.clinica, p.usuario, 'newsletter', false, via);
  return { ok: true, clinica: p.clinica };
}

const VIGENCIA_ENLACE_MS = 24 * 3_600_000;

/** El deep link de un solo uso para vincular Telegram (el bot no puede escribir primero). */
export async function enlaceTelegram(ctx: Contexto, clinica: string, usuario: string): Promise<{ enlace: string; expira: number }> {
  const p = await ctx.exigePaciente(clinica, usuario);
  const ahora = ctx.reloj();
  const id = idDeClave('tok', `telegram|${clinica}|${p.seudonimo}|${ahora}|${Math.random()}`);
  await ctx.almacen.guardaToken({ id, clinica, paciente: p.seudonimo, tipo: 'telegram', creado: ahora, expira: ahora + VIGENCIA_ENLACE_MS, usado: null });
  return { enlace: enlaceProfundo(ctx.clinica(clinica).botTelegram, id), expira: ahora + VIGENCIA_ENLACE_MS };
}

export type Vinculacion = { ok: true; paciente: string } | { ok: false; motivo: 'no-es-start' | 'token-invalido' | 'token-usado' | 'token-vencido' };

/** Lo que el bot recibe: `/start <token>`. Un token vale UNA vez y caduca; el chat queda ligado al paciente. */
export async function procesaActualizacion(ctx: Contexto, clinica: string, u: ActualizacionBot): Promise<Vinculacion> {
  const m = /^\/start ([A-Za-z0-9_-]{1,64})$/.exec(u.message.text ?? '');
  if (!m?.[1]) return { ok: false, motivo: 'no-es-start' };
  const t = await ctx.almacen.token(m[1]);
  const canal = ctx.telegram(clinica);
  const chat = u.message.chat.id;
  const responde = (texto: string) => canal.texto(chat, texto);
  if (!t || t.tipo !== 'telegram' || t.clinica !== clinica) {
    await responde('Ese enlace no es válido. Pide uno nuevo desde el portal de tu clínica.');
    return { ok: false, motivo: 'token-invalido' };
  }
  const ahora = ctx.reloj();
  if (t.usado !== null) {
    await responde('Ese enlace ya se usó. Si no fuiste tú, avísale a la clínica y pide uno nuevo desde el portal.');
    return { ok: false, motivo: 'token-usado' };
  }
  if (t.expira !== null && t.expira < ahora) {
    await responde('Ese enlace caducó. Pide uno nuevo desde el portal.');
    return { ok: false, motivo: 'token-vencido' };
  }
  await ctx.almacen.guardaToken({ ...t, usado: ahora });
  const p = await ctx.almacen.pacientePorSeudonimo(clinica, t.paciente);
  if (!p) return { ok: false, motivo: 'token-invalido' };
  await ctx.almacen.guardaPaciente({ ...p, telegram: { chatId: chat, vinculadoEn: ahora } });
  if ((await vigentes(ctx, clinica, p.seudonimo)).telegram !== true) await cambiaConsentimiento(ctx, clinica, p.usuario, 'telegram', true);
  await ctx.emite({ clinica, sujeto: p.seudonimo, tipo: 'telegram_vinculado' }, `telegram|${p.seudonimo}|${t.id}`);
  for (const a of await ctx.almacen.avisos(clinica, p.seudonimo)) {
    if (a.estado === 'esperando_vinculo') await ctx.almacen.guardaAviso({ ...a, estado: 'programado', actualizado: ahora });
  }
  await responde(`¡Listo! Aquí te avisaremos de tus citas en ${ctx.clinica(clinica).nombre}. Puedes desactivarlo cuando quieras desde el portal.`);
  return { ok: true, paciente: p.seudonimo };
}
