/**
 * El motor del laboratorio, entero en el navegador: el simulador de Google (con su contrato: etags,
 * 410, invalid_grant…), el espejo en memoria, la pluma, el lector y las reservas de la herramienta.
 * No hay red, ni Supabase, ni service_role: lo que se ve es la herramienta empaquetada, no una maqueta.
 */
import {
  Lector, Pluma, Reservas, esErrorCalendario, proyecta, rangoDeVista, sincroniza,
  type BloqueDeActividad, type Instancia, type Reloj, type Salud, type Vista,
} from '../../../../tools/calendario/dist/index.js';
import { SimuladorGoogle } from '../../../../tools/calendario/dist/simulador/index.js';
import { AlmacenEnMemoria } from '../../../../tools/calendario/dist/almacenes/memoria.js';
import { CALENDARIOS, EVENTOS, INICIO_DEL_RELOJ, REGLAS, TRABAJOS, ZONA } from './semilla.ts';

export interface Lectura {
  instancias: Instancia[];
  salud: Salud;
  actividad: BloqueDeActividad[];
  ahoraMs: number;
}

export interface ConsultaLab {
  vista: Vista;
  fecha: string;
  visibles: string[];
  conActividad: boolean;
  gruposOcultos: string[];
}

function relojDelLaboratorio(): Reloj {
  const base = Date.parse(INICIO_DEL_RELOJ);
  const t0 = Date.now();
  return { ahora: () => base + (Date.now() - t0), espera: (ms) => new Promise((r) => setTimeout(r, ms)) };
}

export function creaMotor() {
  const reloj = relojDelLaboratorio();
  const sim = new SimuladorGoogle({ reloj, tamanoPagina: 4 });
  const almacen = new AlmacenEnMemoria();
  const pluma = new Pluma({ proveedor: sim, almacen, reloj });
  const lector = new Lector({ almacen, reloj });
  const trabajo = { cuenta: CALENDARIOS[0]!.cuenta, calendario: CALENDARIOS[0]!.id };
  const reservas = new Reservas({ almacen, pluma, lector, reloj, recurso: trabajo, ocupan: CALENDARIOS.map((c) => ({ cuenta: c.cuenta, calendario: c.id })), reglas: REGLAS, ttlMin: 10 });
  for (const c of CALENDARIOS) sim.agregaCalendario(c);
  for (const s of EVENTOS) sim.siembra(s.ref, s.evento);

  const refs = () => CALENDARIOS.map((c) => ({ cuenta: c.cuenta, calendario: c.id }));

  return {
    reloj, sim, almacen, pluma, lector, reservas,
    calendarios: CALENDARIOS,
    zona: ZONA,
    /** Sincroniza los dos calendarios; devuelve el primer error (si lo hubo) para el registro. */
    async sincronizaTodo(): Promise<string | null> {
      const rs = await Promise.all(refs().map((r) => sincroniza({ proveedor: sim, almacen, reloj }, r)));
      const e = rs.find((r) => r.error)?.error;
      return e ? `${e.codigo}: ${e.mensaje}` : null;
    },
    async lee(c: ConsultaLab): Promise<Lectura> {
      const rango = rangoDeVista(c.vista, c.fecha, ZONA);
      const visibles = refs().filter((r) => c.visibles.includes(r.calendario));
      const l = await lector.consulta({ calendarios: visibles, desde: rango.desde, hasta: rango.hasta, zona: ZONA }, pluma.reparacionesPendientes);
      const salud = await lector.salud(refs(), pluma.reparacionesPendientes);
      const trabajos = TRABAJOS.filter((t) => !c.gruposOcultos.includes(t.grupo ?? ''));
      const actividad = c.conActividad ? proyecta(trabajos, { desde: rango.desde, hasta: rango.hasta, ahora: reloj.ahora() }).bloques : [];
      return { instancias: l.instancias, salud, actividad, ahoraMs: reloj.ahora() };
    },
  };
}

export type Motor = ReturnType<typeof creaMotor>;

/** El mensaje que ve una persona: el del error, y quien lo destraba si depende de alguien. */
export function mensajeDe(e: unknown): string {
  if (esErrorCalendario(e)) return e.destraba ? `${e.message} Lo destraba: ${e.destraba}.` : e.message;
  return e instanceof Error ? e.message : String(e);
}
