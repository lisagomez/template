/**
 * EL LIBRO DE EVENTOS: solo se agrega, una cadena por clinica, con el diseño de la casa
 * (`docs/goals/expediente-lote-cadena-hash.md`, `tools/ventas-whatsapp/src/trazabilidad/cadena.ts`):
 *
 *   eslabon = { v, clinica, seq, evento, anterior, hash }   hash = SHA-256(JCS(eslabon sin hash))
 *
 * Se hashea el eslabon ENTERO canonicalizado (RFC 8785): cambiar el actor, la fecha o un campo del evento
 * cambia el hash. Cada evento valida contra el contrato ANTES de entrar: lo que no cumple no se encadena.
 *
 * Tamper-EVIDENT, no tamper-proof: quien escribe el almacen podria recalcular la cadena entera. Eso lo delata
 * el SELLO: la raiz de Merkle (RFC 6962) hasta un `seq`, firmada con Ed25519 y guardada aparte. La
 * verificacion dice DONDE se rompio: alterado, quitado, reordenado, enlace roto, fuera de contrato o reescrito.
 */
import { generateKeyPairSync, sign, verify, createPrivateKey, createPublicKey } from 'node:crypto';
import { canonico } from './jcs.js';
import { raizDeHashes } from './merkle.js';
import { idDeClave, sha256Hex } from './seudonimo.js';
import { esquemaEvento, validaEvento, VERSION_CONTRATO, type Evento, type EventoSinSello } from './eventos.js';

export interface Eslabon {
  v: 1;
  clinica: string;
  seq: number;
  evento: Evento;
  anterior: string;
  hash: string;
}

export interface Sello {
  v: 1;
  clinica: string;
  hasta: number;
  raiz: string;
  cabeza: string;
  creado: string;
  firma: string;
}

export interface AlmacenLibro {
  eslabones(clinica: string): Promise<Eslabon[]>;
  agrega(e: Eslabon): Promise<void>;
  sellos(clinica: string): Promise<Sello[]>;
  agregaSello(s: Sello): Promise<void>;
}

export const GENESIS = '0'.repeat(64);
export const hashDeEslabon = (e: Omit<Eslabon, 'hash'>): string => sha256Hex(canonico(e));

export type FalloLibro = 'alterado' | 'quitado' | 'reordenado' | 'enlace' | 'contrato' | 'sello';
export type VerificacionLibro =
  | { ok: true; n: number; cabeza: string; raiz: string; sellado: number }
  | { ok: false; n: number; fallo: FalloLibro; posicion: number; seq: number; detalle: string };

const rompe = (n: number, fallo: FalloLibro, posicion: number, seq: number, detalle: string): VerificacionLibro => ({ ok: false, n, fallo, posicion, seq, detalle });

function revisaOrden(es: readonly Eslabon[]): VerificacionLibro | null {
  for (let i = 0; i < es.length; i++) {
    const seq = es[i]!.seq;
    if (seq === i + 1) continue;
    if (es.some((x, j) => j > i && x.seq === i + 1)) return rompe(es.length, 'reordenado', i + 1, seq, `en la posición ${i + 1} está el eslabón ${seq}; el ${i + 1} aparece más adelante`);
    if (seq > i + 1) return rompe(es.length, 'quitado', i + 1, i + 1, `falta el eslabón ${i + 1}: la secuencia salta de ${i} a ${seq}`);
    return rompe(es.length, 'reordenado', i + 1, seq, `el eslabón ${seq} aparece repetido o fuera de lugar en la posición ${i + 1}`);
  }
  return null;
}

/** Recorre el libro EN EL ORDEN DEL ARCHIVO: secuencia, enlace, hash, contrato y, si hay, el ultimo sello. */
export function verificaLibro(es: readonly Eslabon[], sellos: readonly Sello[] = [], verificaFirma?: (s: Omit<Sello, 'firma'>, firma: string) => boolean): VerificacionLibro {
  const orden = revisaOrden(es);
  if (orden) return orden;
  let anterior = GENESIS;
  for (const e of es) {
    if (e.anterior !== anterior) return rompe(es.length, 'enlace', e.seq, e.seq, `el eslabón ${e.seq} no enlaza con el ${e.seq - 1}`);
    const { hash, ...resto } = e;
    if (hashDeEslabon(resto) !== hash) return rompe(es.length, 'alterado', e.seq, e.seq, `el contenido del eslabón ${e.seq} (${e.evento?.tipo ?? '?'}) cambió después de encadenarse`);
    const v = validaEvento(e.evento);
    if (!v.ok) return rompe(es.length, 'contrato', e.seq, e.seq, `el eslabón ${e.seq} no cumple el contrato v${VERSION_CONTRATO}: ${v.error}`);
    anterior = hash;
  }
  const ultimo = [...sellos].sort((a, b) => b.hasta - a.hasta)[0];
  if (ultimo) {
    const { firma, ...sinFirma } = ultimo;
    if (verificaFirma && !verificaFirma(sinFirma, firma)) return rompe(es.length, 'sello', ultimo.hasta, ultimo.hasta, 'la firma del sello no es válida');
    if (es.length < ultimo.hasta) return rompe(es.length, 'sello', es.length + 1, ultimo.hasta, `el sello cubre ${ultimo.hasta} eslabones y el libro tiene ${es.length}: se quitaron del final`);
    const raiz = raizDeHashes(es.slice(0, ultimo.hasta).map((e) => e.hash));
    if (raiz !== ultimo.raiz || es[ultimo.hasta - 1]!.hash !== ultimo.cabeza) return rompe(es.length, 'sello', ultimo.hasta, ultimo.hasta, `el libro ya no cuadra con el sello hasta ${ultimo.hasta}: se reescribió`);
  }
  return { ok: true, n: es.length, cabeza: anterior, raiz: raizDeHashes(es.map((e) => e.hash)), sellado: ultimo?.hasta ?? 0 };
}

