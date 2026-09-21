'use client';

/** «Como me va»: cifras con su fuente, nunca un puntaje. Barras de los ultimos 14 dias, semana, racha, latencia, motor y lo que saben las trayectorias. */
import type { Estadisticas } from '../services/estadisticas.ts';

function Cifra({ nombre, valor, pista }: { nombre: string; valor: string | number; pista?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
      <p className="text-[11px] uppercase tracking-wide text-neutral-500">{nombre}</p>
      <p className="text-lg font-semibold tabular-nums">{valor}</p>
      {pista ? <p className="text-[11px] text-neutral-400">{pista}</p> : null}
    </div>
  );
}

const diaCorto = (dia: string) => { const [, m, d] = dia.split('-'); return `${Number(d)}/${Number(m)}`; };

export function Cifras({ e }: { e: Estadisticas }) {
  const max = Math.max(1, ...e.ultimosDias.map((d) => d.dictados));
  const cambio = e.semanaAnterior.dictados > 0 ? Math.round(((e.semana.dictados - e.semanaAnterior.dictados) / e.semanaAnterior.dictados) * 100) : null;
  const t = e.trayectorias;
  return (
    <section className="space-y-3" data-prueba="cifras">
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Cifra nombre="Esta semana" valor={e.semana.dictados} pista={`${e.semana.palabras} palabras${cambio !== null ? ` · ${cambio >= 0 ? '+' : ''}${cambio} % vs. la anterior` : ''}`} />
        <Cifra nombre="Racha" valor={`${e.racha.dias} día${e.racha.dias === 1 ? '' : 's'}`} pista={e.racha.dias === 0 ? 'sin dictar hoy ni ayer' : e.racha.hastaHoy ? 'seguidos, hoy incluido' : 'seguidos hasta ayer'} />
        <Cifra nombre="Latencia esta semana" valor={e.semana.latencia.p50 !== null ? `${e.semana.latencia.p50} ms` : '—'} pista={e.semana.latencia.p95 !== null ? `p95 ${e.semana.latencia.p95} ms · ${e.semana.latencia.medidas} medidas` : 'fin de habla → pegado'} />
        <Cifra nombre="En total" valor={e.total} pista={`${e.palabrasTotales} palabras dictadas`} />
        <Cifra nombre="Motor más usado" valor={e.motor ? (e.motor.motor.includes('parakeet') ? 'Parakeet' : e.motor.motor.includes('whisper') ? 'Whisper' : e.motor.motor.startsWith('remoto') ? 'residente' : e.motor.motor) : '—'} pista={e.motor ? `${e.motor.dictados} dictados` : undefined} />
        <Cifra nombre="Sesiones medidas" valor={t.sesiones} pista={t.sesiones ? `${t.turnos} turnos · ${t.sinVoz} sin voz · ${t.respaldo} con respaldo` : 'de las trayectorias de dictar'} />
      </div>
      <div>
        <p className="text-xs text-neutral-500">Dictados por día, últimos 14 días</p>
        <div className="mt-1 flex h-20 items-end gap-1" data-prueba="barras-dias">
          {e.ultimosDias.map((d) => (
            <div key={d.dia} className="flex flex-1 flex-col items-center gap-1" title={`${d.dia}: ${d.dictados} dictados, ${d.palabras} palabras`}>
              <div className="w-full rounded-t bg-neutral-800 dark:bg-neutral-200" style={{ height: `${Math.max(2, Math.round((d.dictados / max) * 64))}px` }} />
              <span className="text-[9px] text-neutral-400">{diaCorto(d.dia)}</span>
            </div>
          ))}
        </div>
      </div>
      {t.sesiones > 0 ? (
        <p className="text-xs text-neutral-500">
          Micrófono en las sesiones medidas: {t.saturaciones ? `${t.saturaciones} con saturación` : 'ninguna saturación'}, {t.flojos ? `${t.flojos} con señal floja` : 'ninguna floja'}{t.muertesCaptura ? `, ${t.muertesCaptura} caídas de la captura` : ''}. Latencia p50 de las sesiones: {t.latenciaP50Ms ?? '—'} ms.
        </p>
      ) : null}
      <p className="text-xs text-neutral-400">Cifras medidas sobre tu historial y las trayectorias de forma de `dictar` (que no guardan lo que dijiste). Orientan; no califican.</p>
    </section>
  );
}
