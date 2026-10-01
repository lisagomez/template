/**
 * El BSP propio (N-02): dar de alta una pyme en NUESTRA plataforma por Embedded Signup, sin pasar por
 * un BSP ajeno. Sigue la documentación consultada el 2026-09-30:
 *  - el evento de sesión `WA_EMBEDDED_SIGNUP` (FINISH, FINISH_ONLY_WABA,
 *    FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING, CANCEL con `current_step`, ERROR) trae `waba_id`,
 *    `phone_number_id`, `business_id` y, si la pyme los eligió, `dataset_ids` y `catalog_ids`;
 *  - el código canjeable vive **30 segundos**: `GET /oauth/access_token` (client_id, client_secret, code)
 *    devuelve el token de negocio (developers.facebook.com/…/embedded-signup/implementation);
 *  - después: `POST /{waba_id}/subscribed_apps` y `POST /{phone_number_id}/register` con PIN de 6 dígitos;
 *  - **Tech Provider**: la pyme pone su método de pago en WhatsApp Manager y Meta le cobra a ella;
 *  - **Solution Partner**: se comparte nuestra línea de crédito
 *    (`POST /{extended_credit_line_id}/whatsapp_credit_sharing_and_attach`, `waba_currency` en AUD, EUR,
 *    GBP, IDR, INR o USD: **MXN no está**) y nosotros le cobramos (…/onboarding-customers-as-a-solution-partner).
 *
 * El token de negocio vale por toda la WABA: vive en la bóveda (P-02) y NUNCA en el inquilino, el
 * almacén ni una traza.
 */
import type { Reloj } from '../comun/base.js';
import type { Almacen } from '../almacen/almacen.js';
import type { Inquilino } from '../modelo.js';
import { emiteLigaAlta, filtraMensajeSignup, leeLigaAlta, type EventoSignup } from './liga.js';
import type { GestorNumeros, Modalidad } from '../dominios/numeros.js';

export type ModalidadBsp = 'tech_provider' | 'solution_partner';
export const VIDA_CODIGO_SIGNUP_MS = 30_000;
export const MONEDAS_CREDITO = ['AUD', 'EUR', 'GBP', 'IDR', 'INR', 'USD'] as const;

export interface GraphBsp {
  canjeaCodigo(code: string): Promise<{ ok: true; token: string } | { ok: false; error: string }>;
  suscribe(wabaId: string, token: string): Promise<{ ok: boolean; error?: string }>;
  desuscribe(wabaId: string, token: string): Promise<{ ok: boolean }>;
  comparteCredito(lineaId: string, wabaId: string, moneda: string): Promise<{ ok: true; allocationConfigId: string } | { ok: false; error: string }>;
  registra(phoneNumberId: string, pin: string, token: string): Promise<{ ok: true } | { ok: false; codigo: number; error: string }>;
}

/** Dónde viven los tokens de negocio (P-02: vault). La implementación en memoria es del laboratorio. */
export interface BovedaTokens {
  guarda(wabaId: string, token: string): Promise<void>;
  lee(wabaId: string): Promise<string | undefined>;
  revoca(wabaId: string): Promise<void>;
}

export function bovedaEnMemoria(): BovedaTokens & { cuantos(): number } {
  const m = new Map<string, string>();
  return { async guarda(w, t) { m.set(w, t); }, async lee(w) { return m.get(w); }, async revoca(w) { m.delete(w); }, cuantos: () => m.size };
}

export interface PasoAlta { paso: string; ok: boolean; detalle?: string }
export interface AltaBsp {
  wabaId: string;
  inquilinoId?: string;
  modalidad: ModalidadBsp;
  estado: 'activa' | 'falta_metodo_pago' | 'fallida' | 'baja';
  pasos: PasoAlta[];
  allocationConfigId?: string;
  monedaCredito?: string;
  /** La línea de crédito no admite MXN: cobramos en pesos lo que Meta nos cobra en dólares. */
  riesgoCambiario?: boolean;
  numeroDelPool?: string;
  creadaEn: number;
}

export interface OpcionesBsp {
  graph: GraphBsp;
  boveda: BovedaTokens;
  almacen: Almacen;
  reloj: Reloj;
  modalidad: ModalidadBsp;
  lineaCredito?: { id: string; monedaPreferida: string };
  /** PIN de dos pasos por número (6 dígitos); nunca se guarda en el alta ni en una traza. */
  pin: (phoneNumberId: string) => string;
  /** N-01: si la pyme no trae número, sale del pool. */
  numeros?: GestorNumeros;
  /** Dónde viven las altas, el embudo y los nonces de las ligas (en memoria si no se da). */
  registro?: RegistroAltas;
  /** Firma las ligas de alta (`ligaDeAlta`, `recibe`). */
  secretoLigas?: string;
}

