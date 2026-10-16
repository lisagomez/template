/**
 * La base de conocimiento de UNA clinica, en texto, para el prompt del chatbot y para las respuestas locales
 * (horario, ubicacion) que el enrutador contesta sin LLM. Sale solo de la declaracion de la clinica: lo que
 * no esta aqui, el asistente no lo sabe.
 */
import { NOMBRE_CATEGORIA, pesos, type Clinica } from '../clinicas.js';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** «lunes a viernes de 9:00 a 14:00 y de 16:00 a 19:00; sábado de 9:00 a 13:00; domingo cerrado». */
export function horarioEnPalabras(c: Clinica): string {
  const porDia = DIAS.map((_, d) => c.horario.filter((f) => f.dia === d).map((f) => `de ${f.desde.replace(/^0/, '')} a ${f.hasta.replace(/^0/, '')}`).join(' y '));
  const grupos: { desde: number; hasta: number; texto: string }[] = [];
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    const texto = porDia[d] || 'cerrado';
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.texto === texto && d !== 0) ultimo.hasta = d;
    else grupos.push({ desde: d, hasta: d, texto });
  }
  return grupos.map((g) => `${DIAS[g.desde]}${g.hasta !== g.desde ? ` a ${DIAS[g.hasta]}` : ''} ${g.texto}`).join('; ');
}

export interface CitaParaAsistente { cuando: string; servicio: string }

export function baseDeConocimiento(c: Clinica, citas: readonly CitaParaAsistente[] | null): string {
  const servicios = c.servicios.map((s) => `- ${s.nombre} (${NOMBRE_CATEGORIA[s.categoria]}): ${pesos(s.precioMxn)}, ${s.duracionMin} minutos. En qué consiste: ${s.enQueConsiste} Cómo prepararse: ${s.comoPrepararse}`);
  const promos = c.promociones.map((p) => `- ${p.texto} Vigencia: ${p.vigencia}.`);
  const suyas = citas === null ? ['(La persona no ha iniciado sesión: no sabes nada de sus citas.)'] : citas.length === 0 ? ['(No tiene citas próximas.)'] : citas.map((x) => `- ${x.cuando}: ${x.servicio}`);
  return [
    `CLÍNICA: ${c.nombre} — ${c.lema}`,
    `DIRECCIÓN: ${c.direccion}`,
    `CÓMO LLEGAR: ${c.comoLlegar}`,
    `TELÉFONO: ${c.telefono}`,
    `HORARIO: ${horarioEnPalabras(c)}. Días sin servicio: ${c.fechasBloqueadas.join(', ')}.`,
    'SERVICIOS Y PRECIOS (en pesos mexicanos, con IVA):',
    ...servicios,
    'PROMOCIONES VIGENTES:',
    ...(promos.length ? promos : ['- Ninguna.']),
    `POLÍTICA DE CANCELACIÓN: ${c.politicas.cancelacion}`,
    `PAGOS: ${c.politicas.pagos}`,
    `MENORES DE EDAD: ${c.politicas.menores}`,
    `AL LLEGAR: ${c.politicas.llegada}`,
    'PRÓXIMAS CITAS DE ESTA PERSONA:',
    ...suyas,
  ].join('\n');
}

/** Respuestas locales del enrutador: sin LLM, sin red, desde la declaracion. */
export function respuestaLocal(orden: 'horario' | 'ubicacion', c: Clinica): string {
  if (orden === 'horario') return `${c.nombre} atiende ${horarioEnPalabras(c)}. Para agendar, usa el botón «Agendar cita».`;
  return `${c.nombre} está en ${c.direccion}. ${c.comoLlegar}`;
}
