/**
 * Del corte semántico (MetricFlow) al UNIT ECONOMICS por clínica y canal, y al GRAFO DE ATENCIÓN.
 *
 * Regla: **cada cifra dice de dónde sale** — `medida` (del gasto real de OpenRouter o de un conteo de las corridas),
 * `simulada` (pacientes, asistencia y entregas del laboratorio), `supuesta` (precios, costos y gasto de marketing
 * declarados por la clínica sintética, con su fuente) o `compuesta` (cuenta de las anteriores, con su fórmula).
 * Ninguna finge ser de una clínica real.
 */
import type { Clinica } from './clinicas.js';

export type Origen = 'medida' | 'simulada' | 'supuesta' | 'compuesta';
export interface Cifra { valor: number | null; unidad: string; origen: Origen; fuente: string }

export interface CorteSemantico {
  metricas: Record<string, Record<string, { metricflow: number | null; directo: number | null }>>;
  porCanal: { clinica: string; canal: string; visitantes: number | null; registrados: number | null; conversion: number | null }[];
  aristas: { arista: string; metricflow: { n: number | null; p50: number | null } }[];
  aristasPorClinica: { clinica: string; arista: string; n: number | null; p50: number | null }[];
  /** v2: los avisos por canal y los mensajes de WhatsApp por categoria (opcionales: un corte v1 no los trae). */
  avisosPorCanal?: { clinica: string; canal: string; entregados: number | null; leidos: number | null; entregabilidad: number | null; costoPorAvisoUsd: number | null }[];
  mensajesWhatsapp?: { clinica: string; categoria: string; mensaje: string; n: number | null; cobrables: number | null; costoUsd: number | null }[];
}

const SIM = 'corrida del laboratorio con pacientes sintéticos (corte semántico de MetricFlow)';
const m = (c: CorteSemantico, metrica: string, clinica: string): number | null => c.metricas[metrica]?.[clinica]?.metricflow ?? null;
const redondea = (x: number | null, d = 2) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const cifra = (valor: number | null, unidad: string, origen: Origen, fuente: string, d = 2): Cifra => ({ valor: redondea(valor, d), unidad, origen, fuente });
const div = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : a / b);

export interface AvisosDeCanal { canal: string; entregados: Cifra; leidos: Cifra; entregabilidad: Cifra; costoPorAviso: Cifra }

export interface UnitEconomicsClinica {
  clinica: string;
  periodoDias: number;
  cifras: Record<string, Cifra>;
  porCanal: { canal: string; gastoPeriodoMxn: Cifra; registrados: Cifra; cac: Cifra; conversion: Cifra }[];
  /** El costo de AVISAR por cada canal: lo que hace que WhatsApp valga o no frente al correo y Telegram. */
  avisosPorCanal?: AvisosDeCanal[];
  whatsapp?: Record<string, Cifra>;
}

function cifrasDeClinica(corte: CorteSemantico, c: Clinica, periodoDias: number): Record<string, Cifra> {
  const s = c.supuestos;
  const tc = s.tipoCambioMxnPorUsd.valor;
  const v = (k: string) => m(corte, k, c.id);
  const atendidas = v('citas_atendidas_n');
  const margenPorCita = div(v('margen_atendido_mxn'), atendidas);
  const costoAvisosPorCita = v('costo_por_aviso_usd') === null ? null : v('costo_por_aviso_usd')! * tc * (div(v('avisos_entregados_n'), v('citas_confirmadas')) ?? 0);
  const costoAsistentePorCita = v('costo_por_conversacion_usd') === null ? null : v('costo_por_conversacion_usd')! * tc * (div(v('conversaciones_asistente_n'), v('citas_confirmadas')) ?? 0);
  const contribucion = margenPorCita === null ? null : margenPorCita - (costoAvisosPorCita ?? 0) - (costoAsistentePorCita ?? 0);
  const inasistencia = v('tasa_inasistencia');
  const ltv = contribucion === null ? null : contribucion * s.visitasPorAnio.valor * s.aniosRetencion.valor * (1 - (inasistencia ?? 0));
  const gasto = Object.values(s.gastoMarketingMensualMxn).reduce((t, g) => t + g.valor, 0) * (periodoDias / 30);
  const cac = div(gasto, v('pacientes_nuevos'));
  return {
    pacientes_nuevos: cifra(v('pacientes_nuevos'), 'pacientes', 'simulada', SIM, 0),
    citas_confirmadas: cifra(v('citas_confirmadas'), 'citas', 'simulada', SIM, 0),
    citas_atendidas: cifra(atendidas, 'citas', 'simulada', `${SIM}; la asistencia es SIMULADA`, 0),
    precio_promedio_cita: cifra(div(v('ingreso_atendido_mxn'), atendidas), 'MXN', 'supuesta', 'precios DECLARADOS de la clínica sintética, sobre las citas atendidas de la corrida'),
    margen_por_cita: cifra(margenPorCita, 'MXN', 'supuesta', 'precio − costo variable SUPUESTO por servicio (declaración de la clínica)'),
    tasa_inasistencia: cifra(inasistencia, 'proporción', 'simulada', 'asistencia SIMULADA en el laboratorio (cada paciente sintético declara si asiste)', 3),
    entregabilidad: cifra(v('entregabilidad'), 'proporción', 'simulada', 'buzón y Bot API SIMULADOS: no dicen nada de la entregabilidad real de Gmail o Telegram', 3),
    costo_por_aviso: cifra(v('costo_por_aviso_usd') === null ? null : v('costo_por_aviso_usd')! * tc, 'MXN', 'supuesta', `${s.costoCorreoUsd.fuente}; ${s.costoTelegramUsd.fuente}; WhatsApp: ${s.tarifasWhatsappUsd.utility.fuente}; ${s.tipoCambioMxnPorUsd.fuente}`, 4),
    costo_asistente_por_conversacion: cifra(v('costo_por_conversacion_usd') === null ? null : v('costo_por_conversacion_usd')! * tc, 'MXN', 'medida', `lo que reportó OpenRouter (usage.cost) por los turnos con LLM de la corrida; ${s.tipoCambioMxnPorUsd.fuente}`, 4),
    contribucion_por_cita: cifra(contribucion, 'MXN', 'compuesta', 'margen por cita − costo de avisos por cita − costo del asistente por cita'),
    ltv: cifra(ltv, 'MXN', 'compuesta', `contribución por cita × ${s.visitasPorAnio.valor} visitas al año × ${s.aniosRetencion.valor} años × (1 − inasistencia). Visitas y retención: ${s.visitasPorAnio.fuente}`),
    cac: cifra(cac, 'MXN', 'compuesta', `gasto de marketing SUPUESTO prorrateado a ${periodoDias} días ÷ pacientes nuevos simulados`),
    ltv_sobre_cac: cifra(div(ltv, cac), 'veces', 'compuesta', 'LTV ÷ CAC: dos cifras hechas de supuestos; orientan, no deciden'),
  };
}

