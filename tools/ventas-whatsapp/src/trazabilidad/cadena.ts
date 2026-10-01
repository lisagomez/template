/**
 * Trazabilidad con cadena de hashes, POR INQUILINO (el diseño de `tools/etiquetas-gs1/src/cadena.ts`
 * y `anclaje.ts`, adaptado): solo se agrega; cada eslabón lleva la secuencia y el hash del
 * anterior, y su propio hash es SHA-256 sobre el eslabón COMPLETO canonicalizado (llaves ordenadas,
 * RFC 8785 para lo que usamos). Hashear solo los datos dejaría cambiar el actor o la fecha.
 *
 * Qué se encadena: cada tarea A2A que importa (pedido, liga, pago, conversión, traspaso, reserva,
 * lead, catálogo) con su `tenant`, `contextId` y `taskId`; cada mensaje que entra y sale; y cada
 * acción del dueño. Es la auditoría de la fuente («trazas con tenant, contextId y taskId para
 * auditar y cobrar por uso»), hecha a prueba de alteración.
 *
 * SIN DATOS PERSONALES: el contenido entra como HUELLA (HMAC-SHA256 con una llave de la
 * plataforma, no un SHA a secas: un teléfono se adivinaría por fuerza bruta) y el cliente como
 * seudónimo. El texto vive en su colección y se puede borrar (derechos ARCO); la cadena sigue
 * verificando porque solo guarda la huella.
 *
 * Tamper-EVIDENT, no tamper-proof: quien escribe el almacén puede recalcular la cadena entera. Eso
 * lo delata el ANCLAJE: la raíz de Merkle (RFC 6962) de lo nuevo, firmada (Ed25519) y guardada
 * donde el inquilino no escribe. Lo que queda sin anclar es la ventana de riesgo, y se reporta.
 */
import { createHash, createHmac } from 'node:crypto';

export type TipoEslabon = 'MENSAJE_ENTRANTE' | 'MENSAJE_SALIENTE' | 'TAREA_A2A' | 'ACCION_DUENO' | 'CANAL';

export interface Eslabon {
  v: 1;
  inquilino: string;
  seq: number;
  /** ISO UTC. */
  instante: string;
  tipo: TipoEslabon;
  /** Id del objeto: wamid, taskId, casoId. */
  ref: string;
  /** HMAC-SHA256 del contenido (hex). Nunca el contenido. */
  huella: string;
  /** Seudónimo: `agente`, `dueno`, `sistema`, `cliente:<8 hex>`, `dominio:<nombre>`. */
  actor: string;
  /** Solo datos sin PII: montos, estados, categorías, ids internos. */
  datos: Record<string, string | number | boolean | null>;
  anterior: string;
  hash: string;
}

export interface Ancla {
  v: 1;
  inquilino: string;
  desdeSeq: number;
  hastaSeq: number;
  raiz: string;
  /** Hash del último eslabón cubierto. */
  cabeza: string;
  anclaAnterior: string;
  creada: string;
  firma: string;
}

/** Donde viven las anclas: NO en el almacén del inquilino. */
export interface AlmacenAnclas {
  anclas(inquilino: string): Promise<Ancla[]>;
  agrega(a: Ancla): Promise<void>;
}

export const GENESIS = '0'.repeat(64);

