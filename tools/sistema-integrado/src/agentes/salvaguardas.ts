/**
 * Salvaguardas deterministas sobre lo que entra y sale de un agente:
 *   L5 citas: toda propuesta cita IDs que EXISTEN en el catálogo y que se le permitieron.
 *   L6 inyección: el texto de terceros va delimitado; se detectan (y se reportan) instrucciones incrustadas. La
 *      defensa real es estructural: la salida del LLM nunca cambia un estado sin aprobación humana.
 *   L8 certificación: ninguna salida promete certificar.
 *   C4 minimización: CURP, RFC, NSS, CLABE, correos y teléfonos salen como marcadores ANTES de salir hacia el LLM.
 */
import { CATALOGO, existe, type Catalogo } from '../catalogo/index.js';
import type { SalidaAgente, TarjetaAgente, Propuesta } from './tipos.js';

// ───────────────────────── C4 · minimización ─────────────────────────

const PATRONES_PERSONALES: readonly (readonly [string, RegExp])[] = [
  ['CURP', /\b[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/g],
  ['RFC', /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/g],
  ['CLABE', /\b\d{18}\b/g],
  ['NSS', /\b\d{11}\b/g],
  ['CORREO', /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g],
  ['TELÉFONO', /(?:\+?52[\s.-]?)?(?:\(?\d{2,3}\)?[\s.-]?)\d{3,4}[\s.-]?\d{4}\b/g],
];

/** Reemplaza datos personales por marcadores y cuenta cuántos de cada tipo quitó. */
export function minimiza(texto: string): { texto: string; conteo: Record<string, number> } {
  const conteo: Record<string, number> = {};
  let salida = texto;
  for (const [tipo, re] of PATRONES_PERSONALES) {
    salida = salida.replace(re, () => { conteo[tipo] = (conteo[tipo] ?? 0) + 1; return `[${tipo}]`; });
  }
  return { texto: salida, conteo };
}

/** Minimiza también dentro de estructuras (datos del agente). */
export function minimizaValor(v: unknown, conteo: Record<string, number> = {}): { valor: unknown; conteo: Record<string, number> } {
  if (typeof v === 'string') {
    const m = minimiza(v);
    for (const [k, n] of Object.entries(m.conteo)) conteo[k] = (conteo[k] ?? 0) + n;
    return { valor: m.texto, conteo };
  }
  if (Array.isArray(v)) return { valor: v.map((x) => minimizaValor(x, conteo).valor), conteo };
  if (v && typeof v === 'object') return { valor: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, minimizaValor(x, conteo).valor])), conteo };
  return { valor: v, conteo };
}

// ───────────────────────── L6 · texto de terceros ─────────────────────────

const ETIQUETA = 'evidencia_de_terceros';

