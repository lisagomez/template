/**
 * Reseñas y reputación (adaptado de `review-reputation`). Lee reseñas exportadas o pegadas, las
 * agrupa en temas con citas textuales, redacta respuestas en la voz del dueño para aprobar UNA
 * POR UNA, y señala clientes que se callaron. Nada se publica ni se envía. Carga el riesgo más
 * alto de la familia (texto de terceros, decisiones sobre personas): ver la AISIA del goal.
 */
import { fechaCorta, sumaDias, type Dia } from '../comun/fechas.js';
import type { SeccionDelLunes, AccionSugerida } from '../comun/lunes.js';
import { seccionSinDatos } from '../comun/lunes.js';
import type { Redactor } from '../comun/redactor.js';
import type { LineaDeVenta } from '../ventas/tipos.js';
import { clientesCallados, type ClienteCallado } from './callados.js';
import { borradoresDeRespuesta, type BorradorDeRespuesta, type OpcionesDeRespuesta } from './respuestas.js';
import { agrupaTemas, type Tema } from './temas.js';
import type { Plataforma, Resena } from './tipos.js';

export const VENTANA_RESENAS = 90;
/** Por debajo de esto, una mitad de la ventana no es base para hablar de dirección. */
export const MINIMO_POR_MITAD = 3;

export interface CalificacionPorPlataforma {
  readonly plataforma: Plataforma;
  readonly promedio: number | null;
  readonly resenas: number;
  /** Mitad reciente contra mitad anterior de la ventana; `null` si no hay base. */
  readonly cambio: number | null;
}

export interface AnalisisDeResenas {
  readonly desde: Dia;
  readonly hasta: Dia;
  /** Por plataforma y SIN promediar entre ellas: son públicos distintos. */
  readonly calificaciones: readonly CalificacionPorPlataforma[];
  readonly fuentes: readonly { readonly nombre: string; readonly cuantas: number | null; readonly nota: string }[];
  readonly temas: readonly Tema[];
  readonly borradores: readonly BorradorDeRespuesta[];
  readonly callados: readonly ClienteCallado[];
  readonly tresCosas: readonly AccionSugerida[];
}

function promedio(xs: readonly number[]): number | null {
  return xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null;
}

function calificaciones(resenas: readonly Resena[], hasta: Dia): CalificacionPorPlataforma[] {
  const mitad = sumaDias(hasta, -Math.floor(VENTANA_RESENAS / 2));
  const plataformas = [...new Set(resenas.map((r) => r.plataforma))].filter((p) => p !== 'Mensaje');
  return plataformas.map((plataforma) => {
    const suyas = resenas.filter((r) => r.plataforma === plataforma && r.estrellas !== null);
    const recientes = suyas.filter((r) => (r.dia ?? '') > mitad).map((r) => r.estrellas!);
    const anteriores = suyas.filter((r) => r.dia && r.dia <= mitad).map((r) => r.estrellas!);
    const suficiente = recientes.length >= MINIMO_POR_MITAD && anteriores.length >= MINIMO_POR_MITAD;
    const reciente = suficiente ? promedio(recientes) : null, anterior = suficiente ? promedio(anteriores) : null;
    return { plataforma, promedio: promedio(suyas.map((r) => r.estrellas!)), resenas: resenas.filter((r) => r.plataforma === plataforma).length, cambio: reciente !== null && anterior !== null ? Math.round((reciente - anterior) * 10) / 10 : null };
  });
}

function tresCosas(temas: readonly Tema[], borradores: readonly BorradorDeRespuesta[], callados: readonly ClienteCallado[]): AccionSugerida[] {
  const acciones: AccionSugerida[] = [];
  const escaladas = borradores.filter((b) => b.estado === 'escalada' || b.estado === 'retenida').length;
  if (escaladas) acciones.push({ titulo: `Atiende en persona ${escaladas} reseña(s) delicada(s)`, porque: 'mencionan salud, una acción legal o piden dinero: no van con plantilla', impacto: null, prioridad: 1, fuente: 'resenas' });
  const queja = temas.find((t) => t.quejas > t.elogios);
  if (queja) acciones.push({ titulo: `Revisa «${queja.etiqueta.toLowerCase()}»`, porque: `${queja.quejas} de ${queja.conteo} menciones son quejas`, impacto: null, prioridad: acciones.length ? 2 : 1, fuente: 'resenas' });
  const pendientes = borradores.filter((b) => b.estado === 'borrador').length;
  if (pendientes) acciones.push({ titulo: `Aprueba o edita ${pendientes} respuesta(s), una por una`, porque: 'las negativas conviene contestarlas en un par de días', impacto: null, prioridad: 2, fuente: 'resenas' });
  if (callados.length && acciones.length < 3) acciones.push({ titulo: `Decide qué ofrecer a ${callados.length} cliente(s) que se callaron`, porque: `el de más gasto lleva ${callados[0]!.diasSinComprar} días sin comprar`, impacto: null, prioridad: 3, fuente: 'resenas' });
  return acciones.slice(0, 3);
}

