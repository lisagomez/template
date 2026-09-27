/**
 * Calendario vivo de 30 días (adaptado de `social-content-engine`, que absorbe a `canva-creator`).
 * Reglas de la fuente que se conservan:
 *  - Cadencia por tamaño del negocio (dueño solo: 2 por semana; «tres buenas a la semana ganan a
 *    catorce mediocres seguidas de tres meses de silencio»).
 *  - Mezcla 40 % útil · 30 % prueba · 20 % oferta · 10 % personas.
 *  - Una pieza de ORIGEN por día y su reuso en los demás canales; el reuso apunta a su origen.
 *  - Precio solo el confirmado por el dueño (con impuestos, como pide PROFECO); si falta, no se escribe.
 *  - Lo que exige algo real del dueño (un tip, la foto de un trabajo con permiso, el equipo) queda
 *    en `falta-algo`: nunca se inventa.
 *  - Se EXTIENDE, no se rehace; nada se publica ni se programa: aprobar deja la pieza lista para él.
 */
import { formatoDinero } from '../comun/dinero.js';
import { diaDeSemana, fechaCorta, sumaDias, type Dia } from '../comun/fechas.js';
import { fechasComercialesMx } from '../comun/temporada.js';
import { normaliza } from '../comun/texto.js';
import { VOZ_NEUTRA, type PerfilDeVoz } from '../comun/voz.js';
import type { Redactor } from '../comun/redactor.js';
import type { PerfilDeMarca } from '../marca/perfil.js';
import type { EstrategiaDe30Dias } from './estrategia.js';
import { piezaSvg, type DatosDePieza } from './pieza-svg.js';
import type { FormatoDePieza } from './formatos.js';
import { revisaPieza } from './revision-visual.js';

export type Canal = 'instagram' | 'facebook' | 'whatsapp';
export type Angulo = 'util' | 'prueba' | 'oferta' | 'personas';
export type Cadencia = 'solo' | 'con-ayuda' | 'marketing';

export interface FilaDeCalendario {
  readonly id: string;
  readonly dia: Dia;
  readonly canal: Canal;
  readonly ruta: 'imagen' | 'solo-texto';
  readonly formato: 'publicacion' | 'historia' | 'estado';
  readonly angulo: Angulo;
  readonly tema: string;
  readonly producto: string | null;
  /** En filas de reuso, el id de la pieza de origen (no se regenera otra idea). */
  readonly origen: string | null;
  readonly texto: string;
  readonly pieza: string | null;
  readonly redactor: string;
  readonly avisos: readonly string[];
  /** Qué le falta al dueño aportar; `null` si el borrador está completo. */
  readonly falta: string | null;
  readonly estado: 'borrador' | 'falta-algo' | 'aprobada' | 'descartada';
}

export interface OpcionesDeCalendario {
  readonly cadencia?: Cadencia;
  readonly canales?: readonly Canal[];
  /** Precios CONFIRMADOS por el dueño, en pesos con impuestos, por nombre de producto. */
  readonly precios?: Readonly<Record<string, number>>;
  readonly voz?: PerfilDeVoz;
}

export const DIAS_POR_CADENCIA: Readonly<Record<Cadencia, readonly number[]>> = {
  solo: [2, 5], 'con-ayuda': [1, 3, 5], marketing: [1, 2, 3, 4, 5],
};

/** 40/30/20/10 en una secuencia de diez que se repite. */
const MEZCLA: readonly Angulo[] = ['oferta', 'util', 'prueba', 'util', 'oferta', 'prueba', 'util', 'personas', 'prueba', 'util'];

const REUSO: Readonly<Record<Canal, readonly [FilaDeCalendario['formato'], FormatoDePieza]>> = {
  instagram: ['publicacion', 'vertical'], facebook: ['publicacion', 'horizontal'], whatsapp: ['estado', 'historia'],
};

const FALTA: Readonly<Record<Exclude<Angulo, 'oferta'>, string>> = {
  util: 'el tip que quieras enseñar (una línea: cómo se conserva, con qué se acompaña...)',
  prueba: 'una foto de un pedido o trabajo real y el permiso del cliente si aparece',
  personas: 'una foto tuya o de tu equipo y una línea de quién es',
};

