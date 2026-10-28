'use client';

/**
 * Agentes y la Puerta. Cada agente existe solo con un idCard: quién responde por él, la huella de la tarjeta aprobada y
 * la de su llave, dónde puede actuar, su techo de autonomía y sus tres topes (leídos del libro y de las filas, un solo
 * dato). Suspender se deshace; revocar no, y va por el freno: se escribe en la conversación y se confirma con un clic.
 */
import { useState, useTransition } from 'react';
import { bajaTopeDe, proponeCambio, reactivaAgente, suspendeAgente } from '@/features/agora/services/acciones';
import { corta, mxn, pct } from '@/features/agora/services/formato';
import { Avatar, Etiqueta } from '@/features/agora/components/insignia';
import { simulaSocio, type Escenario, type ResultadoSimulado } from '../services/acciones';
import type { AgenteVisible, DatosDeAgentes, Tope } from '../services/lecturas';

const ESTADO: Record<string, string> = { aprobado: 'bg-emerald-100 text-emerald-800', prueba: 'bg-blue-100 text-blue-800', en_revision: 'bg-amber-100 text-amber-800', solicitado: 'bg-amber-100 text-amber-800',
  suspendido: 'bg-rose-100 text-rose-700', revocado: 'bg-slate-800 text-white' };

function Medidor({ nombre, t, dinero }: { nombre: string; t: Tope; dinero?: boolean }) {
  const p = pct(Number(t.uso), Number(t.tope));
  return (
    <div className="grid grid-cols-[130px_1fr_120px] items-center gap-2 text-[11.5px]" data-tope={nombre} data-pct={p}>
      <span className="text-slate-600">{nombre}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-slate-200"><span className={`block h-full rounded-full ${p >= 100 ? 'bg-rose-600' : p >= 80 ? 'bg-amber-500' : 'bg-slate-700'}`} style={{ width: `${Math.min(100, p)}%` }} /></span>
      <span className={`text-right tabular-nums ${p >= 100 ? 'font-semibold text-rose-700' : p >= 80 ? 'font-semibold text-amber-700' : 'text-slate-600'}`}>{dinero ? `${mxn(t.uso)} / ${mxn(t.tope, false)}` : `${t.uso} / ${t.tope}`}{t.sin_costo ? ` (+${t.sin_costo} sin costo)` : ''}</span>
    </div>
  );
}

