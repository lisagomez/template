/**
 * El laboratorio del vendedor en WhatsApp: todo lo de esta página CORRIÓ en el servidor al abrirla,
 * contra el simulador de Meta y con las dos pymes ficticias. Cada caso dice su estado y cada cifra
 * su naturaleza: medida, simulada o no medido. Nada se disfraza de real.
 */
import type {
  CostosGuion, FilaMetrica, GuionConversacion, MedidaVariante, MesDeCostos, PartidaPresupuesto, PlantillaMeta, ResultadoCaso, Transcripcion,
} from '../../../../tools/ventas-whatsapp/dist/laboratorio/index.js';

interface Props {
  readonly casos: readonly ResultadoCaso[];
  readonly metricas: readonly FilaMetrica[];
  readonly transcripciones: readonly Transcripcion[];
  readonly cuando: string;
  readonly optimizacion: { antes: MedidaVariante; despues: MedidaVariante; ahorroTokensPct: number; ahorroLlamadasPct: number; ahorroMensajesPct: number };
  readonly costos: readonly MesDeCostos[];
  readonly presupuesto: readonly PartidaPresupuesto[];
  readonly guiones: ReadonlyArray<GuionConversacion & { costos: CostosGuion }>;
  readonly plantillas: readonly PlantillaMeta[];
}

