/**
 * El endpoint de datos de los Flows dinámicos (entrega, checkout y reserva). Meta lo llama en cada
 * pantalla; aquí se descifra, se valida el `flow_token`, se pide a los dominios por A2A y se
 * responde cifrado. Códigos: 421 si no se puede descifrar (verificado en la guía el 2026-09-30);
 * 427 si el `flow_token` no es válido y 432 si la firma no cuadra (tabla «Business endpoint error
 * codes» de Meta; no releída el 30/09).
 */
import { createHash, type KeyLike } from 'node:crypto';
import { esObjeto, texto } from '../comun/base.js';
import { verificaFirmaMeta } from '../meta/firma.js';
import { artefacto, type BusA2A } from '../agente/a2a-modelo.js';
import { formatoPrecio } from '../agente/modelos.js';
import type { Inquilino } from '../modelo.js';
import { cifraRespuesta, descifraPeticion, type PeticionCifrada } from './cifrado.js';
import { leeTokenFlow, type DatosTokenFlow } from './token.js';
import { diaLocal } from '../dominios/citas.js';
import { DIA } from '../comun/base.js';

export interface OpcionesEndpointFlows {
  secretoApp: string;
  secretoTokens: string;
  llavePrivada: KeyLike;
  reloj: () => number;
  inquilino: (id: string) => Promise<Inquilino | undefined>;
  bus: BusA2A;
}

type Respuesta = Record<string, unknown>;
const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function zonas(i: Inquilino) {
  return (i.politicas.cobertura ?? []).map((c) => ({ id: c.zona, title: `${c.zona} · ${formatoPrecio(c.costoCentavos)} · ${c.minutos} min` }));
}

async function pantallaInicial(tipo: DatosTokenFlow['f'], i: Inquilino, ahora: number): Promise<Respuesta> {
  if (tipo === 'entrega') {
    return { screen: 'ENTREGA', data: { zonas: zonas(i), horarios: [{ id: 'lo-antes-posible', title: 'Lo antes posible' }, { id: '19:00-20:00', title: 'Entre 7 y 8 pm' }, { id: '20:00-21:00', title: 'Entre 8 y 9 pm' }], error: '' } };
  }
  if (tipo === 'checkout') return { screen: 'ENVIO', data: { zonas: zonas(i), error: '' } };
  const conf = i.politicas.citas;
  const servicios = (conf?.servicios ?? []).map((s) => ({ id: s.id, title: s.nombre }));
  const dias: Array<{ id: string; title: string }> = [];
  for (let d = 0; d < 10 && dias.length < 5; d++) {
    const ms = ahora + d * DIA;
    const dia = diaLocal(ms);
    const semana = new Date(Date.parse(dia) + DIA / 2).getUTCDay();
    if (conf?.diasAbiertos.includes(semana)) dias.push({ id: dia, title: `${DIAS_SEMANA[semana]} ${Number(dia.slice(8))}` });
  }
  return { screen: 'DIA', data: { servicios, dias } };
}