function Tarjeta({ a, d, avisa }: { a: AgenteVisible; d: DatosDeAgentes; avisa: (t: string) => void }) {
  const [ocupado, empieza] = useTransition();
  const [tope, setTope] = useState('');
  const vivo = ['aprobado', 'prueba'].includes(a.estado);
  const corre = (fn: () => Promise<{ ok: boolean; motivo?: string }>, bien: string) => empieza(async () => { const r = await fn(); avisa(r.ok ? bien : `La base no lo permitió: ${r.motivo}`) });
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4" data-agente={a.slug} data-estado={a.estado}>
      <header className="flex items-start gap-3">
        <Avatar tipo={a.origen} iniciales={a.iniciales} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h3 className="text-[14px] font-semibold text-slate-900">{a.nombre}</h3><Etiqueta tipo={a.origen} /><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${ESTADO[a.estado] ?? ''}`}>{a.estado.replace('_', ' ')}</span></div>
          <p className="text-[12px] text-slate-500">{a.rol} · techo {a.autonomia}{a.sinModelo ? ' · sin modelo (reglas)' : ''} · idCard v{a.version}{a.vence ? ` · vence ${a.vence}` : ''} · {a.responsable}</p>
          <p className="mt-0.5 text-[12px] text-slate-600">{a.descripcion}</p>
        </div>
      </header>
      <dl className="mt-2 grid grid-cols-[110px_1fr] gap-x-2 gap-y-0.5 text-[11.5px]">
        <dt className="text-slate-500">Alcance</dt><dd>{a.alcance.map((x) => `${x.nodo} (${x.skills.join(', ')})`).join(' · ') || '—'}</dd>
        {a.origen === 'externo' ? <><dt className="text-slate-500">Tarjeta</dt><dd className="font-mono" title={a.cardSha256 ?? ''}>sha256 {corta(a.cardSha256)} · {a.cardUrl}</dd>
          <dt className="text-slate-500">Llave</dt><dd className="font-mono" title={a.llaveSha256 ?? ''}>kid {a.kid} · sha256 {corta(a.llaveSha256)}</dd></> : null}
        <dt className="text-slate-500">Firmas del alta</dt><dd>{a.firmas.join(' · ') || '—'}</dd>
      </dl>
      {a.topes ? <div className="mt-2 space-y-1"><Medidor nombre="Mensajes por hora" t={a.topes.mensajes} /><Medidor nombre="Propuestas por día" t={a.topes.propuestas} /><Medidor nombre="Gasto de modelo (mes)" t={a.topes.gasto} dinero /></div> : null}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 text-xs">
        {vivo && (d.yo.propietario || d.yo.administrador || d.yo.aprobador) ? <button type="button" disabled={ocupado} onClick={() => corre(() => suspendeAgente({ agente: a.id, motivo: 'suspendido desde Agentes' }), `${a.nombre} suspendido: sus llamadas responden «no existe» y sus propuestas quedan congeladas.`)} className="rounded-md border border-rose-300 px-2 py-1 font-medium text-rose-700" data-suspende={a.slug}>Suspender</button> : null}
        {a.estado === 'suspendido' && d.yo.propietario ? <button type="button" disabled={ocupado} onClick={() => corre(() => reactivaAgente({ agente: a.id, motivo: 'reactivado desde Agentes' }), `${a.nombre} reactivado.`)} className="rounded-md border border-emerald-300 px-2 py-1 font-medium text-emerald-700">Reactivar</button> : null}
        {a.estado !== 'revocado' && (d.yo.propietario || d.yo.administrador) ? <span className="text-slate-500" data-revoca-por-freno>Revocar va por el freno: escribe «revoca a {a.nombre}» en la conversación.</span> : null}
        {vivo && (d.yo.propietario || d.yo.administrador) ? (
          <span className="ml-auto flex items-center gap-1">
            <input value={tope} onChange={(e) => setTope(e.target.value.replace(/[^\d.]/g, ''))} placeholder="nuevo tope de gasto" className="w-32 rounded border border-slate-300 px-1.5 py-0.5" />
            <button type="button" disabled={ocupado || !tope} onClick={() => {
              const v = Number(tope); const actual = Number(a.topes?.gasto.tope ?? 0)
              if (v < actual) corre(() => bajaTopeDe({ agente: a.id, tope: 'gasto', valor: v }), `Tope de gasto bajado a ${mxn(v, false)} (versión nueva del idCard).`)
              else corre(async () => { const r = await proponeCambio({ payload: { version: 1, clase: 'tope_gasto', categoria: d.categoriaFinanzas ?? '', agente: a.id, tope: 'gasto', antes: actual, despues: v }, resumen: `Subir el tope de gasto de ${a.nombre} a ${mxn(v, false)}` }); return r.ok && r.valor.id ? { ok: true } : { ok: false, motivo: r.ok ? r.valor.veredicto.motivo ?? '' : r.motivo } }, 'Subir un tope es una propuesta: la firman la Propietaria Y Finanzas.')
            }} className="rounded border border-slate-300 px-2 py-0.5">Cambiar tope</button>
          </span>
        ) : null}
      </div>
    </article>
  );
}

const ESCENARIOS: Array<[Escenario, string]> = [['valida', 'Llamada válida'], ['propuesta', 'Con una propuesta'], ['refirmada', 'Tarjeta re-firmada'], ['otra-llave', 'Otra llave (kid)'], ['firma-ajena', 'Firma ajena'], ['jti-repetido', 'jti repetido'], ['fuera-de-alcance', 'Fuera de alcance']];

function SocioSimulado({ avisa }: { avisa: (t: string) => void }) {
  const [socio, setSocio] = useState('medios-norte');
  const [r, setR] = useState<ResultadoSimulado[]>([]);
  const [ocupado, empieza] = useTransition();
  const llama = (e: Escenario) => empieza(async () => {
    const x = await simulaSocio({ socio, escenario: e });
    if (!x.ok) return avisa(x.motivo);
    setR((v) => [x.valor, ...v].slice(0, 8));
  });
  return (
    <section className="rounded-xl border border-dashed border-amber-400 bg-amber-50/40 p-4" data-socio-simulado>
      <h2 className="text-sm font-semibold text-slate-900">Socio simulado (laboratorio)</h2>
      <p className="text-[11.5px] text-slate-600">Llama a la Puerta como un agente externo real (token ES256, su tarjeta, un jti nuevo). Nada sale de la máquina.</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <select value={socio} onChange={(e) => setSocio(e.target.value)} className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs"><option value="medios-norte">Medios Norte</option><option value="fletes-golfo">Fletes del Golfo</option><option value="empaques-regio">Empaques Regio (suspendido)</option></select>
        {ESCENARIOS.map(([e, n]) => <button key={e} type="button" disabled={ocupado} onClick={() => llama(e)} data-escenario={e} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50">{n}</button>)}
      </div>
      <ul className="mt-2 space-y-1 text-[12px]" data-resultados-socio>
        {r.map((x, k) => (
          <li key={k} className={`rounded px-2 py-1 ${x.admitida ? 'bg-emerald-50 text-emerald-900' : x.http === 429 ? 'bg-amber-100 text-amber-900' : 'bg-rose-50 text-rose-800'}`} data-resultado={x.admitida ? 'admitida' : 'rechazada'}>
            <b>{ESCENARIOS.find(([e]) => e === x.escenario)?.[1]}</b> → HTTP {x.http} · {x.admitida ? 'admitida' : 'rechazada'} · motivo interno: {x.motivo}{x.retryAfter ? ` · Retry-After ${x.retryAfter} s` : ''} · el socio ve: <code>{JSON.stringify((x.respuesta as { error?: unknown; result?: { status?: { state?: string } } }).error ?? (x.respuesta as { result?: { status?: { state?: string } } }).result?.status?.state)}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Agentes({ d }: { d: DatosDeAgentes }) {
  const [aviso, setAviso] = useState<string | null>(null);
  const internos = d.agentes.filter((a) => a.origen === 'interno');
  const externos = d.agentes.filter((a) => a.origen === 'externo');
  return (
    <div className="space-y-5 p-5" data-agora-agentes>
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Identidad A2A · idCard, huellas fijadas y topes</p>
        <h1 className="text-xl font-semibold text-slate-900">Agentes y la Puerta</h1>
        <p className="mt-1 rounded-lg bg-slate-900 px-3 py-2 text-[12.5px] text-white" data-puerta-cerrada>La Puerta A2A está CERRADA: solo responde en el laboratorio y desde esta máquina. Abrirla a un socio real exige el C3 y el C4 firmados y la doble firma humana.</p>
      </header>
      {aviso ? <p role="status" className="rounded-lg bg-slate-900 px-3 py-2 text-[12.5px] text-white" data-aviso-agentes>{aviso}</p> : null}
      <div className="grid gap-4 2xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Socios externos (entran por la Puerta)</h2>
          {externos.map((a) => <Tarjeta key={a.id} a={a} d={d} avisa={setAviso} />)}
          <h2 className="pt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Agentes internos</h2>
          {internos.map((a) => <Tarjeta key={a.id} a={a} d={d} avisa={setAviso} />)}
        </div>
        <div className="space-y-4">
          <SocioSimulado avisa={setAviso} />
          <section className="rounded-xl border border-slate-200 bg-white p-4" data-tras-revocar>
            <h2 className="text-sm font-semibold text-slate-900">Llamadas admitidas después de revocar (meta: 0)</h2>
            {d.trasRevocar.length ? <ul className="mt-1 text-[12.5px]">{d.trasRevocar.map((x) => <li key={x.agente} data-llamadas-tras-revocar={x.llamadas}><b>{x.agente}</b>: <span className={x.llamadas ? 'font-semibold text-rose-700' : 'font-semibold text-emerald-700'}>llamadas_tras_revocar = {x.llamadas}</span> (revocado {x.revocado.slice(0, 16)})</li>)}</ul> : <p className="text-[12px] text-slate-500">Ningún agente revocado todavía.</p>}
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-4" data-registro-puerta>
            <h2 className="text-sm font-semibold text-slate-900">Lo que vio la Puerta</h2>
            <p className="text-[11.5px] text-slate-500">Rechazos por motivo: {d.porMotivo.map((x) => `${x.motivo} (${x.n})`).join(' · ') || 'ninguno'}</p>
            <table className="mt-2 w-full text-[11.5px]"><thead className="text-left text-[10px] uppercase tracking-wider text-slate-500"><tr><th>Cuándo</th><th>Agente</th><th>Resultado</th><th>Motivo</th><th>HTTP</th></tr></thead>
              <tbody>{d.llamadas.map((l, k) => <tr key={k} className="border-t border-slate-100"><td className="py-0.5 tabular-nums">{l.cuando.slice(11, 19)}</td><td>{l.agente ?? '—'}</td><td className={l.resultado === 'admitida' ? 'text-emerald-700' : 'text-rose-700'}>{l.resultado}</td><td>{l.motivo}</td><td className="tabular-nums">{l.http}{l.retry ? ` · ${l.retry}s` : ''}</td></tr>)}</tbody></table>
          </section>
        </div>
      </div>
    </div>
  );
}
