/**
 * Los controles de la AISIA firmada (propuesta §7) como código que BLOQUEA. Lo que no se puede firmar
 * se rediseña: la cara de quien no consintió se desenfoca por defecto; un dato personal en pantalla, una
 * segunda voz sin consentimiento, música ajena o un corte que parte lo que dijo otra persona bloquean el
 * borrador. Detección, nunca reconocimiento:
 * ninguna función de aquí sabe QUIÉN es una cara; solo DÓNDE está y cuánto tiempo.
 */
import type { Caja, Consentimiento, DeteccionCara, Desenfoque, HallazgoPantalla, Medidas, Observacion, PistaCara, TipoDeDato, Tramo } from './tipos.js';
import { costura, type Edl } from './cortes.js';

export const REGLAS_DE_PRIVACIDAD = { confianzaMin: 0.8, iouMin: 0.2, presenciaSujeto: 0.5, margenCaja: 0.3, intervaloMuestreo: 0.5 } as const;

const iou = (a: Caja, b: Caja): number => {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.ancho, b.x + b.ancho), y1 = Math.min(a.y + a.alto, b.y + b.alto);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return inter / (a.ancho * a.alto + b.ancho * b.alto - inter || 1);
};

/** Agrupa detecciones de cuadros muestreados en pistas (misma cara que se mueve poco). */
export function pistasDeCaras(detecciones: readonly DeteccionCara[], muestras: number, r = REGLAS_DE_PRIVACIDAD): PistaCara[] {
  const pistas: PistaCara[] = [];
  const porTiempo = [...detecciones].filter((d) => d.confianza >= r.confianzaMin).sort((a, b) => a.t - b.t);
  for (const d of porTiempo) {
    const p = pistas.find((q) => { const u = q.detecciones[q.detecciones.length - 1]; return u !== undefined && u.t < d.t && iou(u, d) >= r.iouMin; });
    if (p) p.detecciones.push(d); else pistas.push({ id: pistas.length + 1, detecciones: [d], presencia: 0, areaMedia: 0 });
  }
  for (const p of pistas) {
    p.presencia = new Set(p.detecciones.map((d) => d.t)).size / Math.max(1, muestras);
    p.areaMedia = p.detecciones.reduce((s, d) => s + d.ancho * d.alto, 0) / p.detecciones.length;
  }
  return pistas;
}

/** El sujeto: la cara que está en al menos la mitad del clip y es la más grande (el dueño a cámara). */
export function sujeto(pistas: readonly PistaCara[], r = REGLAS_DE_PRIVACIDAD): PistaCara | null {
  return [...pistas].filter((p) => p.presencia >= r.presenciaSujeto).sort((a, b) => b.areaMedia - a.areaMedia)[0] ?? null;
}

const agranda = (c: Caja, m: number, lim = { ancho: 1080, alto: 1920 }): Caja => {
  const dx = c.ancho * m, dy = c.alto * m;
  const x = Math.max(0, Math.floor(c.x - dx)), y = Math.max(0, Math.floor(c.y - dy));
  return { x, y, ancho: Math.min(lim.ancho - x, Math.ceil(c.ancho + 2 * dx)), alto: Math.min(lim.alto - y, Math.ceil(c.alto + 2 * dy)) };
};

/**
 * Desenfoque por defecto de toda cara que no es el sujeto ni está marcada con consentimiento. Cada
 * detección cubre medio intervalo de muestreo antes y después: entre dos muestras la cara no queda al aire.
 */
export function desenfoquesDeCaras(pistas: readonly PistaCara[], sujetoId: number | null, conConsentimiento: ReadonlySet<number>, r = REGLAS_DE_PRIVACIDAD): Desenfoque[] {
  return pistas
    .filter((p) => p.id !== sujetoId && !conConsentimiento.has(p.id))
    .flatMap((p) => p.detecciones.map((d) => ({ inicio: Math.max(0, d.t - r.intervaloMuestreo), fin: d.t + r.intervaloMuestreo, caja: agranda(d, r.margenCaja), motivo: 'cara' as const })));
}

