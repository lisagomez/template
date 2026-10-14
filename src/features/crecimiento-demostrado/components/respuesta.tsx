/**
 * La RESPUESTA al dueño: su estado (que nunca se confunde con otro), el texto que pasó la
 * inclusión de números, la cascada si es un puente, lo que NO se puede afirmar, los supuestos que
 * usó, el árbol de la prueba, el certificado con su replay, y la propuesta para un humano.
 */
import type { EstadoDeRespuesta, Especificacion, Respuesta } from '../services/nucleo';
import { ArbolDeLaPrueba } from './arbol';
import { Cascada, puenteDe } from './cascada';

const ESTADO: Readonly<Record<EstadoDeRespuesta, { icono: string; texto: string; clase: string }>> = {
  demostrada: { icono: '✓', texto: 'Demostrada', clase: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' },
  evidencia_insuficiente: { icono: '◐', texto: 'Evidencia insuficiente', clase: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' },
  hipotesis: { icono: '?', texto: 'Hipótesis: no se demuestra con datos', clase: 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200' },
  rechazada: { icono: '✕', texto: 'Rechazada por el kernel', clase: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200' },
  requiere_entrada: { icono: '…', texto: 'Requiere entrada', clase: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' },
  sin_plan: { icono: '∅', texto: 'Sin plan: no sé responder eso', clase: 'bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200' },
  no_medido: { icono: '—', texto: 'No medido', clase: 'bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200' },
  narracion_bloqueada: { icono: '⊘', texto: 'Narración bloqueada', clase: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200' },
};

function loQueNoAfirma(r: Respuesta): string {
  const v = r.veredicto;
  if (r.estado === 'demostrada' && v?.estado === 'aceptada') {
    return v.certificado.nivel === 'inferencial'
      ? 'Dice que la diferencia no parece ruido. No dice por qué pasó ni que se vaya a repetir: eso sería una hipótesis.'
      : 'Describe qué pasó en tus datos, al centavo. No dice POR QUÉ: cualquier causa es una hipótesis que pide un experimento.';
  }
  if (r.estado === 'evidencia_insuficiente') return 'No afirma que haya un cambio, ni que no lo haya. Con estos datos, decidirlo sería decidir sobre ruido.';
  if (r.estado === 'hipotesis') return 'Los datos históricos no demuestran causas. Hasta que corra el experimento, nadie sabe si el cambio funcionará.';
  return 'Nada de esta pregunta quedó demostrado: no hay cifra que puedas usar.';
}

export function TarjetaDeRespuesta({ r, especificacion, replay }: { r: Respuesta; especificacion: Especificacion; replay: { gamma: string; certificado: string | null } | null }) {
  const e = ESTADO[r.estado];
  const v = r.veredicto;
  const puente = v?.estado === 'aceptada' ? puenteDe(v.certificado) : null;
  const supuestos = (r.derivacion as { supuestos?: string[] } | null)?.supuestos ?? [];
  return (
    <section className="mt-6 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800" data-prueba="respuesta" data-estado={r.estado}>
      <p className="text-sm text-neutral-500">«{r.pregunta}»</p>
      <p className={`mt-2 inline-flex items-center gap-2 rounded px-2 py-1 text-sm font-semibold ${e.clase}`}><span aria-hidden>{e.icono}</span>{e.texto}</p>
      {r.texto
        ? <p className="mt-3 whitespace-pre-line text-base leading-relaxed">{r.texto}</p>
        : <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">{r.estado === 'narracion_bloqueada' ? 'El texto propuesto traía cifras o causas que no están verificadas, y no se publica.' : (v && v.estado !== 'aceptada' ? v.detalle : r.bloqueos[0]?.motivo)}</p>}
      {puente && <Cascada puente={puente} />}
      <div className="mt-4 rounded border-l-4 border-neutral-400 bg-neutral-50 p-3 text-sm dark:bg-neutral-900" data-prueba="no-afirma">
        <p className="font-semibold">Lo que esta respuesta NO afirma</p>
        <p className="mt-1 text-neutral-700 dark:text-neutral-300">{loQueNoAfirma(r)}</p>
      </div>
      {supuestos.length > 0 && (
        <div className="mt-3 text-sm">
          <p className="font-semibold">Supuestos que usó (los declaró tu spec)</p>
          <ul className="mt-1 list-disc pl-5 text-neutral-700 dark:text-neutral-300">{supuestos.map((s) => <li key={s}><b>{s}</b>: {especificacion.supuestos.find((x) => x.id === s)?.texto}</li>)}</ul>
        </div>
      )}
      {r.derivacion !== null && <ArbolDeLaPrueba derivacion={r.derivacion} />}
      <Certificado r={r} replay={replay} />
      {r.propuesta && (
        <div className="mt-3 rounded border border-violet-300 p-3 text-sm dark:border-violet-800" data-prueba="propuesta">
          <p className="font-semibold">Propuesta para una persona (esta app no ejecuta nada)</p>
          <p className="mt-1">{r.propuesta.accion}</p>
          <p className="mt-1 text-xs text-neutral-500">Forma de sis_propuesta · origen {r.propuesta.origen} · modelo {r.propuesta.modelo} · evidencia {r.propuesta.evidencia.certificado ?? r.propuesta.evidencia.veredicto} · requiere {r.propuesta.requiere}</p>
        </div>
      )}
    </section>
  );
}

function Certificado({ r, replay }: { r: Respuesta; replay: { gamma: string; certificado: string | null } | null }) {
  const c = r.veredicto?.estado === 'aceptada' ? r.veredicto.certificado : null;
  return (
    <details className="mt-3 text-sm" open={replay !== null}>
      <summary className="cursor-pointer font-semibold">Certificado, intentos y replay</summary>
      <dl className="mt-2 grid grid-cols-[8rem_1fr] gap-x-2 gap-y-1 break-all text-xs">
        <dt className="text-neutral-500">Certificado</dt><dd data-prueba="certificado">{c?.hash ?? 'ninguno: solo una aceptación se certifica'}</dd>
        <dt className="text-neutral-500">Kernel</dt><dd>{c?.kernel ?? '—'}</dd>
        <dt className="text-neutral-500">Γ</dt><dd>{r.gamma}</dd>
        <dt className="text-neutral-500">Spec</dt><dd>{r.especificacion}</dd>
        <dt className="text-neutral-500">Plan</dt><dd>{r.planHuella ?? '—'}</dd>
        <dt className="text-neutral-500">Agentes</dt><dd>{r.agentes.proponente} · {r.agentes.narrador}</dd>
      </dl>
      <ol className="mt-2 list-decimal pl-5 text-xs text-neutral-600 dark:text-neutral-400">{r.intentos.map((i, k) => <li key={k}>{i.etapa}: {i.resultado} — {i.detalle}</li>)}</ol>
      {replay && (
        <p className="mt-2 rounded bg-neutral-100 p-2 text-xs dark:bg-neutral-900" data-prueba="replay">
          Replay con Γ reconstruido desde las fuentes: Γ {replay.gamma} · certificado {replay.certificado ?? '—'} · {replay.certificado === (c?.hash ?? null) && replay.gamma === r.gamma ? '✓ idéntico' : '✕ distinto'}
        </p>
      )}
    </details>
  );
}
