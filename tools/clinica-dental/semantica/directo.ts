/**
 * El CONTEO DIRECTO sobre el libro: las mismas cifras que MetricFlow, calculadas aquí sin SQL ni dbt, recorriendo los
 * eventos. Es la referencia del lazo l-metricas: si una métrica no cuadra con esto, algo se perdió o se duplicó en
 * el camino libro → staging → marts → semántica. Implementación independiente a propósito (no comparte código).
 */
import type { Evento } from '../dist/index.js';

type De<T extends Evento['tipo']> = Extract<Evento, { tipo: T }>;
const de = <T extends Evento['tipo']>(es: readonly Evento[], t: T) => es.filter((e): e is De<T> => e.tipo === t);
const ms = (iso: string) => Date.parse(iso);

/** Percentil continuo 0.5 (lo que hace `percentile_cont(0.5)` de Postgres). */
export function mediana(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = (o.length - 1) / 2;
  return o[Math.floor(m)]! + (o[Math.ceil(m)]! - o[Math.floor(m)]!) * (m - Math.floor(m));
}
const ratio = (a: number, b: number) => (b === 0 ? null : a / b);

function porCita(es: readonly Evento[]) {
  const cancel = new Map(de(es, 'cita_cancelada').map((e) => [e.cita, e.motivo]));
  const asis = new Map<string, boolean>();
  for (const e of de(es, 'cita_asistencia')) asis.set(e.cita, (asis.get(e.cita) ?? false) || e.asistio);
  return de(es, 'cita_confirmada').map((c) => {
    const m = cancel.get(c.cita);
    const a = asis.get(c.cita);
    const estado = m === 'reprogramada' ? 'reprogramada' : m ? 'cancelada' : a === true ? 'asistio' : a === false ? 'inasistencia' : 'pendiente';
    return { c, estado };
  });
}

function embudo(es: readonly Evento[]) {
  const visitantes = [...new Set(de(es, 'portal_visitado').map((e) => e.sujeto))];
  const iniciaron = new Set(de(es, 'registro_iniciado').map((e) => e.sujeto));
  const pacienteDe = new Map(de(es, 'paciente_registrado').filter((e) => e.visitante).map((e) => [e.visitante!, e.sujeto]));
  const conCita = new Set(de(es, 'cita_confirmada').map((e) => e.sujeto));
  return {
    visitantes: visitantes.length,
    iniciaron: visitantes.filter((v) => iniciaron.has(v)).length,
    registrados: visitantes.filter((v) => pacienteDe.has(v)).length,
    conCita: visitantes.filter((v) => conCita.has(pacienteDe.get(v) ?? '')).length,
  };
}

function avisos(es: readonly Evento[]) {
  const entregado = new Map<string, number>();
  for (const e of de(es, 'aviso_entregado')) entregado.set(e.aviso, (entregado.get(e.aviso) ?? 0) + (e.costo_usd ?? 0));
  const fallo = new Set(de(es, 'aviso_fallido').filter((e) => e.definitivo).map((e) => e.aviso));
  const prog = de(es, 'aviso_programado');
  const entregados = prog.filter((p) => entregado.has(p.aviso)).length;
  const fallidos = prog.filter((p) => !entregado.has(p.aviso) && fallo.has(p.aviso)).length;
  const costo = prog.reduce((s, p) => s + (entregado.get(p.aviso) ?? 0), 0);
  return { entregados, intentados: entregados + fallidos, costo };
}

