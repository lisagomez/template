/**
 * Lo que hace cada intención de Recepción cuando la capa la reconoce: las del calendario (consultar, apartar y
 * cancelar, que llega aquí solo después del freno) sobre la agenda del mostrador, y las del propio negocio
 * (servicios, horario y horas libres) sobre sus datos sintéticos. Sin LLM: lo que no entiende lo pregunta, y lo que
 * no señala una sola cita no la cancela.
 */
import type { Manejador, Manejadores } from '../../../../tools/capa/dist/index.js';
import { fechaEnZona, instanteDesdeLocal, sumaDias, type Instancia } from '../../../../tools/calendario/dist/index.js';
import { CITA, HORARIO, SERVICIOS, ZONA } from '../datos.ts';
import { citasDelDia, fechaDe, horaDe, inicioDelDia, type Agenda } from './agenda.ts';
import { cuandoDe, normaliza, type Cuando } from './cuando.ts';
import { NOMBRES_DIA, cierra, diaSemana, horarioDeLaSemana, lista, mayuscula, queDia } from './textos.ts';

/** Lo que comparten los manejadores: la agenda (se pide en cada llamada: la de la pestaña existe solo en el
 *  navegador) y el reloj. */
interface Contexto { agenda: () => Agenda; ahora: () => number; cuando: (texto: string) => Cuando }

const enLista = (xs: readonly Instancia[]) => xs.map((i) => `${horaDe(i.inicioMs)} ${i.titulo}`).join('; ');
const elDia = (x: Contexto, dias: number) => queDia(dias, inicioDelDia(x.ahora(), dias));

function consulta(x: Contexto): Manejador {
  return async ({ texto }) => {
    const ag = x.agenda();
    await ag.listo;
    const { dias } = x.cuando(texto);
    const xs = citasDelDia(ag.foto(), dias);
    const d = mayuscula(elDia(x, dias));
    return { texto: xs.length ? cierra(`${d} tienes ${xs.length === 1 ? 'una cita' : `${xs.length} citas`}: ${enLista(xs)}`) : `${d} no tienes citas.` };
  };
}

function reserva(x: Contexto): Manejador {
  return async ({ texto }) => {
    const ag = x.agenda();
    await ag.listo;
    const c = x.cuando(texto);
    if (!c.hora) return { texto: '¿A qué hora la aparto? Dímelo con la hora, por ejemplo: «aparta una cita mañana a las 11». No aparté nada.' };
    const [h, m] = c.hora.split(':').map(Number) as [number, number];
    const inicio = instanteDesdeLocal({ ...sumaDias(fechaEnZona(x.ahora(), ZONA), c.dias), hora: h, minuto: m, segundo: 0 }, ZONA);
    const d = elDia(x, c.dias);
    if (inicio === null) return { texto: `Esa hora no existe ${d}. No aparté nada.` };
    const r = await ag.reserva(inicio, 'Cita (mostrador)');
    if (r.ok) return { texto: `Listo: apartada una cita ${d} (${fechaDe(r.inicioMs)}) de ${horaDe(r.inicioMs)} a ${horaDe(r.finMs)}.` };
    if (r.motivo === 'ocupado') return { texto: `${mayuscula(d)} a las ${c.hora} ya está ocupado. Pregúntame «¿qué horas quedan libres ${d}?» y te digo cuáles.` };
    return { texto: `${mayuscula(d)} a las ${c.hora} no puedo apartarla: abrimos ${horarioDeLaSemana()}, las citas empiezan cada ${CITA.cadaMinutos} minutos y se apartan con ${CITA.avisoMinimoMinutos} minutos de aviso. No aparté nada.` };
  };
}

