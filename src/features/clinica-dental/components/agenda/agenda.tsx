'use client';

/**
 * La agenda: servicio (con precio y duración a la vista) → día → hora → resumen con el SELECTOR DE AVISOS →
 * confirmar. Solo se ofrecen huecos reales; si otra persona confirma el mismo hueco un instante antes, se dice y
 * se elige otro. Confirmar exige cuenta; ver la disponibilidad, no.
 */
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CLINICAS, NOMBRE_CATEGORIA, pesos, CATEGORIAS, type DiaDisponible } from '../../../../../tools/clinica-dental/dist/index.js';
import { enlaceTelegram, reprogramar, reservar } from '../../services/servidor/acciones';
import { empuja } from '../../services/cliente/datalayer';
import { Aviso, clasesBoton, clasesBotonSecundario } from '../ui';
import { CalendarioMes, fechaLarga } from './calendario-mes';
import { SelectorAvisos, type EleccionAvisos } from './selector-avisos';

interface Props { clinica: string; conSesion: boolean; esPaciente: boolean; servicioInicial: string | null; reprograma: { cita: string; servicio: string } | null }

const clave = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Los huecos de (clínica, servicio). Cada carga lleva su llave: una respuesta vieja no pisa a la nueva, y mientras
 * la llave no coincide los días son `null` (cargando) sin escribir estado dentro del efecto.
 */
