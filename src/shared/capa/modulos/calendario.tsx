'use client';

/**
 * `tools/calendario` enchufado en la capa: su motor de verdad (simulador de Google + espejo en memoria + pluma +
 * lector), entero en el navegador y con datos SINTÉTICOS, llena la ranura de plan y atiende las intenciones que
 * declara su `enchufe.json`: consultar el día, reservar y cancelar (esta última, irreversible: pasa por el freno de
 * la capa antes de llegar aquí). El calendario no sabe que existe la capa; esto es el adaptador.
 */
import { useSyncExternalStore } from 'react';
import { Lector, Pluma, sincroniza, fechaEnZona, sumaDias, instanteDesdeLocal, type Instancia, type RefCalendario } from '../../../../tools/calendario/dist/index.js';
import { SimuladorGoogle } from '../../../../tools/calendario/dist/simulador/index.js';
import { AlmacenEnMemoria } from '../../../../tools/calendario/dist/almacenes/memoria.js';
import type { Manejadores } from '../../../../tools/capa/dist/index.js';

export const ZONA = 'America/Mexico_City';
const REF: RefCalendario = { cuenta: 'agenda@producto-sintetico.mx', calendario: 'citas' };
const HORA = 3_600_000;

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** «hoy», «mañana», «pasado mañana», un día de la semana; «a las 10», «a las 4 de la tarde», «10:30». */
export function cuandoDe(texto: string, ahoraMs: number, zona = ZONA): { inicioMs: number; dia: string; hora: string | null } {
  const t = sinAcentos(texto);
  const hoy = fechaEnZona(ahoraMs, zona);
  let dias = /pasado manana/.test(t) ? 2 : /\bmanana\b/.test(t) ? 1 : 0;
  const semanal = DIAS.map(sinAcentos).findIndex((d) => new RegExp(`\\b${d}\\b`).test(t));
  if (semanal >= 0) dias = ((semanal - new Date(Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia)).getUTCDay() + 7) % 7) || 7;
  const m = t.match(/\b(?:a las|a la|las)\s+(\d{1,2})(?::(\d{2}))?\s*(de la (tarde|noche)|pm)?/) ?? t.match(/\b(\d{1,2}):(\d{2})\b/);
  let hora: number | null = m ? Number(m[1]) : null;
  const minuto = m?.[2] ? Number(m[2]) : 0;
  if (hora !== null && (m?.[3] || (hora >= 1 && hora <= 7))) hora = hora < 12 ? hora + 12 : hora;
  const f = sumaDias(hoy, dias);
  const inicioMs = instanteDesdeLocal({ ...f, hora: hora ?? 10, minuto, segundo: 0 }, zona) ?? ahoraMs;
  const dia = dias === 0 ? 'hoy' : dias === 1 ? 'mañana' : dias === 2 ? 'pasado mañana' : `el ${DIAS[(semanal + 7) % 7]}`;
  return { inicioMs, dia, hora: hora === null ? null : `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}` };
}

const horaDe = (ms: number) => new Intl.DateTimeFormat('es-MX', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false }).format(ms);
const mismoDia = (a: number, b: number) => JSON.stringify(fechaEnZona(a, ZONA)) === JSON.stringify(fechaEnZona(b, ZONA));

function creaAgenda() {
  const reloj = { ahora: () => Date.now(), espera: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) };
  const sim = new SimuladorGoogle({ reloj });
  const almacen = new AlmacenEnMemoria();
  const pluma = new Pluma({ proveedor: sim, almacen, reloj });
  const lector = new Lector({ almacen, reloj });
  sim.agregaCalendario({ cuenta: REF.cuenta, id: REF.calendario, nombre: 'Citas', color: '#0f766e', zona: ZONA, rol: 'propietario', principal: true, visible: true });
  const hoy = fechaEnZona(Date.now(), ZONA);
  const a = (dias: number, hora: number, titulo: string) => {
    const inicio = instanteDesdeLocal({ ...sumaDias(hoy, dias), hora, minuto: 0, segundo: 0 }, ZONA) ?? Date.now();
    sim.siembra(REF, { titulo, inicio: new Date(inicio).toISOString(), fin: new Date(inicio + HORA).toISOString(), zona: ZONA });
  };
  a(0, 10, 'Revisión de inventario'); a(0, 16, 'Llamada con proveedor'); a(1, 9, 'Cita de seguimiento'); a(1, 12, 'Entrega de pedido');
  /** La foto que pinta la ranura: las instancias y el momento en que se leyeron (estable entre lecturas). */
  let foto: { instancias: Instancia[]; ahora: number } = { instancias: [], ahora: 0 };
  const oyentes = new Set<() => void>();
  const refresca = async () => {
    const desde = instanteDesdeLocal({ ...hoy, hora: 0, minuto: 0, segundo: 0 }, ZONA) ?? Date.now();
    const hasta = desde + 3 * 24 * HORA;
    foto = { instancias: (await lector.consulta({ calendarios: [REF], desde, hasta, zona: ZONA })).instancias, ahora: Date.now() };
    oyentes.forEach((f) => f());
  };
  const listo = sincroniza({ proveedor: sim, almacen, reloj }, REF).then(refresca);
  return {
    listo, pluma, refresca,
    instancias: () => foto.instancias,
    foto: () => foto,
    suscribe: (f: () => void) => { oyentes.add(f); return () => { oyentes.delete(f); }; },
  };
}

