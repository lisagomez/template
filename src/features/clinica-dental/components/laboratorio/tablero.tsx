/**
 * El TABLERO DE UNIT ECONOMICS del laboratorio: por clínica y por canal, y cada cifra con su ORIGEN en texto
 * (medida, simulada, supuesta, compuesta) y su fuente a la vista. Nada aquí es de una clínica real.
 */
import type { Cifra, UnitEconomicsClinica } from '../../../../../tools/clinica-dental/dist/index.js';
import { CLINICAS } from '../../../../../tools/clinica-dental/dist/index.js';

const ORIGEN: Record<Cifra['origen'], { texto: string; clase: string }> = {
  medida: { texto: 'medida', clase: 'bg-emerald-50 text-emerald-900 ring-emerald-200' },
  simulada: { texto: 'simulada', clase: 'bg-amber-50 text-amber-900 ring-amber-200' },
  supuesta: { texto: 'supuesta', clase: 'bg-slate-100 text-slate-800 ring-slate-300' },
  compuesta: { texto: 'compuesta', clase: 'bg-violet-50 text-violet-900 ring-violet-200' },
};
const ETIQUETA: Record<string, string> = {
  pacientes_nuevos: 'Pacientes nuevos', citas_confirmadas: 'Citas confirmadas', citas_atendidas: 'Citas atendidas', precio_promedio_cita: 'Precio promedio por cita',
  margen_por_cita: 'Margen por cita', tasa_inasistencia: 'Tasa de inasistencia', entregabilidad: 'Entregabilidad de avisos', costo_por_aviso: 'Costo por aviso',
  costo_asistente_por_conversacion: 'Costo del asistente por conversación', contribucion_por_cita: 'Contribución por cita', ltv: 'LTV', cac: 'CAC', ltv_sobre_cac: 'LTV / CAC',
};

const CANAL: Record<string, string> = { busqueda: 'Búsqueda', redes: 'Redes sociales', referido: 'Referido', convenio: 'Convenio', directo: 'Directo' };
const CANAL_AVISO: Record<string, string> = { correo: 'Correo', telegram: 'Telegram', whatsapp: 'WhatsApp' };
const ETIQUETA_WA: Record<string, string> = {
  mensajes: 'Mensajes de WhatsApp entregados', cobrables: 'Mensajes cobrados por Meta', costo_periodo: 'Costo de WhatsApp en el periodo', costo_plantillas: 'Costo de plantillas (avisos)',
  costo_servicio: 'Costo de mensajes de servicio', asistencias_confirmadas: 'Asistencias confirmadas por WhatsApp', tasa_vinculo: 'Código → número vinculado',
};

const formato = (c: Cifra) => {
  if (c.valor === null) return '—';
  if (c.unidad === 'MXN') return `$${c.valor.toLocaleString('es-MX', { maximumFractionDigits: c.valor < 1 ? 4 : 2 })}`;
  if (c.unidad === 'proporción') return `${(c.valor * 100).toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`;
  return c.valor.toLocaleString('es-MX', { maximumFractionDigits: 2 });
};

