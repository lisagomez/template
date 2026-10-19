/**
 * El ENDPOINT DE DATOS de los Flows (agendar, reprogramar, cancelar). WhatsApp lo llama en cada pantalla, cifrado
 * (RSA-OAEP + AES-128-GCM) y firmado (`X-Hub-Signature-256`); el cifrado se inyecta (el de ventas-whatsapp en el
 * laboratorio). Codigos de Meta: 432 firma, 421 no se pudo descifrar, 427 `flow_token` invalido (deshabilita el
 * boton). Meta da 10 s por respuesta: aqui todo es local (la agenda y el portal), sin red.
 *
 * QUIEN actua sale del `flow_token` firmado Y de que ese numero SIGA vinculado a ese paciente; el payload solo trae
 * elecciones (servicio, dia, hora, cita), que se validan: un servicio de otra clinica no existe, una cita ajena no
 * se encuentra. La cita la reserva, mueve o cancela el portal, con sus reglas (sin dobles reservas, 24 h de aviso).
 */
import { createHash } from 'node:crypto';
import { pesos, servicio as servicioDe } from '../clinicas.js';
import type { Paciente } from '../almacen.js';
import { ErrorPortal, HORA_MS, type Contexto } from '../portal/contexto.js';
import { cancela, LIMITE_CAMBIO_HORAS, reprograma, reserva } from '../portal/citas.js';
import { fechaEnFrase, fechaLarga } from '../portal/plantillas.js';
import { leeTokenFlow, type DatosFlow } from './firma.js';
import { mismoTelefono } from './numero.js';

export interface CifradoFlows {
  /** Descifra la peticion; `null` si no se puede (→ 421). `responde` cifra la respuesta con la llave de ESA peticion. */
  abre(cuerpoCrudo: string): { datos: unknown; responde(r: unknown): string } | null;
}

export interface DepsEndpointFlows {
  ctx: Contexto;
  verificaFirma(cuerpoCrudo: string, firma: string | null | undefined): boolean;
  cifrado: CifradoFlows;
}

type Pantalla = { screen: string; data: Record<string, unknown> };
const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const corta = (s: string, n: number) => ([...s].length > n ? `${[...s].slice(0, n - 1).join('')}…` : s);
const DIAS_VISIBLES = 14;

interface Turno { ctx: Contexto; tok: DatosFlow; p: Paciente; idem: string }

const conError = (screen: string, data: Record<string, unknown>, error: string): Pantalla => ({ screen, data: { ...data, error, hay_error: error !== '' } });

async function pantallaDias(t: Turno, servicio: string, cita: string, error = ''): Promise<Pantalla> {
  const c = t.ctx.clinica(t.tok.clinica);
  const s = servicioDe(c, servicio);
  const ahora = t.ctx.reloj();
  const dias = (await t.ctx.agenda(c.id).dias(s.id, ahora, ahora + DIAS_VISIBLES * 24 * HORA_MS)).slice(0, 30);
  const titulo = (f: string) => corta(new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(Date.parse(f) + 12 * HORA_MS)), 30);
  const err = dias.length ? error : 'No hay horarios en las próximas dos semanas. Llama a la clínica.';
  return conError('DIA', { servicio: s.id, cita, resumen: `${s.nombre} · ${s.duracionMin} min · ${pesos(s.precioMxn)}`, dias: dias.map((d) => ({ id: d.fecha, title: titulo(d.fecha) })) }, err);
}

async function pantallaHoras(t: Turno, servicio: string, cita: string, dia: string, error = ''): Promise<Pantalla> {
  const c = t.ctx.clinica(t.tok.clinica);
  const s = servicioDe(c, servicio);
  const dias = await t.ctx.agenda(c.id).dias(s.id, t.ctx.reloj(), t.ctx.reloj() + DIAS_VISIBLES * 24 * HORA_MS);
  const horas = (dias.find((d) => d.fecha === dia)?.horas ?? []).slice(0, 200).map((h) => ({ id: h.inicio, title: h.hora }));
  return conError('HORA', { servicio: s.id, cita, resumen: `${s.nombre} · ${dia}`, horas }, horas.length ? error : 'Ese día ya no tiene horarios. Regresa y elige otro.');
}

