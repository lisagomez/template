/**
 * Gestión y venta de números de WhatsApp como línea de negocio (N-01). Es de la PLATAFORMA, no de
 * un inquilino: el pool de números es nuestro y cada número se asigna a UNA pyme a la vez.
 *
 * Dos modalidades, porque Meta exige que el número sea de quien lo registra («be owned by you»,
 * developers.facebook.com/…/business-phone-numbers/phone-numbers, consultado el 2026-09-30):
 *  - VENTA: conseguimos la línea (SIM mexicana) A NOMBRE DE LA PYME, la verificamos y registramos
 *    en SU WABA. Cobramos el alta y, si quiere, la administración. Si se va, se lleva su número.
 *  - RENTA: el número es nuestro (SIM o virtual del pool) y se lo rentamos. Si se va, se le
 *    ofrece portarlo o transferirlo; si el proveedor no lo permite, se le dice ANTES de venderlo.
 *
 * El alta sigue el orden de Meta: `request_code` (SMS o voz) → `verify_code` → `register` con PIN
 * de 6 dígitos (10 intentos por número en 72 h; al pasarse, 133016) → nombre visible en revisión →
 * `CONNECTED`. Un portafolio sin verificar registra hasta 2 números (20 tras verificarlo).
 *
 * La regla que NO se firma: un número liberado recibe mensajes de los clientes del dueño anterior.
 * Reasignarlo de inmediato expondría a terceros (sus pedidos, su dirección). Por eso todo número
 * liberado pasa por CUARENTENA (90 días por omisión) antes de volver al pool.
 */
import { DIA, HORA, type Reloj, type Resultado } from '../comun/base.js';

export type Modalidad = 'venta' | 'renta';
export type OrigenNumero = 'sim_mx' | 'virtual';
export type EstadoNumero = 'disponible' | 'reservado' | 'verificando' | 'registrado' | 'activo' | 'cuarentena' | 'transferido' | 'retirado';
export type Calidad = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';

export interface NumeroGestionado {
  e164: string;
  origen: OrigenNumero;
  proveedor: string;
  modalidad: Modalidad;
  /** A nombre de quién está la línea. En VENTA, siempre la pyme. */
  titular: 'plataforma' | 'pyme';
  /** Lo que nos cuesta al mes (centavos MXN) y lo que se cobra. */
  costoMensualCentavos: number;
  precioMensualCentavos: number;
  precioAltaCentavos: number;
  estado: EstadoNumero;
  inquilinoId?: string;
  phoneNumberId?: string;
  nombreVisible?: { nombre: string; estado: 'PENDING_REVIEW' | 'APPROVED' | 'DECLINED' };
  calidad: Calidad;
  cuarentenaHasta?: number;
  intentosRegistro: number[];
  /** Portable o transferible si la pyme se va (dicho ANTES de venderlo). */
  portable: boolean;
  historial: Array<{ instante: number; de: EstadoNumero; a: EstadoNumero; motivo: string }>;
}

/** El registro de Meta para números (lo implementa el simulador; en producción, la Graph API). */
export interface RegistroNumerosMeta {
  /** Da de alta el número en la WABA y devuelve su `phone_number_id`. */
  agrega(wabaId: string, e164: string): Promise<{ ok: true; phoneNumberId: string } | { ok: false; codigo: number; error: string }>;
  solicitaCodigo(phoneNumberId: string, metodo: 'SMS' | 'VOICE'): Promise<{ ok: boolean; error?: string }>;
  verificaCodigo(phoneNumberId: string, codigo: string): Promise<{ ok: boolean; error?: string }>;
  registra(phoneNumberId: string, pin: string): Promise<{ ok: true } | { ok: false; codigo: number; error: string }>;
  desregistra(phoneNumberId: string): Promise<{ ok: boolean }>;
  pideNombre(phoneNumberId: string, nombre: string): Promise<{ estado: 'PENDING_REVIEW' | 'APPROVED' | 'DECLINED' }>;
  estado(phoneNumberId: string): Promise<{ status: string; quality_rating: Calidad; name_status: string; code_verification_status: string }>;
}

/** Donde llega el código: la SIM o el buzón del proveedor virtual. */
export interface BuzonNumeros {
  ultimoCodigo(e164: string): Promise<string | null>;
}

export interface PoolNumeros {
  lee(e164: string): Promise<NumeroGestionado | undefined>;
  guarda(n: NumeroGestionado): Promise<void>;
  lista(): Promise<NumeroGestionado[]>;
}