/** JSON canónico: llaves ordenadas en todos los niveles (RFC 8785 para strings, enteros y booleanos). */
export function canonico(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(',')}}`;
}

export const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
export const hashDeEslabon = (e: Omit<Eslabon, 'hash'>) => sha256(canonico(e));

/** Raíz de Merkle (RFC 6962): hoja = H(0x00 ‖ dato), nodo = H(0x01 ‖ izq ‖ der). */
export function raizMerkle(hashes: string[]): string {
  if (!hashes.length) return sha256('');
  let nivel: Buffer[] = hashes.map((h) => createHash('sha256').update(Buffer.concat([Buffer.from([0]), Buffer.from(h, 'hex')])).digest());
  while (nivel.length > 1) {
    const siguiente: Buffer[] = [];
    for (let i = 0; i < nivel.length; i += 2) {
      const izq = nivel[i]!;
      const der = nivel[i + 1];
      siguiente.push(der ? createHash('sha256').update(Buffer.concat([Buffer.from([1]), izq, der])).digest() : izq);
    }
    nivel = siguiente;
  }
  return nivel[0]!.toString('hex');
}

export type Verificacion = { ok: true; n: number; cabeza: string } | { ok: false; n: number; rotoEn: number; motivo: string };

/** Recorre la cadena: secuencia continua, enlace con el anterior y hash de cada eslabón. */
export function verificaCadena(eslabones: Eslabon[]): Verificacion {
  const orden = [...eslabones].sort((a, b) => a.seq - b.seq);
  let anterior = GENESIS;
  for (let i = 0; i < orden.length; i++) {
    const e = orden[i]!;
    if (e.seq !== i + 1) return { ok: false, n: orden.length, rotoEn: i + 1, motivo: `falta el eslabón ${i + 1} (hay un hueco en la secuencia)` };
    if (e.anterior !== anterior) return { ok: false, n: orden.length, rotoEn: e.seq, motivo: 'no enlaza con el anterior' };
    const { hash, ...resto } = e;
    if (hashDeEslabon(resto) !== hash) return { ok: false, n: orden.length, rotoEn: e.seq, motivo: 'el contenido del eslabón cambió' };
    anterior = hash;
  }
  return { ok: true, n: orden.length, cabeza: anterior };
}

/** Compara la cadena contra sus anclas firmadas: una cadena recalculada entera no cuadra con la raíz. */
export function verificaAnclas(eslabones: Eslabon[], anclas: Ancla[], verificaFirma: (a: Omit<Ancla, 'firma'>, firma: string) => boolean): { ok: boolean; ancladas: number; sinAnclar: number; motivo?: string } {
  const orden = [...eslabones].sort((a, b) => a.seq - b.seq);
  let previa = GENESIS;
  let hasta = 0;
  for (const a of [...anclas].sort((x, y) => x.desdeSeq - y.desdeSeq)) {
    const { firma, ...sinFirma } = a;
    if (!verificaFirma(sinFirma, firma)) return { ok: false, ancladas: hasta, sinAnclar: orden.length - hasta, motivo: `firma inválida en el ancla ${a.desdeSeq}-${a.hastaSeq}` };
    if (a.anclaAnterior !== previa) return { ok: false, ancladas: hasta, sinAnclar: orden.length - hasta, motivo: 'las anclas no están encadenadas' };
    const tramo = orden.filter((e) => e.seq >= a.desdeSeq && e.seq <= a.hastaSeq);
    if (tramo.length !== a.hastaSeq - a.desdeSeq + 1) return { ok: false, ancladas: hasta, sinAnclar: orden.length - hasta, motivo: `faltan eslabones anclados (${a.desdeSeq}-${a.hastaSeq})` };
    if (raizMerkle(tramo.map((e) => e.hash)) !== a.raiz || tramo[tramo.length - 1]!.hash !== a.cabeza) {
      return { ok: false, ancladas: hasta, sinAnclar: orden.length - hasta, motivo: `la cadena ya no cuadra con el ancla ${a.desdeSeq}-${a.hastaSeq}: se reescribió` };
    }
    previa = sha256(canonico(a));
    hasta = a.hastaSeq;
  }
  return { ok: true, ancladas: hasta, sinAnclar: orden.length - hasta };
}

export interface DepsTrazabilidad {
  /** Lee y agrega eslabones del inquilino (su colección `cadena`). */
  eslabones(inquilino: string): Promise<Eslabon[]>;
  guarda(e: Eslabon): Promise<void>;
  /** Llave de las huellas (HMAC). Nunca se imprime. */
  llaveHuella: string;
  reloj: () => number;
}

/** El registrador: serializa por inquilino (la secuencia no se pisa aunque lleguen dos a la vez). */
export function creaTrazabilidad(d: DepsTrazabilidad) {
  const colas = new Map<string, Promise<unknown>>();
  /** La cabeza de cada cadena, en memoria: no se relee la cadena entera en cada eslabón. */
  const cabezas = new Map<string, { seq: number; hash: string }>();
  const huella = (contenido: unknown) => createHmac('sha256', d.llaveHuella).update(canonico(contenido)).digest('hex');
  const seudonimo = (waId: string) => `cliente:${createHmac('sha256', d.llaveHuella).update(`contacto|${waId}`).digest('hex').slice(0, 8)}`;
  function registra(inquilino: string, tipo: TipoEslabon, ref: string, contenido: unknown, datos: Eslabon['datos'], actor: string): Promise<Eslabon> {
    const previa = colas.get(inquilino) ?? Promise.resolve();
    const siguiente = previa.catch(() => undefined).then(async () => {
      let cabeza = cabezas.get(inquilino);
      if (!cabeza) {
        const ultimo = (await d.eslabones(inquilino)).reduce<Eslabon | null>((m, e) => (!m || e.seq > m.seq ? e : m), null);
        cabeza = { seq: ultimo?.seq ?? 0, hash: ultimo?.hash ?? GENESIS };
      }
      const base: Omit<Eslabon, 'hash'> = {
        v: 1, inquilino, seq: cabeza.seq + 1, instante: new Date(d.reloj()).toISOString(), tipo, ref,
        huella: huella(contenido), actor, datos, anterior: cabeza.hash,
      };
      const e: Eslabon = { ...base, hash: hashDeEslabon(base) };
      await d.guarda(e);
      cabezas.set(inquilino, { seq: e.seq, hash: e.hash });
      return e;
    });
    colas.set(inquilino, siguiente);
    return siguiente;
  }
  return {
    registra,
    seudonimo,
    huella,
    /** Espera lo que esté en vuelo (pruebas, antes de anclar). */
    async drena() { await Promise.all([...colas.values()].map((p) => p.catch(() => undefined))); },
    async verifica(inquilino: string) { return verificaCadena(await d.eslabones(inquilino)); },
    /** Ancla lo nuevo desde la última ancla: raíz de Merkle firmada con la llave de la plataforma. */
    async ancla(inquilino: string, anclas: AlmacenAnclas, firmar: (a: Omit<Ancla, 'firma'>) => string): Promise<Ancla | null> {
      await this.drena();
      const todos = (await d.eslabones(inquilino)).sort((a, b) => a.seq - b.seq);
      const previas = await anclas.anclas(inquilino);
      const ultima = previas.reduce<Ancla | null>((m, a) => (!m || a.hastaSeq > m.hastaSeq ? a : m), null);
      const nuevos = todos.filter((e) => e.seq > (ultima?.hastaSeq ?? 0));
      if (!nuevos.length) return null;
      const sinFirma: Omit<Ancla, 'firma'> = {
        v: 1, inquilino, desdeSeq: nuevos[0]!.seq, hastaSeq: nuevos[nuevos.length - 1]!.seq, raiz: raizMerkle(nuevos.map((e) => e.hash)),
        cabeza: nuevos[nuevos.length - 1]!.hash, anclaAnterior: ultima ? sha256(canonico(ultima)) : GENESIS, creada: new Date(d.reloj()).toISOString(),
      };
      const a: Ancla = { ...sinFirma, firma: firmar(sinFirma) };
      await anclas.agrega(a);
      return a;
    },
  };
}

export type Trazabilidad = ReturnType<typeof creaTrazabilidad>;

/** Anclas en memoria (pruebas); la app las guarda en un archivo aparte del almacén. */
export function anclasEnMemoria(): AlmacenAnclas & { todas: Ancla[] } {
  const todas: Ancla[] = [];
  return { todas, async anclas(i) { return todas.filter((a) => a.inquilino === i); }, async agrega(a) { todas.push(a); } };
}
