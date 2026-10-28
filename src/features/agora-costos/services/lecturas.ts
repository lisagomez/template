/** Lo que pinta la pantalla de costos de un periodo, leído con la sesión de quien mira. Ninguna cifra se calcula aquí. */
import { arbolDeCostos, gastoPorAgente, tiposDeCambioUsados, type FilaCentro, type GastoAgente, type TipoDeCambio } from '../../../../tools/agora/dist/index.js';
import { conSesion } from '@/features/agora/services/datos';

export interface FilaCategoria { categoria: string; compromisosAprobados: string; ejercidoDeCompromiso: string; presupuestoVersion: number | null; pendientes: number }
export interface Compromiso { id: string; categoria: string; item: string | null; concepto: string; periodo: string; importe: string; vigente: string; ejercido: string }
export interface Aviso { id: string; tipo: string; texto: string; cuando: string }

export interface DatosDeCostos {
  periodo: string; periodos: string[]; cerrado: boolean
  arbol: Array<FilaCentro & { padre: string | null; orden: number }>
  categorias: FilaCategoria[]
  agentes: GastoAgente[]
  tipos: TipoDeCambio[]
  compromisos: Compromiso[]
  avisos: Aviso[]
  totales: { presupuesto: string; comprometido: string; ejercido: string; disponible: string; sinCosto: number; topeOrg: string; gastoOrg: string }
  soyFinanzas: boolean
  nodos: Array<{ id: string; nombre: string; tipo: string; padre: string | null }>
}

export async function leeCostos(periodo: string | null) {
  return conSesion(async (s, persona): Promise<DatosDeCostos> => {
    const periodos = (await s.consulta<{ p: string }>(`select distinct periodo p from agora.v_centro_periodo order by 1`)).map((x) => x.p);
    const [hoy] = await s.consulta<{ p: string }>(`select to_char(now() at time zone 'America/Mexico_City', 'YYYY-MM') p`);
    const per = periodo && periodos.includes(periodo) ? periodo : hoy!.p;
    const nodos = await s.consulta<{ id: string; nombre: string; tipo: string; padre: string | null; orden: number }>(`select id, nombre, tipo, padre_id padre, orden from agora.nodo order by orden`);
    const filas = await arbolDeCostos(s, per);
    const arbol = nodos.map((n) => {
      const f = filas.find((x) => x.nodo === n.id);
      return { nodo: n.id, tipo: n.tipo, nombre: n.nombre, periodo: per, presupuesto: f?.presupuesto ?? '0', comprometido: f?.comprometido ?? '0', ejercido: f?.ejercido ?? '0', disponible: f?.disponible ?? '0',
        gastoModelo: f?.gastoModelo ?? '0', filasSinCosto: f?.filasSinCosto ?? 0, pendiente: f?.pendiente ?? '0', padre: n.padre, orden: n.orden };
    });
    const categorias = await s.consulta<FilaCategoria>(`select categoria_id categoria, compromisos_aprobados_mxn::text "compromisosAprobados", ejercido_de_compromiso_mxn::text "ejercidoDeCompromiso",
        presupuesto_version "presupuestoVersion", pendientes from agora.v_centro_periodo where periodo = $1`, [per]);
    const compromisos = await s.consulta<Compromiso>(`select k.id, k.categoria_id categoria, k.item_id item, k.concepto, k.periodo, k.importe_mxn::text importe, k.vigente_mxn::text vigente, k.ejercido_mxn::text ejercido
        from agora.v_compromiso_saldo k where k.estado = 'vigente' and k.vigente_mxn > 0 order by k.periodo, k.concepto`);
    const avisos = await s.consulta<Aviso>(`select id, tipo, texto, creado_en::text cuando from agora.aviso where tipo in ('tope_80', 'tope_100', 'presupuesto_desviacion') and not atendido order by creado_en desc limit 12`);
    const [org] = await s.consulta<{ tope: string; gasto: string; finanzas: boolean; cerrado: boolean }>(`select c.tope_gasto_org_mxn::text tope,
        (select coalesce(sum(g.costo_mxn), 0) from agora.gasto_modelo g where g.org_id = c.org_id and g.periodo = $1)::text gasto,
        agora_priv.tiene_rol(c.org_id, null, array['finanzas']) finanzas,
        exists (select 1 from agora.periodo p where p.org_id = c.org_id and p.periodo = $1 and p.estado = 'cerrado') cerrado
        from agora.org_config c join agora.persona p on p.org_id = c.org_id where p.id = $2`, [per, persona]);
    const ws = arbol.filter((n) => n.tipo === 'workspace');
    const suma = (k: 'presupuesto' | 'comprometido' | 'ejercido' | 'disponible') => ws.reduce((t, n) => t + Number(n[k]), 0).toFixed(2);
    return { periodo: per, periodos: [...new Set([...periodos, hoy!.p])].sort(), cerrado: org!.cerrado, arbol, categorias, agentes: await gastoPorAgente(s, per), tipos: await tiposDeCambioUsados(s, per), compromisos, avisos,
      totales: { presupuesto: suma('presupuesto'), comprometido: suma('comprometido'), ejercido: suma('ejercido'), disponible: suma('disponible'), sinCosto: ws.reduce((t, n) => t + n.filasSinCosto, 0), topeOrg: org!.tope, gastoOrg: org!.gasto },
      soyFinanzas: org!.finanzas, nodos: nodos.map(({ id, nombre, tipo, padre }) => ({ id, nombre, tipo, padre })) };
  });
}