async function intercambio(tok: DatosTokenFlow, pantalla: string, datos: Record<string, unknown>, o: OpcionesEndpointFlows, i: Inquilino, idem: string): Promise<Respuesta> {
  const base = { tenant: tok.t, contextId: `ctx_${tok.c}` };
  if ((pantalla === 'ENTREGA' || pantalla === 'ENVIO') && tok.p) {
    const recoger = datos.recoger === true || datos.recoger === 'true';
    const t = await o.bus.envia('pedidos', {
      ...base, skill: 'agregar_entrega', messageId: idem,
      datos: { pedidoId: tok.p, zona: texto(datos.zona) ?? '', direccion: texto(datos.direccion) ?? '', horario: texto(datos.horario) ?? '', recoger, ...(texto(datos.rfc) ? { rfc: texto(datos.rfc), razonSocial: texto(datos.razon_social) ?? '' } : {}) },
    });
    if (t.estado !== 'TASK_STATE_COMPLETED') {
      return { screen: pantalla, data: { zonas: zonas(i), ...(pantalla === 'ENTREGA' ? { horarios: [{ id: 'lo-antes-posible', title: 'Lo antes posible' }] } : {}), error: t.motivo === 'sin cobertura' ? 'Todavía no llegamos a esa zona. Elige otra o marca «recoger».' : 'No pudimos guardar tus datos. Intenta de nuevo.' } };
    }
    const p = artefacto(t, 'pedido') as { id: string; items: Array<{ nombre: string; cantidad: number }>; envioCentavos: number; totalCentavos: number };
    const resumen = `${p.items.map((x) => `${x.cantidad} × ${x.nombre}`).join(', ')} · Envío ${formatoPrecio(p.envioCentavos)} · Total ${formatoPrecio(p.totalCentavos)}`;
    return { screen: 'RESUMEN', data: { resumen, pedido_id: p.id } };
  }
  if (pantalla === 'RESUMEN') {
    return { screen: 'SUCCESS', data: { extension_message_response: { params: { flow_token: '', pedido_id: tok.p ?? '' } } } };
  }
  if (pantalla === 'DIA') {
    const t = await o.bus.envia('citas', { ...base, skill: 'disponibilidad', messageId: idem, datos: { servicioId: texto(datos.servicio) ?? '', dia: texto(datos.dia) ?? '' } });
    const d = artefacto(t, 'disponibilidad') as { dias: Array<{ horarios: Array<{ inicio: number; hora: string }> }> };
    const horarios = (d.dias[0]?.horarios ?? []).map((h) => ({ id: String(h.inicio), title: h.hora }));
    return { screen: 'HORA', data: { horarios, servicio: texto(datos.servicio) ?? '', error: horarios.length ? '' : 'Ese día ya no hay mesas. Regresa y elige otro.' } };
  }
  if (pantalla === 'HORA') {
    const t = await o.bus.envia('citas', { ...base, skill: 'reservar', messageId: idem, datos: { servicioId: texto(datos.servicio) ?? '', inicio: Number(texto(datos.inicio) ?? datos.inicio), conversacionId: tok.c, waId: tok.w } });
    if (t.estado !== 'TASK_STATE_COMPLETED') {
      return { screen: 'HORA', data: { horarios: [], servicio: texto(datos.servicio) ?? '', error: 'Alguien acaba de apartar ese horario. Regresa y elige otro.' } };
    }
    const c = artefacto(t, 'cita') as { id: string; servicio: string; dia: string; hora: string };
    return { screen: 'SUCCESS', data: { extension_message_response: { params: { flow_token: '', cita_id: c.id, resumen: `${c.servicio} el ${c.dia} a las ${c.hora}` } } } };
  }
  return { screen: pantalla, data: { error: 'Pantalla desconocida.' } };
}

/** Atiende una petición cruda del endpoint de datos. Devuelve el status y el cuerpo (texto). */
export async function atiendeEndpointFlows(cuerpoCrudo: string, firma: string | null | undefined, o: OpcionesEndpointFlows): Promise<{ status: number; cuerpo: string }> {
  if (!verificaFirmaMeta(o.secretoApp, cuerpoCrudo, firma)) return { status: 432, cuerpo: '' };
  let p: PeticionCifrada;
  let claro: { datos: unknown; llaveAes: Buffer; iv: Buffer };
  try {
    p = JSON.parse(cuerpoCrudo) as PeticionCifrada;
    claro = descifraPeticion(p, o.llavePrivada);
  } catch {
    return { status: 421, cuerpo: '' };
  }
  const responde = (r: Respuesta) => ({ status: 200, cuerpo: cifraRespuesta(r, claro.llaveAes, claro.iv) });
  const d = esObjeto(claro.datos) ? claro.datos : {};
  const accion = texto(d.action) ?? '';
  if (accion === 'ping') return responde({ data: { status: 'active' } });
  const datos = esObjeto(d.data) ? d.data : {};
  if (datos.error !== undefined) return responde({ data: { acknowledged: true } });
  const token = texto(d.flow_token) ?? '';
  const tok = leeTokenFlow(o.secretoTokens, token, o.reloj());
  if (!tok) return { status: 427, cuerpo: '' };
  const inquilino = await o.inquilino(tok.t);
  if (!inquilino) return { status: 427, cuerpo: '' };
  if (accion === 'INIT' || accion === 'BACK') return responde(await pantallaInicial(tok.f, inquilino, o.reloj()));
  if (accion !== 'data_exchange') return responde({ data: { error: 'acción desconocida' } });
  const idem = `flow:${createHash('sha256').update(cuerpoCrudo).digest('hex').slice(0, 24)}`;
  const r = await intercambio(tok, texto(d.screen) ?? '', datos, o, inquilino, idem);
  // El `flow_token` vuelve en los parámetros del cierre: así el `nfm_reply` se ata a su conversación.
  if (r.screen === 'SUCCESS' && esObjeto(r.data) && esObjeto(r.data.extension_message_response) && esObjeto(r.data.extension_message_response.params)) {
    r.data.extension_message_response.params.flow_token = token;
  }
  return responde(r);
}