const SIN_PAUTA = { valor: 0, fuente: 'sin gasto declarado para este canal: se cuenta en 0 (el tráfico directo no paga pauta)' };

/** Todo canal con gasto declarado Y todo canal por el que de verdad llegó alguien: ninguno se cae de la tabla. */
function cacPorCanal(corte: CorteSemantico, c: Clinica, periodoDias: number): UnitEconomicsClinica['porCanal'] {
  const declarados = c.supuestos.gastoMarketingMensualMxn;
  const vistos = corte.porCanal.filter((f) => f.clinica === c.id).map((f) => f.canal);
  const canales = [...new Set([...Object.keys(declarados), ...vistos])];
  return canales.map((canal) => {
    const g = declarados[canal] ?? SIN_PAUTA;
    const fila = corte.porCanal.find((f) => f.clinica === c.id && f.canal === canal);
    const registrados = fila?.registrados ?? 0;
    const gasto = g.valor * (periodoDias / 30);
    return {
      canal,
      gastoPeriodoMxn: cifra(gasto, 'MXN', 'supuesta', g.fuente),
      registrados: cifra(registrados, 'pacientes', 'simulada', SIM, 0),
      cac: cifra(registrados > 0 ? gasto / registrados : null, 'MXN', 'compuesta', 'gasto supuesto del canal en el periodo ÷ registrados simulados del canal'),
      conversion: cifra(fila?.conversion ?? null, 'proporción', 'simulada', SIM, 3),
    };
  });
}

const FUENTE_CANAL: Record<string, (c: Clinica) => string> = {
  correo: (c) => c.supuestos.costoCorreoUsd.fuente,
  telegram: (c) => c.supuestos.costoTelegramUsd.fuente,
  whatsapp: (c) => `lo que Meta marcó como cobrable en el estado de cada mensaje (SIMULADO) × ${c.supuestos.tarifasWhatsappUsd.utility.fuente}`,
};

function avisosPorCanal(corte: CorteSemantico, c: Clinica): AvisosDeCanal[] {
  const tc = c.supuestos.tipoCambioMxnPorUsd.valor;
  return (corte.avisosPorCanal ?? []).filter((f) => f.clinica === c.id).map((f) => ({
    canal: f.canal,
    entregados: cifra(f.entregados, 'avisos', 'simulada', SIM, 0),
    leidos: cifra(f.canal === 'whatsapp' ? f.leidos : null, 'avisos', 'simulada', 'solo WhatsApp da acuse de lectura; el del simulador no depende de la persona', 0),
    entregabilidad: cifra(f.entregabilidad, 'proporción', 'simulada', 'canales SIMULADOS: no dicen nada de la entrega real', 3),
    costoPorAviso: cifra(f.costoPorAvisoUsd === null ? null : f.costoPorAvisoUsd * tc, 'MXN', 'supuesta', `${(FUENTE_CANAL[f.canal] ?? (() => SIM))(c)}; ${c.supuestos.tipoCambioMxnPorUsd.fuente}`, 4),
  }));
}

