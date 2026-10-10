'use client'

/**
 * Lo que se mide y lo que se recomienda: el tablero (del corte semántico), el SLA del contrato, las
 * horas, el reloj con su evidencia, los accionables con su impacto en MXN (fórmula, supuestos y rango a
 * la vista), el FODA con su dato, y lo que el agente propone (regla y CLI) sin aplicarlo.
 */
import type { AccionableVista, ConsentimientoVista, FodaVista, GrupoTarjetas, PropuestaVista, SlaVista, Tarjeta, Vista } from '../services/tipos'
import { Celda, Metricas, Pildora, hora, mxn } from './ui'
import { Reloj } from './incidencias'

export function Tablero({ grupos, ancho = 12 }: { grupos: readonly GrupoTarjetas[]; ancho?: 7 | 12 }) {
  return (
    <Celda titulo="Tablero (capa semántica)" ancho={ancho} prueba="tablero" nota="Cada número viene del corte semántico (dbt + MetricFlow); pasa el cursor para ver su fuente.">
      <div className="space-y-4">
        {grupos.map((g) => (
          <div key={g.titulo}><h3 className="mb-1 text-sm font-semibold">{g.titulo}</h3><Metricas tarjetas={g.tarjetas} /></div>
        ))}
      </div>
    </Celda>
  )
}

export function Sla({ sla }: { sla: SlaVista }) {
  return (
    <Celda titulo={`Contrato SLA · ${sla.contrato}`} ancho={7} prueba="sla" nota="Metas citadas de una referencia pública o «por decidir»: el laboratorio no inventa cifras.">
      <table className="w-full text-xs">
        <thead className="text-left text-neutral-500"><tr><th>Prioridad</th><th>Respuesta</th><th>Resolución</th><th>Fuente</th></tr></thead>
        <tbody>{sla.metas.map((m) => <tr key={m.prioridad} className="border-t border-neutral-100 dark:border-neutral-800"><td className="font-semibold">{m.prioridad}</td><td>{m.respuesta}</td><td>{m.resolucion}</td><td className="text-[10px] text-neutral-500">{m.fuente.replace(/: https?:\/\/\S+/, '')}</td></tr>)}</tbody>
      </table>
      <div className="mt-3"><Metricas tarjetas={sla.tarjetas} prueba="sla-metricas" /></div>
      <ul className="mt-2 list-disc pl-4 text-[11px] text-neutral-500">{sla.notas.map((n) => <li key={n}>{n}</li>)}</ul>
    </Celda>
  )
}

export function Horas({ tarjetas }: { tarjetas: readonly Tarjeta[] }) {
  return <Celda titulo="Horas de la consultora" ancho={5} prueba="horas"><Metricas tarjetas={tarjetas} /></Celda>
}

export function RelojDemo({ relojes }: { relojes: Vista['relojesDemo'] }) {
  return (
    <Celda titulo="Reloj de SLA con su evidencia (corpus sintético)" ancho={12} prueba="reloj-demo" nota="Corre en el calendario de la meta, se pausa en la espera del cliente y se reanuda; cada tramo dice qué evento lo abrió.">
      <div className="space-y-4">{relojes.map((d) => <div key={d.titulo}><p className="mb-1 text-xs font-semibold">{d.titulo}</p><Reloj r={d.reloj} /></div>)}</div>
    </Celda>
  )
}

function Accionable({ a }: { a: AccionableVista }) {
  return (
    <li data-prueba={`accionable-${a.id}`} className="rounded-xl bg-neutral-50 p-3 text-xs dark:bg-neutral-800/60">
      <p className="text-sm font-semibold">{a.titulo} <Pildora tono="info">{a.para === 'n3' ? 'para el cliente' : 'para la consultora'}</Pildora></p>
      <p className="mt-1 text-lg font-bold tabular-nums">{mxn(a.bajo)} · {mxn(a.central)} · {mxn(a.alto)} <span className="text-xs font-normal text-neutral-500">MXN al mes (bajo · central · alto)</span></p>
      <p className="mt-1"><b>Fórmula:</b> {a.formula}</p>
      <p className="mt-1"><b>Evidencia:</b> {a.evidencia.join('; ')}</p>
      <ul className="mt-1 list-disc pl-4"><b>Supuestos:</b>{a.supuestos.map((s) => <li key={s}>{s}</li>)}</ul>
      <p className="mt-1">Confianza <b>{a.confianza}</b> · responsable: {a.responsable}</p>
      <p className="mt-1 text-amber-700 dark:text-amber-300">{a.aviso}</p>
    </li>
  )
}

export function Accionables({ lista, ancho = 12 }: { lista: readonly AccionableVista[]; ancho?: 5 | 7 | 12 }) {
  return (
    <Celda titulo="Accionables con impacto en MXN" ancho={ancho} prueba="accionables" nota="Proyecciones, no promesas: los parámetros son supuestos (D15) hasta que la consultora los capture.">
      {lista.length === 0 ? <p className="text-sm text-neutral-500">Sin accionables: el corte no da evidencia para ninguno.</p> : <ul className="grid gap-2 md:grid-cols-2">{lista.map((a) => <Accionable key={a.id} a={a} />)}</ul>}
    </Celda>
  )
}

