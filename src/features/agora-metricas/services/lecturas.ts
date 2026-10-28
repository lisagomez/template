/**
 * El tablero de métricas de un periodo: la especificación vigente (la última versión guardada, o la inicial), cada
 * componente CONSULTADO a la capa semántica con la sesión de quien mira, y su prueba contra el libro. Ninguna cifra
 * se calcula aquí: la métrica la compila el catálogo y la prueba la vuelve a sumar de las tablas de origen.
 */
import { metricas, type Sesion } from '../../../../tools/agora/dist/index.js';
import { conSesion } from '@/features/agora/services/datos';

export interface Prueba { fuente: string; libro: string | null; metrica: string | null; cuadra: boolean }
export interface Tarjeta extends metricas.Componente {
  titulo: string; definicion: string; decision: string; formato: metricas.Formato
  filas: Array<{ dimension: string | null; valor: string | null }>; sql: string; prueba: Prueba | null; error: string | null
}
export interface Version { version: number; quien: string; cuando: string; motivo: string }
export interface DatosDeMetricas {
  periodo: string; periodos: string[]; titulo: string; version: number
  tarjetas: Tarjeta[]; versiones: Version[]; workspaces: Array<{ id: string; nombre: string }>
}

/** Las métricas sumables y de dónde las vuelve a sacar la prueba: la tabla de origen, no la capa semántica. */
const ORIGEN: Record<string, { fuente: string; sql: string }> = {
  presupuesto_mxn: { fuente: 'agora.v_centro_periodo (presupuesto)', sql: 'select sum(presupuesto_mxn)::text x from agora.v_centro_periodo where periodo = $1' },
  comprometido_mxn: { fuente: 'agora.v_centro_periodo (comprometido)', sql: 'select sum(comprometido_mxn)::text x from agora.v_centro_periodo where periodo = $1' },
  ejercido_mxn: { fuente: 'agora.v_centro_periodo (ejercido)', sql: 'select sum(ejercido_mxn)::text x from agora.v_centro_periodo where periodo = $1' },
  disponible_mxn: { fuente: 'agora.v_centro_periodo (disponible)', sql: 'select sum(disponible_mxn)::text x from agora.v_centro_periodo where periodo = $1' },
  costo_modelo_mxn: { fuente: 'agora.gasto_modelo (costo_mxn)', sql: 'select sum(costo_mxn)::text x from agora.gasto_modelo where periodo = $1' },
  filas_sin_costo: { fuente: 'agora.gasto_modelo (costo_mxn is null)', sql: 'select count(*)::text x from agora.gasto_modelo where periodo = $1 and costo_mxn is null' },
};
const centavos = (x: string | null) => (x === null ? null : Math.round(Number(x) * 100));

/** El periodo de la página aplica a lo que es del libro o del gasto; lo demás (propuestas, ítems) es acumulado. */
const DEL_PERIODO = new Set(['presupuesto_mxn', 'comprometido_mxn', 'ejercido_mxn', 'disponible_mxn', 'desviacion_pct', 'costo_modelo_mxn', 'filas_sin_costo']);

async function pinta(s: Sesion, c: metricas.Componente, periodo: string): Promise<Tarjeta> {
  const d = metricas.describe(c.metrica);
  const base = { ...c, titulo: d?.titulo ?? c.metrica, definicion: d?.definicion ?? '', decision: d?.decision ?? '', formato: d?.formato ?? 'n' as metricas.Formato };
  if (!d) return { ...base, filas: [], sql: '', prueba: null, error: `la métrica «${c.metrica}» ya no está en el catálogo` };
  const per = c.periodo ?? (DEL_PERIODO.has(c.metrica) ? periodo : null);
  try {
    const r = await metricas.consulta(s, { metrica: c.metrica, dimension: c.dimension, periodo: per, workspace: c.workspace, origen: c.origen });
    let prueba: Prueba | null = null;
    const o = ORIGEN[c.metrica];
    if (o && per && !c.workspace && !c.origen) {
      const [l] = await s.consulta<{ x: string | null }>(o.sql, [per]);
      const suma = r.filas.reduce<number | null>((t, f) => (f.valor === null ? t : (t ?? 0) + Math.round(Number(f.valor) * 100)), null);
      const libro = l?.x ?? null;
      prueba = { fuente: o.fuente, libro, metrica: suma === null ? null : (suma / 100).toFixed(2), cuadra: (centavos(libro) ?? 0) === (suma ?? 0) };
    }
    return { ...base, periodo: per, filas: r.filas, sql: r.sql, prueba, error: null };
  } catch (e) {
    return { ...base, filas: [], sql: '', prueba: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function leeMetricas(periodo: string | null) {
  return conSesion(async (s): Promise<DatosDeMetricas> => {
    const periodos = (await s.consulta<{ p: string }>('select distinct periodo p from agora.v_centro_periodo order by 1')).map((x) => x.p);
    const [hoy] = await s.consulta<{ p: string }>(`select to_char(now() at time zone 'America/Mexico_City', 'YYYY-MM') p`);
    const per = periodo && periodos.includes(periodo) ? periodo : hoy!.p;
    const versiones = await s.consulta<Version & { spec: metricas.EspecTablero }>(
      `select t.version, coalesce(p.nombre, 'alguien') quien, t.cuando::text cuando, t.motivo, t.spec from agora.metricas_tablero t left join agora.persona p on p.id = t.quien order by t.version desc limit 20`);
    const vigente = versiones[0]?.spec ?? metricas.TABLERO_INICIAL;
    const tarjetas: Tarjeta[] = [];
    for (const c of vigente.componentes) tarjetas.push(await pinta(s, c, per));
    const workspaces = await s.consulta<{ id: string; nombre: string }>(`select id, nombre from agora.nodo where tipo = 'workspace' order by orden`);
    return { periodo: per, periodos: [...new Set([...periodos, hoy!.p])].sort(), titulo: vigente.titulo, version: versiones[0]?.version ?? 0,
      tarjetas, versiones: versiones.map(({ version, quien, cuando, motivo }) => ({ version, quien, cuando, motivo })), workspaces };
  });
}