/** WhatsApp entero (avisos y respuestas): mensajes, cuántos se cobraron y cuánto, plantilla contra servicio. */
function cifrasWhatsapp(corte: CorteSemantico, c: Clinica): Record<string, Cifra> | undefined {
  const filas = (corte.mensajesWhatsapp ?? []).filter((f) => f.clinica === c.id);
  if (!filas.length) return undefined;
  const tc = c.supuestos.tipoCambioMxnPorUsd.valor;
  const suma = (k: 'n' | 'cobrables' | 'costoUsd', f: (x: (typeof filas)[number]) => boolean = () => true) => filas.filter(f).reduce((t, x) => t + (x[k] ?? 0), 0);
  const fuente = `estados de Meta SIMULADOS × ${c.supuestos.tarifasWhatsappUsd.utility.fuente}; ${c.supuestos.tipoCambioMxnPorUsd.fuente}`;
  const v = (k: string) => m(corte, k, c.id);
  return {
    mensajes: cifra(suma('n'), 'mensajes', 'simulada', SIM, 0),
    cobrables: cifra(suma('cobrables'), 'mensajes', 'simulada', 'plantillas siempre; servicio solo pasados los 1,000 gratis del mes', 0),
    costo_periodo: cifra(suma('costoUsd') * tc, 'MXN', 'supuesta', fuente, 4),
    costo_plantillas: cifra(suma('costoUsd', (x) => x.categoria === 'utility') * tc, 'MXN', 'supuesta', fuente, 4),
    costo_servicio: cifra(suma('costoUsd', (x) => x.categoria === 'service') * tc, 'MXN', 'supuesta', fuente, 4),
    asistencias_confirmadas: cifra(v('asistencias_confirmadas_n'), 'citas', 'simulada', `${SIM}: el paciente sintético tocó «Confirmo»`, 0),
    tasa_vinculo: cifra(v('tasa_vinculo'), 'proporción', 'simulada', 'códigos emitidos que terminaron en un número confirmado desde la cuenta', 3),
  };
}

/** Las cifras de UNA clínica. `periodoDias`: lo que duró la corrida en el reloj del laboratorio. */
export function unitEconomics(corte: CorteSemantico, c: Clinica, periodoDias: number): UnitEconomicsClinica {
  const wa = cifrasWhatsapp(corte, c);
  return { clinica: c.id, periodoDias, cifras: cifrasDeClinica(corte, c, periodoDias), porCanal: cacPorCanal(corte, c, periodoDias), avisosPorCanal: avisosPorCanal(corte, c), ...(wa ? { whatsapp: wa } : {}) };
}

export interface NodoGrafo { id: string; label: string; estado: 'morado' | 'gris' }
export interface AristaGrafo { id: string; label: string; tipo: 'script'; from: string; to: string; n: number; p50_s: number | null; origen: Origen }
export interface GrafoAtencion { slug: string; titulo: string; nodos: NodoGrafo[]; aristas: AristaGrafo[]; lazos: never[]; fuente: string }

export const NODOS_ATENCION: Record<string, string> = {
  visita: 'Visita al portal', registro: 'Registro (cuestionario)', consentimientos: 'Consentimientos', agenda: 'Agenda (hueco elegido)', cita: 'Cita confirmada',
  avisos: 'Avisos entregados', asistencia: 'Asistió (simulada)', inasistencia: 'No asistió (simulada)', cancelada: 'Cita cancelada', reprogramada: 'Cita reprogramada',
  asistente: 'Asistente (chat o voz)', urgencia: 'Urgencia derivada por regla', baja: 'Baja del newsletter',
};

/** El recorrido del paciente como grafo, en el esquema de docs/grafos/: conteo y p50 por arista de MetricFlow. */
export function grafoDeAtencion(corte: CorteSemantico): GrafoAtencion {
  const aristas = corte.aristas.filter((a) => (a.metricflow.n ?? 0) > 0).map((a) => {
    const [from = '', to = ''] = a.arista.split('→');
    return { id: `a-${from}-${to}`, label: `${from} → ${to}`, tipo: 'script' as const, from, to, n: a.metricflow.n ?? 0, p50_s: redondea(a.metricflow.p50, 1), origen: 'simulada' as const };
  });
  const usados = new Set(aristas.flatMap((a) => [a.from, a.to]));
  return {
    slug: 'clinica-dental-atencion',
    titulo: 'Grafo de atención al cliente: el recorrido del paciente (laboratorio, pacientes sintéticos)',
    nodos: Object.entries(NODOS_ATENCION).filter(([id]) => usados.has(id)).map(([id, label]) => ({ id, label, estado: 'morado' as const })),
    aristas,
    lazos: [],
    fuente: 'métricas `transiciones` y `segundos_arista_p50` de MetricFlow sobre fct_transicion (libro de eventos de las corridas del laboratorio)',
  };
}
