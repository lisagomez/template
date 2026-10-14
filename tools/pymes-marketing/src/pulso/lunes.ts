/**
 * Brief del lunes (adaptado de `marketing-monday`): UNA página que funde lo que dijeron las
 * herramientas. Reglas de la fuente:
 *  - no se engrapan reportes: hay frases que CONECTAN secciones («la misma historia contada dos veces»);
 *  - titular de una frase; números con su comparación; citas textuales; qué cambió alrededor
 *    (observado vs inferido, con fecha); máximo TRES acciones por impacto («cuatro es una lista que
 *    nadie trabaja»); semana tranquila = tres líneas;
 *  - una fuente que no llegó se NOMBRA como «sin datos» y se sigue: un hueco callado parece buena
 *    noticia. La fusión nunca tira una sección (lazo L2 del goal);
 *  - las respuestas a reseñas van en SU cola de aprobación, no dentro del brief;
 *  - no hay programador: guardar el brief no lo vuelve semanal y no se dice que sí.
 */
import { fechaCorta, leeDia, type Dia } from '../comun/fechas.js';
import { seccionSinDatos, type AccionSugerida, type FuenteDelLunes, type SeccionDelLunes } from '../comun/lunes.js';
import { revisaTextoDeTerceros } from '../comun/no-confiable.js';
import { normaliza } from '../comun/texto.js';
import type { Campana } from './anuncios.js';
import type { BloqueDeCambio } from './recomienda.js';

export interface NotaDeCompetencia {
  readonly dia: Dia;
  readonly competidor: string;
  readonly que: string;
  readonly tipo: 'observado' | 'inferido';
}

/** «12/10/2026 · El Globo · abrió sucursal en la 5 de Mayo · observado», una por línea. */
export function leeNotasDeCompetencia(texto: string): { notas: NotaDeCompetencia[]; ignoradas: string[] } {
  const notas: NotaDeCompetencia[] = [], ignoradas: string[] = [];
  for (const l of texto.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) {
    const [f, c, q, t] = l.split(/\s[·|]\s/).map((x) => x.trim());
    const dia = f ? leeDia(f) : null;
    if (!dia || !c || !q) { ignoradas.push(l); continue; }
    notas.push({ dia, competidor: revisaTextoDeTerceros(c, 60).texto, que: revisaTextoDeTerceros(q, 200).texto, tipo: t && /infer/i.test(t) ? 'inferido' : 'observado' });
  }
  return { notas, ignoradas };
}

export function competenciaParaElLunes(notas: readonly NotaDeCompetencia[] | null): SeccionDelLunes {
  if (!notas || notas.length === 0) return seccionSinDatos('competencia', 'Qué cambió alrededor', 'no anotaste movimientos de la competencia esta semana (se piden una vez: 3 o 4 competidores)');
  return { fuente: 'competencia', titulo: 'Qué cambió alrededor', estado: 'ok', motivo: null, hallazgos: notas.map((n) => `${fechaCorta(n.dia)} · ${n.competidor}: ${n.que} (${n.tipo})`), acciones: [] };
}

export function anunciosParaElLunes(cs: readonly Campana[] | null, bloques: readonly BloqueDeCambio[]): SeccionDelLunes {
  if (!cs || cs.length === 0) return seccionSinDatos('anuncios', 'Anuncios', 'no se cargó la exportación del Administrador de anuncios');
  const acciones: AccionSugerida[] = bloques.slice(0, 2).map((b) => ({ titulo: b.cambio, porque: `hoy cuesta ${b.cuestaHoy}; reversible: ${b.reversible.toLowerCase()}`, impacto: b.impactoMensual === null ? null : `${b.impactoMensual < 0 ? 'ahorra' : 'invierte'} ~$${Math.round(Math.abs(b.impactoMensual) / 100).toLocaleString('es-MX')} ${b.moneda} al mes`, prioridad: b.impactoMensual !== null && b.impactoMensual < 0 ? 1 : 2, fuente: 'anuncios' }));
  return { fuente: 'anuncios', titulo: 'Anuncios', estado: 'ok', motivo: null, hallazgos: cs.map((c) => `${c.nombre}: ${c.veredicto} — ${c.porque}`), acciones };
}