export interface RegistroAltas {
  lee(wabaId: string): Promise<AltaBsp | undefined>;
  guarda(a: AltaBsp): Promise<void>;
  lista(): Promise<AltaBsp[]>;
  anota(e: { instante: number; resultado: string }): Promise<void>;
  embudo(): Promise<Array<{ instante: number; resultado: string }>>;
  /** Aparta el nonce de una liga: `false` si ya estaba apartado (la liga sirve una vez). */
  apartaNonce(nonce: string): Promise<boolean>;
  liberaNonce(nonce: string): Promise<void>;
}

export interface VolcadoAltas { altas: Record<string, AltaBsp>; embudo: Array<{ instante: number; resultado: string }>; nonces: string[] }

export function registroAltasEnMemoria(inicial?: VolcadoAltas, alGuardar?: (v: VolcadoAltas) => void): RegistroAltas {
  const v: VolcadoAltas = inicial ? structuredClone(inicial) : { altas: {}, embudo: [], nonces: [] };
  const persiste = () => alGuardar?.(v);
  return {
    async lee(w) { const a = v.altas[w]; return a ? structuredClone(a) : undefined; },
    async guarda(a) { v.altas[a.wabaId] = structuredClone(a); persiste(); },
    async lista() { return Object.values(v.altas).map((a) => structuredClone(a)); },
    async anota(e) { v.embudo.push(e); persiste(); },
    async embudo() { return [...v.embudo]; },
    async apartaNonce(n) { if (v.nonces.includes(n)) return false; v.nonces.push(n); persiste(); return true; },
    async liberaNonce(n) { v.nonces = v.nonces.filter((x) => x !== n); persiste(); },
  };
}

export interface SolicitudAlta {
  /** A quién dimos la liga de alta: el inquilino se crea con este id. */
  inquilinoId: string;
  code: string;
  /** Cuándo emitió Meta el código (lo marca nuestra página al recibirlo). */
  recibidoEn: number;
  evento: EventoSignup;
  perfil: (canal: Inquilino['canal']) => Inquilino;
  telefonoVisible: string;
  /** Sin número propio (FINISH_ONLY_WABA): cuál modalidad del pool y con qué nombre visible. */
  delPool?: { modalidad: Modalidad; nombreVisible: string };
}