/** `oferta` solo cuando la estrategia propuso un paquete real; empujar un producto no es una oferta. */
interface Hueco { readonly angulo: Angulo; readonly producto: string | null; readonly ocasion: string | null; readonly tema: string; readonly oferta: string | null }

function huecos(e: EstrategiaDe30Dias, n: number, marca: PerfilDeMarca): Hueco[] {
  const ofertas: Hueco[] = [
    ...e.empujar.map((x) => ({ angulo: 'oferta' as const, producto: x.producto, ocasion: x.fecha?.nombre ?? null, tema: x.angulo, oferta: null })),
    ...e.ofertas.filter((o) => o.tipo === 'paquete' && o.descripcion.includes(' + ')).map((o) => ({ angulo: 'oferta' as const, producto: o.descripcion.split(' + ')[0]!, ocasion: null, tema: o.porque, oferta: `Paquete: ${o.descripcion}` })),
  ];
  const productos = [...e.empujar.map((x) => x.producto), ...e.mantener.map((x) => x.producto)];
  let o = 0, p = 0;
  return Array.from({ length: n }, (_, i) => {
    const angulo = MEZCLA[i % MEZCLA.length]!;
    if (angulo === 'oferta' && ofertas.length) return ofertas[o++ % ofertas.length]!;
    const producto = productos.length ? productos[p++ % productos.length]! : null;
    const a = angulo === 'oferta' ? 'util' : angulo;
    return { angulo: a, producto: a === 'personas' ? null : producto, ocasion: null, oferta: null, tema: a === 'personas' ? `quién está detrás de ${marca.nombre}` : a === 'prueba' ? `pedido real de ${producto ?? 'un cliente'}` : `algo útil sobre ${producto ?? 'lo que haces'}` };
  });
}

function conflictos(dia: Dia, h: Hueco, e: EstrategiaDe30Dias): string[] {
  const avisos: string[] = [];
  const festivo = fechasComercialesMx(Number(dia.slice(0, 4))).find((f) => f.precision === 'exacta' && f.desde === dia && f.desde === f.hasta);
  if (h.oferta && festivo) avisos.push(`promoción el mismo día de ${festivo.nombre}: revisa si abres y si conviene`);
  if (h.oferta && dia > e.hasta) avisos.push('oferta después de que termina la vigencia del brief');
  return avisos;
}

function hashtags(marca: PerfilDeMarca, h: Hueco, cuantas: number): string {
  const e = (s: string) => `#${normaliza(s).replace(/\s+/g, '')}`;
  return [marca.nombre, h.producto, h.ocasion, 'hechoenmexico', 'consumelocal'].filter((x): x is string => Boolean(x)).map(e).slice(0, cuantas).join(' ');
}