/** Las citas que la persona puede cambiar o cancelar por aqui: confirmadas y con 24 h o mas por delante. */
async function citasCambiables(t: Turno) {
  const ahora = t.ctx.reloj();
  return (await t.ctx.almacen.citas(t.tok.clinica, t.p.seudonimo)).filter((x) => x.estado === 'confirmada' && (x.inicio - ahora) / HORA_MS >= LIMITE_CAMBIO_HORAS).sort((a, b) => a.inicio - b.inicio);
}

async function resumenCita(t: Turno, id: string): Promise<string | null> {
  const cita = (await citasCambiables(t)).find((x) => x.id === id);
  if (!cita) return null;
  const c = t.ctx.clinica(t.tok.clinica);
  return `${servicioDe(c, cita.servicio).nombre} el ${fechaEnFrase(cita.inicio, c.zona)}`;
}

async function inicial(t: Turno): Promise<Pantalla> {
  const c = t.ctx.clinica(t.tok.clinica);
  if (t.tok.flujo === 'agendar') return conError('SERVICIO', { servicios: c.servicios.map((s) => ({ id: s.id, title: corta(s.nombre, 30), description: `${s.duracionMin} min · ${pesos(s.precioMxn)}` })) }, '');
  if (t.tok.cita) {
    const resumen = await resumenCita(t, t.tok.cita);
    if (resumen && t.tok.flujo === 'cancelar') return conError('CANCELA', { cita: t.tok.cita, resumen }, '');
    const cita = await t.ctx.almacen.cita(t.tok.clinica, t.tok.cita);
    if (resumen && cita) return pantallaDias(t, cita.servicio, cita.id);
  }
  const citas = (await citasCambiables(t)).map((x) => ({ id: x.id, title: corta(`${servicioDe(c, x.servicio).nombre}`, 30), description: fechaLarga(x.inicio, c.zona) }));
  return conError('CITA', { citas }, citas.length ? '' : `No tienes citas que se puedan cambiar por aquí (faltan menos de ${LIMITE_CAMBIO_HORAS} h o no hay). Llama a ${c.nombre} al ${c.telefono}.`);
}

const exito = (params: Record<string, unknown>): Pantalla => ({ screen: 'SUCCESS', data: { extension_message_response: { params } } });

async function confirmaFlujo(t: Turno, d: Record<string, unknown>): Promise<Pantalla> {
  const servicio = str(d['servicio']);
  const hora = str(d['hora']);
  const cita = str(d['cita']);
  if (d['confirma'] !== true && d['confirma'] !== 'true') return pantallaHoras(t, servicio, cita, hora.slice(0, 10), 'Toca «Confirmar» para apartar la cita.');
  const clave = `wa-flow|${t.idem}`;
  const r = t.tok.flujo === 'reprogramar'
    ? await reprograma(t.ctx, t.tok.clinica, t.p.usuario, cita, hora, clave, 'whatsapp')
    : await reserva(t.ctx, { clinica: t.tok.clinica, usuario: t.p.usuario, servicio, inicio: hora, canales: ['whatsapp'], newsletter: false, clave, via: 'whatsapp' });
  if (!r.ok) {
    const dia = new Intl.DateTimeFormat('en-CA', { timeZone: t.ctx.clinica(t.tok.clinica).zona }).format(new Date(hora));
    return pantallaHoras(t, servicio, cita, dia, r.motivo === 'ocupado' ? 'Alguien acaba de tomar ese horario. Elige otro.' : r.detalle);
  }
  const c = t.ctx.clinica(t.tok.clinica);
  return exito({ cita: r.cita.id, resumen: `${servicioDe(c, r.cita.servicio).nombre} el ${fechaEnFrase(r.cita.inicio, c.zona)}` });
}

async function cancelaFlujo(t: Turno, d: Record<string, unknown>): Promise<Pantalla> {
  const cita = str(d['cita']);
  const resumen = await resumenCita(t, cita);
  if (!resumen) return conError('CITA', { citas: [] }, 'Esa cita ya no se puede cancelar por aquí. Llama a la clínica.');
  if (d['seguro'] !== true && d['seguro'] !== 'true') return conError('CANCELA', { cita, resumen }, 'Marca la casilla para confirmar que quieres cancelarla.');
  await cancela(t.ctx, t.tok.clinica, t.p.usuario, cita, 'whatsapp');
  return exito({ cita, cancelada: true, resumen });
}

