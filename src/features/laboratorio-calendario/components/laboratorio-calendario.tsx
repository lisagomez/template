'use client';

/**
 * El laboratorio de la herramienta de calendario: la herramienta EMPAQUETADA (`tools/calendario/dist`)
 * corriendo contra su simulador de Google, en este navegador. Todo lo que se toca pasa por la pluma
 * (una escritura → Google y espejo, o error tipado) y todo lo que se ve sale del espejo.
 */
import { useEffect, useRef, useState } from 'react';
import { Agenda, EditorDeEvento, type GuardadoDelEditor } from '../../../../tools/calendario/dist/react/index.js';
import { claveNueva, type Alcance, type Instancia, type Vista } from '../../../../tools/calendario/dist/index.js';
import { creaMotor, mensajeDe, type Lectura } from '../services/motor.ts';
import { SEMANA, TRABAJOS } from '../services/semilla.ts';
import { PanelConsumidor } from './panel-consumidor.tsx';

interface Movimiento { instancia: Instancia; inicio: string; fin: string }
const GRUPOS = [...new Set(TRABAJOS.map((t) => t.grupo ?? ''))];
const boton = 'rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800';
const panel = 'rounded-xl border border-neutral-200 p-4 dark:border-neutral-800';

function DialogoAlcance({ m, alElegir, alCerrar }: { m: Movimiento; alElegir: (a: Alcance) => void; alCerrar: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" data-prueba="dialogo-alcance">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-neutral-900">
        <h3 className="font-semibold">Mover «{m.instancia.titulo}», que se repite</h3>
        <p className="mt-1 text-sm text-neutral-500">¿A cuáles aplica el cambio?</p>
        <div className="mt-4 grid gap-2">
          <button type="button" className={boton} onClick={() => alElegir('este')}>Solo este</button>
          <button type="button" className={boton} onClick={() => alElegir('siguientes')}>Este y los siguientes</button>
          <button type="button" className={boton} onClick={() => alElegir('todos')}>Todos los de la serie</button>
          <button type="button" className="mt-1 text-sm text-neutral-500 hover:underline" onClick={alCerrar}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

export function LaboratorioCalendario() {
  const [motor] = useState(creaMotor);
  const [listo, setListo] = useState(false);
  const [version, setVersion] = useState(0);
  const [vista, setVista] = useState<Vista>('semana');
  const [fecha, setFecha] = useState(SEMANA);
  const [visibles, setVisibles] = useState(() => motor.calendarios.map((c) => c.id));
  const [conActividad, setConActividad] = useState(false);
  const [soloActividad, setSoloActividad] = useState(false);
  const [gruposOcultos, setGruposOcultos] = useState<string[]>([]);
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [seleccion, setSeleccion] = useState<Instancia | null>(null);
  const [borrador, setBorrador] = useState<{ inicio: string; fin: string } | null>(null);
  const [movimiento, setMovimiento] = useState<Movimiento | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [registro, setRegistro] = useState<string[]>([]);
  const [credencialCaducada, setCredencialCaducada] = useState(false);

  const anota = (nota: string) => {
    const cuando = new Date(motor.reloj.ahora()).toLocaleTimeString('es-MX', { timeZone: motor.zona, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    setRegistro((r) => [`${cuando} · ${nota}`, ...r].slice(0, 12));
    setVersion((v) => v + 1);
  };

  const iniciado = useRef(false);
  useEffect(() => {
    // En desarrollo React monta dos veces: el espejo se llena una sola.
    if (iniciado.current) return;
    iniciado.current = true;
    motor.sincronizaTodo().then((e) => {
      setListo(true);
      anota(e ? `sincroniza · ${e}` : 'sincroniza · espejo lleno desde el simulador de Google');
    });
    // Una sola vez: el motor vive lo que vive la pagina.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!listo) return;
    let vigente = true;
    motor.lee({ vista, fecha, visibles, conActividad, gruposOcultos }).then((l) => { if (vigente) setLectura(l); });
    return () => { vigente = false; };
  }, [motor, listo, version, vista, fecha, visibles, conActividad, gruposOcultos]);

  const corre = async (nota: string, f: () => Promise<{ espejo?: string } | unknown>) => {
    setOcupado(true);
    setError(null);
    try {
      const r = await f();
      const espejo = r && typeof r === 'object' && 'espejo' in r ? ` · espejo ${(r as { espejo: string }).espejo}` : '';
      anota(`${nota}${espejo}`);
      return true;
    } catch (e) {
      setError(mensajeDe(e));
      anota(`${nota} · ERROR ${mensajeDe(e)}`);
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const guarda = async (g: GuardadoDelEditor) => {
    const op = { clave: claveNueva('lab'), notificar: g.notificar, confirmaNotificar: g.confirmaNotificar };
    const ok = seleccion
      ? await corre(`actualiza «${g.entrada.titulo}» (${seleccion.recurrente ? g.alcance : 'suelto'})`, () => motor.pluma.actualiza(seleccion, g.entrada, { ...op, alcance: g.alcance }))
      : await corre(`crea «${g.entrada.titulo}»`, () => motor.pluma.crea(g.calendario, g.entrada, op));
    if (ok) { setSeleccion(null); setBorrador(null); }
  };
  const borra = async (alcance: Alcance) => {
    if (!seleccion) return;
    if (await corre(`borra «${seleccion.titulo}» (${seleccion.recurrente ? alcance : 'suelto'})`, () => motor.pluma.borra(seleccion, { clave: claveNueva('lab'), alcance }))) setSeleccion(null);
  };
  const mueve = async (i: Instancia, inicio: string, fin: string, alcance: Alcance = 'este') => {
    await corre(`mueve «${i.titulo}»${i.recurrente ? ` (${alcance})` : ''}`, () => motor.pluma.actualiza(i, { inicio, fin }, { clave: claveNueva('lab'), alcance }));
  };
  const credencial = async (caducar: boolean) => {
    motor.sim.caducaCredencial(caducar);
    setCredencialCaducada(caducar);
    const e = await motor.sincronizaTodo();
    anota(caducar ? `credencial caducada (invalid_grant) · sync: ${e ?? 'ok'}` : `reautenticada · sync ${e ?? 'ok: espejo al día'}`);
  };

  const sincroniza = () => corre('sincroniza', async () => { const e = await motor.sincronizaTodo(); if (e) throw new Error(e); });
  const extra = (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="cal-boton" onClick={sincroniza} data-prueba="sincronizar">Sincronizar</button>
      <button type="button" className="cal-boton" aria-pressed={conActividad} onClick={() => { setConActividad(!conActividad); setSoloActividad(false); }} data-prueba="boton-actividad">Actividad programada</button>
      {conActividad && <button type="button" className="cal-boton" aria-pressed={soloActividad} onClick={() => setSoloActividad(!soloActividad)} data-prueba="boton-solo-actividad">Solo actividad</button>}
    </div>
  );

  return (
    <main className="mx-auto max-w-[1440px] space-y-4 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Laboratorio del calendario</h1>
        <p className="max-w-3xl text-sm text-neutral-600 dark:text-neutral-400">
          <code>tools/calendario</code> contra su simulador de Google. Se lee siempre del espejo; toda escritura pasa por una sola pluma que deja Google y el espejo de acuerdo, o falla con un error tipado. Datos sintéticos.
        </p>
        <div className="flex flex-wrap gap-2 pt-1 text-xs">
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">proveedor: simulador de Google (medido)</span>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-950 dark:text-amber-200">adaptador gog: no medido</span>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800" data-prueba="reloj">reloj del laboratorio: {lectura ? new Date(lectura.ahoraMs).toLocaleString('es-MX', { timeZone: motor.zona, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '…'}</span>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800" data-prueba="invitaciones">invitaciones enviadas: {lectura ? motor.sim.notificaciones.length : 0}</span>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        {lectura ? (
          <Agenda vista={vista} fecha={fecha} zona={motor.zona} instancias={lectura.instancias} calendarios={motor.calendarios}
            actividad={lectura.actividad} soloActividad={soloActividad} salud={lectura.salud} hoy={SEMANA} ahoraMs={lectura.ahoraMs}
            extra={extra} alto={720} alCambiarVista={setVista} alCambiarFecha={setFecha}
            alSeleccionar={(i) => { setError(null); setSeleccion(i); }}
            alCrear={(inicio, fin) => { setError(null); setBorrador({ inicio, fin }); }}
            alMover={(i, inicio, fin) => (i.recurrente ? setMovimiento({ instancia: i, inicio, fin }) : void mueve(i, inicio, fin))} />
        ) : <div className={`${panel} h-[720px] animate-pulse`} data-prueba="cargando">Llenando el espejo…</div>}

        <aside className="space-y-4">
          <section className={panel}>
            <h2 className="text-sm font-semibold">Calendarios</h2>
            {motor.calendarios.map((c) => (
              <label key={c.id} className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={visibles.includes(c.id)} onChange={(e) => setVisibles(e.target.checked ? [...visibles, c.id] : visibles.filter((v) => v !== c.id))} />
                <span className="h-3 w-3 rounded-full" style={{ background: c.color ?? undefined }} />{c.nombre}
              </label>
            ))}
          </section>

          <section className={panel} data-prueba="panel-credencial">
            <h2 className="text-sm font-semibold">Credencial de Google</h2>
            <p className="mt-1 text-xs text-neutral-500">Simula el <code>invalid_grant</code> (el token de prueba de Google caduca cada 7 días): se sigue leyendo del espejo y la escritura se bloquea diciendo quién la destraba.</p>
            <div className="mt-2 flex gap-2">
              <button type="button" className={boton} disabled={credencialCaducada} onClick={() => credencial(true)} data-prueba="caducar-credencial">Caducar credencial</button>
              <button type="button" className={boton} disabled={!credencialCaducada} onClick={() => credencial(false)} data-prueba="reautenticar">Reautenticar</button>
            </div>
            {lectura?.salud.destraba && <p className="mt-2 text-xs text-red-700 dark:text-red-300" data-prueba="destraba">Lo destraba: {lectura.salud.destraba}</p>}
          </section>

          <PanelConsumidor motor={motor} alCambiar={anota} />

          {conActividad && (
            <section className={panel} data-prueba="panel-actividad">
              <h2 className="text-sm font-semibold">Actividad programada</h2>
              <p className="mt-1 text-xs text-neutral-500">Las próximas corridas de un scheduler (simulado). Los trabajos pausados no se pintan.</p>
              {GRUPOS.map((g) => (
                <label key={g} className="mt-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!gruposOcultos.includes(g)} onChange={(e) => setGruposOcultos(e.target.checked ? gruposOcultos.filter((x) => x !== g) : [...gruposOcultos, g])} />
                  {g} <span className="text-xs text-neutral-500">· {TRABAJOS.filter((t) => t.grupo === g).map((t) => `${t.nombre}${t.pausado ? ' (pausado)' : ''}`).join(', ')}</span>
                </label>
              ))}
            </section>
          )}

          <section className={panel} data-prueba="registro">
            <h2 className="text-sm font-semibold">Registro</h2>
            <ol className="mt-2 space-y-1 font-mono text-[11px] leading-snug text-neutral-600 dark:text-neutral-400">
              {registro.map((r, i) => <li key={`${i}-${r}`}>{r}</li>)}
            </ol>
          </section>
        </aside>
      </div>

      {(seleccion || borrador) && (
        <EditorDeEvento key={seleccion?.id ?? borrador?.inicio} instancia={seleccion} borrador={borrador} calendarios={motor.calendarios} zona={motor.zona}
          error={error} ocupado={ocupado} alGuardar={guarda} alBorrar={borra} alCerrar={() => { setSeleccion(null); setBorrador(null); setError(null); }} />
      )}
      {movimiento && (
        <DialogoAlcance m={movimiento} alCerrar={() => setMovimiento(null)}
          alElegir={(a) => { const m = movimiento; setMovimiento(null); void mueve(m.instancia, m.inicio, m.fin, a); }} />
      )}
    </main>
  );
}