/** Llaves Ed25519 del sello (PEM). La privada no sale del servidor ni se imprime. */
export function llavesSello(): { privada: string; publica: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { privada: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), publica: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
}
export const firmaSello = (privadaPem: string) => (s: Omit<Sello, 'firma'>): string => sign(null, Buffer.from(canonico(s)), createPrivateKey(privadaPem)).toString('base64');
export const verificaSello = (publicaPem: string) => (s: Omit<Sello, 'firma'>, firma: string): boolean => {
  try {
    return verify(null, Buffer.from(canonico(s)), createPublicKey(publicaPem), Buffer.from(firma, 'base64'));
  } catch {
    return false;
  }
};

export interface DepsLibro {
  almacen: AlmacenLibro;
  reloj: () => number;
}

export function creaLibro(d: DepsLibro) {
  const colas = new Map<string, Promise<unknown>>();
  const cabezas = new Map<string, { seq: number; hash: string; ids: Map<string, Evento> }>();

  async function cabeza(clinica: string) {
    let c = cabezas.get(clinica);
    if (!c) {
      const es = await d.almacen.eslabones(clinica);
      const ultimo = es[es.length - 1];
      c = { seq: ultimo?.seq ?? 0, hash: ultimo?.hash ?? GENESIS, ids: new Map(es.map((e) => [e.evento.id, e.evento])) };
      cabezas.set(clinica, c);
    }
    return c;
  }

  /** Encadena un evento. Idempotente por `clave`: la misma clave devuelve el mismo evento y no agrega nada. */
  function registra(entrada: EventoSinSello, clave: string): Promise<Evento> {
    const clinica = entrada.clinica;
    const previa = colas.get(clinica) ?? Promise.resolve();
    const siguiente = previa.catch(() => undefined).then(async () => {
      const c = await cabeza(clinica);
      const id = idDeClave('evt', `${clinica}|${clave}`);
      const ya = c.ids.get(id);
      if (ya) return ya;
      const evento = esquemaEvento.parse({ ...entrada, v: VERSION_CONTRATO, id, en: new Date(d.reloj()).toISOString() });
      const base: Omit<Eslabon, 'hash'> = { v: 1, clinica, seq: c.seq + 1, evento, anterior: c.hash };
      const e: Eslabon = { ...base, hash: hashDeEslabon(base) };
      await d.almacen.agrega(e);
      c.seq = e.seq;
      c.hash = e.hash;
      c.ids.set(id, evento);
      return evento;
    });
    colas.set(clinica, siguiente);
    return siguiente;
  }

  return {
    registra,
    async drena() {
      await Promise.all([...colas.values()].map((p) => p.catch(() => undefined)));
    },
    async eventos(clinica: string): Promise<Evento[]> {
      await this.drena();
      return (await d.almacen.eslabones(clinica)).map((e) => e.evento);
    },
    async verifica(clinica: string, verificaFirma?: (s: Omit<Sello, 'firma'>, firma: string) => boolean) {
      await this.drena();
      return verificaLibro(await d.almacen.eslabones(clinica), await d.almacen.sellos(clinica), verificaFirma);
    },
    /** Sella lo encadenado hasta ahora: raiz de Merkle + cabeza, firmadas. */
    async sella(clinica: string, firmar: (s: Omit<Sello, 'firma'>) => string): Promise<Sello | null> {
      await this.drena();
      const es = await d.almacen.eslabones(clinica);
      if (es.length === 0) return null;
      const sinFirma: Omit<Sello, 'firma'> = { v: 1, clinica, hasta: es.length, raiz: raizDeHashes(es.map((e) => e.hash)), cabeza: es[es.length - 1]!.hash, creado: new Date(d.reloj()).toISOString() };
      const s: Sello = { ...sinFirma, firma: firmar(sinFirma) };
      await d.almacen.agregaSello(s);
      return s;
    },
  };
}

export type Libro = ReturnType<typeof creaLibro>;

export function libroEnMemoria(): AlmacenLibro & { todos: Map<string, Eslabon[]> } {
  const todos = new Map<string, Eslabon[]>();
  const sellos = new Map<string, Sello[]>();
  return {
    todos,
    async eslabones(c) { return [...(todos.get(c) ?? [])]; },
    async agrega(e) { todos.set(e.clinica, [...(todos.get(e.clinica) ?? []), e]); },
    async sellos(c) { return [...(sellos.get(c) ?? [])]; },
    async agregaSello(s) { sellos.set(s.clinica, [...(sellos.get(s.clinica) ?? []), s]); },
  };
}