/** Envuelve texto ajeno; neutraliza cualquier intento de cerrar la etiqueta desde dentro. */
export function delimita(titulo: string, texto: string): string {
  const limpio = texto.replace(new RegExp(`</?\\s*${ETIQUETA}`, 'gi'), '‹etiqueta retirada›');
  const t = titulo.replace(/["<>]/g, '');
  return `<${ETIQUETA} titulo="${t}">\n${limpio}\n</${ETIQUETA}>`;
}

const INSTRUCCIONES_INCRUSTADAS = [
  /ignora\s+(todas?\s+)?(las\s+|tus\s+|sus\s+)?(instrucciones|reglas|indicaciones)/i,
  /olvida\s+(todo\s+)?(lo\s+anterior|tus\s+reglas|las\s+instrucciones)/i,
  /marca\s+(todo|todos\s+los\s+requisitos|cada\s+requisito)\s+como\s+(cumplid|cubiert|aprobad)/i,
  /(apru[eé]ba(lo|la)?|aprueba\s+(esto|este\s+documento))\s+(autom[aá]tic|sin\s+revis)/i,
  /\b(system\s+prompt|prompt\s+del\s+sistema|developer\s+message)\b/i,
  /\bignore\s+(all\s+)?(previous|prior)\s+instructions\b/i,
  /\b(ahora\s+eres|act[uú]a\s+como)\b/i,
];

export const tieneInstruccionIncrustada = (texto: string): boolean => INSTRUCCIONES_INCRUSTADAS.some((re) => re.test(texto));

// ───────────────────────── L8 · certificación ─────────────────────────

const PROMESAS = [
  /\b(te|le|les|los|las)\s+certific(amos|aremos|a)\b/i,
  /\bcertificaci[oó]n\s+(garantizada|asegurada|incluida|inmediata)\b/i,
  /\bgarantiz\w*\s+(la\s+|tu\s+|su\s+)?certificaci[oó]n\b/i,
  /\b(obt[eé]n|consigue|logra)\s+(ya\s+)?(tu|la|su)\s+certificaci[oó]n\b/i,
  /\b(quedar[aá][sn]?|quedas|quedan|estar[aá][sn]?)\s+certificad[oa]s?\b/i,
  /\blist[oa]s?\s+para\s+(ser\s+)?certificad/i,
  /\b(certificad[oa]s?|certifica)\s+(por|con)\s+(nosotros|esta\s+(app|aplicaci[oó]n|plataforma))\b/i,
  /\bemitimos\s+(el|su|tu)\s+certificado\b/i,
  /\bguaranteed\s+certification\b/i,
];

/** Rechazo explícito en la oración: lo que hace de una frase CITADA un deslinde («No incluyo el indicador "…"»). */
const RECHAZO = /\b(no\s+(incluyo|incluimos|se\s+incluye|propongo|proponemos|se\s+puede|es\s+posible|podemos|puede)|ning[uú]n[oa]?|nadie|nunca|jam[aá]s)\b/i;
const COMILLAS = `'"«»“”‘’`;

/**
 * Frases que prometen certificación. Devuelve los fragmentos encontrados (vacío = limpio). No son promesa:
 * - una coincidencia negada pegada a la frase («no te certifica», «nunca garantizamos la certificación»);
 * - una coincidencia CITADA entre comillas en una oración que la rechaza explícitamente (medido el 2026-10-01: el
 *   agente escribió «No incluyo el indicador solicitado con el nombre '…certificación garantizada…' porque ninguna
 *   herramienta puede garantizar…» y el detector lo tomaba por promesa). Sin comillas, o sin rechazo, sigue contando.
 */
export function promesasDeCertificacion(texto: string): string[] {
  const negada = (i: number) => /\b(no|nunca|jam[aá]s|ni)\s+(\w+\s+)?$/i.test(texto.slice(Math.max(0, i - 24), i));
  const citadaYRechazada = (i: number, fin: number) => {
    const ini = Math.max(texto.lastIndexOf('.', i), texto.lastIndexOf('?', i), texto.lastIndexOf('!', i), texto.lastIndexOf('\n', i)) + 1;
    const cierre = texto.slice(fin).search(/[.?!\n]/);
    const oracion = texto.slice(ini, cierre < 0 ? texto.length : fin + cierre);
    const antes = texto.slice(ini, i), despues = texto.slice(fin, cierre < 0 ? texto.length : fin + cierre);
    const abre = [...antes].filter((ch) => COMILLAS.includes(ch)).length % 2 === 1;
    const cierra = [...despues].some((ch) => COMILLAS.includes(ch));
    return abre && cierra && RECHAZO.test(oracion.replace(texto.slice(i, fin), ''));
  };
  return PROMESAS.flatMap((re) => {
    const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    return [...texto.matchAll(global)]
      .filter((m) => !negada(m.index ?? 0) && !citadaYRechazada(m.index ?? 0, (m.index ?? 0) + m[0].length))
      .map((m) => m[0]);
  });
}

// ───────────────────────── L5 · forma y citas ─────────────────────────

/** Extrae el primer objeto JSON del texto (tolera cercas ```json y texto alrededor). */
export function extraeJson(texto: string): unknown {
  const sinCercas = texto.replace(/```(?:json)?/gi, '');
  const inicio = sinCercas.indexOf('{');
  const fin = sinCercas.lastIndexOf('}');
  if (inicio < 0 || fin <= inicio) throw new Error('la respuesta no trae un objeto JSON');
  return JSON.parse(sinCercas.slice(inicio, fin + 1));
}

const esTexto = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

/** Valida la FORMA de la salida contra la tarjeta del agente. Devuelve la salida tipada o la lista de errores. */
export function validaForma(obj: unknown, tarjeta: TarjetaAgente): { ok: true; salida: SalidaAgente } | { ok: false; errores: string[] } {
  const errores: string[] = [];
  if (!obj || typeof obj !== 'object') return { ok: false, errores: ['la salida no es un objeto'] };
  const o = obj as Record<string, unknown>;
  if (!esTexto(o.resumen, 2000)) errores.push('falta «resumen» (texto de hasta 2000 caracteres)');
  if (!Array.isArray(o.propuestas)) errores.push('falta «propuestas» (lista)');
  const propuestas: Propuesta[] = [];
  for (const [i, p] of (Array.isArray(o.propuestas) ? o.propuestas : []).entries()) {
    const q = (p ?? {}) as Record<string, unknown>;
    if (!esTexto(q.tipo, 60) || !tarjeta.tipos.includes(q.tipo)) errores.push(`propuesta ${i + 1}: «tipo» debe ser uno de ${tarjeta.tipos.join(', ')}`);
    if (!esTexto(q.titulo, 200)) errores.push(`propuesta ${i + 1}: falta «titulo»`);
    if (!esTexto(q.detalle, 4000)) errores.push(`propuesta ${i + 1}: falta «detalle»`);
    if (!Array.isArray(q.requisitos) || !q.requisitos.every((x) => typeof x === 'string')) errores.push(`propuesta ${i + 1}: «requisitos» debe ser una lista de IDs`);
    const datos = q.datos && typeof q.datos === 'object' && !Array.isArray(q.datos)
      ? Object.fromEntries(Object.entries(q.datos as Record<string, unknown>).filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v))) as Record<string, string | number | boolean>
      : undefined;
    propuestas.push({ tipo: String(q.tipo ?? ''), titulo: String(q.titulo ?? ''), detalle: String(q.detalle ?? ''), requisitos: Array.isArray(q.requisitos) ? q.requisitos.map(String) : [], ...(datos ? { datos } : {}) });
  }
  let documento: SalidaAgente['documento'];
  if (o.documento !== undefined && o.documento !== null) {
    const d = o.documento as Record<string, unknown>;
    const secciones = Array.isArray(d.secciones) ? d.secciones.map((s) => {
      const x = (s ?? {}) as Record<string, unknown>;
      return { titulo: String(x.titulo ?? ''), parrafos: Array.isArray(x.parrafos) ? x.parrafos.map(String).filter((t) => t.trim()) : [] };
    }) : [];
    if (!esTexto(d.titulo, 200) || !secciones.length || secciones.some((s) => !s.titulo || !s.parrafos.length)) errores.push('«documento» necesita título y secciones con párrafos');
    documento = { titulo: String(d.titulo ?? ''), secciones };
  }
  if (tarjeta.requiereDocumento && !documento) errores.push('este agente debe devolver «documento»');
  const preguntasAbiertas = Array.isArray(o.preguntasAbiertas) ? o.preguntasAbiertas.map(String) : [];
  if (errores.length) return { ok: false, errores };
  return { ok: true, salida: { resumen: String(o.resumen), propuestas, ...(documento ? { documento } : {}), preguntasAbiertas } };
}

export interface RevisionCitas {
  readonly ok: boolean;
  readonly citados: readonly string[];
  /** IDs que no existen en el catálogo (inventados). */
  readonly inexistentes: readonly string[];
  /** IDs que existen pero no se le permitieron a este agente en esta tarea. */
  readonly noPermitidos: readonly string[];
  /** Propuestas sin ninguna cita. */
  readonly sinCita: readonly string[];
}

const PATRON_ID = /\bSGI-[A-Z]{1,2}-[0-9][0-9.]*-\d{2}\b/g;

/** Revisa TODAS las citas: las de `requisitos` y las que aparezcan escritas dentro de cualquier texto. */
export function revisaCitas(s: SalidaAgente, permitidos: readonly string[], c: Catalogo = CATALOGO): RevisionCitas {
  const textos = [s.resumen, ...s.preguntasAbiertas, ...s.propuestas.flatMap((p) => [p.titulo, p.detalle, ...Object.values(p.datos ?? {}).map(String)]),
    ...(s.documento ? [s.documento.titulo, ...s.documento.secciones.flatMap((x) => [x.titulo, ...x.parrafos])] : [])];
  const enTexto = textos.flatMap((t) => t.match(PATRON_ID) ?? []);
  const citados = [...new Set([...s.propuestas.flatMap((p) => p.requisitos), ...enTexto])].sort();
  const inexistentes = citados.filter((id) => !existe(id, c));
  const permitido = new Set(permitidos);
  const noPermitidos = citados.filter((id) => existe(id, c) && !permitido.has(id));
  const sinCita = s.propuestas.filter((p) => p.requisitos.length === 0).map((p) => p.titulo);
  return { ok: !inexistentes.length && !noPermitidos.length && !sinCita.length, citados, inexistentes, noPermitidos, sinCita };
}

/** L5, último recurso: quita de una salida las citas a IDs que no existen o no estaban permitidos, en `requisitos` y en
 * el texto, y descarta la propuesta que se queda sin ninguna cita. Deja una pregunta abierta SIN el ID (si lo llevara,
 * el validador lo volvería a encontrar): el ID quitado viaja en la traza y en los avisos. */
export function quitaCitas(s: SalidaAgente, fuera: readonly string[]): SalidaAgente {
  const malos = new Set(fuera);
  const limpia = (t: string) => t.replace(PATRON_ID, (id) => (malos.has(id) ? '(requisito inexistente)' : id));
  const propuestas = s.propuestas
    .map((p) => ({
      ...p, titulo: limpia(p.titulo), detalle: limpia(p.detalle), requisitos: p.requisitos.filter((id) => !malos.has(id)),
      ...(p.datos ? { datos: Object.fromEntries(Object.entries(p.datos).map(([k, v]) => [k, typeof v === 'string' ? limpia(v) : v])) } : {}),
    }))
    .filter((p) => p.requisitos.length > 0);
  return {
    resumen: limpia(s.resumen), propuestas,
    ...(s.documento ? { documento: { titulo: limpia(s.documento.titulo), secciones: s.documento.secciones.map((x) => ({ titulo: limpia(x.titulo), parrafos: x.parrafos.map(limpia) })) } } : {}),
    preguntasAbiertas: [...s.preguntasAbiertas.map(limpia), 'Se pidió citar un requisito que no existe en el catálogo (o que no correspondía): se quitó la cita. ¿Qué requisito real atiende eso?'],
  };
}

/** Todo el texto de una salida (para buscar promesas de certificación o genericidad). */
export const textoDeSalida = (s: SalidaAgente): string => [s.resumen, ...s.propuestas.flatMap((p) => [p.titulo, p.detalle]),
  ...(s.documento ? [s.documento.titulo, ...s.documento.secciones.flatMap((x) => [x.titulo, ...x.parrafos])] : []), ...s.preguntasAbiertas].join('\n');