const mxn = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usd = (n: number, d = 2) => `USD ${n.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const th = 'py-1 pr-2';

const COLOR: Record<string, string> = {
  pasa: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  falla: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  'no-medido': 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  medida: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  simulada: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  'no medido': 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
};

export function LaboratorioVentas({ casos, metricas, transcripciones, cuando, optimizacion, costos, presupuesto, guiones, plantillas }: Props) {
  const n = (e: string) => casos.filter((c) => c.estado === e).length;
  const discrepan = casos.filter((c) => !c.cuadra);
  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6">
      <header className="mb-6 pr-24">
        <p className="text-xs uppercase tracking-widest text-neutral-500">Laboratorio del vendedor con IA en WhatsApp</p>
        <h1 className="text-2xl font-bold sm:text-3xl">Fases 0 a 3, contra el simulador de Meta</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Corrido {cuando}. Dos pymes ficticias de Veracruz; IA simulada (y una adversarial). Nada sale a Meta, al procesador ni a un modelo de pago.
        </p>
        <p className="mt-2 flex flex-wrap gap-2 text-sm" data-prueba="resumen-casos">
          <span className={`rounded px-2 py-0.5 font-semibold ${COLOR.pasa}`}>{n('pasa')} pasan</span>
          <span className={`rounded px-2 py-0.5 font-semibold ${COLOR['no-medido']}`}>{n('no-medido')} no medidos</span>
          <span className={`rounded px-2 py-0.5 font-semibold ${COLOR.falla}`}>{n('falla')} fallan</span>
          {discrepan.length > 0 && <span className="rounded bg-red-600 px-2 py-0.5 font-semibold text-white">{discrepan.length} no dan lo que declaran</span>}
        </p>
      </header>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">Compuertas de las fases 0-3</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-prueba="tabla-compuertas">
            <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr><th className="py-1">Fase</th><th>Compuerta</th><th>Meta</th><th>En el laboratorio</th><th>Naturaleza</th></tr>
            </thead>
            <tbody>
              {metricas.map((f) => (
                <tr key={f.compuerta} className="border-t border-neutral-200 align-top dark:border-neutral-800">
                  <td className="py-1 tabular-nums">{f.fase}</td>
                  <td>{f.compuerta}<span className="block text-xs text-neutral-500">{f.nota}</span></td>
                  <td className="whitespace-nowrap">{f.meta}</td>
                  <td className="font-medium">{f.valor}{f.pasa === true && ' ✓'}{f.pasa === false && ' ✗'}</td>
                  <td><span className={`rounded px-1.5 text-xs font-semibold ${COLOR[f.naturaleza] ?? ''}`}>{f.naturaleza}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">Casos del agente</h2>
        <ul className="grid gap-2 sm:grid-cols-2" data-prueba="casos">
          {casos.map((c) => (
            <li key={c.id} className="rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800" data-prueba={`caso-${c.estado}`}>
              <div className="flex items-center gap-2">
                <span className={`rounded px-1.5 text-xs font-semibold ${COLOR[c.estado]}`}>{c.estado}</span>
                <span className="text-xs text-neutral-500">fase {c.fase} · {c.vertical}</span>
                {!c.cuadra && <span className="ml-auto rounded bg-red-600 px-1.5 text-xs font-semibold text-white">declaraba {c.declara}</span>}
              </div>
              <p className="mt-1 font-medium">{c.titulo}</p>
              <p className="mt-1 line-clamp-3 text-xs text-neutral-600 dark:text-neutral-400">{c.evidencia}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-8" data-prueba="optimizacion">
        <h2 className="mb-2 text-lg font-semibold">Optimización de respuestas y costos (A/B, el mismo día con cola larga)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-neutral-500"><tr><th className={th}>Variante</th><th>Llamadas al modelo por conv.</th><th>Tokens por conv.</th><th>Turnos sin modelo</th><th>Mensajes por conv.</th><th>Resueltas sin humano</th><th>Conversión</th></tr></thead>
            <tbody>
              {[optimizacion.antes, optimizacion.despues].map((v) => (
                <tr key={v.variante} className="border-t border-neutral-200 dark:border-neutral-800"><td className={th}>{v.variante}</td><td>{v.llamadasPorConversacion}</td><td>{v.tokensPorConversacion}</td><td>{v.turnosSinModelo}</td><td>{v.mensajesPorConversacion}</td><td>{v.resueltasSinHumanoPct} %</td><td>{v.conversionPct} %</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-sm">Ahorro: <b>tokens −{optimizacion.ahorroTokensPct} %</b>, llamadas −{optimizacion.ahorroLlamadasPct} %, mensajes −{optimizacion.ahorroMensajesPct} % (cada turno ya era un mensaje). Resolución y conversión, iguales: ahorro sin recorte. Tokens estimados del modelo simulado.</p>
      </section>

      <section className="mb-8" data-prueba="roadmap-costos">
        <h2 className="mb-2 text-lg font-semibold">Roadmap de costos — FICTICIO</h2>
        <p className="mb-2 text-xs text-neutral-600 dark:text-neutral-400">Supuestos ficticios salvo mensajes, llamadas y tokens (medidos aquí). La forma importa, no las cifras: el costo lo domina la operación humana; Meta casi no cuesta con el cupo (no verificado) y los anuncios.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-neutral-500"><tr><th className={th}>Mes</th><th>Fase</th><th>Pymes</th><th>Meta</th><th>Meta sin cupo</th><th>IA</th><th>Infra</th><th>Soporte</th><th>Total</th><th>Por pyme</th><th>Margen</th></tr></thead>
            <tbody>
              {costos.map((m) => (
                <tr key={m.mes} className="border-t border-neutral-200 tabular-nums dark:border-neutral-800"><td className={th}>{m.mes}</td><td>{m.fase}</td><td>{m.pymes}</td><td>{usd(m.metaUsd)}</td><td>{usd(m.metaSinCupoUsd)}</td><td>{usd(m.iaUsd)}</td><td>{usd(m.infraUsd, 0)}</td><td>{mxn(m.soporteMxn)}</td><td>{mxn(m.totalMxn)}</td><td>{mxn(m.porPymeMxn)}</td><td>{m.margenPct} %</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className="mb-1 mt-3 text-sm font-semibold">Líneas de negocio: números (N-01) y BSP propio (N-02)</h3>
        <div className="overflow-x-auto" data-prueba="lineas-de-negocio">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-neutral-500"><tr><th className={th}>Mes</th><th>Con número nuestro</th><th>Números: ingreso</th><th>Números: costo</th><th>BSP</th><th>Margen BSP</th><th>Margen con las tres líneas</th></tr></thead>
            <tbody>
              {costos.map((m) => (
                <tr key={m.mes} className="border-t border-neutral-200 tabular-nums dark:border-neutral-800"><td className={th}>{m.mes}</td><td>{m.pymesConNumero}</td><td>{mxn(m.numerosIngresoMxn)}</td><td>{mxn(m.numerosCostoMxn)}</td><td>{m.bspModalidad === 'solution_partner' ? 'Solution Partner' : 'Tech Provider'}</td><td>{mxn(m.bspMargenMxn)}</td><td>{m.margenTotalPct} %</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className="mb-1 mt-3 text-sm font-semibold">Presupuesto del laboratorio y del piloto (una vez, ficticio)</h3>
        <ul className="text-sm">
          {presupuesto.map((p) => <li key={p.concepto}>{p.concepto}: <b>{mxn(p.montoMxn)}</b> <span className="text-xs text-neutral-500">— {p.nota}</span></li>)}
          <li className="mt-1 font-semibold">Total: {mxn(presupuesto.reduce((a, p) => a + p.montoMxn, 0))}</li>
        </ul>
      </section>

      <section className="mb-8" data-prueba="roadmap-conversaciones">
        <h2 className="mb-2 text-lg font-semibold">Roadmap de conversaciones-plantilla</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-neutral-500"><tr><th className={th}>Fase</th><th>Guion</th><th>Mensajes</th><th>Por anuncio</th><th>Orgánico en cupo</th><th>Fuera de cupo</th><th>Estado</th></tr></thead>
            <tbody>
              {guiones.map((g) => (
                <tr key={g.id} className="border-t border-neutral-200 align-top dark:border-neutral-800">
                  <td className={th}>{g.fase}</td>
                  <td>{g.nombre}<span className="block text-xs text-neutral-500">{g.pasos}</span></td>
                  <td className="tabular-nums">{g.mensajesLibres + g.plantillas.length}</td>
                  <td className="tabular-nums">{usd(g.costos.desdeAnuncioUsd, 4)}</td><td className="tabular-nums">{usd(g.costos.organicoEnCupoUsd, 4)}</td><td className="tabular-nums">{usd(g.costos.organicoFueraDeCupoUsd, 4)}</td>
                  <td><span className={`rounded px-1.5 text-xs font-semibold ${g.estado === 'probada' ? COLOR.pasa : COLOR['no-medido']}`}>{g.estado}</span><span className="block text-xs text-neutral-500">{g.evidencia}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">Plantillas de Meta: {plantillas.map((p) => `${p.nombre} (${p.categoria}${p.registrada ? ', registrada' : ''})`).join(' · ')}.</p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Una conversación de punta a punta por pyme</h2>
        {transcripciones.map((t) => (
          <pre key={t.pyme} className="mb-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-neutral-950 p-3 text-xs leading-relaxed text-neutral-100">{t.lineas.join('\n')}</pre>
        ))}
      </section>
    </main>
  );
}
