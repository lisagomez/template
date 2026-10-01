/**
 * El alta de números en Meta, simulada (para la línea N-01). Las formas y los límites siguen la
 * documentación consultada el 2026-09-30:
 *  - `POST /{phone_number_id}/request_code` {code_method: SMS|VOICE, language} y `verify_code` {code}
 *    (developers.facebook.com/…/business-phone-numbers/phone-numbers);
 *  - `POST /{phone_number_id}/register` {messaging_product, pin de 6 dígitos} y `deregister`, con 10
 *    intentos de cada uno por número en 72 h; al pasarse, el error 133016 (…/cloud-api/reference/registration);
 *  - un portafolio sin verificar registra hasta 2 números; verificado, hasta 20;
 *  - `quality_rating` GREEN/YELLOW/RED/UNKNOWN, `name_status` y `code_verification_status`.
 * SUPUESTOS (marcados): el código de error cuando el número sigue en la app de consumo o el portafolio
 * llegó a su tope (se usa 100 con el motivo en el texto), y la regla de revisión del nombre visible
 * (aquí: se rechaza si dice «WhatsApp» o tiene menos de 3 letras).
 */
import { randomInt } from 'node:crypto';
import type { Reloj } from '../comun/base.js';
import { LIMITE_REGISTROS, type BuzonNumeros, type Calidad, type RegistroNumerosMeta } from '../dominios/numeros.js';

interface NumeroMeta {
  id: string;
  e164: string;
  wabaId: string;
  verificacion: 'NOT_VERIFIED' | 'VERIFIED';
  status: 'PENDING' | 'CONNECTED' | 'DISCONNECTED';
  pin?: string;
  codigo?: string;
  registros: number[];
  calidad: Calidad;
  nombre?: string;
  nameStatus: 'NONE' | 'PENDING_REVIEW' | 'APPROVED' | 'DECLINED';
}

export interface OpcionesRegistroSimulado {
  reloj: Reloj;
  /** Portafolio verificado: 20 números en vez de 2. */
  portafolioVerificado?: boolean;
}

export function creaRegistroNumerosSimulado(o: OpcionesRegistroSimulado) {
  const numeros = new Map<string, NumeroMeta>();
  const buzon = new Map<string, string>();
  const enAppDeConsumo = new Set<string>();
  const sinSms = new Set<string>();
  let verificado = o.portafolioVerificado ?? false;
  let secuencia = 0;
  const activosDe = (wabaId: string) => [...numeros.values()].filter((n) => n.wabaId === wabaId && n.status !== 'DISCONNECTED').length;

  const registro: RegistroNumerosMeta = {
    async agrega(wabaId, e164) {
      if (enAppDeConsumo.has(e164)) return { ok: false, codigo: 100, error: '(SUPUESTO) el número sigue en la app de consumo: hay que borrar esa cuenta primero' };
      const tope = verificado ? 20 : 2;
      if (activosDe(wabaId) >= tope) return { ok: false, codigo: 100, error: `(SUPUESTO) el portafolio llegó a su tope de ${tope} números${verificado ? '' : ' (verifica el negocio para subir a 20)'}` };
      const existente = [...numeros.values()].find((n) => n.e164 === e164 && n.status !== 'DISCONNECTED');
      if (existente) return existente.wabaId === wabaId ? { ok: true, phoneNumberId: existente.id } : { ok: false, codigo: 100, error: 'el número ya está en otra WABA: migrarlo, no darlo de alta' };
      const id = `1${String(++secuencia).padStart(14, '0')}`;
      numeros.set(id, { id, e164, wabaId, verificacion: 'NOT_VERIFIED', status: 'PENDING', registros: [], calidad: 'UNKNOWN', nameStatus: 'NONE' });
      return { ok: true, phoneNumberId: id };
    },
    async solicitaCodigo(id, metodo) {
      const n = numeros.get(id);
      if (!n) return { ok: false, error: '(#100) phone_number_id desconocido' };
      if (metodo === 'SMS' && sinSms.has(n.e164)) return { ok: false, error: 'la línea no recibe SMS: pedir el código por VOICE' };
      n.codigo = String(randomInt(100000, 1000000));
      buzon.set(n.e164, n.codigo);
      return { ok: true };
    },
    async verificaCodigo(id, codigo) {
      const n = numeros.get(id);
      if (!n?.codigo || n.codigo !== codigo) return { ok: false, error: 'código incorrecto o vencido' };
      n.verificacion = 'VERIFIED';
      n.codigo = undefined;
      return { ok: true };
    },
    async registra(id, pin) {
      const n = numeros.get(id);
      if (!n) return { ok: false, codigo: 100, error: 'phone_number_id desconocido' };
      if (n.verificacion !== 'VERIFIED') return { ok: false, codigo: 100, error: 'verifica el número antes de registrarlo' };
      if (!/^\d{6}$/.test(pin)) return { ok: false, codigo: 100, error: 'el PIN son 6 dígitos' };
      n.registros = n.registros.filter((t) => t > o.reloj() - LIMITE_REGISTROS.ventanaMs);
      if (n.registros.length >= LIMITE_REGISTROS.intentos) return { ok: false, codigo: 133016, error: 'Account register deregister rate limit exceeded' };
      n.registros.push(o.reloj());
      if (n.pin && n.pin !== pin) return { ok: false, codigo: 100, error: 'PIN de dos pasos incorrecto' };
      n.pin = pin;
      n.status = 'CONNECTED';
      return { ok: true };
    },
    async desregistra(id) {
      const n = numeros.get(id);
      if (!n) return { ok: false };
      n.status = 'DISCONNECTED';
      return { ok: true };
    },
    async pideNombre(id, nombre) {
      const n = numeros.get(id);
      const estado = !n || /whatsapp/i.test(nombre) || nombre.replace(/[^\p{L}]/gu, '').length < 3 ? 'DECLINED' : 'APPROVED';
      if (n) { n.nombre = nombre; n.nameStatus = estado; }
      return { estado };
    },
    async estado(id) {
      const n = numeros.get(id);
      return { status: n?.status ?? 'DISCONNECTED', quality_rating: n?.calidad ?? 'UNKNOWN', name_status: n?.nameStatus ?? 'NONE', code_verification_status: n?.verificacion ?? 'NOT_VERIFIED' };
    },
  };

  const buzonSimulado: BuzonNumeros = { async ultimoCodigo(e164) { return buzon.get(e164) ?? null; } };

  return {
    registro,
    buzon: buzonSimulado,
    /** Palancas del laboratorio. */
    enAppDeConsumo: (e164: string) => void enAppDeConsumo.add(e164),
    sinSms: (e164: string) => void sinSms.add(e164),
    verificaPortafolio: () => { verificado = true; },
    cambiaCalidad(e164: string, calidad: Calidad) {
      for (const n of numeros.values()) if (n.e164 === e164 && n.status === 'CONNECTED') n.calidad = calidad;
    },
    /** Lo que Meta sabe de cada número (sin el PIN ni el código). */
    lista: () => [...numeros.values()].map((n) => { const c = structuredClone(n); delete c.pin; delete c.codigo; return c; }),
  };
}

export type RegistroNumerosSimulado = ReturnType<typeof creaRegistroNumerosSimulado>;
