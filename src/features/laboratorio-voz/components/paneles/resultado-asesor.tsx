'use client';

/** La salida del cerebro de asesoria, para leerla: puntaje con desglose, hallazgos con su cita, huecos, acciones, riesgos, mapa. */
import { ETIQUETA_DIMENSION, type AnalisisReunion } from '../../services/asesor.ts';
import type { Segmento } from '../../types/index.ts';
import { Aviso, Metrica } from '../ui.tsx';

const CATEGORIA: Record<string, string> = {
  pain: 'Dolor', objetivo: 'Objetivo', necesidad_explicita: 'Necesidad explícita', necesidad_implicita: 'Necesidad implícita', riesgo: 'Riesgo', objecion: 'Objeción',
  herramienta_actual: 'Herramienta actual', competidor: 'Competidor', stakeholder: 'Persona clave', presupuesto: 'Presupuesto', urgencia: 'Urgencia', proceso_decision: 'Proceso de decisión',
  senal_compra: 'Señal de compra', proximo_paso: 'Próximo paso', pregunta_sin_responder: 'Pregunta sin responder',
};
const ESTADO_DIM: Record<string, string> = { cubierta: 'bg-emerald-500', parcial: 'bg-amber-500', faltante: 'bg-neutral-300 dark:bg-neutral-700' };

export function ResultadoAsesor({ analisis, segmentos, enfoque }: { analisis: AnalisisReunion; segmentos: Segmento[]; enfoque: 'insights' | 'score' | 'turnos' | 'playbook' }) {
  const s = analisis.score;
  const cita = (idx: number) => segmentos[idx]?.texto ?? '';
  return (
    <div className="space-y-4" data-prueba="resultado-asesor">
      <section className={enfoque === 'score' || enfoque === 'playbook' ? 'order-first' : ''}>
        <div className="grid gap-2 sm:grid-cols-4">
          <Metrica nombre="Puntaje de descubrimiento" valor={`${s.total} / 100`} pista="nunca sin su desglose" />
          <Metrica nombre="Habla del asesor" valor={`${Math.round(s.conducta.ratioHablaInterno * 100)} %`} pista="ideal por debajo de 45 %" />
          <Metrica nombre="Preguntas abiertas" valor={s.conducta.preguntasAbiertas} />
          <Metrica nombre="Turnos inaudibles" valor={s.conducta.segmentosInaudibles} />
        </div>
        <ul className="mt-2 space-y-1" data-prueba="desglose">
          {s.dimensiones.map((d) => (
            <li key={d.dimension} className="flex items-center gap-2 text-sm">
              <span className="w-44 shrink-0 text-xs">{ETIQUETA_DIMENSION[d.dimension]} · {d.peso}</span>
              <span className="h-2 flex-1 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800"><span className={`block h-2 ${ESTADO_DIM[d.estado]}`} style={{ width: d.estado === 'cubierta' ? '100%' : d.estado === 'parcial' ? '50%' : '4%' }} /></span>
              <span className="w-20 text-xs text-neutral-500">{d.estado}</span>
            </li>
          ))}
        </ul>
        {s.huecos.length > 0 ? (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950" data-prueba="huecos">
            <p className="text-xs font-semibold uppercase tracking-wide">Huecos y la pregunta que faltó</p>
            <ul className="mt-1 space-y-1">
              {s.huecos.map((h) => (
                <li key={h.dimension}><strong>{ETIQUETA_DIMENSION[h.dimension]}:</strong> {h.motivo} → <em>«{h.preguntaSugerida}»</em></li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Hallazgos ({analisis.insights.length}) · cada uno cita su frase</p>
        <ul className="mt-1 space-y-1" data-prueba="insights">
          {analisis.insights.map((i) => (
            <li key={i.id} className="rounded-lg border border-neutral-200 bg-white p-2 text-sm dark:border-neutral-800 dark:bg-neutral-950">
              <span className="mr-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase dark:bg-neutral-800">{CATEGORIA[i.categoria] ?? i.categoria}</span>
              {i.texto}
              <p className="mt-1 text-xs text-neutral-500">Evidencia: «{i.evidencia[0]?.cita || cita(i.evidencia[0]?.segmentoIdx ?? -1)}» ({Math.round(i.evidencia[0]?.inicioS ?? 0)} s) · confianza {i.confianza}</p>
            </li>
          ))}
          {analisis.insights.length === 0 ? <li className="text-sm text-neutral-400">Sin hallazgos con evidencia: el motor no adivina.</li> : null}
        </ul>
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Acciones ({analisis.acciones.length})</p>
          <ul className="mt-1 space-y-1 text-sm">
            {analisis.acciones.map((a) => (
              <li key={a.id}>• {a.tarea}{a.responsable ? ` — ${a.responsable}` : ''}{a.fechaTexto ? ` (${a.fechaTexto})` : ''}</li>
            ))}
          </ul>
        </section>
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Riesgos ({analisis.riesgos.length})</p>
          <ul className="mt-1 space-y-1 text-sm">
            {analisis.riesgos.map((r) => (
              <li key={r.tipo}><span className="text-xs font-semibold uppercase">{r.severidad}</span> · {r.descripcion} <span className="text-xs text-neutral-500">→ {r.mitigacion}</span></li>
            ))}
          </ul>
        </section>
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Personas ({analisis.stakeholders.length})</p>
          <ul className="mt-1 space-y-1 text-sm">
            {analisis.stakeholders.map((p) => (
              <li key={p.nombre}>• {p.nombre} — {p.rol} · {p.influencia}{p.presente ? '' : ' (ausente)'}</li>
            ))}
          </ul>
        </section>
      </div>
      <Aviso tipo="honesto">Análisis por reglas, sin modelo de lenguaje: mismo texto, mismo resultado, mismo porqué. Un turno sin texto se marca inaudible y nunca se adivina.</Aviso>
    </div>
  );
}