export async function analizaResenas(resenas: readonly Resena[], redactor: Redactor, o: OpcionesDeRespuesta & { readonly hoy: Dia; readonly ventas?: readonly LineaDeVenta[] }): Promise<AnalisisDeResenas> {
  const desde = sumaDias(o.hoy, -(VENTANA_RESENAS - 1));
  const enVentana = resenas.filter((r) => !r.dia || (r.dia >= desde && r.dia <= o.hoy));
  // Las de solo estrellas cuentan para la calificación, pero no tienen tema ni se les responde.
  const conTexto = enVentana.filter((r) => r.texto.trim() !== '');
  const temas = agrupaTemas(conTexto);
  const borradores = await borradoresDeRespuesta(conTexto, redactor, o);
  const callados = o.ventas ? clientesCallados(o.ventas, o.hoy) : [];
  const cuenta = (p: Plataforma) => enVentana.filter((r) => r.plataforma === p).length;
  const fuentes = [
    ...(['Google Maps', 'Facebook', 'TripAdvisor', 'Mercado Libre', 'App de comida', 'Mensaje'] as const).filter((p) => cuenta(p) > 0).map((p) => ({ nombre: p, cuantas: cuenta(p), nota: '' })),
    ...(cuenta('Google Maps') ? [] : [{ nombre: 'Google Maps', cuantas: null, nota: 'no entregado' }]),
    ...(o.ventas ? [{ nombre: 'Pedidos (para clientes callados)', cuantas: o.ventas.filter((l) => l.cliente).length, nota: o.ventas.some((l) => l.cliente) ? '' : 'sin cliente identificado en las ventas' }] : [{ nombre: 'Pedidos (para clientes callados)', cuantas: null, nota: 'no entregado' }]),
  ];
  return { desde, hasta: o.hoy, calificaciones: calificaciones(enVentana, o.hoy), fuentes, temas, borradores, callados, tresCosas: tresCosas(temas, borradores, callados) };
}

/** Lo que pasa al brief del lunes: temas y dirección. Las respuestas van como COLA APARTE. */
export function resenasParaElLunes(a: AnalisisDeResenas | null): SeccionDelLunes {
  if (!a || a.borradores.length === 0) return seccionSinDatos('resenas', 'Qué dijeron los clientes', 'no se cargaron reseñas ni mensajes');
  const hallazgos = [
    ...a.calificaciones.map((c) => `${c.plataforma}: ${c.promedio ?? 'sin calificación'} (${c.resenas} reseñas)${c.cambio !== null ? `, ${c.cambio >= 0 ? '+' : ''}${c.cambio} contra la mitad anterior` : ''}`),
    ...a.temas.slice(0, 3).map((t) => `${t.etiqueta}: ${t.conteo} menciones (${t.quejas} quejas). ${t.citas[0] ?? ''}`),
    `${a.borradores.filter((b) => b.estado === 'borrador').length} respuesta(s) esperan tu aprobación en su propia cola (${fechaCorta(a.desde)} a ${fechaCorta(a.hasta)})`,
  ];
  return { fuente: 'resenas', titulo: 'Qué dijeron los clientes', estado: 'ok', motivo: null, hallazgos, acciones: a.tresCosas };
}

export { resenasDesdeCsv, resenasPegadas, plataformaDe } from './lee.js';
export { agrupaTemas, tonoDe, temasDe, temasPorTono, cita, TEMAS, type Tema, type Tono, type IdTema } from './temas.js';
export { borradorPara, borradoresDeRespuesta, decideBorrador, MAX_PALABRAS, type BorradorDeRespuesta, type EstadoDeBorrador, type OpcionesDeRespuesta } from './respuestas.js';
export { clientesCallados, type ClienteCallado } from './callados.js';
export type { Resena, Plataforma, LecturaDeResenas } from './tipos.js';
