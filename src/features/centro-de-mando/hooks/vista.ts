/**
 * De los eventos del bucle a lo que se pinta, como función pura: un turno entra al registro solo
 * cuando se CONFIRMA (una especulación descartada nunca aparece) y la respuesta se va
 * reescribiendo mientras llega.
 */
import type { EventoBucle } from '../../../../tools/bucle-voz/dist/index.js';
import type { Entrada, VistaCentro } from '../types/index.ts';

export const VISTA_INICIAL: VistaCentro = {
  estado: 'reposo',
  modo: 'manos-libres',
  encendido: false,
  velocidad: 1,
  entradas: [],
  frases: [],
  turnoFrases: undefined,
  oyendo: '',
  turnos: [],
  avisos: [],
  error: undefined,
  detector: undefined,
};

const MAX_ENTRADAS = 60;

/** Lo pendiente por turno (oído, ruta) hasta que se confirma. */
const pendientes = new Map<number, { texto?: string; ruta?: 'orden' | 'llm'; orden?: string; confirmado?: boolean; especulativo?: boolean }>();

function agrega(v: VistaCentro, e: Entrada): VistaCentro {
  return { ...v, entradas: [...v.entradas.filter((x) => x.id !== e.id), e].slice(-MAX_ENTRADAS) };
}

function publicaPersona(v: VistaCentro, turno: number): VistaCentro {
  const p = pendientes.get(turno);
  if (!p?.confirmado || p.texto === undefined) return v;
  return agrega(v, { id: `p${turno}`, turno, quien: 'persona', texto: p.texto, ruta: p.ruta, orden: p.orden, especulativo: p.especulativo });
}

export function aplicaEvento(v: VistaCentro, e: EventoBucle): VistaCentro {
  switch (e.tipo) {
    case 'estado':
      return { ...v, estado: e.estado, oyendo: e.estado === 'escuchando' ? v.oyendo : '' };
    case 'oido':
      pendientes.set(e.turno, { ...pendientes.get(e.turno), texto: e.texto, especulativo: e.especulativo });
      return publicaPersona({ ...v, oyendo: e.texto }, e.turno);
    case 'decision': {
      const d = e.decision;
      if (d.tipo === 'nada') return v;
      pendientes.set(e.turno, { ...pendientes.get(e.turno), texto: d.texto || pendientes.get(e.turno)?.texto, ruta: d.tipo === 'orden' ? 'orden' : 'llm', ...(d.tipo === 'orden' ? { orden: d.orden } : {}) });
      return publicaPersona(v, e.turno);
    }
    case 'confirmado':
      pendientes.set(e.turno, { ...pendientes.get(e.turno), confirmado: true });
      return publicaPersona(v, e.turno);
    case 'descartado':
      // Un tramo descartado (sin palabra de activación, eco, especulación que siguió) no se atendió: fuera del registro.
      pendientes.delete(e.turno);
      return { ...v, entradas: v.entradas.filter((x) => x.id !== `p${e.turno}`) };
    case 'respuesta':
      return agrega(v, { id: `m${e.turno}`, turno: e.turno, quien: 'maquina', texto: e.texto, ruta: pendientes.get(e.turno)?.ruta });
    case 'frase': {
      const frases = v.turnoFrases === e.turno ? v.frases : [];
      return { ...v, turnoFrases: e.turno, frases: [...frases, { indice: e.indice, texto: e.texto, fraccion: 0 }] };
    }
    case 'karaoke':
      if (v.turnoFrases !== e.turno) return v;
      return { ...v, frases: v.frases.map((f) => (f.indice < e.indice ? { ...f, fraccion: 1 } : f.indice === e.indice ? { ...f, fraccion: e.fraccion } : f)) };
    case 'interrumpido': {
      const previa = v.entradas.find((x) => x.id === `m${e.turno}`);
      const conMarca = agrega(v, { id: `m${e.turno}`, turno: e.turno, quien: 'maquina', texto: e.dicho || previa?.texto || '', ruta: previa?.ruta, interrumpida: true });
      return { ...conMarca, frases: v.frases.map((f) => ({ ...f, fraccion: Math.min(f.fraccion, 0.999) })) };
    }
    case 'activado':
      return agrega(v, { id: `a${e.turno}`, turno: e.turno, quien: 'sistema', texto: 'Palabra de activación oída' });
    case 'aviso':
      return agrega({ ...v, avisos: [...v.avisos, e.mensaje].slice(-5) }, { id: `x${Date.now()}${Math.random()}`, turno: e.turno ?? 0, quien: 'sistema', texto: e.mensaje });
    case 'fin':
      pendientes.delete(e.turno);
      return v;
    default:
      return v;
  }
}