const PATRONES: ReadonlyArray<[TipoDeDato, RegExp]> = [
  ['correo', /[\w.+-]+@[\w-]+\.[\w.-]+/],
  ['curp', /\b[A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d\b/],
  ['rfc', /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/],
  ['tarjeta', /\b(?:\d[ -]?){15,16}\b/],
  ['telefono', /(?:\+?52[\s-]?)?(?:\(?\d{2,3}\)?[\s.-]?)\d{3,4}[\s.-]?\d{4}\b/],
];

/** Reporte enmascarado: a lo sumo 4 caracteres del hallazgo (regla de la fábrica). */
export const enmascara = (s: string): string => `${s.trim().slice(0, 4)}…`;

/** Datos personales en una línea de texto leída del cuadro. Devuelve el tipo y la muestra YA enmascarada. */
export function datosEnTexto(linea: string): Array<{ tipo: TipoDeDato; muestra: string }> {
  const salida: Array<{ tipo: TipoDeDato; muestra: string }> = [];
  for (const [tipo, re] of PATRONES) {
    const m = re.exec(tipo === 'correo' ? linea : linea.toUpperCase());
    if (!m) continue;
    const digitos = m[0].replace(/\D/g, '');
    if (tipo === 'telefono' && (digitos.length < 10 || digitos.length > 12)) continue;
    if (tipo === 'tarjeta' && !luhn(digitos)) continue;
    salida.push({ tipo, muestra: enmascara(m[0]) });
    if (tipo !== 'correo') break;
  }
  return salida;
}

function luhn(d: string): boolean {
  let s = 0;
  for (let i = 0; i < d.length; i++) { let n = Number(d[d.length - 1 - i]); if (i % 2) { n *= 2; if (n > 9) n -= 9; } s += n; }
  return d.length >= 15 && s % 10 === 0;
}

export const vigentes = (cs: readonly Consentimiento[], hoy: string): Consentimiento[] => cs.filter((c) => !c.revocado && c.vigenteHasta >= hoy);

/** Un turno de voz con su hablante (salida de `cuentaHablantes`), en segundos del clip original. `null`:
 *  un turno demasiado corto para saber de quién es. */
export interface TurnoDeVoz { inicio: number; fin: number; hablante: string | null }

/** Un corte que se lleva una PARTE de lo que dijo otra persona (riesgo 5 de la AISIA firmada). La clave es
 *  su tramo: si el corte cambia, cambia la clave y hay que volver a revisarlo. `costura`: el segundo del
 *  reel editado donde queda la unión, que es donde el dueño tiene que escuchar. */
export interface CorteEnVozAjena { clave: string; desde: number; hasta: number; costura: number }

/**
 * `minimo`: menos de 0.3 s cortado (o conservado) es el respiro de una frontera, no habla. `dominio`: el
 * dueño es la voz que más habla SOLO si se lleva el 60 % del habla atribuida; si no (un testimonio largo
 * del cliente), no se sabe quién es y todo corte parcial se revisa. Valores de partida sin calibrar con
 * voces reales: se recalibran en el estreno, como `CALIBRACION_DE_VOCES`.
 */
export const REGLAS_DE_VOZ_AJENA = { minimo: 0.3, dominio: 0.6 } as const;

const solapa = (a: Tramo, b: Tramo): number => Math.max(0, Math.min(a.fin, b.fin) - Math.max(a.inicio, b.inicio));

/** La voz del dueño: la que más habla, si domina. Si ninguna domina, `null` (no se adivina). */
export function vozDelDueno(turnos: readonly TurnoDeVoz[], r = REGLAS_DE_VOZ_AJENA): string | null {
  const porVoz = new Map<string, number>();
  for (const t of turnos) if (t.hablante) porVoz.set(t.hablante, (porVoz.get(t.hablante) ?? 0) + (t.fin - t.inicio));
  const total = [...porVoz.values()].reduce((s, x) => s + x, 0);
  const [voz, tiempo] = [...porVoz.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  return voz !== null && total > 0 && tiempo / total >= r.dominio ? voz : null;
}

/**
 * Cortes dentro del habla de otra persona: de cada voz que no es la del dueño (y de lo que no se puede
 * atribuir), lo que el EDL descarta MIENTRAS esa voz conserva habla en el reel. Quitarla entera no altera
 * lo que dijo; partirla sí puede cambiarle el sentido. Con una sola voz no hay a quién proteger.
 */
export function cortesEnVozAjena(turnos: readonly TurnoDeVoz[], edl: Edl, hablantes: number, r = REGLAS_DE_VOZ_AJENA): CorteEnVozAjena[] {
  if (hablantes < 2) return [];
  const dueno = vozDelDueno(turnos, r);
  const ajenas = new Map<string, TurnoDeVoz[]>();
  for (const t of turnos) {
    if (t.hablante !== null && t.hablante === dueno) continue;
    const k = t.hablante ?? '?';
    ajenas.set(k, [...(ajenas.get(k) ?? []), t]);
  }
  const salida = new Map<string, CorteEnVozAjena>();
  for (const ts of ajenas.values()) {
    const conservado = ts.reduce((s, t) => s + edl.conservar.reduce((x, c) => x + solapa(t, c), 0), 0);
    if (conservado < r.minimo) continue;
    for (const d of edl.descartes) {
      const partes = ts.filter((t) => solapa(t, d) > 0).map((t) => ({ inicio: Math.max(t.inicio, d.inicio), fin: Math.min(t.fin, d.fin) }));
      if (partes.reduce((s, p) => s + (p.fin - p.inicio), 0) < r.minimo) continue;
      const desde = Math.min(...partes.map((p) => p.inicio)), hasta = Math.max(...partes.map((p) => p.fin));
      const clave = `${desde.toFixed(1)}-${hasta.toFixed(1)}`;
      salida.set(clave, { clave, desde, hasta, costura: costura(d.inicio, edl) });
    }
  }
  return [...salida.values()].sort((a, b) => a.desde - b.desde);
}

export interface EntradaDeRevision {
  medidas: Medidas;
  pistas: readonly PistaCara[];
  sujetoId: number | null;
  hablantes: number;
  consentimientos: readonly Consentimiento[];
  hoy: string;
  hallazgos: readonly HallazgoPantalla[];
  /** Grupos de hallazgos (índices de `agrupaHallazgos`) que el dueño ya cubrió: se desenfocan en el máster. */
  cubiertos?: ReadonlySet<number>;
  musica: { fraccion: number; segundos: number };
  /** Cortes que parten lo que dijo otra persona (riesgo 5) y las claves que el dueño ya revisó en la sala. */
  cortesEnVozAjena?: readonly CorteEnVozAjena[];
  revisados?: ReadonlySet<string>;
}

/** Todo lo que bloquea o avisa ANTES de componer el máster. */
export function revisaPrivacidad(e: EntradaDeRevision): Observacion[] {
  const obs: Observacion[] = [];
  if (e.medidas.ancho > e.medidas.alto) obs.push({ regla: 'clip-horizontal', nivel: 'bloquea', mensaje: `El clip es horizontal (${e.medidas.ancho}×${e.medidas.alto}); el reel es vertical 9:16: vuelve a grabar con el celular de pie` });
  agrupaHallazgos(e.hallazgos).forEach((g, i) => {
    if (!e.cubiertos?.has(i)) obs.push({ regla: 'dato-en-pantalla', nivel: 'bloquea', t: g.desde, mensaje: `Del segundo ${g.desde.toFixed(0)} al ${g.hasta.toFixed(0)} se lee un ${g.tipo} («${g.muestra}»): cúbrelo o corta ese tramo` });
  });
  const vozConsentida = vigentes(e.consentimientos, e.hoy).filter((c) => c.rol !== 'dueno').length;
  if (e.hablantes > 1 + vozConsentida) obs.push({ regla: 'otra-voz', nivel: 'bloquea', mensaje: `Se oyen ${e.hablantes} voces y solo hay ${vozConsentida} consentimiento(s) además del tuyo: registra el de quien habla o corta su tramo` });
  // Más de la mitad de las pausas con sonido y al menos 0.5 s: un clip hablado casi sin pausas escondía la
  // música con el umbral anterior de 1.5 s (medido). Solo energía: un ruido fuerte también la dispara.
  if (e.musica.fraccion > 0.5 && e.musica.segundos >= 0.5) obs.push({ regla: 'musica-de-fondo', nivel: 'bloquea', mensaje: `Se oye sonido de fondo continuo (posible música o ruido fuerte) en ${Math.round(e.musica.fraccion * 100)} % de las pausas: el reel no lleva música incrustada; agrégala tú en la app de la red al publicar` });
  for (const c of e.cortesEnVozAjena ?? []) {
    if (!e.revisados?.has(c.clave)) obs.push({ regla: 'corte-en-voz-ajena', nivel: 'bloquea', t: c.costura, mensaje: `En el segundo ${c.costura.toFixed(1)} del reel se corta una parte de lo que dice otra persona (del ${c.desde.toFixed(1)} al ${c.hasta.toFixed(1)} del clip): escúchalo y confirma en la sala que no le cambia el sentido` });
  }
  const otras = e.pistas.filter((p) => p.id !== e.sujetoId);
  if (otras.length) obs.push({ regla: 'caras-desenfocadas', nivel: 'aviso', mensaje: `${otras.length} cara(s) además de la tuya: se desenfocan por defecto. Si alguien consintió, márcalo en la sala` });
  return obs;
}

/** Después del máster: si al volver a detectar aparece una cara que no es el sujeto, no se cubrió bien. */
export function carasSinCubrir(detecciones: readonly DeteccionCara[], sujetoCajas: readonly Caja[], r = REGLAS_DE_PRIVACIDAD): DeteccionCara[] {
  return detecciones.filter((d) => d.confianza >= r.confianzaMin && !sujetoCajas.some((s) => iou(d, s) >= r.iouMin));
}

/** Junta los desenfoques consecutivos de una misma zona (menos filtros en el máster, mismo cubrimiento). */
export function fusiona(ds: readonly Desenfoque[]): Desenfoque[] {
  const salida: Desenfoque[] = [];
  for (const d of [...ds].sort((a, b) => a.inicio - b.inicio)) {
    const u = salida.find((s) => s.motivo === d.motivo && d.inicio <= s.fin && iou(s.caja, d.caja) > 0);
    if (!u) { salida.push({ ...d, caja: { ...d.caja } }); continue; }
    const x0 = Math.min(u.caja.x, d.caja.x), y0 = Math.min(u.caja.y, d.caja.y);
    const x1 = Math.max(u.caja.x + u.caja.ancho, d.caja.x + d.caja.ancho), y1 = Math.max(u.caja.y + u.caja.alto, d.caja.y + d.caja.alto);
    u.caja = { x: x0, y: y0, ancho: x1 - x0, alto: y1 - y0 };
    u.fin = Math.max(u.fin, d.fin);
  }
  return salida;
}

export interface GrupoDeHallazgos { tipo: TipoDeDato; muestra: string; desde: number; hasta: number; caja: Caja; veces: number }

/** Un mismo dato visto en muchos cuadros es UN hallazgo con su rango de tiempo, no veinte. */
export function agrupaHallazgos(hs: readonly HallazgoPantalla[]): GrupoDeHallazgos[] {
  const grupos: GrupoDeHallazgos[] = [];
  for (const h of [...hs].sort((a, b) => a.t - b.t)) {
    const g = grupos.find((x) => x.tipo === h.tipo && x.muestra === h.muestra && iou(x.caja, h.caja) > 0);
    if (!g) { grupos.push({ tipo: h.tipo, muestra: h.muestra, desde: h.t, hasta: h.t, caja: { ...h.caja }, veces: 1 }); continue; }
    const x0 = Math.min(g.caja.x, h.caja.x), y0 = Math.min(g.caja.y, h.caja.y);
    g.caja = { x: x0, y: y0, ancho: Math.max(g.caja.x + g.caja.ancho, h.caja.x + h.caja.ancho) - x0, alto: Math.max(g.caja.y + g.caja.alto, h.caja.y + h.caja.alto) - y0 };
    g.hasta = h.t; g.veces++;
  }
  return grupos;
}
