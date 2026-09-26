/**
 * El lado servidor del expediente: el CENTRAL (anclas, testigos, llaves publicas, incidentes), los
 * seudonimos de operador y las llaves de sitio.
 *
 * - Llave de cada sitio: `ETIQUETAS_LLAVE_<SITIO>` (PKCS#8 DER en base64; `-` → `_`). NUNCA se
 *   imprime ni se devuelve: hacia fuera solo sale presente/ausente, su largo y la huella de la
 *   llave PUBLICA. En esta demo un solo servidor hace de todos los sitios; en una instalacion real
 *   cada llave vive solo en el agente de su sitio.
 * - Central: `ETIQUETAS_CENTRAL` (por defecto `central.json` junto al estado). En produccion va en
 *   otra maquina: la sucursal no escribe en el; solo le envia anclas y testigos.
 * - Seudonimos: `operadores.json`, aparte y borrable. La cadena solo guarda `op-xxxxxxxx`.
 */
import { join, resolve } from 'node:path';
import { centralEnArchivo, type AlmacenCentral } from '../../../../../tools/etiquetas-gs1/dist/almacenes/central.js';
import { seudonimosEnArchivo, type Seudonimos } from '../../../../../tools/etiquetas-gs1/dist/almacenes/seudonimos.js';
import { firmaAncla, idLlave, publicaDe, verificador } from '../../../../../tools/etiquetas-gs1/dist/firma.js';
import {
  abreIncidente, audita, integridadLocal, preparaAncla, recibeAncla, recibeTestigo, registraLlave, verificaSitio, ventasFicticias,
  type EstadoAlmacen, type EstadoCentral, type FuenteVentas, type InformeIntegridad, type VerificaFirma,
} from '../nucleo.ts';
import { almacenDelServidor, hoyIso } from './almacen.ts';
import { VENTAS_DEMO } from './semilla.ts';

const carpeta = () => resolve(/*turbopackIgnore: true*/ process.env['ETIQUETAS_DATOS'] || '.datos/etiquetas');
let central: AlmacenCentral | undefined;
let seudonimos: Seudonimos | undefined;

export function centralDelServidor(): AlmacenCentral {
  central ??= centralEnArchivo(process.env['ETIQUETAS_CENTRAL'] ? resolve(/*turbopackIgnore: true*/ process.env['ETIQUETAS_CENTRAL']) : join(/*turbopackIgnore: true*/ carpeta(), 'central.json'));
  return central;
}

export function seudonimosDelServidor(): Seudonimos {
  seudonimos ??= seudonimosEnArchivo(join(/*turbopackIgnore: true*/ carpeta(), 'operadores.json'));
  return seudonimos;
}