export interface BriefDelLunes {
  readonly semana: Dia;
  readonly titular: string;
  readonly hilo: readonly string[];
  readonly secciones: readonly SeccionDelLunes[];
  readonly acciones: readonly AccionSugerida[];
  readonly fuentes: string;
  readonly colaDeRespuestas: number;
  readonly semanaTranquila: boolean;
  readonly nota: string;
}

const ORDEN: readonly FuenteDelLunes[] = ['ventas', 'resenas', 'competencia', 'anuncios', 'visibilidad', 'contenido'];

function hilos(s: ReadonlyMap<FuenteDelLunes, SeccionDelLunes>): string[] {
  const texto = (f: FuenteDelLunes) => normaliza((s.get(f)?.hallazgos ?? []).join(' '));
  const ok = (f: FuenteDelLunes) => s.get(f)?.estado === 'ok';
  const h: string[] = [];
  // «Baja» es la zona roja del pulso: más de 10 % contra el periodo anterior (thresholds.md).
  const cambio = Number(/va (-?\d+)%/.exec(s.get('ventas')?.hallazgos[0] ?? '')?.[1] ?? 'NaN');
  const ventasBajan = ok('ventas') && cambio <= -10;
  const bajas = [...(s.get('resenas')?.hallazgos ?? []).join(' ').matchAll(/([A-Za-zÁ-ú ]+): (\d\.\d) \(/g)].filter((m) => Number(m[2]) < 3.8);
  if (ok('resenas') && /(espera|atencion|pedidos)/.test(texto('resenas')) && ventasBajan) h.push('Las quejas por espera o trato y la caída de la venta son la misma historia contada dos veces: arreglar la atención vale más que una campaña nueva.');
  if (ok('resenas') && bajas.length && ok('ventas') && !ventasBajan) h.push(`Las reseñas van mal (${bajas.map((m) => `${m[1]!.trim()} ${m[2]}`).join(', ')}) mientras la venta aguanta: es un aviso que suele llegar a las ventas en unos dos meses.`);
  if (ok('competencia') && ventasBajan) h.push('La venta bajó la misma semana que se movió la competencia: puede haber relación (inferido, no comprobado).');
  if (ok('anuncios') && ventasBajan && /problema/.test(texto('anuncios'))) h.push('Hay anuncios gastando sin resultados mientras la venta baja: antes de meter más dinero, corrige esos.');
  if (h.length === 0) {
    const conDatos = ORDEN.filter(ok).length;
    h.push(conDatos >= 2 ? 'Nada de lo que llegó contradice lo demás: semana sin sorpresas entre fuentes.' : 'Llegó poca información: el brief se apoya en lo que hubo y nombra lo que faltó.');
  }
  return h;
}

export function briefDelLunes(secciones: readonly SeccionDelLunes[], o: { readonly semana: Dia; readonly colaDeRespuestas?: number }): BriefDelLunes {
  const porFuente = new Map<FuenteDelLunes, SeccionDelLunes>();
  for (const s of secciones) porFuente.set(s.fuente, s);
  for (const f of ['ventas', 'resenas', 'competencia', 'anuncios', 'visibilidad'] as const) if (!porFuente.has(f)) porFuente.set(f, seccionSinDatos(f, f, 'no se entregó esta fuente'));
  const todas = ORDEN.map((f) => porFuente.get(f)).filter((s): s is SeccionDelLunes => Boolean(s));
  const vistas = new Set<string>();
  const acciones = todas.flatMap((s) => s.acciones).sort((a, b) => a.prioridad - b.prioridad).filter((a) => !vistas.has(normaliza(a.titulo)) && vistas.add(normaliza(a.titulo))).slice(0, 3);
  const hilo = hilos(porFuente);
  const primera = acciones[0];
  const titular = primera ? `Lo único que importa esta semana: ${primera.titulo.charAt(0).toLowerCase()}${primera.titulo.slice(1)}.` : 'Semana tranquila: nada urgente que cambiar.';
  const fuentes = todas.map((s) => (s.estado === 'ok' ? `${s.titulo} ✓` : `${s.titulo}: sin datos`)).join(' · ');
  return { semana: o.semana, titular, hilo, secciones: todas, acciones, fuentes, colaDeRespuestas: o.colaDeRespuestas ?? 0, semanaTranquila: acciones.length === 0,
    nota: 'Este brief no se manda solo: guardarlo no lo programa. Ábrelo cada lunes o pide un recordatorio que sí dispare.' };
}