export function creaBsp(o: OpcionesBsp) {
  const registro = o.registro ?? registroAltasEnMemoria();
  const anota = (resultado: string) => registro.anota({ instante: o.reloj(), resultado });
  const falla = async (a: AltaBsp, paso: string, detalle: string): Promise<AltaBsp> => {
    const r: AltaBsp = { ...a, estado: 'fallida', pasos: [...a.pasos, { paso, ok: false, detalle }] };
    // Una WABA que no se pudo suscribir no es nuestra: su fallo no pisa el alta buena de otra pyme.
    const previa = await registro.lee(a.wabaId);
    if (!previa || previa.estado === 'fallida' || previa.estado === 'baja') await registro.guarda(r);
    await anota(`fallida en ${paso}`);
    return r;
  };

  /** Solution Partner: comparte la línea de crédito. MXN no se admite: se usa USD y se marca el riesgo. */
  async function credito(a: AltaBsp): Promise<AltaBsp | string> {
    if (o.modalidad !== 'solution_partner') return a;
    if (!o.lineaCredito) return 'Solution Partner sin línea de crédito configurada';
    const preferida = o.lineaCredito.monedaPreferida;
    const moneda = (MONEDAS_CREDITO as readonly string[]).includes(preferida) ? preferida : 'USD';
    const c = await o.graph.comparteCredito(o.lineaCredito.id, a.wabaId, moneda);
    if (!c.ok) return c.error;
    return { ...a, allocationConfigId: c.allocationConfigId, monedaCredito: moneda, riesgoCambiario: moneda !== preferida, pasos: [...a.pasos, { paso: 'compartir_credito', ok: true, detalle: moneda === preferida ? moneda : `${preferida} no se admite: ${moneda}` }] };
  }

  /** El número: el que trajo la pyme (se registra con PIN) o uno del pool (N-01, con su propio alta). */
  async function numero(a: AltaBsp, s: SolicitudAlta, token: string): Promise<{ alta: AltaBsp; phoneNumberId: string; telefono: string } | string> {
    if (s.evento.tipo !== 'fin') return 'evento sin fin';
    if (s.evento.phoneNumberId) {
      // SUPUESTO: con coexistencia el número ya vive en la app y no se registra (verificar en el primer alta real).
      if (s.evento.coexistencia) return { alta: { ...a, pasos: [...a.pasos, { paso: 'registrar', ok: true, detalle: 'coexistencia: sin registro' }] }, phoneNumberId: s.evento.phoneNumberId, telefono: s.telefonoVisible };
      const r = await o.graph.registra(s.evento.phoneNumberId, o.pin(s.evento.phoneNumberId), token);
      if (!r.ok) return `${r.codigo}: ${r.error}`;
      return { alta: { ...a, pasos: [...a.pasos, { paso: 'registrar', ok: true }] }, phoneNumberId: s.evento.phoneNumberId, telefono: s.telefonoVisible };
    }
    if (!s.delPool || !o.numeros) return 'la pyme no trajo número y no hay pool (N-01)';
    const reservado = await o.numeros.reserva(s.inquilinoId, s.delPool.modalidad);
    if (!reservado.ok) return reservado.error;
    const activo = await o.numeros.activa(reservado.valor.e164, a.wabaId, s.delPool.nombreVisible);
    if (!activo.ok || !activo.valor.phoneNumberId) return activo.ok ? 'el número no quedó registrado' : activo.error;
    return { alta: { ...a, numeroDelPool: activo.valor.e164, pasos: [...a.pasos, { paso: 'numero_del_pool', ok: true, detalle: `${s.delPool.modalidad}, ${activo.valor.estado}` }] }, phoneNumberId: activo.valor.phoneNumberId, telefono: activo.valor.e164 };
  }

  async function completa(s: SolicitudAlta): Promise<AltaBsp | { rechazo: string }> {
    if (s.evento.tipo === 'abandono') { await anota(`abandono en ${s.evento.paso}`); return { rechazo: `la pyme abandonó en ${s.evento.paso}` }; }
    if (s.evento.tipo === 'error') { await anota('error en la ventana'); return { rechazo: s.evento.mensaje }; }
    const vigente = (x: AltaBsp) => x.estado === 'activa' || x.estado === 'falta_metodo_pago';
    const previa = await registro.lee(s.evento.wabaId);
    if (previa && vigente(previa)) return previa.inquilinoId === s.inquilinoId ? previa : { rechazo: 'esa WABA ya está dada de alta con otra pyme' };
    if ((await registro.lista()).some((x) => x.inquilinoId === s.inquilinoId && vigente(x))) return { rechazo: 'esta pyme ya tiene una WABA dada de alta: primero la baja' };
    if (o.reloj() - s.recibidoEn > VIDA_CODIGO_SIGNUP_MS) return { rechazo: 'el código de Embedded Signup vive 30 s: se canjea al recibirlo, servidor a servidor' };
    let a: AltaBsp = { wabaId: s.evento.wabaId, modalidad: o.modalidad, estado: 'fallida', pasos: [], creadaEn: o.reloj() };
    const canje = await o.graph.canjeaCodigo(s.code);
    if (!canje.ok) return falla(a, 'canjear_codigo', canje.error);
    a = { ...a, pasos: [{ paso: 'canjear_codigo', ok: true }] };
    // El token entra a la bóveda solo cuando Meta acepta que es de ESA WABA: un mensaje con la WABA de
    // otro y un código propio no deja un token guardado a nombre ajeno.
    const sus = await o.graph.suscribe(a.wabaId, canje.token);
    if (!sus.ok) return falla(a, 'suscribir_webhooks', sus.error ?? 'sin detalle');
    await o.boveda.guarda(a.wabaId, canje.token);
    a = { ...a, pasos: [...a.pasos, { paso: 'suscribir_webhooks', ok: true, detalle: 'token en la bóveda' }] };
    const conCredito = await credito(a);
    if (typeof conCredito === 'string') return falla(a, 'compartir_credito', conCredito);
    const n = await numero(conCredito, s, canje.token);
    if (typeof n === 'string') return falla(conCredito, 'registrar', n);
    return cierra(n.alta, s, n.phoneNumberId, n.telefono);
  }

  async function cierra(a: AltaBsp, s: SolicitudAlta, phoneNumberId: string, telefono: string): Promise<AltaBsp> {
    if (s.evento.tipo !== 'fin') return a;
    const base = { ...s.perfil({ wabaId: a.wabaId, phoneNumberId, telefonoVisible: telefono, datasetId: s.evento.datasetIds[0] ?? '', catalogoId: s.evento.catalogIds[0] ?? '', flows: {} }), id: s.inquilinoId };
    // Tech Provider: hasta que la pyme ponga su método de pago en WhatsApp Manager, el canal no envía.
    const tp = o.modalidad === 'tech_provider';
    await o.almacen.guardaInquilino(tp ? { ...base, estado: 'pausado', motivoPausa: 'falta el método de pago en WhatsApp Manager (Tech Provider: Meta le cobra a la pyme)' } : base);
    const final: AltaBsp = { ...a, inquilinoId: base.id, estado: tp ? 'falta_metodo_pago' : 'activa', pasos: [...a.pasos, { paso: 'inquilino', ok: true, detalle: base.id }] };
    await registro.guarda(final);
    await anota(final.estado);
    return final;
  }

  return {
    completa,
    /** La pyme confirmó su método de pago (Tech Provider): el canal ya envía. */
    async confirmaMetodoPago(wabaId: string): Promise<AltaBsp | undefined> {
      const a = await registro.lee(wabaId);
      if (!a?.inquilinoId || a.estado !== 'falta_metodo_pago') return a;
      const i = await o.almacen.inquilino(a.inquilinoId);
      if (i) { const activo: Inquilino = { ...i, estado: 'activo' }; delete activo.motivoPausa; await o.almacen.guardaInquilino(activo); }
      const r: AltaBsp = { ...a, estado: 'activa', pasos: [...a.pasos, { paso: 'metodo_de_pago', ok: true }] };
      await registro.guarda(r);
      return r;
    },
    /**
     * Baja (la pyme se va, o llegó PARTNER_REMOVED): se desuscribe, se revoca el token y se pausa. Un
     * número del pool vuelve a N-01 (se lo lleva o entra a cuarentena). Retirar la línea de crédito
     * queda como paso manual: su endpoint no se verificó.
     */
    async baja(wabaId: string, motivo: string): Promise<AltaBsp | undefined> {
      const a = await registro.lee(wabaId);
      if (!a || a.estado === 'baja') return a;
      const token = await o.boveda.lee(wabaId);
      if (token) await o.graph.desuscribe(wabaId, token);
      await o.boveda.revoca(wabaId);
      const pasos: PasoAlta[] = [...a.pasos, { paso: 'desuscribir_y_revocar', ok: true, detalle: motivo }];
      if (a.monedaCredito) pasos.push({ paso: 'retirar_credito', ok: false, detalle: 'manual en Business Manager (endpoint no verificado)' });
      if (a.numeroDelPool && o.numeros) {
        const l = await o.numeros.libera(a.numeroDelPool, motivo);
        pasos.push({ paso: 'numero_del_pool', ok: l.ok, detalle: l.ok ? l.valor.estado : l.error });
      }
      const i = a.inquilinoId ? await o.almacen.inquilino(a.inquilinoId) : undefined;
      if (i) await o.almacen.guardaInquilino({ ...i, estado: 'pausado', motivoPausa: `baja del BSP: ${motivo}` });
      const r: AltaBsp = { ...a, estado: 'baja', pasos };
      await registro.guarda(r);
      return r;
    },
    altas: () => registro.lista(),
    /** Cuántas pymes empiezan el alta y dónde se caen. */
    embudo: () => registro.embudo(),
    /** La liga privada que se le da a UNA pyme para su alta (firmada, vence, sirve una vez). */
    ligaDeAlta(inquilinoId: string): string {
      if (!o.secretoLigas) throw new Error('sin secreto de ligas');
      return emiteLigaAlta(o.secretoLigas, inquilinoId, o.reloj());
    },
    /**
     * Lo que manda nuestra página: la liga con la que entró la pyme, el `code` y el mensaje de la
     * ventana con su origen. El inquilino sale de la liga, nunca del navegador.
     */
    async recibe(r: { liga: string; code: string; origen: string; mensaje: unknown } & Omit<SolicitudAlta, 'inquilinoId' | 'code' | 'recibidoEn' | 'evento'>): Promise<AltaBsp | { rechazo: string }> {
      if (!o.secretoLigas) return { rechazo: 'sin secreto de ligas' };
      const evento = filtraMensajeSignup(r.origen, r.mensaje);
      if (!evento) { await anota('mensaje que no viene de Meta'); return { rechazo: 'el mensaje no viene de Meta o no es de Embedded Signup' }; }
      const liga = leeLigaAlta(o.secretoLigas, r.liga, o.reloj());
      if (!liga) return { rechazo: 'liga inválida o vencida' };
      if (!await registro.apartaNonce(liga.nonce)) return { rechazo: 'esta liga ya se usó' };
      const a = await completa({ inquilinoId: liga.inquilinoId, code: r.code, recibidoEn: o.reloj(), evento, perfil: r.perfil, telefonoVisible: r.telefonoVisible, ...(r.delPool ? { delPool: r.delPool } : {}) });
      // Un abandono o un fallo dejan reintentar con la misma liga; un alta lograda la gasta.
      if ('rechazo' in a || a.estado === 'fallida') await registro.liberaNonce(liga.nonce);
      return a;
    },
  };
}

export type Bsp = ReturnType<typeof creaBsp>;