export function Foda({ foda }: { foda: FodaVista }) {
  const bloques: Array<[string, FodaVista['fortalezas'], 'bien' | 'mal' | 'info' | 'aviso']> = [
    ['Fortalezas', foda.fortalezas, 'bien'], ['Debilidades', foda.debilidades, 'mal'], ['Oportunidades', foda.oportunidades, 'info'], ['Amenazas', foda.amenazas, 'aviso'],
  ]
  return (
    <Celda titulo="FODA del servicio" ancho={12} prueba="foda" nota="Cada punto cita su dato, su criterio (umbrales supuestos, a la vista) y su confianza: con pocas incidencias en el periodo, baja.">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {bloques.map(([t, puntos, tono]) => (
          <div key={t} className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-800/60">
            <p className="mb-1"><Pildora tono={tono}>{t}</Pildora></p>
            {puntos.length === 0 ? <p className="text-xs text-neutral-500">— (ningún dato lo sostiene)</p> : null}
            <ul className="space-y-2 text-xs">{puntos.map((p) => <li key={p.texto}><b>{p.texto}</b> <Pildora tono={p.confianza === 'baja' ? 'aviso' : 'neutro'}>confianza {p.confianza}</Pildora><br /><span className="text-neutral-500">Dato: {p.datos.join('; ')}</span><br /><span className="text-[10px] text-neutral-400">Criterio: {p.criterio}</span></li>)}</ul>
          </div>
        ))}
      </div>
    </Celda>
  )
}

/** Lo enseñado queda a medida de la consultora del caso; al núcleo lo sube el superadministrador, generalizado (PRP-010 H-19). */
export function Propuestas({ lista, alNucleo }: { lista: readonly PropuestaVista[]; alNucleo: ((id: string) => void) | null }) {
  return (
    <Celda titulo="Propuestas del agente (nada se aplica solo)" ancho={7} prueba="propuestas" nota="Lo enseñado queda a medida de la consultora del caso. Al núcleo lo sube el superadministrador, generalizado. Una regla la firma el laboratorio en tools/conocimiento; imprimir un CLI es CDC.">
      {lista.length === 0 ? <p className="text-sm text-neutral-500">Sin propuestas todavía: enseña un caso en el chat, nombrando su incidencia.</p> : null}
      <ul className="space-y-2 text-xs">{lista.map((p, k) => (
        <li key={k} className="rounded-lg bg-neutral-50 p-2 dark:bg-neutral-800/60" data-prueba={p.id ? `propuesta-${p.id}` : undefined}>
          <Pildora tono="info">{p.tipo}</Pildora> {p.alcance ? <Pildora tono={p.alcance === 'núcleo' ? 'aviso' : 'bien'}>{p.alcance}</Pildora> : null} <b>{p.titulo}</b> · {p.estado} · {p.por}
          <p className="mt-1 whitespace-pre-wrap font-mono text-[10px]">{p.detalle}</p>
          {alNucleo && p.id && p.alcance !== 'núcleo' && p.falta ? <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300" data-prueba={`falta-${p.id}`}>No sube todavía: {p.falta}.</p> : null}
          {alNucleo && p.id && p.alcance !== 'núcleo' && !p.falta ? <button type="button" onClick={() => alNucleo(p.id!)} className="mt-1 rounded-full border px-3 py-0.5 text-[11px] font-semibold" data-prueba={`al-nucleo-${p.id}`}>Subir al núcleo, generalizada</button> : null}
        </li>
      ))}</ul>
    </Celda>
  )
}

export function Sandbox({ casos }: { casos: Vista['sandbox'] }) {
  return (
    <Celda titulo="Sandbox (solo anonimizado)" ancho={5} prueba="sandbox" nota="Sin regla en el grafo, el caso entra anonimizado; con dudas o datos de RR. HH., va a cuarentena.">
      {casos.length === 0 ? <p className="text-sm text-neutral-500">Sin casos en el sandbox.</p> : null}
      <ul className="space-y-2 text-xs">{casos.map((c) => <li key={c.incidencia} className="rounded-lg bg-neutral-50 p-2 dark:bg-neutral-800/60"><b>{c.incidencia}</b> <Pildora tono={c.veredicto === 'entra' ? 'bien' : 'aviso'}>{c.veredicto}</Pildora>{c.texto ? <p className="mt-1 font-mono">{c.texto}</p> : null}{c.senales.length ? <p className="text-neutral-500">Señales: {c.senales.join('; ')}</p> : null}</li>)}</ul>
    </Celda>
  )
}

/**
 * D1 (PRP-011): la consultora (un consultor) y el cliente consienten, cada uno por sí, que lo aprendido de sus casos
 * suba generalizado al núcleo común. La consultora ve también el de sus clientes, pero no consiente por ellos.
 */
export function ConocimientoComun({ lista, propia, actua }: { lista: readonly ConsentimientoVista[]; propia: string; actua: (a: object) => Promise<void> }) {
  return (
    <Celda titulo="Conocimiento común (D1)" ancho={5} prueba="conocimiento-comun" nota="Lo que se aprende de tus casos puede servir a otras consultoras solo generalizado (sin nombres, objetos propios ni estructura) y solo si tu organización y la otra parte lo consienten. Revocar frena lo que no ha subido; lo que ya subió, generalizado, se queda.">
      <ul className="space-y-1 text-xs">{lista.map((c) => (
        <li key={c.organizacion} data-prueba={`consentimiento-${c.organizacion}`}>
          <b>{c.nombre}</b> · {c.vigente ? <Pildora tono="bien">consiente</Pildora> : <Pildora tono="neutro">no consiente</Pildora>}
          {c.vigente ? <span className="text-neutral-500"> · por {c.vigente.por}, {hora(c.vigente.fecha)}</span> : null}
          {c.organizacion === propia ? (
            <button type="button" onClick={() => actua({ tipo: c.vigente ? 'revoca_nucleo' : 'consiente_nucleo' })} className="ml-2 rounded-full border px-2 py-0.5 text-[11px]"
              data-prueba={c.vigente ? 'revoca-nucleo' : 'consiente-nucleo'}>{c.vigente ? 'Revocar' : 'Consentir'}</button>
          ) : null}
        </li>
      ))}</ul>
    </Celda>
  )
}

