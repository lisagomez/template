/** El paquete para Contabilidad de un periodo: la póliza propuesta, su balanza, el comparativo y el export (ERP-5B). */
import { conSesion } from '@/features/agora/services/datos';

export interface Periodo { periodo: string; estado: 'abierto' | 'cerrado'; cerradoPor: string | null; cerradoEn: string | null; cita: string | null; vencido: boolean }
export interface Movimiento { orden: number; cuenta: string; nombre: string; codigo_agrupador: string; naturaleza: 'cargo' | 'abono'; importe: string; uuid_cfdi: string | null; rfc: string | null; documento: string; concepto: string; categoria: string | null }
export interface Poliza { id: string; folio: string; tipo: string; periodo: string; estado: string; sha256: string; sinCostear: number; generada: string; concepto: string
  decisiones: Array<{ decision: string; persona: string; motivo: string | null; cuando: string }> }

export interface DatosContables {
  periodos: Periodo[]; periodo: string
  poliza: Poliza | null; movimientos: Movimiento[]; export: unknown
  balanza: Array<{ cuenta: string; nombre: string; codigo_agrupador: string; cargos: string | null; abonos: string | null; saldo: string }>
  comparativo: Array<{ categoria: string; presupuesto: string; ejercido: string; comprometido: string; desviacion: string | null }>
  previa: { costos: number; importe: string; llamadas: number; sinCosto: number; pendientes: number }
  yo: { finanzas: boolean; contabilidad: boolean; puedeAceptar: { puede: boolean; motivo: string } }
}

export async function leeContabilidad(periodo: string | null) {
  return conSesion(async (s, persona): Promise<DatosContables> => {
    const periodos = await s.consulta<Periodo>(`with ps as (select distinct periodo from agora.v_centro_periodo union select periodo from agora.periodo)
      select ps.periodo, coalesce(p.estado, 'abierto') estado, q.nombre "cerradoPor", p.cerrado_en::text "cerradoEn", p.cita,
             ps.periodo < to_char(now() at time zone 'America/Mexico_City', 'YYYY-MM') vencido
        from ps left join agora.periodo p on p.periodo = ps.periodo left join agora.persona q on q.id = p.cerrado_por order by ps.periodo`);
    const per = periodo && periodos.some((p) => p.periodo === periodo) ? periodo : (periodos.find((p) => p.estado === 'cerrado')?.periodo ?? periodos.find((p) => p.vencido)?.periodo ?? periodos[0]?.periodo ?? '');
    const [pol] = await s.consulta<Omit<Poliza, 'decisiones'>>(`select id, folio, tipo, periodo, estado, sha256, sin_costear "sinCostear", generada_en::text generada, concepto from agora.poliza where periodo = $1 order by generada_en desc limit 1`, [per]);
    const poliza = pol ? { ...pol, decisiones: await s.consulta<Poliza['decisiones'][number]>(`select d.decision, p.nombre persona, d.motivo, d.decidida_en::text cuando from agora.poliza_decision d join agora.persona p on p.id = d.decidida_por where d.poliza_id = $1`, [pol.id]) } : null;
    const movimientos = pol ? await s.consulta<Movimiento>(`select m.orden, m.cuenta, k.nombre, m.codigo_agrupador, m.naturaleza, m.importe::text importe, m.uuid_cfdi::text uuid_cfdi, m.rfc_tercero rfc, m.documento, m.concepto, n.nombre categoria
        from agora.poliza_movimiento m join agora.cuenta k on k.org_id = m.org_id and k.codigo = m.cuenta left join agora.nodo n on n.id = m.categoria_id where m.poliza_id = $1 order by m.orden`, [pol.id]) : [];
    const exp = pol ? (await s.consulta<{ e: unknown }>('select agora.exporta_poliza($1) e', [pol.id]))[0]!.e : null;
    const balanza = await s.consulta<DatosContables['balanza'][number]>(`select cuenta, nombre, codigo_agrupador, cargos::text, abonos::text, saldo_deudor::text saldo from agora.v_balanza_costos where periodo = $1 order by cuenta`, [per]);
    const comparativo = await s.consulta<DatosContables['comparativo'][number]>(`select n.nombre categoria, v.presupuesto_mxn::text presupuesto, v.ejercido_mxn::text ejercido, v.comprometido_mxn::text comprometido,
        case when v.presupuesto_mxn > 0 then round(100 * (v.ejercido_mxn - v.presupuesto_mxn) / v.presupuesto_mxn, 1)::text end desviacion
        from agora.v_centro_periodo v join agora.nodo n on n.id = v.categoria_id where v.periodo = $1 order by n.orden`, [per]);
    const [previa] = await s.consulta<DatosContables['previa']>(`select (select count(*)::int from agora.costo where periodo = $1 and estado = 'ejercido') costos,
        (select coalesce(sum(importe_mxn), 0)::text from agora.costo where periodo = $1 and estado = 'ejercido') importe,
        (select count(*)::int from agora.gasto_modelo where periodo = $1) llamadas, (select count(*)::int from agora.gasto_modelo where periodo = $1 and costo_mxn is null) "sinCosto",
        (select count(*)::int from agora.costo where periodo = $1 and estado = 'pendiente') pendientes`, [per]);
    const [r] = await s.consulta<{ finanzas: boolean; contabilidad: boolean; aprobo: boolean; cerro: boolean; seg: boolean }>(`select agora_priv.tiene_rol(p.org_id, null, array['finanzas']) finanzas,
        agora_priv.tiene_rol(p.org_id, null, array['contabilidad']) contabilidad,
        exists (select 1 from agora.compromiso k join agora.aprobacion a on a.propuesta_id = k.propuesta_id and a.decision = 'aprobar' where k.periodo = $2 and a.decidida_por = p.id)
          or exists (select 1 from agora.presupuesto x where x.periodo = $2 and x.aprobado_por = p.id) aprobo,
        exists (select 1 from agora.periodo x where x.periodo = $2 and x.cerrado_por = p.id) cerro, c.segregacion seg
        from agora.persona p join agora.org_config c on c.org_id = p.org_id where p.id = $1`, [persona, per]);
    const motivo = !r!.contabilidad ? 'solo Contabilidad acepta o devuelve la póliza' : r!.seg && (r!.aprobo || r!.cerro) ? 'aprobaste un gasto de este periodo o lo cerraste: la acepta otra persona (segregación)' : '';
    return { periodos, periodo: per, poliza, movimientos, export: exp, balanza, comparativo, previa: previa!, yo: { finanzas: r!.finanzas, contabilidad: r!.contabilidad, puedeAceptar: { puede: !motivo, motivo } } };
  });
}