function useHuecos(clinica: string, servicio: string | null) {
  const [vuelta, setVuelta] = useState(0);
  const [leido, setLeido] = useState<{ de: string; dias: DiaDisponible[] | null; error: string | null } | null>(null);
  const de = `${clinica}|${servicio}|${vuelta}`;
  useEffect(() => {
    if (!servicio) return;
    let vigente = true;
    const lee = async () => {
      const r = await fetch(`/api/clinica-dental/huecos?clinica=${clinica}&servicio=${servicio}&dias=56`, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      return ((await r.json()) as { dias: DiaDisponible[] }).dias;
    };
    lee().then(
      (dias) => vigente && setLeido({ de, dias, error: null }),
      () => vigente && setLeido({ de, dias: null, error: 'No pudimos leer la agenda. Intenta de nuevo.' }),
    );
    return () => { vigente = false; };
  }, [clinica, servicio, de]);
  const actual = leido?.de === de ? leido : null;
  return { dias: actual?.dias ?? null, error: actual?.error ?? null, recarga: () => setVuelta((v) => v + 1) };
}

function Servicios({ clinica, elegido, alElegir }: { clinica: string; elegido: string | null; alElegir: (s: string) => void }) {
  const c = CLINICAS.find((x) => x.id === clinica)!;
  return (
    <fieldset className="space-y-3">
      <legend className="text-lg font-semibold">1. ¿Qué servicio?</legend>
      {CATEGORIAS.filter((k) => c.servicios.some((s) => s.categoria === k)).map((k) => (
        <div key={k}>
          <p className="mb-1 text-sm font-medium text-slate-600">{NOMBRE_CATEGORIA[k]}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {c.servicios.filter((s) => s.categoria === k).map((s) => (
              <label key={s.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-white p-3 ${elegido === s.id ? 'border-[color:var(--c1)] ring-2 ring-[color:var(--c1)]/30' : 'border-slate-200'}`}>
                <span className="flex items-center gap-2"><input type="radio" name="servicio" value={s.id} checked={elegido === s.id} onChange={() => alElegir(s.id)} className="h-4 w-4 accent-[color:var(--c1)]" /><span className="font-medium">{s.nombre}</span></span>
                <span className="text-right text-sm"><span className="font-semibold">{pesos(s.precioMxn)}</span><span className="block text-slate-600">{s.duracionMin} min</span></span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  );
}

export function Agenda({ clinica, conSesion, esPaciente, servicioInicial, reprograma }: Props) {
  const c = CLINICAS.find((x) => x.id === clinica)!;
  const [servicio, setServicio] = useState<string | null>(reprograma?.servicio ?? servicioInicial);
  const { dias, error, recarga } = useHuecos(clinica, servicio);
  const [dia, setDia] = useState<string | null>(null);
  const [hora, setHora] = useState<{ hora: string; inicio: string } | null>(null);
  const [avisos, setAvisos] = useState<EleccionAvisos>({ canal: null, newsletter: false });
  const [mes, setMes] = useState<{ anio: number; mes: number } | null>(null);
  const [estado, setEstado] = useState<{ enviando: boolean; error: string | null; hecho: { cita: string; telegram: boolean } | null; sinSesion: boolean }>({ enviando: false, error: null, hecho: null, sinSesion: false });
  const [enlace, setEnlace] = useState<string | null>(null);
  const meses = useMemo(() => [...new Set((dias ?? []).map((d) => d.fecha.slice(0, 7)))], [dias]);
  const mesVisible = mes ?? (meses[0] ? { anio: Number(meses[0].slice(0, 4)), mes: Number(meses[0].slice(5)) } : null);
  const delDia = dias?.find((d) => d.fecha === dia) ?? null;
  const s = c.servicios.find((x) => x.id === servicio) ?? null;

  const eligeServicio = (id: string) => { setServicio(id); setDia(null); setHora(null); setMes(null); };
  const cambiaMes = (delta: number) => {
    if (!mesVisible) return;
    const t = new Date(Date.UTC(mesVisible.anio, mesVisible.mes - 1 + delta, 1));
    setMes({ anio: t.getUTCFullYear(), mes: t.getUTCMonth() + 1 });
  };
  async function confirma() {
    if (!s || !hora) return;
    if (!reprograma && avisos.canal === null) return setEstado({ enviando: false, error: 'Elige cómo quieres tus avisos (o «Ninguno»).', hecho: null, sinSesion: false });
    setEstado({ enviando: true, error: null, hecho: null, sinSesion: false });
    const canales: ('correo' | 'telegram')[] = avisos.canal === 'ambos' ? ['correo', 'telegram'] : avisos.canal === 'correo' || avisos.canal === 'telegram' ? [avisos.canal] : [];
    const r = reprograma ? await reprogramar(clinica, reprograma.cita, hora.inicio) : await reservar(clinica, { servicio: s.id, inicio: hora.inicio, canales, newsletter: avisos.newsletter, clave: clave() });
    if (!r.ok) {
      setEstado({ enviando: false, error: r.error, hecho: null, sinSesion: Boolean(r.sinSesion) });
      setHora(null);
      recarga();
      return;
    }
    empuja(r.dataLayer ?? []);
    const telegram = 'telegramPorVincular' in r.valor ? Boolean(r.valor.telegramPorVincular) : false;
    setEstado({ enviando: false, error: null, hecho: { cita: r.valor.cita, telegram }, sinSesion: false });
    if (telegram) {
      const e = await enlaceTelegram(clinica);
      if (e.ok) setEnlace(e.valor.enlace);
    }
  }

  if (estado.hecho) return <Confirmada clinica={clinica} enlace={enlace} telegram={estado.hecho.telegram} />;
  return (
    <div className="space-y-6">
      {!reprograma ? <Servicios clinica={clinica} elegido={servicio} alElegir={eligeServicio} /> : <Aviso>Elige el nuevo día y hora para tu cita. La de ahora sigue apartada hasta que confirmes.</Aviso>}
      {servicio ? (
        <section aria-labelledby="paso-dia" className="space-y-3">
          <h2 id="paso-dia" className="text-lg font-semibold">2. ¿Qué día?</h2>
          {error ? <Aviso tono="error">{error}</Aviso> : null}
          {/* Si otra persona ganó el hueco, la hora se limpia y el resumen se va: el aviso tiene que verse aquí. */}
          {estado.error && !hora ? <Aviso tono="error">{estado.error}</Aviso> : null}
          {dias === null ? <p role="status">Buscando horarios…</p> : dias.length === 0 ? <Aviso>No hay horarios libres en las próximas semanas. Llama a la clínica: {c.telefono}.</Aviso> : (
            <>
              <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Próximos días con horario">
                {dias.slice(0, 7).map((d) => <button key={d.fecha} data-fecha={d.fecha} type="button" aria-pressed={dia === d.fecha} onClick={() => { setDia(d.fecha); setHora(null); }} className={`min-h-11 shrink-0 rounded-lg border px-3 py-2 text-sm ${dia === d.fecha ? 'border-transparent bg-[color:var(--c1)] text-white' : 'border-slate-300 bg-white'}`}>{fechaLarga(d.fecha)}</button>)}
              </div>
              {mesVisible ? <CalendarioMes anio={mesVisible.anio} mes={mesVisible.mes} dias={dias} elegido={dia} alElegir={(f) => { setDia(f); setHora(null); }} alCambiarMes={cambiaMes} puedeAtras={meses.indexOf(`${mesVisible.anio}-${String(mesVisible.mes).padStart(2, '0')}`) > 0} puedeAdelante={meses.indexOf(`${mesVisible.anio}-${String(mesVisible.mes).padStart(2, '0')}`) < meses.length - 1} /> : null}
            </>
          )}
        </section>
      ) : null}
      {delDia ? (
        <section aria-labelledby="paso-hora" className="space-y-3">
          <h2 id="paso-hora" className="text-lg font-semibold">3. ¿A qué hora? <span className="font-normal text-slate-600">({fechaLarga(delDia.fecha)})</span></h2>
          <div className="flex flex-wrap gap-2">
            {delDia.horas.map((h) => <button key={h.inicio} data-inicio={h.inicio} data-hora={h.hora} type="button" aria-pressed={hora?.inicio === h.inicio} onClick={() => setHora(h)} className={`min-h-11 rounded-lg border px-4 text-sm font-medium ${hora?.inicio === h.inicio ? 'border-transparent bg-[color:var(--c1)] text-white' : 'border-slate-300 bg-white hover:border-[color:var(--c1)]'}`}>{h.hora}</button>)}
          </div>
        </section>
      ) : null}
      {s && delDia && hora ? (
        <section aria-labelledby="paso-resumen" className="space-y-4 rounded-xl bg-white p-4 ring-1 ring-slate-200 sm:p-6">
          <h2 id="paso-resumen" className="text-lg font-semibold">4. Revisa y confirma</h2>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-600">Servicio</dt><dd className="font-medium">{s.nombre} · {pesos(s.precioMxn)}</dd></div>
            <div><dt className="text-slate-600">Cuándo</dt><dd className="font-medium">{fechaLarga(delDia.fecha)}, {hora.hora} ({s.duracionMin} min)</dd></div>
            <div><dt className="text-slate-600">Clínica</dt><dd className="font-medium">{c.nombre}</dd></div>
            <div><dt className="text-slate-600">Cómo llegar</dt><dd>{c.direccion}. {c.comoLlegar}</dd></div>
          </dl>
          {!reprograma ? <SelectorAvisos valor={avisos} alCambiar={setAvisos} /> : null}
          {estado.error && hora ? <Aviso tono="error">{estado.error}</Aviso> : null}
          {!conSesion || estado.sinSesion ? <Aviso>Para confirmar necesitas tu cuenta: <Link className="underline" href={`/clinica/${clinica}/entrar?siguiente=/clinica/${clinica}/agenda`}>entra</Link> o <Link className="underline" href={`/clinica/${clinica}/registro`}>regístrate</Link>.</Aviso>
            : !esPaciente ? <Aviso>Primero <Link className="underline" href={`/clinica/${clinica}/registro`}>completa tu registro</Link> en {c.nombre}.</Aviso>
            : <button type="button" className={clasesBoton} onClick={() => void confirma()} disabled={estado.enviando}>{estado.enviando ? 'Confirmando…' : reprograma ? 'Confirmar el cambio' : 'Confirmar cita'}</button>}
        </section>
      ) : null}
    </div>
  );
}

function Confirmada({ clinica, telegram, enlace }: { clinica: string; telegram: boolean; enlace: string | null }) {
  return (
    <div className="space-y-4 rounded-2xl bg-white p-6 ring-1 ring-slate-200" role="status">
      <h2 className="text-2xl font-bold">¡Cita confirmada!</h2>
      <p className="text-slate-700">Te mandamos los avisos que elegiste. Puedes verla, cambiarla o cancelarla en «Mis citas».</p>
      {telegram ? (
        <Aviso>
          <strong>Falta un paso para Telegram:</strong> un bot no puede escribirte primero. Abre el enlace y pulsa «Iniciar»; desde ese momento te llegan los avisos ahí. El enlace sirve una sola vez y caduca en 24 horas.
          {enlace ? <a className={`${clasesBotonSecundario} mt-2 flex`} href={enlace} target="_blank" rel="noopener noreferrer" data-enlace-telegram={enlace}>Abrir Telegram e iniciar el chat</a> : null}
        </Aviso>
      ) : null}
      <Link href={`/clinica/${clinica}/mis-citas`} className={clasesBoton}>Ver mis citas</Link>
    </div>
  );
}