/** Llega aquí solo después del freno de la capa: la cita textual de quien lo pidió y su clic. */
function cancela(x: Contexto): Manejador {
  return async ({ texto }) => {
    const ag = x.agenda();
    await ag.listo;
    const c = x.cuando(texto);
    const r = await ag.cancela(c.dias, c.hora);
    const d = elDia(x, c.dias);
    if (r.ok) {
      const quien = r.cita.invitados.map((i) => i.nombre ?? i.correo);
      const aviso = r.avisados.length ? ` Le avisé a ${lista(quien)}; es el simulador de tools/calendario: no salió ningún correo de verdad.` : '';
      return { texto: `Cancelada «${r.cita.titulo}» de ${d} a las ${horaDe(r.cita.inicioMs)}.${aviso}` };
    }
    if (r.motivo === 'ninguna') return { texto: `${mayuscula(d)} no hay citas. No cancelé nada.` };
    if (r.motivo === 'otra-hora') return { texto: `${mayuscula(d)} a las ${c.hora} no hay cita; las de ese día son: ${cierra(enLista(r.citas))} No cancelé nada.` };
    return { texto: `${mayuscula(d)} hay ${r.citas.length} citas: ${cierra(enLista(r.citas))} Dime la hora de la que cancelo; no cancelé ninguna.` };
  };
}

function servicios(): Manejador {
  return async ({ texto }) => {
    const t = normaliza(texto);
    const id = t.includes('barba') && t.includes('corte') ? 'corte-y-barba' : t.includes('barba') ? 'barba' : t.includes('corte') ? 'corte' : /lavad|peinad/.test(t) ? 'lavado' : null;
    const s = SERVICIOS.find((x) => x.id === id);
    const nota = 'Son precios de ejemplo de un negocio ficticio.';
    if (s) return { texto: `${s.nombre}: $${s.precio}, unos ${s.minutos} minutos. ${nota}` };
    return { texto: `Tenemos ${lista(SERVICIOS.map((x) => `${x.nombre.toLowerCase()} (${x.minutos} min, $${x.precio})`))}. ${nota}` };
  };
}

function horario(x: Contexto): Manejador {
  return async ({ texto }) => {
    const c = x.cuando(texto);
    if (!c.diaDicho) return { texto: `Abrimos ${horarioDeLaSemana()}.` };
    const inicio = inicioDelDia(x.ahora(), c.dias);
    const dia = diaSemana(inicio);
    const f = HORARIO.find((h) => h.dia === dia);
    // «hoy» y «mañana» dicen su día; un día de la semana se contesta por el día («los domingos»).
    const d = c.dias <= 2 ? `${mayuscula(queDia(c.dias, inicio))} (${NOMBRES_DIA[dia]})` : `Los ${NOMBRES_DIA[dia]}${dia === 0 || dia === 6 ? 's' : ''}`;
    return { texto: f ? `${d} abrimos de ${f.desde} a ${f.hasta}.` : `${d} está cerrado.` };
  };
}

function huecos(x: Contexto): Manejador {
  return async ({ texto }) => {
    const ag = x.agenda();
    await ag.listo;
    const { dias } = x.cuando(texto);
    const d = mayuscula(elDia(x, dias));
    const r = await ag.huecos(dias);
    if (!r.ok || !r.inicios.length) return { texto: `${d} ya no queda lugar para una cita.` };
    return { texto: `${d} quedan ${r.inicios.length} horarios para una cita de ${CITA.minutos} minutos; los primeros: ${lista(r.inicios.slice(0, 4).map(horaDe))}. ¿Te aparto uno?` };
  };
}

export function manejadoresDeRecepcion(agenda: () => Agenda, ahora: () => number = Date.now): Manejadores {
  const x: Contexto = { agenda, ahora, cuando: (texto) => cuandoDe(texto, diaSemana(ahora())) };
  return {
    'calendario.consulta-hoy': consulta(x),
    'calendario.reserva': reserva(x),
    'calendario.cancela': cancela(x),
    'recepcion.servicios': servicios(),
    'recepcion.horario': horario(x),
    'recepcion.huecos': huecos(x),
  };
}