/** Lo de WhatsApp (contrato v2), con la MISMA definicion que los marts, recalculado aqui. */
function whatsapp(es: readonly Evento[]) {
  const leidos = new Set(de(es, 'aviso_leido').map((e) => e.aviso));
  const cobros = de(es, 'whatsapp_cobro');
  const costo = cobros.reduce((s, e) => s + (e.costo_usd ?? 0), 0);
  const entrantes = de(es, 'whatsapp_entrante');
  const vinculo = de(es, 'whatsapp_vinculo');
  const paso = (p: string) => vinculo.filter((e) => e.paso === p).length;
  const confirmadas = new Set(de(es, 'asistencia_confirmada').map((e) => e.cita));
  const conf = de(es, 'cita_confirmada');
  return {
    avisos_leidos_n: de(es, 'aviso_programado').filter((p) => leidos.has(p.aviso)).length,
    mensajes_whatsapp_n: cobros.length,
    mensajes_whatsapp_cobrados_n: cobros.filter((e) => e.billable).length,
    costo_whatsapp_usd: costo,
    costo_por_mensaje_whatsapp_usd: ratio(costo, cobros.length),
    entrantes_whatsapp_n: entrantes.length,
    entrantes_whatsapp_vinculados_n: entrantes.filter((e) => e.vinculado).length,
    urgencias_whatsapp_n: de(es, 'asistente_turno').filter((t) => t.ruta === 'urgencia' && t.canal === 'whatsapp').length,
    codigos_vinculo_n: paso('codigo_emitido'),
    vinculos_confirmados_n: paso('confirmado'),
    vinculos_rechazados_n: paso('rechazado'),
    tasa_vinculo: ratio(paso('confirmado'), paso('codigo_emitido')),
    asistencias_confirmadas_n: conf.filter((c) => confirmadas.has(c.cita)).length,
    citas_por_whatsapp_n: conf.filter((c) => c.via === 'whatsapp').length,
    recepcion_atiende_n: de(es, 'recepcion_atiende').length,
  };
}

export interface Cifras { [metrica: string]: number | null }

/** Las métricas por clínica, calculadas recorriendo los eventos de ESA clínica. */
export function metricasDirectas(es: readonly Evento[], servicios: ReadonlyMap<string, { precio: number; costo: number }>): Cifras {
  const reg = new Map(de(es, 'paciente_registrado').map((e) => [e.sujeto, ms(e.en)]));
  const primera = new Map<string, number>();
  for (const c of de(es, 'cita_confirmada')) primera.set(c.sujeto, Math.min(primera.get(c.sujeto) ?? Infinity, ms(c.en)));
  const horas = [...reg].filter(([s]) => primera.has(s)).map(([s, t]) => (primera.get(s)! - t) / 3_600_000);
  const citas = porCita(es);
  const conAsistencia = citas.filter((x) => x.estado === 'asistio' || x.estado === 'inasistencia');
  const atendidas = citas.filter((x) => x.estado === 'asistio');
  const f = embudo(es);
  const a = avisos(es);
  const turnos = de(es, 'asistente_turno');
  const conversaciones = new Set(turnos.map((t) => t.conversacion));
  const costoAsistente = turnos.reduce((s, t) => s + (t.costo_usd ?? 0), 0);
  const precio = (x: { c: De<'cita_confirmada'> }) => servicios.get(x.c.servicio)?.precio ?? 0;
  const costoVar = (x: { c: De<'cita_confirmada'> }) => servicios.get(x.c.servicio)?.costo ?? 0;
  return {
    pacientes_nuevos: reg.size,
    citas_confirmadas: citas.length,
    horas_registro_a_cita_p50: mediana(horas),
    visitantes_portal: f.visitantes,
    registros_embudo: f.registrados,
    conversion_visita_registro: ratio(f.registrados, f.visitantes),
    conversion_inicio_registro: ratio(f.registrados, f.iniciaron),
    conversion_registro_cita: ratio(f.conCita, f.registrados),
    avisos_entregados_n: a.entregados,
    entregabilidad: ratio(a.entregados, a.intentados),
    costo_por_aviso_usd: ratio(a.costo, a.entregados),
    bajas_newsletter: de(es, 'newsletter_baja').length,
    turnos_asistente_n: turnos.length,
    urgencias_derivadas: turnos.filter((t) => t.ruta === 'urgencia').length,
    latencia_asistente_p50_ms: mediana(turnos.map((t) => t.latencia_ms)),
    conversaciones_asistente_n: conversaciones.size,
    costo_por_conversacion_usd: ratio(costoAsistente, conversaciones.size),
    tasa_inasistencia: ratio(conAsistencia.filter((x) => x.estado === 'inasistencia').length, conAsistencia.length),
    citas_atendidas_n: atendidas.length,
    citas_canceladas_n: citas.filter((x) => x.estado === 'cancelada').length,
    ingreso_atendido_mxn: atendidas.reduce((s, x) => s + precio(x), 0),
    margen_atendido_mxn: atendidas.reduce((s, x) => s + precio(x) - costoVar(x), 0),
    ...whatsapp(es),
  };
}

export interface Arista { desde: string; hacia: string; n: number; p50: number | null }