export function Insignia({ origen }: { origen: Cifra['origen'] }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${ORIGEN[origen].clase}`}>{ORIGEN[origen].texto}</span>;
}

function Tarjeta({ id, c, etiquetas = ETIQUETA }: { id: string; c: Cifra; etiquetas?: Record<string, string> }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-2"><span className="text-xs font-medium text-slate-600">{etiquetas[id] ?? id}</span><Insignia origen={c.origen} /></div>
      <span className="text-2xl font-semibold tabular-nums text-slate-900">{formato(c)}{c.unidad === 'MXN' || c.unidad === 'proporción' ? '' : <span className="ml-1 text-sm font-normal text-slate-600">{c.unidad}</span>}</span>
      <details className="text-xs text-slate-600"><summary className="cursor-pointer">Fuente</summary><p className="mt-1">{c.fuente}</p></details>
    </div>
  );
}

export function Tablero({ clinicas, periodoDias, corte }: { clinicas: UnitEconomicsClinica[]; periodoDias: number; corte: string }) {
  return (
    <div className="space-y-8">
      <p className="text-sm text-slate-700">Periodo de la corrida: <strong>{periodoDias} días</strong> del reloj del laboratorio · corte semántico {corte}. Leyenda: <Insignia origen="medida" /> del gasto real de OpenRouter · <Insignia origen="simulada" /> de las corridas con pacientes sintéticos · <Insignia origen="supuesta" /> declarada por la clínica con su fuente · <Insignia origen="compuesta" /> cuenta de las anteriores.</p>
      {clinicas.map((u) => (
        <section key={u.clinica} aria-labelledby={`ue-${u.clinica}`} className="space-y-3">
          <h2 id={`ue-${u.clinica}`} className="text-xl font-semibold">{CLINICAS.find((c) => c.id === u.clinica)?.nombre}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(u.cifras).map(([k, c]) => <Tarjeta key={k} id={k} c={c} />)}</div>
          {/* En celular la tabla se desplaza de lado: el contenedor recibe foco para moverla con el teclado. */}
          <div role="region" aria-label={`Por canal de adquisición, ${u.clinica}`} tabIndex={0} className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200 focus-visible:outline focus-visible:outline-2">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <caption className="px-3 pt-3 text-left text-sm font-semibold">Por canal de adquisición</caption>
              <thead className="text-xs text-slate-600"><tr><th className="px-3 py-2">Canal</th><th className="px-3 py-2 text-right">Gasto en el periodo</th><th className="px-3 py-2 text-right">Registrados</th><th className="px-3 py-2 text-right">Conversión visita → registro</th><th className="px-3 py-2 text-right">CAC</th></tr></thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {u.porCanal.map((k) => (
                  <tr key={k.canal}>
                    <th scope="row" className="px-3 py-2 font-medium">{CANAL[k.canal] ?? k.canal}</th>
                    <td className="px-3 py-2 text-right">{formato(k.gastoPeriodoMxn)} <Insignia origen="supuesta" /></td>
                    <td className="px-3 py-2 text-right">{formato(k.registrados)} <Insignia origen="simulada" /></td>
                    <td className="px-3 py-2 text-right">{formato(k.conversion)}</td>
                    <td className="px-3 py-2 text-right">{formato(k.cac)} <Insignia origen="compuesta" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {u.avisosPorCanal?.length ? <AvisosPorCanal u={u} /> : null}
          {u.whatsapp ? (
            <div className="space-y-2">
              <h3 className="font-semibold">WhatsApp</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(u.whatsapp).map(([k, c]) => <Tarjeta key={k} id={k} c={c} etiquetas={ETIQUETA_WA} />)}</div>
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}

function AvisosPorCanal({ u }: { u: UnitEconomicsClinica }) {
  return (
    <div role="region" aria-label={`Avisos por canal, ${u.clinica}`} tabIndex={0} className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200 focus-visible:outline focus-visible:outline-2">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <caption className="px-3 pt-3 text-left text-sm font-semibold">Costo de avisar, por canal</caption>
        <thead className="text-xs text-slate-600"><tr><th className="px-3 py-2">Canal</th><th className="px-3 py-2 text-right">Entregados</th><th className="px-3 py-2 text-right">Leídos</th><th className="px-3 py-2 text-right">Entregabilidad</th><th className="px-3 py-2 text-right">Costo por aviso</th></tr></thead>
        <tbody className="divide-y divide-slate-100 tabular-nums">
          {(u.avisosPorCanal ?? []).map((a) => (
            <tr key={a.canal} data-canal={a.canal}>
              <th scope="row" className="px-3 py-2 font-medium">{CANAL_AVISO[a.canal] ?? a.canal}</th>
              <td className="px-3 py-2 text-right">{formato(a.entregados)} <Insignia origen="simulada" /></td>
              <td className="px-3 py-2 text-right">{formato(a.leidos)}</td>
              <td className="px-3 py-2 text-right">{formato(a.entregabilidad)}</td>
              <td className="px-3 py-2 text-right">{formato(a.costoPorAviso)} <Insignia origen="supuesta" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