let agenda: ReturnType<typeof creaAgenda> | null = null;
/** Una agenda por pestaña: la ranura de plan y los manejadores ven la misma. */
export const agendaDeLaCapa = () => (agenda ??= creaAgenda());

const lista = (xs: Instancia[]) => xs.map((i) => `${horaDe(i.inicioMs)} ${i.titulo}`).join('; ');

export const manejadoresDeCalendario: Manejadores = {
  'calendario.consulta-hoy': async () => {
    const ag = agendaDeLaCapa();
    await ag.listo;
    const hoy = ag.instancias().filter((i) => mismoDia(i.inicioMs, Date.now()));
    return { texto: hoy.length ? `Hoy tienes ${hoy.length}: ${lista(hoy)}.` : 'Hoy no tienes nada en la agenda.' };
  },
  'calendario.reserva': async ({ texto }) => {
    const ag = agendaDeLaCapa();
    await ag.listo;
    const c = cuandoDe(texto, Date.now());
    const choca = ag.instancias().find((i) => i.inicioMs < c.inicioMs + HORA && i.finMs > c.inicioMs);
    if (choca) return { texto: `${c.dia} a las ${horaDe(c.inicioMs)} ya está «${choca.titulo}». Dime otra hora y la aparto.` };
    await ag.pluma.crea(REF, { titulo: 'Cita', inicio: new Date(c.inicioMs).toISOString(), fin: new Date(c.inicioMs + HORA).toISOString(), zona: ZONA }, { clave: `capa-reserva-${c.inicioMs}` });
    await ag.refresca();
    return { texto: `Listo: apartada una cita ${c.dia} a las ${horaDe(c.inicioMs)}.` };
  },
  'calendario.cancela': async ({ texto }) => {
    const ag = agendaDeLaCapa();
    await ag.listo;
    const c = cuandoDe(texto, Date.now());
    const delDia = ag.instancias().filter((i) => mismoDia(i.inicioMs, c.inicioMs));
    const cual = (c.hora ? delDia.find((i) => horaDe(i.inicioMs) === horaDe(c.inicioMs)) : null) ?? delDia[0];
    if (!cual) return { texto: `No encuentro nada ${c.dia} para cancelar.` };
    await ag.pluma.borra({ ...REF, id: cual.id, etag: cual.etag }, { clave: `capa-cancela-${cual.id}` });
    await ag.refresca();
    return { texto: `Cancelada «${cual.titulo}» de ${c.dia} a las ${horaDe(cual.inicioMs)}. Es un calendario simulado: no se avisó a nadie de verdad.` };
  },
};

const VACIA = { instancias: [] as Instancia[], ahora: 0 };

/** La ranura de plan, llenada por el calendario: hoy y mañana, de su espejo. */
export function PlanDelCalendario() {
  const ag = agendaDeLaCapa();
  const { instancias, ahora } = useSyncExternalStore(ag.suscribe, ag.foto, () => VACIA);
  const grupos = [['Hoy', instancias.filter((i) => mismoDia(i.inicioMs, ahora))], ['Mañana', instancias.filter((i) => mismoDia(i.inicioMs, ahora + 24 * HORA))]] as const;
  return (
    <div data-capa-calendario="tools/calendario">
      {grupos.map(([nombre, xs]) => (
        <div key={nombre}>
          <div className="capa-aviso">{nombre}</div>
          {xs.length ? xs.map((i) => <div key={i.id} className="capa-dato" data-capa-cita={i.titulo}><span>{i.titulo}</span><b>{horaDe(i.inicioMs)}</b></div>) : <div className="capa-aviso">Nada.</div>}
        </div>
      ))}
    </div>
  );
}