/** Las aristas del recorrido, con la MISMA definición que fct_transicion, recalculadas aquí. */
export function aristasDirectas(es: readonly Evento[]): Arista[] {
  const sec = (a: number, b: number) => Math.max(0, (b - a) / 1000);
  const minPor = <T extends Evento>(xs: T[], k: (e: T) => string) => {
    const m = new Map<string, number>();
    for (const e of xs) m.set(k(e), Math.min(m.get(k(e)) ?? Infinity, ms(e.en)));
    return m;
  };
  const vis = minPor(de(es, 'portal_visitado'), (e) => e.sujeto);
  const reg = de(es, 'paciente_registrado');
  const regEn = new Map(reg.map((e) => [e.sujeto, ms(e.en)]));
  const con = minPor(de(es, 'consentimiento_otorgado').filter((e) => e.consentimiento === 'aviso_privacidad'), (e) => e.sujeto);
  const sol = minPor(de(es, 'cita_solicitada'), (e) => e.sujeto);
  const conf = de(es, 'cita_confirmada');
  const primera = minPor(conf, (e) => e.sujeto);
  const entregado = minPor(de(es, 'aviso_entregado'), (e) => e.aviso);
  const avisoDeCita = new Map<string, number>();
  for (const p of de(es, 'aviso_programado')) if (p.cita && entregado.has(p.aviso)) avisoDeCita.set(p.cita, Math.min(avisoDeCita.get(p.cita) ?? Infinity, entregado.get(p.aviso)!));
  const filas: { desde: string; hacia: string; s: number }[] = [];
  const agrega = (desde: string, hacia: string, a: number | undefined, b: number | undefined) => a !== undefined && b !== undefined && filas.push({ desde, hacia, s: sec(a, b) });
  for (const r of reg) if (r.visitante) agrega('visita', 'registro', vis.get(r.visitante), ms(r.en));
  for (const [s, t] of regEn) agrega('registro', 'consentimientos', t, con.get(s));
  for (const [s, t] of con) agrega('consentimientos', 'agenda', t, sol.get(s));
  for (const [s, t] of sol) agrega('agenda', 'cita', t, primera.get(s));
  const asis = de(es, 'cita_asistencia');
  for (const c of conf) {
    agrega('cita', 'avisos', ms(c.en), avisoDeCita.get(c.cita));
    for (const a of asis.filter((x) => x.cita === c.cita)) agrega('avisos', a.asistio ? 'asistencia' : 'inasistencia', avisoDeCita.get(c.cita), ms(a.en));
    for (const x of de(es, 'cita_cancelada').filter((y) => y.cita === c.cita)) agrega('cita', x.motivo === 'reprogramada' ? 'reprogramada' : 'cancelada', ms(c.en), ms(x.en));
  }
  const turnos = new Map<string, { sujeto: string; en: number }>();
  for (const t of de(es, 'asistente_turno')) {
    const k = `${t.sujeto}|${t.conversacion}`;
    if (!turnos.has(k) || turnos.get(k)!.en > ms(t.en)) turnos.set(k, { sujeto: t.sujeto, en: ms(t.en) });
  }
  const urg = minPor(de(es, 'urgencia_derivada'), (e) => e.conversacion);
  for (const [k, t] of turnos) {
    const origen = vis.get(t.sujeto) ?? regEn.get(t.sujeto);
    agrega(t.sujeto.startsWith('vis_') ? 'visita' : 'registro', 'asistente', origen, origen === undefined ? undefined : t.en);
    agrega('asistente', 'urgencia', t.en, urg.get(k.split('|')[1]!));
  }
  const baja = minPor(de(es, 'newsletter_baja'), (e) => e.sujeto);
  for (const [s, t] of regEn) agrega('registro', 'baja', t, baja.get(s));
  const grupos = new Map<string, number[]>();
  for (const f of filas) grupos.set(`${f.desde}→${f.hacia}`, [...(grupos.get(`${f.desde}→${f.hacia}`) ?? []), f.s]);
  return [...grupos].map(([k, v]) => ({ desde: k.split('→')[0]!, hacia: k.split('→')[1]!, n: v.length, p50: mediana(v) })).sort((a, b) => `${a.desde}${a.hacia}`.localeCompare(`${b.desde}${b.hacia}`));
}