export const CUARENTENA_POR_OMISION = 90 * DIA;
export const LIMITE_REGISTROS = { intentos: 10, ventanaMs: 72 * HORA };

export function poolEnMemoria(): PoolNumeros {
  const m = new Map<string, NumeroGestionado>();
  return {
    async lee(e) { const n = m.get(e); return n ? structuredClone(n) : undefined; },
    async guarda(n) { m.set(n.e164, structuredClone(n)); },
    async lista() { return [...m.values()].map((n) => structuredClone(n)); },
  };
}

export interface OpcionesGestor {
  pool: PoolNumeros;
  meta: RegistroNumerosMeta;
  buzon: BuzonNumeros;
  reloj: Reloj;
  cuarentenaMs?: number;
  /** PIN de verificación en dos pasos (6 dígitos). Se genera por número y NUNCA se registra en logs. */
  pin: (e164: string) => string;
}


export function creaGestorNumeros(o: OpcionesGestor) {
  const cuarentena = o.cuarentenaMs ?? CUARENTENA_POR_OMISION;
  const mueve = (n: NumeroGestionado, a: EstadoNumero, motivo: string): NumeroGestionado => ({ ...n, estado: a, historial: [...n.historial, { instante: o.reloj(), de: n.estado, a, motivo }] });

  /** Lo que ya salió de cuarentena vuelve a estar disponible. */
  async function liberaVencidos() {
    for (const n of await o.pool.lista()) {
      if (n.estado === 'cuarentena' && (n.cuarentenaHasta ?? 0) <= o.reloj()) await o.pool.guarda({ ...mueve(n, 'disponible', 'cuarentena cumplida'), inquilinoId: undefined, phoneNumberId: undefined, nombreVisible: undefined });
    }
  }

  return {
    /** Compra o alta de un número en el pool (renta) o por encargo de una pyme (venta). */
    async altaEnPool(n: Omit<NumeroGestionado, 'estado' | 'historial' | 'intentosRegistro' | 'calidad'>): Promise<Resultado<NumeroGestionado>> {
      if (!/^\+52\d{10}$/.test(n.e164)) return { ok: false, error: 'número mexicano en E.164 (+52 y 10 dígitos)' };
      if (await o.pool.lee(n.e164)) return { ok: false, error: 'el número ya está en el pool' };
      if (n.modalidad === 'venta' && n.titular !== 'pyme') return { ok: false, error: 'en VENTA la línea va a nombre de la pyme (Meta: el número es de quien lo registra)' };
      const nuevo: NumeroGestionado = { ...n, estado: 'disponible', historial: [], intentosRegistro: [], calidad: 'UNKNOWN' };
      await o.pool.guarda(nuevo);
      return { ok: true, valor: nuevo };
    },

    /** Reserva un número disponible para una pyme (nunca uno en cuarentena). */
    async reserva(inquilinoId: string, modalidad: Modalidad): Promise<Resultado<NumeroGestionado>> {
      await liberaVencidos();
      const libre = (await o.pool.lista()).find((n) => n.estado === 'disponible' && n.modalidad === modalidad);
      if (!libre) return { ok: false, error: `no hay números en ${modalidad} disponibles (los de cuarentena no cuentan)` };
      const r = { ...mueve(libre, 'reservado', `reservado para ${inquilinoId}`), inquilinoId };
      await o.pool.guarda(r);
      return { ok: true, valor: r };
    },

    /** El alta completa en la WABA de la pyme: código → verificación → registro con PIN → nombre visible. */
    async activa(e164: string, wabaId: string, nombreVisible: string, metodo: 'SMS' | 'VOICE' = 'SMS'): Promise<Resultado<NumeroGestionado>> {
      let n = await o.pool.lee(e164);
      if (!n || n.estado !== 'reservado' || !n.inquilinoId) return { ok: false, error: 'el número no está reservado para una pyme' };
      const recientes = n.intentosRegistro.filter((t) => t > o.reloj() - LIMITE_REGISTROS.ventanaMs);
      if (recientes.length >= LIMITE_REGISTROS.intentos) return { ok: false, error: '133016: 10 intentos de registro en 72 h; esperar' };
      const alta = await o.meta.agrega(wabaId, e164);
      if (!alta.ok) return { ok: false, error: `${alta.codigo}: ${alta.error}` };
      n = { ...mueve(n, 'verificando', `código por ${metodo}`), phoneNumberId: alta.phoneNumberId };
      await o.pool.guarda(n);
      const pedido = await o.meta.solicitaCodigo(alta.phoneNumberId, metodo);
      if (!pedido.ok) return { ok: false, error: pedido.error ?? 'no se pudo pedir el código' };
      const codigo = await o.buzon.ultimoCodigo(e164);
      if (!codigo) return { ok: false, error: 'el código no llegó a la SIM ni al buzón del proveedor' };
      const v = await o.meta.verificaCodigo(alta.phoneNumberId, codigo);
      if (!v.ok) return { ok: false, error: v.error ?? 'código rechazado' };
      n = { ...n, intentosRegistro: [...recientes, o.reloj()] };
      const reg = await o.meta.registra(alta.phoneNumberId, o.pin(e164));
      if (!reg.ok) { await o.pool.guarda(n); return { ok: false, error: `${reg.codigo}: ${reg.error}` }; }
      n = mueve(n, 'registrado', 'registrado en Cloud API con PIN');
      const nombre = await o.meta.pideNombre(alta.phoneNumberId, nombreVisible);
      n = { ...n, nombreVisible: { nombre: nombreVisible, estado: nombre.estado } };
      if (nombre.estado === 'APPROVED') n = mueve(n, 'activo', 'nombre visible aprobado');
      await o.pool.guarda(n);
      return { ok: true, valor: n };
    },

    /** Lee la calidad del número (GET quality_rating). En RED se avisa: el número de la pyme está en riesgo. */
    async revisaCalidad(e164: string): Promise<{ calidad: Calidad; alerta: string | null }> {
      const n = await o.pool.lee(e164);
      if (!n?.phoneNumberId) return { calidad: 'UNKNOWN', alerta: null };
      const e = await o.meta.estado(n.phoneNumberId);
      await o.pool.guarda({ ...n, calidad: e.quality_rating });
      const alerta = e.quality_rating === 'RED' ? `La calidad de ${e164} está en ROJO: se pausan envíos no esenciales y se revisa qué la bajó.`
        : e.quality_rating === 'YELLOW' ? `La calidad de ${e164} bajó a AMARILLO: revisar quejas y bloqueos.` : null;
      return { calidad: e.quality_rating, alerta };
    },

    /**
     * La pyme deja el número. VENTA o portable: se transfiere (es suyo). RENTA no portable: se
     * desregistra y entra a CUARENTENA antes de volver al pool.
     */
    async libera(e164: string, motivo: string, llevarselo = true): Promise<Resultado<NumeroGestionado>> {
      const n = await o.pool.lee(e164);
      if (!n || !['activo', 'registrado', 'reservado'].includes(n.estado)) return { ok: false, error: 'el número no está asignado' };
      if (n.phoneNumberId) await o.meta.desregistra(n.phoneNumberId);
      if (n.modalidad === 'venta' || (llevarselo && n.portable)) {
        const t = { ...mueve(n, 'transferido', `se lo lleva la pyme: ${motivo}`), titular: 'pyme' as const };
        await o.pool.guarda(t);
        return { ok: true, valor: t };
      }
      const c = { ...mueve(n, 'cuarentena', `liberado: ${motivo}`), cuarentenaHasta: o.reloj() + cuarentena };
      await o.pool.guarda(c);
      return { ok: true, valor: c };
    },

    liberaVencidos,

    /** El mes de la línea de números: cobros y costos por número asignado. */
    async facturacion(): Promise<{ numeros: number; ingresoCentavos: number; costoCentavos: number; margenCentavos: number; porInquilino: Record<string, number> }> {
      const cobrables = (await o.pool.lista()).filter((n) => n.estado === 'activo' || n.estado === 'registrado');
      const pool = (await o.pool.lista()).filter((n) => n.modalidad === 'renta' && n.estado !== 'transferido' && n.estado !== 'retirado');
      const ingreso = cobrables.reduce((a, n) => a + n.precioMensualCentavos, 0);
      // En renta pagamos TODO el pool (también lo disponible y lo que está en cuarentena); en venta, nada.
      const costo = pool.reduce((a, n) => a + n.costoMensualCentavos, 0);
      const porInquilino: Record<string, number> = {};
      for (const n of cobrables) if (n.inquilinoId) porInquilino[n.inquilinoId] = (porInquilino[n.inquilinoId] ?? 0) + n.precioMensualCentavos;
      return { numeros: cobrables.length, ingresoCentavos: ingreso, costoCentavos: costo, margenCentavos: ingreso - costo, porInquilino };
    },
  };
}

export type GestorNumeros = ReturnType<typeof creaGestorNumeros>;