async function siguiente(t: Turno, screen: string, d: Record<string, unknown>): Promise<Pantalla> {
  const cita = str(d['cita']);
  if (screen === 'SERVICIO') return pantallaDias(t, str(d['servicio']), '');
  if (screen === 'CITA') {
    const resumen = await resumenCita(t, cita);
    if (!resumen) return inicial({ ...t, tok: { ...t.tok, cita: null } });
    if (t.tok.flujo === 'cancelar') return conError('CANCELA', { cita, resumen }, '');
    return pantallaDias(t, (await t.ctx.almacen.cita(t.tok.clinica, cita))!.servicio, cita);
  }
  if (screen === 'DIA') return pantallaHoras(t, str(d['servicio']), cita, str(d['dia']));
  if (screen === 'HORA') {
    const c = t.ctx.clinica(t.tok.clinica);
    const hora = str(d['hora']);
    const s = servicioDe(c, str(d['servicio']));
    if (Number.isNaN(Date.parse(hora))) return pantallaHoras(t, s.id, cita, '', 'Elige una hora de la lista.');
    const verbo = t.tok.flujo === 'reprogramar' ? 'Tu cita cambia a' : 'Vas a agendar';
    return conError('CONFIRMA', { servicio: s.id, cita, hora, resumen: `${verbo}: ${s.nombre}, el ${fechaEnFrase(Date.parse(hora), c.zona)}. ${c.direccion}.` }, '');
  }
  if (screen === 'CONFIRMA') return confirmaFlujo(t, d);
  if (screen === 'CANCELA') return cancelaFlujo(t, d);
  return { screen, data: { error: 'Pantalla desconocida.', hay_error: true } };
}

/** El token vale si la firma cuadra, no vencio y el numero SIGUE vinculado a ese paciente. */
async function turnoDe(ctx: Contexto, token: string, idem: string): Promise<Turno | null> {
  const tok = leeTokenFlow(ctx.seudonimos.firma, token, ctx.reloj());
  if (!tok) return null;
  const p = await ctx.almacen.pacientePorSeudonimo(tok.clinica, tok.paciente);
  if (!p?.whatsapp?.waId || !mismoTelefono(p.whatsapp.waId, tok.waId)) return null;
  return { ctx, tok, p, idem };
}

/** Atiende una peticion cruda del endpoint. Devuelve el status y el cuerpo (cifrado, en texto). */
export async function atiendeEndpointFlows(d: DepsEndpointFlows, cuerpoCrudo: string, firma: string | null | undefined): Promise<{ status: number; cuerpo: string }> {
  if (!d.verificaFirma(cuerpoCrudo, firma)) return { status: 432, cuerpo: '' };
  const abierta = d.cifrado.abre(cuerpoCrudo);
  if (!abierta) return { status: 421, cuerpo: '' };
  const p = obj(abierta.datos);
  const responde = (r: unknown) => ({ status: 200, cuerpo: abierta.responde(r) });
  const accion = str(p['action']);
  if (accion === 'ping') return responde({ data: { status: 'active' } });
  const datos = obj(p['data']);
  if (datos['error'] !== undefined) return responde({ data: { acknowledged: true } });
  const token = str(p['flow_token']);
  // La misma peticion repetida (Meta reintenta) da la misma clave: reservar dos veces no aparta dos sillones.
  const t = await turnoDe(d.ctx, token, createHash('sha256').update(`${token}|${JSON.stringify(datos)}|${str(p['screen'])}`).digest('hex').slice(0, 24));
  if (!t) return { status: 427, cuerpo: '' };
  try {
    const r = accion === 'INIT' || accion === 'BACK' ? await inicial(t) : accion === 'data_exchange' ? await siguiente(t, str(p['screen']), datos) : { screen: '', data: { error: 'acción desconocida' } };
    if (r.screen === 'SUCCESS') (r.data['extension_message_response'] as { params: Record<string, unknown> }).params['flow_token'] = token;
    return responde(r);
  } catch (e) {
    // Un servicio de otra clinica, una cita que no es suya, una hora que ya no existe: pantalla con el motivo, nunca un 500.
    const mensaje = e instanceof ErrorPortal ? e.message : 'No pudimos con eso. Intenta de nuevo o llama a la clínica.';
    return responde(conError(str(p['screen']) || 'CITA', { citas: [] }, mensaje));
  }
}