async function filasDelDia(dia: Dia, h: Hueco, marca: PerfilDeMarca, redactor: Redactor, o: OpcionesDeCalendario, e: EstrategiaDe30Dias): Promise<FilaDeCalendario[]> {
  const canales = o.canales ?? ['instagram', 'facebook', 'whatsapp'];
  const precio = h.producto ? o.precios?.[normaliza(h.producto)] : undefined;
  const falta = h.angulo !== 'oferta' ? FALTA[h.angulo] : null;
  const origenId = `${dia}-${canales[0]}`;
  const filas: FilaDeCalendario[] = [];
  for (const [i, canal] of canales.entries()) {
    const [formato, formatoPieza] = REUSO[canal];
    const hechos: Record<string, string> = { producto: h.producto ?? marca.nombre, negocio: marca.nombre, canal, formato, fecha: dia };
    if (h.ocasion) hechos['ocasion'] = h.ocasion;
    if (precio !== undefined) hechos['precio'] = formatoDinero(Math.round(precio * 100));
    if (h.oferta) hechos['oferta'] = h.oferta;
    if (falta) hechos['pendiente'] = falta;
    const etiquetas = hashtags(marca, h, canal === 'instagram' ? 5 : canal === 'facebook' ? 2 : 0);
    if (etiquetas) hechos['etiquetas'] = etiquetas;
    const r = await redactor.redacta({ tarea: 'caption', voz: o.voz ?? VOZ_NEUTRA, hechos, limite: canal === 'whatsapp' ? 140 : canal === 'facebook' ? 500 : 2200 });
    const avisos = [...r.avisos, ...conflictos(dia, h, e), ...(h.oferta ? ['paquete: valida que te deje margen antes de publicarlo'] : []), ...(h.producto && precio === undefined && h.angulo === 'oferta' ? ['sin precio confirmado: no se escribió precio (confírmalo con impuestos)'] : []), ...(marca.confirmado ? [] : ['la marca aún no está confirmada: dile «sí» a la vista previa'])];
    const datos: DatosDePieza = { titular: h.ocasion ?? h.producto ?? marca.nombre, apoyo: h.ocasion ? h.producto ?? undefined : marca.lema ?? undefined, precio: hechos['precio'], etiqueta: h.oferta ? 'Paquete de la semana' : h.ocasion ? 'Temporada' : undefined, formato: formatoPieza, semilla: origenId };
    const vistas = revisaPieza(marca, datos, { canal, precioConfirmado: precio !== undefined }).map((x) => `imagen: ${x.detalle}`);
    filas.push({
      id: `${dia}-${canal}`, dia, canal, ruta: 'imagen', formato, angulo: h.angulo, tema: h.tema, producto: h.producto,
      origen: i === 0 ? null : origenId, texto: r.texto, redactor: r.redactor, avisos: [...avisos, ...vistas], falta, estado: falta ? 'falta-algo' : 'borrador',
      pieza: piezaSvg(marca, datos),
    });
  }
  return filas;
}

/** Un calendario nuevo a 30 días desde `e.desde`, con la cadencia pedida. */
export async function calendarioDe30Dias(e: EstrategiaDe30Dias, marca: PerfilDeMarca, redactor: Redactor, o: OpcionesDeCalendario = {}): Promise<FilaDeCalendario[]> {
  const dias = Array.from({ length: 30 }, (_, i) => sumaDias(e.desde, i)).filter((d) => DIAS_POR_CADENCIA[o.cadencia ?? 'solo'].includes(diaDeSemana(d)));
  const plan = huecos(e, dias.length, marca);
  const filas: FilaDeCalendario[] = [];
  for (const [i, dia] of dias.entries()) filas.push(...(await filasDelDia(dia, plan[i]!, marca, redactor, o, e)));
  return filas;
}

/** Extiende sin rehacer: lo que ya existe (aprobado, descartado o en borrador) se queda igual. */
export function extiendeCalendario(existentes: readonly FilaDeCalendario[], nuevas: readonly FilaDeCalendario[]): FilaDeCalendario[] {
  const ultimo = existentes.reduce<Dia>((m, f) => (f.dia > m ? f.dia : m), '0000-00-00');
  return [...existentes, ...nuevas.filter((f) => f.dia > ultimo)];
}

/** Lo que el dueño ve al abrir: qué está listo, qué falta y dónde empieza el hueco. */
export function estadoDelCalendario(filas: readonly FilaDeCalendario[], hoy: Dia): { readonly aprobadas: number; readonly borradores: number; readonly faltaAlgo: number; readonly huecoDesde: Dia } {
  const ultimo = filas.reduce<Dia>((m, f) => (f.dia > m ? f.dia : m), hoy);
  return {
    aprobadas: filas.filter((f) => f.estado === 'aprobada').length,
    borradores: filas.filter((f) => f.estado === 'borrador').length,
    faltaAlgo: filas.filter((f) => f.estado === 'falta-algo').length,
    huecoDesde: sumaDias(ultimo, 1),
  };
}

/** El clic del dueño. Aprobar NO publica: deja la pieza lista para que él la suba. */
export function marcaFila(fila: FilaDeCalendario, estado: 'aprobada' | 'descartada'): FilaDeCalendario {
  return { ...fila, estado };
}

export function describeFila(f: FilaDeCalendario): string {
  return `${fechaCorta(f.dia)} · ${f.canal} · ${f.angulo}${f.origen ? ' (reuso)' : ''}`;
}
