'use client';

/**
 * La ranura del plan, llenada por `tools/calendario`: las fechas de los ítems que vencen pronto y el calendario de
 * cierre, calendarizadas con SU pluma (idempotente por clave `item:<id>:fecha:v<n>`: volver a pintar no duplica un
 * evento) sobre el simulador del calendario, en el navegador y sin avisar a nadie. El calendario no sabe que existe
 * Ágora: esto es el adaptador.
 */
import { useEffect, useMemo, useState } from 'react';
import { Lector, Pluma, sincroniza, instanteDesdeLocal, type Instancia, type RefCalendario } from '../../../../tools/calendario/dist/index.js';
import { SimuladorGoogle } from '../../../../tools/calendario/dist/simulador/index.js';
import { AlmacenEnMemoria } from '../../../../tools/calendario/dist/almacenes/memoria.js';
import { useAgora } from './contexto';
import { fecha, periodoLargo } from '../services/formato';

const ZONA = 'America/Mexico_City';
const REF: RefCalendario = { cuenta: 'plan@agora-laboratorio.example', calendario: 'fechas' };

function creaAgenda() {
  const reloj = { ahora: () => Date.now(), espera: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) };
  const sim = new SimuladorGoogle({ reloj });
  const almacen = new AlmacenEnMemoria();
  const pluma = new Pluma({ proveedor: sim, almacen, reloj });
  const lector = new Lector({ almacen, reloj });
  sim.agregaCalendario({ cuenta: REF.cuenta, id: REF.calendario, nombre: 'Fechas de Ágora', color: '#2a5db0', zona: ZONA, rol: 'propietario', principal: true, visible: true });
  const listo = sincroniza({ proveedor: sim, almacen, reloj }, REF);
  return { pluma, lector, listo };
}
let agenda: ReturnType<typeof creaAgenda> | null = null;
const laAgenda = () => (agenda ??= creaAgenda());

export function PlanDeAgora() {
  const datos = useAgora();
  const [eventos, setEventos] = useState<Instancia[]>([]);
  const fechas = useMemo(() => (datos.apagada ? [] : datos.fechas), [datos]);
  useEffect(() => {
    let vivo = true;
    const ag = laAgenda();
    void (async () => {
      await ag.listo;
      for (const f of fechas) {
        const inicio = instanteDesdeLocal({ anio: Number(f.fin.slice(0, 4)), mes: Number(f.fin.slice(5, 7)), dia: Number(f.fin.slice(8, 10)), hora: 9, minuto: 0, segundo: 0 }, ZONA) ?? Date.now();
        // La clave lleva la versión de la fecha: si la fecha cambia es otro evento; si no, reintentar no duplica.
        await ag.pluma.crea(REF, { titulo: `Vence: ${f.nombre}`, inicio: new Date(inicio).toISOString(), fin: new Date(inicio + 3600_000).toISOString(), zona: ZONA },
          { clave: `item:${f.id}:fecha:v${f.version}` }).catch(() => undefined);
      }
      const desde = Date.now() - 7 * 864e5;
      const r = await ag.lector.consulta({ calendarios: [REF], desde, hasta: desde + 60 * 864e5, zona: ZONA });
      if (vivo) setEventos(r.instancias);
    })();
    return () => { vivo = false };
  }, [fechas]);
  if (datos.apagada) return null;
  const proximos = eventos.slice(0, 4);
  return (
    <div data-capa-calendario="tools/calendario" data-agora-plan data-eventos={eventos.length}>
      {proximos.length ? proximos.map((ev) => (
        <div key={ev.id} className="capa-dato" data-capa-cita={ev.titulo}><span className="truncate">{ev.titulo.replace(/^Vence: /, '')}</span><b>{fecha(new Date(ev.inicioMs - 6 * 3600_000).toISOString().slice(0, 10))}</b></div>
      )) : <div className="capa-aviso">Sin fechas en las próximas semanas.</div>}
      {datos.cierres.length ? <div className="capa-aviso">Cierre de costos pendiente: {datos.cierres.filter((p) => p < datos.periodo).map(periodoLargo).join(', ') || 'ninguno vencido'}</div> : null}
    </div>
  );
}