export const variableLlave = (sitio: string) => `ETIQUETAS_LLAVE_${sitio.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

/** La llave privada del sitio, o undefined. Solo para firmar: nunca sale de este modulo. */
function llavePrivada(sitio: string): string | undefined {
  const v = process.env[variableLlave(sitio)]?.trim();
  if (!v) return undefined;
  try { publicaDe(v); return v; } catch { return undefined; }
}

export interface EstadoLlave {
  readonly variable: string;
  readonly presente: boolean;
  /** Largo del valor (nunca el valor). */
  readonly largo: number;
  readonly valida: boolean;
  /** Huella de la llave PUBLICA derivada. */
  readonly huella?: string;
}

export function estadoLlave(sitio: string): EstadoLlave {
  const variable = variableLlave(sitio);
  const v = process.env[variable]?.trim() ?? '';
  const privada = llavePrivada(sitio);
  return { variable, presente: v.length > 0, largo: v.length, valida: Boolean(privada), ...(privada ? { huella: idLlave(publicaDe(privada)) } : {}) };
}

export function verificaDelCentral(c: EstadoCentral): VerificaFirma {
  return verificador(Object.fromEntries(Object.values(c.llaves).map((l) => [l.id, l.publica])));
}

/** Registra en el central la llave publica de cada sitio que tenga la suya en el entorno. */
export async function registraLlaves(sitios: readonly string[], cuando = new Date().toISOString()): Promise<void> {
  await centralDelServidor().transaccion((c) => {
    let x = c;
    for (const s of sitios) {
      const privada = llavePrivada(s);
      if (!privada) continue;
      const publica = publicaDe(privada);
      x = registraLlave(x, s, { id: idLlave(publica), publica, registrada: cuando }, cuando);
    }
    return { central: x, resultado: null };
  });
}

/** El sitio avisa al central su cabeza tras cada cambio de su cadena. */
export async function avisaCabezas(estado: EstadoAlmacen, sitios: readonly string[]): Promise<void> {
  await centralDelServidor().transaccion((c) => {
    let x = c;
    for (const s of new Set(sitios)) {
      const ultimo = estado.eventos?.[s]?.at(-1);
      if (ultimo) x = recibeTestigo(x, s, { seq: ultimo.seq, cabeza: ultimo.hash, fecha: new Date().toISOString() }).central;
    }
    return { central: x, resultado: null };
  });
}

export interface ResultadoAncla { readonly sitio: string; readonly ok: boolean; readonly motivo?: string; readonly eventos?: number }

/**
 * Ancla los eventos pendientes de cada sitio: raiz de Merkle, firma con la llave del sitio y envio
 * al central, que la acepta o la rechaza (y abre incidente). `hasta`: solo eventos hasta ese dia.
 */
export async function anclaSitios(estado: EstadoAlmacen, sitios: readonly string[], periodo: string, hasta?: string): Promise<ResultadoAncla[]> {
  await registraLlaves(sitios);
  const cuando = new Date().toISOString();
  return centralDelServidor().transaccion((c) => {
    let x = c;
    const r: ResultadoAncla[] = [];
    for (const sitio of sitios) {
      const privada = llavePrivada(sitio);
      if (!privada) { r.push({ sitio, ok: false, motivo: `sin llave del sitio (${variableLlave(sitio)})` }); continue; }
      const eventos = (estado.eventos?.[sitio] ?? []).filter((e) => !hasta || e.fecha.slice(0, 10) <= hasta);
      const ancla = preparaAncla(sitio, eventos, x.anclas[sitio] ?? [], periodo, cuando);
      if (!ancla) { r.push({ sitio, ok: true, eventos: 0 }); continue; }
      const rec = recibeAncla(x, firmaAncla(ancla, privada), verificaDelCentral(x), cuando);
      x = rec.central;
      r.push({ sitio, ok: rec.ok, ...(rec.motivo ? { motivo: rec.motivo } : {}), eventos: ancla.n });
    }
    return { central: x, resultado: r };
  });
}

/**
 * Semilla del central (solo con la semilla ficticia): las anclas nocturnas de los dias pasados,
 * como si el agente de cada sitio las hubiera enviado cada noche.
 */
export async function siembraCentral(estado: EstadoAlmacen, hoy: string): Promise<void> {
  const c = await centralDelServidor().lee();
  if (Object.keys(c.anclas).length > 0 || process.env['ETIQUETAS_SEMILLA'] !== 'ficticia') return;
  const sitios = estado.configuracion.sitios.map((s) => s.clave);
  const dias = [...new Set(Object.values(estado.eventos ?? {}).flat().map((e) => e.fecha.slice(0, 10)).filter((d) => d < hoy))].sort();
  for (const dia of dias) await anclaSitios(estado, sitios, dia, dia);
  await avisaCabezas(estado, sitios);
}

export function ventasDelServidor(): FuenteVentas {
  if (process.env['ETIQUETAS_SEMILLA'] === 'ficticia') return ventasFicticias(VENTAS_DEMO);
  // Leer ventas reales del ERP (solo lectura) es una propuesta con gate humano: sin ella, no hay fuente.
  return { nombre: 'ninguna', promedioDiario: () => undefined };
}

export interface IntegridadSitio extends InformeIntegridad {
  readonly nombre: string;
  readonly proyeccion: { readonly ok: boolean; readonly motivo?: string };
  readonly llave: EstadoLlave;
  readonly ultimaAncla?: { readonly periodo: string; readonly hastaSeq: number; readonly raiz: string; readonly creada: string };
  readonly anclasTotales: number;
}

/** Lo que muestra el tablero de integridad y lo que el agente comprueba antes de actuar. */
export async function auditoria(estado: EstadoAlmacen): Promise<{ sitios: IntegridadSitio[]; transferencias: readonly { readonly sitio: string; readonly seq: number; readonly detalle: string }[]; incidentes: EstadoCentral['incidentes']; ok: boolean }> {
  const c = await centralDelServidor().lee();
  const sitios = estado.configuracion.sitios;
  const a = audita(estado.eventos ?? {}, c, verificaDelCentral(c), sitios.map((s) => s.clave));
  const informes = a.sitios.map((inf, i) => {
    const p = integridadLocal(estado, inf.sitio);
    const ultima = c.anclas[inf.sitio]?.at(-1)?.ancla;
    return {
      ...inf, nombre: sitios[i]!.nombre, ok: inf.ok && p.ok, proyeccion: { ok: p.ok, ...(p.motivo ? { motivo: p.motivo } : {}) }, llave: estadoLlave(inf.sitio),
      anclasTotales: c.anclas[inf.sitio]?.length ?? 0, ...(ultima ? { ultimaAncla: { periodo: ultima.periodo, hastaSeq: ultima.hastaSeq, raiz: ultima.raiz, creada: ultima.creada } } : {}),
      ...(!inf.primerFallo && p.motivo ? { primerFallo: p.motivo } : {}),
    };
  });
  return { sitios: informes, transferencias: a.transferencias, incidentes: c.incidentes, ok: a.ok && informes.every((x) => x.ok) };
}

/** Integridad COMPLETA de un sitio (local + anclas + testigos) para el agente. Si falla, abre incidente. */
export async function integridadParaActuar(estado: EstadoAlmacen, sitio: string, origen: 'agente' | 'auditoria' = 'agente', que = 'el agente no actuó'): Promise<{ ok: boolean; motivo?: string }> {
  const local = integridadLocal(estado, sitio);
  const c = await centralDelServidor().lee();
  const inf = verificaSitio(sitio, estado.eventos?.[sitio] ?? [], c.anclas[sitio] ?? [], c.llaves[sitio]?.id ?? '', verificaDelCentral(c), c.testigos?.[sitio] ?? []);
  const motivo = local.motivo ?? inf.primerFallo;
  if (!motivo) return { ok: true };
  await centralDelServidor().transaccion((x) => ({ central: abreIncidente(x, { fecha: new Date().toISOString(), sitio, origen, motivo: `${que}: ${motivo}` }), resultado: null }));
  return { ok: false, motivo };
}

export { almacenDelServidor, hoyIso };
